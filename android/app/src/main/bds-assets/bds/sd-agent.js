/*
 * Super DeepSeek — agent glue for the built-in Linux sandbox (loaded after
 * sd-native.js).
 *
 * The sandbox is exposed to the engine as an MCP server named "sandbox"
 * (url sandbox://linux) that the native side implements. The engine then
 * does the agent loop by itself: the model writes
 *   <SDS:AUTO:MCP url="sandbox" tool="run">{"command":"…"}</SDS:AUTO:MCP>
 * the engine calls the tool and sends the result back as the next message.
 *
 * This file adds what the loop needs on a phone:
 *  - __sdSandboxServers()   the server entry, when the sandbox is available.
 *  - exact arguments        the engine reads tool calls from the rendered
 *    chat, where Markdown eats backslashes, underscores and asterisks — fatal
 *    for code. Before a sandbox call runs, the raw text of the reply is taken
 *    from the chat history API and the call's arguments are re-read from it.
 *  - Stop                   a chip that is visible while the agent works;
 *    it kills every sandbox process and stops the loop until the user
 *    writes again.
 *  - "ask" mode             optional confirmation before each command.
 *
 * Plain ES2017, no dependencies.
 */
(function () {
  'use strict';
  if (window.__sdAgent && window.__sdAgent.version) return;

  var SERVER = { name: 'sandbox', serverUrl: 'sandbox://linux', enabled: true, apiKey: '' };
  var IDLE_MS = 10000;
  var HISTORY_TIMEOUT_MS = 5000;

  function bridge() { return window.AndroidBridge || null; }

  function isBn() {
    try { return String(document.documentElement.lang || navigator.language || '').toLowerCase().indexOf('bn') === 0; }
    catch (_) { return false; }
  }

  function t(en, bn) { return isBn() ? bn : en; }

  function toast(message) {
    try {
      var e = window.__sdEngine;
      if (e && typeof e.toast === 'function') { e.toast(message); return; }
    } catch (_) {}
    console.info('[SD]', message);
  }

  /** "sandbox", "sandbox://linux" or a Markdown link to either. */
  function isSandboxUrl(u) {
    var s = String(u || '').trim();
    var m = s.match(/^\[[^\]]*\]\(([^)]+)\)$/);
    if (m) s = m[1];
    s = s.toLowerCase();
    return s === 'sandbox' || s.indexOf('sandbox:') === 0;
  }

  // ── Availability ───────────────────────────────────────────────────────────

  var infoCache = null;
  var infoAt = 0;

  function info() {
    if (infoCache && Date.now() - infoAt < 5000) return infoCache;
    var v = {};
    try {
      var b = bridge();
      v = JSON.parse(b && typeof b.sandboxInfo === 'function' ? b.sandboxInfo() : '{}') || {};
    } catch (_) { v = {}; }
    infoCache = v;
    infoAt = Date.now();
    return v;
  }

  function sandboxServers() {
    var i = info();
    return i.supported && i.enabled !== false ? [Object.assign({}, SERVER)] : [];
  }

  function mode() {
    var i = info();
    return i.mode === 'ask' ? 'ask' : 'auto';
  }

  // ── Exact arguments from the raw reply ─────────────────────────────────────

  function parseAttrs(raw) {
    var a = {};
    var re = /([A-Za-z0-9_:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    var m;
    while ((m = re.exec(raw))) a[m[1]] = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[5]);
    return a;
  }

  /** Every <SDS:AUTO:MCP …>body</SDS:AUTO:MCP> (or self-closing) tag, in order. */
  function parseTags(text) {
    var out = [];
    var s = String(text || '');
    var re = /<[BS]DS:(?:AUTO:)?MCP\b/gi;
    var m;
    while ((m = re.exec(s))) {
      var i = m.index + m[0].length;
      var q = null;
      for (; i < s.length; i++) {
        var c = s[i];
        if (q) { if (c === q) q = null; }
        else if (c === '"' || c === "'") q = c;
        else if (c === '>') break;
      }
      if (i >= s.length) break;
      var attrsRaw = s.slice(m.index + m[0].length, i);
      var selfClosing = /\/\s*$/.test(attrsRaw);
      if (selfClosing) attrsRaw = attrsRaw.replace(/\/\s*$/, '');
      var body = '';
      var end = i + 1;
      if (!selfClosing) {
        var close = /<\/[BS]DS:(?:AUTO:)?MCP\s*>/gi;
        close.lastIndex = i + 1;
        var cm = close.exec(s);
        if (cm) { body = s.slice(i + 1, cm.index); end = cm.index + cm[0].length; }
      }
      out.push({ attrs: parseAttrs(attrsRaw), body: body });
      re.lastIndex = end;
    }
    return out;
  }

  function b64urlDecode(v) {
    var s = String(v || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    if (!s) return null;
    s += '='.repeat((4 - s.length % 4) % 4);
    try {
      var bin = atob(s);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (_) { return null; }
  }

  function parseJsonObject(text) {
    var s = String(text || '').trim();
    if (!s) return null;
    // Tolerate a ```json fence around the body.
    var f = s.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/);
    if (f) s = f[1].trim();
    try {
      var v = JSON.parse(s);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch (_) { return null; }
  }

  function tagArgs(tag) {
    var a = tag.attrs || {};
    var b64 = a.base64Args || a.base64args;
    if (b64) {
      var dec = parseJsonObject(b64urlDecode(b64));
      if (dec) return dec;
    }
    if (a.args) {
      var v = parseJsonObject(a.args);
      if (v) return v;
    }
    return parseJsonObject(tag.body);
  }

  /** How well raw args match the (possibly mangled) args the engine read. */
  function similarity(raw, seen) {
    if (!seen || typeof seen !== 'object') return 0;
    var score = 0;
    Object.keys(raw).forEach(function (k) {
      if (!(k in seen)) return;
      score += 1;
      if (JSON.stringify(raw[k]) === JSON.stringify(seen[k])) score += 2;
    });
    return score;
  }

  /** The raw args for (toolName, seenArgs) from the reply texts, newest first. */
  function pickRawArgs(texts, toolName, seenArgs) {
    for (var ti = 0; ti < texts.length; ti++) {
      var best = null;
      var bestScore = -1;
      parseTags(texts[ti]).forEach(function (tag) {
        var a = tag.attrs || {};
        if (String(a.tool || a.toolName || '') !== toolName) return;
        if (!isSandboxUrl(a.url || a.serverUrl || '')) return;
        var args = tagArgs(tag);
        if (!args) return;
        var s = similarity(args, seenArgs);
        if (s > bestScore) { best = args; bestScore = s; }
      });
      if (best) return best;
    }
    return null;
  }

  function messageText(m) {
    if (!m || typeof m !== 'object') return '';
    if (Array.isArray(m.fragments) && m.fragments.length) {
      return m.fragments
        .filter(function (f) { return f && typeof f.content === 'string' && !/THINK/i.test(String(f.type || '')); })
        .map(function (f) { return f.content; })
        .join('\n');
    }
    return typeof m.content === 'string' ? m.content : '';
  }

  /** Raw texts of the last few assistant replies, newest first. */
  function assistantTexts(messages, limit) {
    var out = [];
    for (var i = messages.length - 1; i >= 0 && out.length < (limit || 3); i--) {
      var m = messages[i];
      if (String((m && m.role) || '').toUpperCase() !== 'ASSISTANT') continue;
      var text = messageText(m);
      if (text) out.push(text);
    }
    return out;
  }

  function sessionId() {
    var m = String(location.href || '').match(/\/chat\/s\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  /** Chat history through the engine's own hook (it adds the auth header). */
  function requestHistory(sid) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = null;
      function finish(v) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener('bds:history-msgs', on);
        resolve(v);
      }
      function on(ev) {
        var d = ev && ev.detail;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return; } }
        var bd = d && d.data && d.data.biz_data;
        if (!bd || !bd.chat_session || bd.chat_session.id !== sid) return;
        finish(Array.isArray(bd.chat_messages) ? bd.chat_messages : null);
      }
      timer = setTimeout(function () { finish(null); }, HISTORY_TIMEOUT_MS);
      window.addEventListener('bds:history-msgs', on);
      try {
        window.dispatchEvent(new CustomEvent('bds:request-history-msgs', { detail: JSON.stringify({ sessionId: sid }) }));
      } catch (_) { finish(null); }
    });
  }

  function exactArgs(payload) {
    var sid = sessionId();
    if (!sid) return Promise.resolve(payload);
    return requestHistory(sid).then(function (messages) {
      if (!messages) return payload;
      var raw = pickRawArgs(assistantTexts(messages, 3), String(payload.toolName || ''), payload.args);
      return raw ? Object.assign({}, payload, { args: raw }) : payload;
    }, function () { return payload; });
  }

  // ── Agent activity, Stop ───────────────────────────────────────────────────

  var state = { pending: 0, active: false, lastActivity: 0, label: '' };
  window.__sdAgentStopped = false;

  function describe(p) {
    var a = (p && p.args) || {};
    var first = function (s) { return String(s || '').split('\n')[0].slice(0, 70); };
    switch (p && p.toolName) {
      case 'run': return (a.background ? '⏵ ' : '$ ') + first(a.command);
      case 'write_file': return t('Writing ', 'লিখছে ') + first(a.path);
      case 'edit_file': return t('Editing ', 'এডিট করছে ') + first(a.path);
      case 'read_file': return t('Reading ', 'পড়ছে ') + first(a.path);
      case 'list_dir': return t('Listing ', 'দেখছে ') + first(a.path || '~/workspace');
      case 'install_packages': return t('Installing ', 'ইনস্টল করছে ') + [].concat(a.packages || []).join(' ').slice(0, 60);
      case 'preview': return t('Opening preview', 'প্রিভিউ খুলছে');
      default: return t('Working…', 'কাজ করছে…');
    }
  }

  function generating() {
    try {
      var e = window.__sdEngine;
      if (e && typeof e.isGenerating === 'function') return !!e.isGenerating();
    } catch (_) {}
    return !!document.querySelector('.ds-icon-stop-circle, .ds-icon-stop');
  }

  var pollTimer = null;

  function ensurePoll() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (generating()) state.lastActivity = Date.now();
      if (state.active && state.pending === 0 && Date.now() - state.lastActivity > IDLE_MS) {
        state.active = false;
        render();
      }
      if (!state.active) { clearInterval(pollTimer); pollTimer = null; }
    }, 1000);
  }

  function beginCall(payload) {
    state.pending++;
    state.active = true;
    state.lastActivity = Date.now();
    state.label = describe(payload);
    render();
    ensurePoll();
  }

  function endCall() {
    state.pending = Math.max(0, state.pending - 1);
    state.lastActivity = Date.now();
    render();
  }

  function clickOfficialStop() {
    var icon = document.querySelector('.ds-icon-stop-circle, .ds-icon-stop');
    if (!icon) return;
    var btn = icon.closest('[role="button"], button') || icon;
    try { btn.click(); } catch (_) {}
  }

  function stopAgent(silent) {
    window.__sdAgentStopped = true;
    try { var b = bridge(); if (b && typeof b.sandboxStop === 'function') b.sandboxStop(); } catch (_) {}
    clickOfficialStop();
    state.active = false;
    state.pending = 0;
    render();
    if (!silent) toast(t('Agent stopped. Write a message to continue.', 'এজেন্ট থামানো হয়েছে। চালিয়ে যেতে একটি মেসেজ লিখুন।'));
  }

  function resume() {
    if (window.__sdAgentStopped) window.__sdAgentStopped = false;
  }

  function isComposer(el) {
    return !!(el && el.closest && el.closest('textarea, [contenteditable="true"], [role="textbox"]') &&
      !el.closest('#bds-root, #sd-agent-chip, #sd-agent-confirm'));
  }

  function installResumeListeners() {
    // Only the user's own typing or tapping re-arms the loop; the engine's
    // automatic messages dispatch untrusted events.
    document.addEventListener('input', function (ev) { if (ev.isTrusted && isComposer(ev.target)) resume(); }, true);
    document.addEventListener('keydown', function (ev) {
      if (ev.isTrusted && ev.key === 'Enter' && isComposer(ev.target)) resume();
    }, true);
    document.addEventListener('click', function (ev) {
      if (!ev.isTrusted || !ev.target || !ev.target.closest) return;
      var btn = ev.target.closest('[role="button"], button');
      if (btn && btn.querySelector && btn.querySelector('.ds-icon-send')) resume();
    }, true);
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  var STYLE = [
    '#sd-agent-chip{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 58px);',
    'z-index:2147483000;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 24px);box-sizing:border-box;',
    'padding:6px 6px 6px 12px;border-radius:999px;background:rgba(28,28,32,.94);color:#f1f1f3;',
    'font:500 13px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.28);',
    '-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.08)}',
    '#sd-agent-chip[hidden]{display:none}',
    '#sd-agent-chip .sd-spin{flex:none;width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,.25);',
    'border-top-color:#8ab4ff;animation:sd-spin .9s linear infinite}',
    '#sd-agent-chip .sd-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
    'font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-size:12px;opacity:.92}',
    '#sd-agent-chip button{flex:none;display:flex;align-items:center;gap:6px;border:0;border-radius:999px;',
    'padding:7px 12px;background:rgba(255,255,255,.12);color:#fff;font:600 12px/1 system-ui,sans-serif}',
    '#sd-agent-chip button:active{background:rgba(255,255,255,.2)}',
    '#sd-agent-chip button i{width:9px;height:9px;border-radius:2px;background:#ff6b6b;display:block}',
    '@keyframes sd-spin{to{transform:rotate(360deg)}}',
    '#sd-agent-confirm{position:fixed;inset:0;z-index:2147483001;display:flex;align-items:flex-end;justify-content:center;',
    'background:rgba(0,0,0,.45)}',
    '#sd-agent-confirm .sd-card{width:100%;max-width:560px;box-sizing:border-box;margin:0 8px calc(env(safe-area-inset-bottom,0px) + 8px);',
    'padding:16px;border-radius:18px;background:#1c1c20;color:#f1f1f3;font:14px/1.4 system-ui,sans-serif}',
    '#sd-agent-confirm h3{margin:0 0 8px;font-size:15px;font-weight:600}',
    '#sd-agent-confirm pre{margin:0 0 14px;max-height:40vh;overflow:auto;padding:10px;border-radius:10px;',
    'background:#0f0f12;color:#d7e3ff;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word}',
    '#sd-agent-confirm .sd-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}',
    '#sd-agent-confirm button{border:0;border-radius:12px;padding:10px 14px;font:600 13px/1 system-ui,sans-serif;',
    'background:rgba(255,255,255,.1);color:#fff}',
    '#sd-agent-confirm button.sd-primary{background:#4d6bfe;color:#fff}',
    // Tool cards in the chat: the spinner stops once the call is over.
    '.bds-mcp-loading.sd-done,.bds-mcp-loading.sd-stopped{animation:none!important}',
    '.bds-mcp-loading.sd-done{border-left-color:#22c55e!important}',
    '.bds-mcp-loading.sd-stopped{border-left-color:#8e8ea0!important}',
    '.sd-done .bds-mcp-loading-spinner,.sd-stopped .bds-mcp-loading-spinner{animation:none!important;',
    'border-color:transparent!important;position:relative}',
    '.sd-done .bds-mcp-loading-spinner::after{content:"";position:absolute;left:5px;top:1px;width:5px;height:10px;',
    'border:solid #22c55e;border-width:0 2px 2px 0;transform:rotate(45deg)}',
    '.sd-stopped .bds-mcp-loading-spinner::after{content:"";position:absolute;left:3px;top:3px;width:10px;height:10px;',
    'border-radius:2px;background:#8e8ea0}'
  ].join('');

  var chip = null;

  function ensureChip() {
    if (chip && document.body && document.body.contains(chip)) return chip;
    if (!document.body) return null;
    if (!document.getElementById('sd-agent-style')) {
      var st = document.createElement('style');
      st.id = 'sd-agent-style';
      st.textContent = STYLE;
      (document.head || document.documentElement).appendChild(st);
    }
    chip = document.createElement('div');
    chip.id = 'sd-agent-chip';
    chip.setAttribute('role', 'status');
    chip.hidden = true;
    var spin = document.createElement('span');
    spin.className = 'sd-spin';
    var label = document.createElement('span');
    label.className = 'sd-label';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.appendChild(document.createElement('i'));
    btn.appendChild(document.createTextNode(t('Stop', 'থামান')));
    btn.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); stopAgent(false); });
    label.addEventListener('click', function () {
      try { var b = bridge(); if (b && typeof b.openStudio === 'function') b.openStudio(); } catch (_) {}
    });
    chip.appendChild(spin);
    chip.appendChild(label);
    chip.appendChild(btn);
    document.body.appendChild(chip);
    return chip;
  }

  var reportedActive = false;

  /** Tells the app while the agent works, so it stays protected in the background. */
  function reportActive() {
    if (reportedActive === state.active) return;
    reportedActive = state.active;
    try { var b = bridge(); if (b && typeof b.sandboxAgentActive === 'function') b.sandboxAgentActive(!!state.active); } catch (_) {}
  }

  function render() {
    reportActive();
    var c = ensureChip();
    if (!c) return;
    c.hidden = !state.active;
    var label = c.querySelector('.sd-label');
    if (label) label.textContent = state.pending > 0 ? state.label : t('Agent is working…', 'এজেন্ট কাজ করছে…');
  }

  function confirmCall(payload) {
    return new Promise(function (resolve) {
      if (!document.body) return resolve('run');
      ensureChip();
      var old = document.getElementById('sd-agent-confirm');
      if (old) old.remove();
      var a = payload.args || {};
      var detail = payload.toolName === 'run' ? String(a.command || '')
        : payload.toolName === 'write_file' ? (a.path + '\n\n' + String(a.content || '').slice(0, 1500))
        : JSON.stringify(a, null, 2).slice(0, 2000);
      var wrap = document.createElement('div');
      wrap.id = 'sd-agent-confirm';
      var card = document.createElement('div');
      card.className = 'sd-card';
      var h = document.createElement('h3');
      h.textContent = t('Allow in the Linux sandbox?', 'লিনাক্স স্যান্ডবক্সে চালাতে দেবেন?') + ' — ' + payload.toolName;
      var pre = document.createElement('pre');
      pre.textContent = detail;
      var row = document.createElement('div');
      row.className = 'sd-row';
      function button(text, cls, value) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        if (cls) b.className = cls;
        b.addEventListener('click', function () { wrap.remove(); resolve(value); });
        row.appendChild(b);
      }
      button(t('Skip', 'বাদ দিন'), '', 'skip');
      button(t('Always allow', 'সবসময় অনুমতি'), '', 'always');
      button(t('Run', 'চালান'), 'sd-primary', 'run');
      card.appendChild(h);
      card.appendChild(pre);
      card.appendChild(row);
      wrap.appendChild(card);
      document.body.appendChild(wrap);
    });
  }

  // ── "Linux Studio" entry in the + sheet ────────────────────────────────────

  var STUDIO_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bds-item-icon svelte-1y27tjy">' +
    '<rect x="2" y="4" width="20" height="16" rx="2"></rect><polyline points="6 9 10 12 6 15"></polyline>' +
    '<line x1="12" y1="15" x2="17" y2="15"></line></svg>';

  function addStudioItem() {
    var sheet = document.querySelector('.bds-attach-dropdown');
    if (!sheet || sheet.querySelector('#sd-studio-item')) return;
    var first = sheet.querySelector('.bds-attach-item');
    if (!first || !first.parentNode) return;
    if (!info().supported) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'sd-studio-item';
    btn.className = 'bds-attach-item svelte-1y27tjy';
    btn.innerHTML = '<span class="bds-item-icon-box svelte-1y27tjy">' + STUDIO_ICON + '</span> ' +
      '<span class="bds-item-content svelte-1y27tjy"><span class="bds-item-title svelte-1y27tjy"></span> ' +
      '<span class="bds-item-desc svelte-1y27tjy"></span></span>';
    btn.querySelector('.bds-item-title').textContent = 'Linux Studio';
    btn.querySelector('.bds-item-desc').textContent = t('Terminal, files and app previews of the AI sandbox',
      'AI স্যান্ডবক্সের টার্মিনাল, ফাইল ও অ্যাপ প্রিভিউ');
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var close = document.querySelector('.bds-sheet-close') || document.querySelector('.bds-attach-backdrop');
      if (close) { try { close.click(); } catch (_) {} }
      try { var b = bridge(); if (b && typeof b.openStudio === 'function') b.openStudio(); } catch (_) {}
    });
    first.parentNode.insertBefore(btn, first);
  }

  function watchSheet() {
    if (typeof MutationObserver !== 'function' || !document.body) return;
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      setTimeout(function () { queued = false; addStudioItem(); }, 50);
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ── The sandbox call path ──────────────────────────────────────────────────

  function stoppedReply() {
    return { ok: false, error: 'Stopped by the user.' };
  }

  function sandboxCall(payload, inner) {
    if (window.__sdAgentStopped) return Promise.resolve(stoppedReply());
    beginCall(payload);
    return exactArgs(payload)
      .then(function (p) {
        state.label = describe(p);
        render();
        if (mode() !== 'ask') return p;
        return confirmCall(p).then(function (choice) {
          if (choice === 'skip') return null;
          if (choice === 'always') {
            try { bridge().setStorage('sd_sandbox_mode', 'auto'); } catch (_) {}
            infoCache = null;
          }
          return p;
        });
      })
      .then(function (p) {
        if (!p) return { ok: false, error: 'The user declined this action. Ask them or try another approach.' };
        if (window.__sdAgentStopped) return stoppedReply();
        return inner(p);
      })
      .then(function (reply) { endCall(); return reply; },
        function (err) { endCall(); return { ok: false, error: String((err && err.message) || err) }; });
  }

  // ── Tool cards: stop the spinner when the call is over ─────────────────────
  //
  // The engine draws a spinning card for every tool call in a reply and never
  // updates it; the result arrives as the next message. A card is finished
  // once a later message exists, or when nothing is running any more.

  var mcpPending = 0;
  var mcpLastEnd = 0;
  var CARD_IDLE_MS = 4000;

  function trackMcp(promise) {
    mcpPending++;
    var done = function () { mcpPending = Math.max(0, mcpPending - 1); mcpLastEnd = Date.now(); sweepSoon(); };
    return Promise.resolve(promise).then(function (v) { done(); return v; }, function (e) { done(); throw e; });
  }

  function messageOf(el) {
    return (el.closest && el.closest('.ds-message')) || null;
  }

  function lastMessage() {
    var all = document.querySelectorAll('.ds-message');
    return all.length ? all[all.length - 1] : null;
  }

  function sweepCards() {
    if (!document.querySelectorAll) return 0;
    var cards = document.querySelectorAll('.bds-mcp-loading:not(.sd-done):not(.sd-stopped)');
    if (!cards.length) return 0;
    var last = lastMessage();
    var idle = mcpPending === 0 && !generating() && Date.now() - Math.max(mcpLastEnd, state.lastActivity || 0) > CARD_IDLE_MS;
    var left = 0;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var msg = messageOf(card);
      var superseded = !!(msg && last && msg !== last && !msg.contains(last));
      if (superseded || idle) card.classList.add(window.__sdAgentStopped && !superseded ? 'sd-stopped' : 'sd-done');
      else left++;
    }
    return left;
  }

  var sweepTimer = null;
  function sweepSoon() {
    if (sweepTimer) return;
    sweepTimer = setTimeout(function tick() {
      sweepTimer = null;
      if (sweepCards() > 0) sweepTimer = setTimeout(tick, 1500);
    }, 300);
  }

  function watchCards() {
    if (typeof MutationObserver !== 'function' || !document.body) return;
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        if (records[i].addedNodes && records[i].addedNodes.length) { sweepSoon(); return; }
      }
    }).observe(document.body, { childList: true, subtree: true });
    sweepSoon();
  }

  function install() {
    var inner = window.__sdBridgeFetch;
    if (typeof inner === 'function' && !inner.__sdAgentWrapped) {
      var wrapped = function (payload) {
        if (payload && payload.type === 'bds-mcp-call') {
          return trackMcp(isSandboxUrl(payload.serverUrl) ? sandboxCall(payload, inner) : inner(payload));
        }
        return inner(payload);
      };
      wrapped.__sdAgentWrapped = true;
      window.__sdBridgeFetch = wrapped;
    }
    installResumeListeners();
    // A fresh page has no running loop (clears a flag left by a reload/crash).
    try { var b = bridge(); if (b && typeof b.sandboxAgentActive === 'function') b.sandboxAgentActive(false); } catch (_) {}
    if (document.body) { watchSheet(); watchCards(); }
    else document.addEventListener('DOMContentLoaded', function () { watchSheet(); watchCards(); });
  }

  install();

  window.__sdSandboxServers = sandboxServers;
  window.__sdAgent = {
    version: 1,
    stop: stopAgent,
    isActive: function () { return state.active; },
    /** From native: sandbox activity outside a tool call (Studio, jobs). */
    refresh: function () { infoCache = null; },
    // Exposed for tests.
    _parseTags: parseTags,
    _tagArgs: tagArgs,
    _pickRawArgs: pickRawArgs,
    _assistantTexts: assistantTexts,
    _isSandboxUrl: isSandboxUrl,
    _sweepCards: sweepCards,
  };
})();
