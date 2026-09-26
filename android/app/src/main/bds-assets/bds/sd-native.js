/*
 * Super DeepSeek — native glue (injected after content.js).
 *
 * Connects the Android side to the engine without touching its internals more
 * than a few one-line hooks in content.js:
 *
 *  - __sdResolvePickedBlobs(result)  picked files arrive as same-origin blob
 *    paths (/__sd/blob/<token>, served natively from the ContentResolver
 *    stream). They are fetched here in parallel and turned into real File
 *    objects (entry.file) — no Base64, no JSON chunks, no size blow-up.
 *  - __sdBridgeFetch(payload)        non-blocking AndroidBridge.fetch.
 *  - __sdAdaptUpload(file, input)    renames text files the chat's file input
 *    would refuse (unknown code/config extensions) to .txt.
 *  - __sdNative.receive(json)        shares, launcher shortcuts, deep links.
 *
 * Plain ES2017, no dependencies; loaded once per document.
 */
(function () {
  'use strict';
  if (window.__sdNative && window.__sdNative.version) return;

  var BLOB_PREFIX = '/__sd/blob/';
  var POOL = 6;
  var FETCH_TIMEOUT_MS = 180000;
  var SANDBOX_TIMEOUT_MS = 32 * 60 * 1000;

  function bridge() { return window.AndroidBridge || null; }

  function engine() { return window.__sdEngine || null; }

  function toast(message) {
    try {
      var e = engine();
      if (e && typeof e.toast === 'function') { e.toast(message); return; }
    } catch (_) {}
    console.info('[SD]', message);
  }

  function isBn() {
    try { return String(document.documentElement.lang || navigator.language || '').toLowerCase().indexOf('bn') === 0; }
    catch (_) { return false; }
  }

  function t(en, bn) { return isBn() ? bn : en; }

  // ── Keyboard: only the user opens it ─────────────────────────────────────
  //
  // The engine and the chat page focus text fields by themselves (after every
  // automatic message, when a question panel appears, when a sheet closes…).
  // On a phone every such focus() popped the soft keyboard and the screen
  // jumped up and down while the agent worked. A focus() that does not follow
  // a real touch or key press now focuses without the keyboard
  // (inputmode="none"); the keyboard comes back as soon as the user taps it.

  var GESTURE_MS = 1000;
  var SILENT = 'data-sd-silent-im';
  var NO_ATTR = '__none__';
  var lastGestureAt = 0;

  function allowKeyboard() { lastGestureAt = Date.now(); }

  function isTextField(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') return !el.readOnly && !el.disabled;
    if (tag === 'INPUT') {
      var type = String(el.type || 'text').toLowerCase();
      return !el.readOnly && !el.disabled &&
        ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].indexOf(type) >= 0;
    }
    return !!el.isContentEditable;
  }

  function unsilence(el) {
    if (!el || typeof el.hasAttribute !== 'function' || !el.hasAttribute(SILENT)) return;
    var orig = el.getAttribute(SILENT);
    el.removeAttribute(SILENT);
    if (orig === NO_ATTR) el.removeAttribute('inputmode'); else el.setAttribute('inputmode', orig);
  }

  function installFocusGuard() {
    var proto = typeof HTMLElement === 'function' ? HTMLElement.prototype : null;
    if (!proto || proto.focus.__sdGuard || typeof document.addEventListener !== 'function') return;
    var nativeFocus = proto.focus;
    var guarded = function (_opts) {
      try {
        if (isTextField(this) && document.activeElement !== this && Date.now() - lastGestureAt > GESTURE_MS) {
          if (!this.hasAttribute(SILENT)) {
            this.setAttribute(SILENT, this.hasAttribute('inputmode') ? this.getAttribute('inputmode') : NO_ATTR);
            this.setAttribute('inputmode', 'none');
          }
          return nativeFocus.call(this, { preventScroll: true });
        }
      } catch (_) {}
      return nativeFocus.apply(this, arguments);
    };
    guarded.__sdGuard = true;
    proto.focus = guarded;

    function gesture(ev) { if (ev && ev.isTrusted) lastGestureAt = Date.now(); }
    ['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach(function (type) {
      document.addEventListener(type, gesture, true);
    });
    document.addEventListener('focusout', function (ev) { unsilence(ev.target); }, true);
    // A tap on a silenced field gives it its keyboard back.
    document.addEventListener('pointerdown', function (ev) {
      if (!ev.isTrusted || !ev.target || typeof ev.target.closest !== 'function') return;
      var field = ev.target.closest('[' + SILENT + ']');
      if (!field) return;
      unsilence(field);
      field.__sdReopen = true;
    }, true);
    document.addEventListener('click', function (ev) {
      if (!ev.isTrusted || !ev.target || typeof ev.target.closest !== 'function') return;
      var field = ev.target.closest('textarea, input, [contenteditable]');
      if (!field || !field.__sdReopen) return;
      field.__sdReopen = false;
      if (document.activeElement === field) {
        try { field.blur(); nativeFocus.call(field, { preventScroll: true }); } catch (_) {}
      }
    }, true);
  }

  installFocusGuard();

  // The page may already have focused the composer on load, before this ran.
  (function silenceInitialFocus() {
    try {
      var el = document.activeElement;
      if (!isTextField(el) || Date.now() - lastGestureAt <= GESTURE_MS || el.hasAttribute(SILENT)) return;
      el.setAttribute(SILENT, el.hasAttribute('inputmode') ? el.getAttribute('inputmode') : NO_ATTR);
      el.setAttribute('inputmode', 'none');
      el.blur();
      el.focus({ preventScroll: true });
    } catch (_) {}
  })();

  // Automatic messages are written into the composer and sent by the engine
  // (sdQuiet in content.js marks <html> meanwhile): keep that text from
  // flashing in the composer and from resizing it.
  (function injectQuietStyle() {
    try {
      if (!document.createElement || document.getElementById('sd-quiet-style')) return;
      var st = document.createElement('style');
      st.id = 'sd-quiet-style';
      st.textContent =
        'html.sd-auto-send textarea#chat-input,html.sd-auto-send .ds-textarea textarea{' +
        'color:transparent!important;-webkit-text-fill-color:transparent!important;' +
        'caret-color:transparent!important;max-height:2.6em!important;overflow:hidden!important}';
      (document.head || document.documentElement).appendChild(st);
      // The moment the user touches or types in a field, it is theirs again:
      // never hide what they type, even if an engine send is still retrying.
      if (typeof document.addEventListener === 'function') {
        var takeOver = function (ev) {
          if (!ev || !ev.isTrusted || !isTextField(ev.target)) return;
          var root = document.documentElement;
          if (root && root.classList && root.classList.contains('sd-auto-send')) root.classList.remove('sd-auto-send');
        };
        ['pointerdown', 'keydown', 'beforeinput'].forEach(function (type) { document.addEventListener(type, takeOver, true); });
      }
    } catch (_) {}
  })();

  // ── Picked files ───────────────────────────────────────────────────────────

  /** Run fn over items with at most `limit` in flight; results keep their order. */
  function pool(items, limit, fn) {
    var results = new Array(items.length);
    var next = 0;
    function worker() {
      if (next >= items.length) return Promise.resolve();
      var i = next++;
      return Promise.resolve()
        .then(function () { return fn(items[i], i); })
        .then(function (r) { results[i] = r; }, function (err) { results[i] = { __error: err }; })
        .then(worker);
    }
    var workers = [];
    for (var w = 0; w < Math.min(limit, items.length); w++) workers.push(worker());
    return Promise.all(workers).then(function () { return results; });
  }

  function isBlobPath(p) { return typeof p === 'string' && p.indexOf(BLOB_PREFIX) === 0; }

  function fetchBlob(path) {
    return fetch(path, { cache: 'no-store', credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('blob ' + r.status);
      return r.blob();
    });
  }

  function release(path) {
    try { var b = bridge(); if (b && typeof b.releaseBlob === 'function') b.releaseBlob(path); } catch (_) {}
  }

  /** One entry {name, mime, blob, text, ...} → the same entry with file (and content for text). */
  function resolveEntry(entry) {
    if (!entry || !isBlobPath(entry.blob)) return Promise.resolve(entry);
    var path = entry.blob;
    return fetchBlob(path).then(function (b) {
      var name = String(entry.name || 'file');
      var baseName = name.split('/').pop() || name;
      var type = entry.text ? 'text/plain' : (entry.mime || b.type || 'application/octet-stream');
      var file = new File([b], baseName, { type: type });
      var out = Object.assign({}, entry, { file: file, size: b.size });
      delete out.blob;
      release(path);
      if (!entry.text) return out;
      return b.text().then(function (text) {
        out.content = text;
        out.encoding = null;
        return out;
      });
    });
  }

  /**
   * The engine's picker result → the same result with every blob entry
   * resolved. Entries that cannot be read move to `skipped` (reason
   * "unreadable") instead of failing the whole pick.
   */
  function resolvePickedBlobs(result) {
    if (!result || typeof result !== 'object' || !Array.isArray(result.files)) return Promise.resolve(result);
    var files = result.files;
    if (!files.some(function (f) { return f && isBlobPath(f.blob); })) return Promise.resolve(result);
    return pool(files, POOL, resolveEntry).then(function (resolved) {
      var ok = [];
      var skipped = Array.isArray(result.skipped) ? result.skipped.slice() : [];
      resolved.forEach(function (r, i) {
        if (r && r.__error) {
          console.warn('[SD] picked file unreadable', files[i] && files[i].name, r.__error);
          skipped.push({ name: (files[i] && files[i].name) || 'file', reason: 'unreadable' });
        } else if (r) {
          ok.push(r);
        }
      });
      return Object.assign({}, result, { files: ok, skipped: skipped });
    });
  }

  // ── Upload adaptation ──────────────────────────────────────────────────────

  function extOf(name) {
    var n = String(name || '').toLowerCase();
    var slash = n.lastIndexOf('/');
    if (slash >= 0) n = n.slice(slash + 1);
    var dot = n.lastIndexOf('.');
    return dot > 0 ? n.slice(dot) : '';
  }

  /** Whether `file` passes an <input accept="..."> list (empty accept = anything). */
  function acceptsFile(accept, file) {
    var list = String(accept || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    if (list.length === 0) return true;
    var ext = extOf(file && file.name);
    var type = String((file && file.type) || '').toLowerCase();
    return list.some(function (a) {
      if (a === '*' || a === '*/*') return true;
      if (a.charAt(0) === '.') return a === ext;
      if (a.slice(-2) === '/*') return type.indexOf(a.slice(0, -1)) === 0;
      return a === type;
    });
  }

  var textLike = /^text\//;

  /**
   * A text file whose extension the chat's input does not list is still text:
   * send it as name.ext.txt (the model sees the original name in it) instead
   * of having the upload refused.
   */
  function adaptUpload(file, input) {
    try {
      if (!(file instanceof File) || !input) return file;
      if (acceptsFile(input.accept, file)) return file;
      if (!textLike.test(file.type || '')) return file;
      return new File([file], file.name + '.txt', { type: 'text/plain', lastModified: file.lastModified });
    } catch (_) {
      return file;
    }
  }

  // ── Non-blocking bridge fetch ──────────────────────────────────────────────

  var pending = Object.create(null);
  var seq = 0;

  function parseReply(json) {
    if (typeof json !== 'string' || json.length === 0) return { ok: false, error: 'Empty response from AndroidBridge.fetch' };
    try { return JSON.parse(json); }
    catch (e) { return { ok: false, error: 'Failed to parse AndroidBridge.fetch response: ' + (e && e.message) }; }
  }

  function bridgeFetch(payload) {
    var b = bridge();
    if (!b) return Promise.resolve({ ok: false, error: '[SDS] window.AndroidBridge is not available.' });
    var body = JSON.stringify(payload || {});
    if (typeof b.fetchAsync !== 'function') {
      // Older native side: the blocking call.
      return Promise.resolve(parseReply(b.fetch(body)));
    }
    return new Promise(function (resolve) {
      var id = 'f' + (++seq) + '_' + Math.random().toString(36).slice(2, 8);
      // Sandbox commands may legitimately run for up to 30 minutes; the
      // native side always answers (it enforces the command's own timeout).
      var ms = /^sandbox/i.test(String((payload && payload.serverUrl) || '')) ? SANDBOX_TIMEOUT_MS : FETCH_TIMEOUT_MS;
      var timer = setTimeout(function () {
        if (!pending[id]) return;
        delete pending[id];
        resolve({ ok: false, error: 'Timed out waiting for AndroidBridge.fetch' });
      }, ms);
      pending[id] = function (reply) { clearTimeout(timer); resolve(reply); };
      try {
        b.fetchAsync(body, id);
      } catch (e) {
        delete pending[id];
        clearTimeout(timer);
        resolve({ ok: false, error: String((e && e.message) || e) });
      }
    });
  }

  /** Called by the native side: an inline JSON reply, or a blob path for large ones. */
  function bridgeReply(id, json, blobPath) {
    var done = pending[id];
    if (!done) return;
    delete pending[id];
    if (isBlobPath(blobPath)) {
      fetch(blobPath, { cache: 'no-store' })
        .then(function (r) { return r.text(); })
        .then(function (text) { done(parseReply(text)); }, function (e) {
          done({ ok: false, error: 'Reply unreadable: ' + ((e && e.message) || e) });
        });
      return;
    }
    done(parseReply(json));
  }

  // ── Actions from Android (shares, shortcuts, deep links) ───────────────────

  function composer() {
    var sel = ['textarea#chat-input', '.ds-textarea textarea', 'textarea[placeholder]', '[role="textbox"][contenteditable]'];
    for (var i = 0; i < sel.length; i++) {
      var el = document.querySelector(sel[i]);
      if (el) return el;
    }
    return null;
  }

  function setComposerText(text) {
    var e = engine();
    if (e && typeof e.setComposer === 'function') {
      try { if (e.setComposer(text)) return true; } catch (_) {}
    }
    var el = composer();
    if (!el) return false;
    el.focus();
    if ('value' in el) {
      var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) setter.set.call(el, text); else el.value = text;
    } else {
      el.textContent = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function fileInput() {
    var e = engine();
    if (e && typeof e.fileInput === 'function') {
      try { var i = e.fileInput(); if (i) return i; } catch (_) {}
    }
    var all = document.querySelectorAll('input[type="file"]');
    for (var k = 0; k < all.length; k++) {
      var el = all[k];
      if (!el.disabled && !el.closest('#bds-root, .bds-attach-wrapper')) return el;
    }
    return null;
  }

  function attachFiles(files) {
    var input = fileInput();
    if (!input || files.length === 0) return false;
    var dt = new DataTransfer();
    if (input.files) for (var i = 0; i < input.files.length; i++) dt.items.add(input.files[i]);
    files.forEach(function (f) { dt.items.add(adaptUpload(f, input)); });
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /** Wait until `test()` is truthy (polling), or give up after `ms`. */
  function waitFor(test, ms) {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function poll() {
        var v = null;
        try { v = test(); } catch (_) {}
        if (v) return resolve(v);
        if (Date.now() - start > ms) return resolve(null);
        setTimeout(poll, 150);
      })();
    });
  }

  function newChat() {
    return new Promise(function (resolve) {
      var e = engine();
      if (e && typeof e.newChat === 'function') {
        var settled = false;
        var finish = function () { if (!settled) { settled = true; resolve(); } };
        try { e.newChat(finish); } catch (_) { finish(); }
        setTimeout(finish, 2500);
        return;
      }
      if (location.pathname !== '/') location.href = 'https://chat.deepseek.com/';
      resolve();
    });
  }

  var REASONS = {
    'too-large': ['over the size limit', 'আকার সীমার বেশি'],
    'unreadable': ['could not be read', 'পড়া যায়নি'],
    'binary': ['not a text file', 'টেক্সট ফাইল নয়'],
    'unsupported-type': ['unsupported type', 'অসমর্থিত ধরন'],
    'image-requires-vision': ['images need a vision model', 'ছবির জন্য ভিশন মডেল দরকার'],
    'image-cap-exceeded': ['too many images', 'অনেক বেশি ছবি'],
    'file-cap-exceeded': ['too many files', 'অনেক বেশি ফাইল'],
  };

  function reasonText(reason) {
    var r = REASONS[reason];
    return r ? t(r[0], r[1]) : String(reason || '');
  }

  /**
   * One line saying which files were not attached and why, e.g.
   * "Not attached (2 of 5): big.iso — over the size limit; x.bin — could not be read".
   */
  function skippedMessage(skipped, attachedCount) {
    if (!skipped || skipped.length === 0) return '';
    var shown = skipped.slice(0, 3).map(function (s) {
      var name = String(s.name || 'file').split('/').pop();
      return name + ' — ' + reasonText(s.reason);
    }).join('; ');
    var more = skipped.length > 3 ? ' (+' + (skipped.length - 3) + ')' : '';
    var count = typeof attachedCount === 'number' && attachedCount > 0
      ? ' (' + skipped.length + '/' + (skipped.length + attachedCount) + ')' : '';
    return t('Not attached', 'সংযুক্ত হয়নি') + count + ': ' + shown + more;
  }

  function receiveShare(action) {
    var text = String(action.text || '');
    var entries = Array.isArray(action.files) ? action.files : [];
    return newChat()
      .then(function () { return waitFor(composer, 8000); })
      .then(function () { return resolvePickedBlobs({ files: entries, skipped: action.skipped || [] }); })
      .then(function (res) {
        var files = (res.files || []).map(function (f) {
          if (f.file instanceof File) return f.file;
          // Inline (small, pre-blob) entries.
          if (f.encoding === 'base64') {
            var bin = atob(String(f.content || ''));
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new File([bytes], f.name || 'file', { type: f.mime || 'application/octet-stream' });
          }
          return new File([String(f.content || '')], f.name || 'file.txt', { type: 'text/plain' });
        });
        if (files.length && !attachFiles(files)) toast(t('Could not attach the shared files.', 'শেয়ার করা ফাইল সংযুক্ত করা যায়নি।'));
        if (text) setComposerText(text);
        var msg = skippedMessage(res.skipped, files.length);
        if (msg) toast(msg);
      });
  }

  function openLink(url) {
    var u;
    try { u = new URL(url); } catch (_) { return; }
    if (u.host !== location.host) return;
    if (u.pathname === location.pathname && u.search === location.search) return;
    var target = u.pathname + u.search;
    var link = document.querySelector('a[href="' + CSS.escape(target) + '"]') ||
      document.querySelector('a[href="' + CSS.escape(u.href) + '"]');
    if (link) { link.click(); return; }
    location.assign(u.href);
  }

  function receiveShortcut(name) {
    if (name === 'new_chat') return newChat();
    if (name === 'deep_research') {
      return newChat().then(function () {
        var e = engine();
        if (e && typeof e.setDeepResearch === 'function') {
          try {
            e.setDeepResearch(true);
            toast(t('Deep Research is on — type your question.', 'ডিপ রিসার্চ চালু — প্রশ্ন লিখুন।'));
          } catch (err) { console.warn('[SD] deep research toggle failed', err); }
        }
        var c = composer();
        // Opened from a launcher shortcut: the user asked to type.
        allowKeyboard();
        if (c) c.focus();
      });
    }
    return Promise.resolve();
  }

  function receive(json) {
    var action;
    try { action = typeof json === 'string' ? JSON.parse(json) : json; } catch (_) { return; }
    if (!action || typeof action !== 'object') return;
    var run;
    if (action.type === 'share') run = receiveShare(action);
    else if (action.type === 'shortcut') run = receiveShortcut(String(action.action || ''));
    else if (action.type === 'open') run = Promise.resolve(openLink(String(action.url || '')));
    if (run && run.catch) run.catch(function (e) { console.error('[SD] native action failed', e); });
  }

  window.__sdResolvePickedBlobs = resolvePickedBlobs;
  window.__sdAdaptUpload = adaptUpload;
  window.__sdBridgeFetch = bridgeFetch;
  window.__sdBridgeReply = bridgeReply;
  window.__sdSkipMessage = skippedMessage;
  window.__sdNative = {
    version: 1,
    receive: receive,
    allowKeyboard: allowKeyboard,
    // Exposed for tests.
    _acceptsFile: acceptsFile,
    _isTextField: isTextField,
    _pool: pool,
  };
})();
