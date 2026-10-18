/*
 * Super DeepSeek — free-form generative visuals (GenUI v1.1).
 *
 * Adds two fenced block types on top of the schema-driven `sds-ui` renderer in sd-genui.js:
 *
 *   ```sds-svg    a single <svg> drawing. Parsed by a small tolerant parser, rebuilt element by
 *                 element from an allowlist (no scripts, no foreignObject, no external references)
 *                 and rendered progressively while the reply is still streaming.
 *   ```sds-html   a self-contained HTML document with CSS and JavaScript. It runs in a sandboxed
 *                 iframe with an opaque origin and a CSP that blocks all network access, so it can
 *                 not read the chat page, cookies, storage or the AndroidBridge.
 *
 * It also appends a short prompt extension (only for visual requests) so the model knows both
 * block types exist. injected.js is NOT modified: the extension is added by wrapping fetch / XHR.
 */
(function (root) {
  'use strict';
  if (root.__sdGenUIHtml && root.__sdGenUIHtml.version === 1) return;

  var MAX_SVG_CHARS = 60000;
  var MAX_HTML_CHARS = 120000;
  var MAX_ATTR = 4000;
  var MAX_PATH_ATTR = 24000;
  var MAX_NODES = 1500;
  var MAX_PARSE_NODES = 6000;
  var MAX_DEPTH = 24;
  var MAX_TEXT = 600;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var PREF_KEY = 'sd_genui_free';
  var FRAME_URL = 'https://bds-asset.local/bds/sd-frame.html';
  var EXT_MARK = '[SDS:GENUI_FREE]';
  var SETTLE_SVG_MS = 400;
  var SETTLE_HTML_DONE_MS = 350;
  var SETTLE_HTML_IDLE_MS = 2500;
  var READY_TIMEOUT_MS = 2500;

  // ---------------------------------------------------------------------------------------------
  // Allowlists
  // ---------------------------------------------------------------------------------------------
  var ELEMENT_LIST = ('svg g defs symbol use title desc path rect circle ellipse line polyline polygon text tspan textPath ' +
    'linearGradient radialGradient stop clipPath mask pattern marker filter feBlend feColorMatrix feComposite feFlood ' +
    'feGaussianBlur feMerge feMergeNode feMorphology feOffset feDropShadow feTurbulence feDisplacementMap ' +
    'feComponentTransfer feFuncR feFuncG feFuncB feFuncA animate animateTransform animateMotion set mpath').split(' ');
  var ELEMENTS = Object.create(null);
  ELEMENT_LIST.forEach(function (name) { ELEMENTS[name.toLowerCase()] = name; });
  var TEXT_ELEMENTS = { text: 1, tspan: 1, textpath: 1, title: 1, desc: 1 };
  var HREF_ELEMENTS = { use: 1, textpath: 1, mpath: 1, lineargradient: 1, radialgradient: 1, pattern: 1 };
  var ANIM_ELEMENTS = { animate: 1, animatetransform: 1, animatemotion: 1, set: 1 };

  var ATTR_LIST = ('x y x1 x2 y1 y2 cx cy r rx ry width height d points transform viewBox preserveAspectRatio dx dy rotate ' +
    'textLength lengthAdjust fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin ' +
    'stroke-dasharray stroke-dashoffset stroke-miterlimit opacity color font-family font-size font-weight font-style ' +
    'text-anchor dominant-baseline alignment-baseline letter-spacing word-spacing text-decoration visibility display ' +
    'clip-path clip-rule mask filter marker-start marker-mid marker-end stop-color stop-opacity offset gradientUnits ' +
    'gradientTransform spreadMethod fx fy fr patternUnits patternContentUnits patternTransform clipPathUnits maskUnits ' +
    'maskContentUnits markerWidth markerHeight markerUnits refX refY orient filterUnits primitiveUnits in in2 result ' +
    'stdDeviation mode type values operator k1 k2 k3 k4 flood-color flood-opacity baseFrequency numOctaves seed scale ' +
    'xChannelSelector yChannelSelector radius tableValues slope intercept amplitude exponent mix-blend-mode paint-order ' +
    'transform-origin transform-box shape-rendering vector-effect pathLength ' +
    'from to by keyTimes keySplines calcMode begin dur end repeatCount repeatDur min max additive accumulate path keyPoints').split(' ');
  var ATTRS = Object.create(null);
  ATTR_LIST.forEach(function (name) { ATTRS[name.toLowerCase()] = name; });
  var ANIM_TARGETS = { x: 1, y: 1, cx: 1, cy: 1, r: 1, rx: 1, ry: 1, width: 1, height: 1, opacity: 1, fill: 1, stroke: 1,
    'stroke-width': 1, 'stroke-opacity': 1, 'fill-opacity': 1, 'stroke-dashoffset': 1, 'stroke-dasharray': 1, transform: 1,
    d: 1, points: 1, offset: 1, 'stop-color': 1, 'stop-opacity': 1, stddeviation: 1, x1: 1, x2: 1, y1: 1, y2: 1, dx: 1, dy: 1,
    rotate: 1, 'font-size': 1, 'letter-spacing': 1, fx: 1, fy: 1, 'flood-color': 1, values: 1, scale: 1, basefrequency: 1 };
  var STYLE_PROPS = { fill: 1, stroke: 1, 'stroke-width': 1, 'stroke-linecap': 1, 'stroke-linejoin': 1, 'stroke-dasharray': 1,
    'stroke-dashoffset': 1, 'stroke-opacity': 1, 'fill-opacity': 1, opacity: 1, 'font-family': 1, 'font-size': 1,
    'font-weight': 1, 'font-style': 1, 'text-anchor': 1, 'letter-spacing': 1, 'dominant-baseline': 1, 'stop-color': 1,
    'stop-opacity': 1, 'mix-blend-mode': 1, filter: 1, 'clip-path': 1, mask: 1, transform: 1, 'transform-origin': 1,
    'transform-box': 1, display: 1, visibility: 1, 'paint-order': 1 };

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  // ---------------------------------------------------------------------------------------------
  // Tolerant markup parser (no DOMParser: no parser differentials, works on truncated streams)
  // ---------------------------------------------------------------------------------------------
  function decodeEntities(text) {
    return String(text).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (match, entity) {
      var lower = entity.toLowerCase();
      if (lower === 'amp') return '&';
      if (lower === 'lt') return '<';
      if (lower === 'gt') return '>';
      if (lower === 'quot') return '"';
      if (lower === 'apos') return "'";
      var code = lower.charAt(1) === 'x' ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
      if (!isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) return '';
      return String.fromCodePoint(code);
    });
  }

  function parseMarkup(source) {
    var s = String(source || '');
    var lowered = s.toLowerCase();
    var n = s.length;
    var i = 0;
    var rootList = [];
    var stack = [];
    var count = 0;
    var tooBig = false;

    function container() { return stack.length ? stack[stack.length - 1].kids : rootList; }
    function addText(raw, isCdata) {
      if (!stack.length) return;
      var value = isCdata ? raw : decodeEntities(raw);
      if (value) container().push({ text: value });
    }
    function closeTag(name) {
      for (var k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === name) { stack.length = k; return; }
      }
    }

    while (i < n && !tooBig) {
      var lt = s.indexOf('<', i);
      if (lt < 0) { addText(s.slice(i)); break; }
      if (lt > i) addText(s.slice(i, lt));
      i = lt;
      if (s.substr(i, 4) === '<!--') {
        var endComment = s.indexOf('-->', i + 4);
        i = endComment < 0 ? n : endComment + 3;
        continue;
      }
      if (s.substr(i, 9) === '<![CDATA[') {
        var endCdata = s.indexOf(']]>', i + 9);
        addText(s.slice(i + 9, endCdata < 0 ? n : endCdata), true);
        i = endCdata < 0 ? n : endCdata + 3;
        continue;
      }
      var next = s.charAt(i + 1);
      if (next === '!' || next === '?') {
        var endDecl = s.indexOf('>', i);
        i = endDecl < 0 ? n : endDecl + 1;
        continue;
      }
      if (next === '/') {
        var endClose = s.indexOf('>', i);
        if (endClose < 0) break;
        closeTag(s.slice(i + 2, endClose).trim().toLowerCase().replace(/^svg:/, ''));
        i = endClose + 1;
        continue;
      }
      var nameMatch = /^<([A-Za-z][\w:.-]*)/.exec(s.slice(i, i + 80));
      if (!nameMatch) { addText('<'); i++; continue; }
      var j = i + nameMatch[0].length;
      var attrs = Object.create(null);
      var selfClose = false;
      var closed = false;
      while (j < n) {
        while (j < n && /\s/.test(s.charAt(j))) j++;
        var c = s.charAt(j);
        if (c === '>') { j++; closed = true; break; }
        if (c === '/' && s.charAt(j + 1) === '>') { selfClose = true; j += 2; closed = true; break; }
        if (c === '/') { j++; continue; }
        var attrMatch = /^[^\s=>\/"']+/.exec(s.slice(j, j + 120));
        if (!attrMatch) { j++; continue; }
        var attrName = attrMatch[0];
        j += attrName.length;
        while (j < n && /\s/.test(s.charAt(j))) j++;
        var value = '';
        if (s.charAt(j) === '=') {
          j++;
          while (j < n && /\s/.test(s.charAt(j))) j++;
          var quote = s.charAt(j);
          if (quote === '"' || quote === "'") {
            var endQuote = s.indexOf(quote, j + 1);
            if (endQuote < 0) { j = n; break; }
            value = s.slice(j + 1, endQuote);
            j = endQuote + 1;
          } else {
            var bare = /^[^\s>]+/.exec(s.slice(j, j + MAX_PATH_ATTR));
            value = bare ? bare[0] : '';
            j += value.length;
          }
        }
        attrs[attrName] = decodeEntities(value.slice(0, MAX_PATH_ATTR + 1));
      }
      if (!closed) break; // truncated tag at the end of a partial stream
      i = j;
      var tagName = nameMatch[1].toLowerCase().replace(/^svg:/, '');
      if (tagName === 'script' || tagName === 'style') {
        if (!selfClose) {
          var endRaw = lowered.indexOf('</' + tagName, i);
          if (endRaw < 0) { i = n; } else {
            var endRawTag = s.indexOf('>', endRaw);
            i = endRawTag < 0 ? n : endRawTag + 1;
          }
        }
        continue;
      }
      var node = { name: tagName, attrs: attrs, kids: [] };
      container().push(node);
      count++;
      if (count > MAX_PARSE_NODES) { tooBig = true; break; }
      if (!selfClose) stack.push(node);
    }
    if (tooBig) return { ok: false, error: 'Drawing has too many elements' };
    return { ok: true, nodes: rootList };
  }

  function findSvgRoot(nodes) {
    for (var k = 0; k < nodes.length; k++) {
      var node = nodes[k];
      if (!node || node.text !== undefined) continue;
      if (node.name === 'svg') return node;
      var inner = findSvgRoot(node.kids);
      if (inner) return inner;
    }
    return null;
  }

  // ---------------------------------------------------------------------------------------------
  // SVG sanitizer
  // ---------------------------------------------------------------------------------------------
  var SAFE_URL_REF = /url\(\s*(['"]?)#([A-Za-z][\w-]*)\1\s*\)/gi;

  function safeValue(raw, prefix, maxLength) {
    var value = String(raw);
    if (value.length > (maxLength || MAX_ATTR)) return null;
    if (/javascript:|vbscript:|data:|[<>]|\/\*|expression\s*\(|@import|\\/i.test(value)) return null;
    if (/url\s*\(/i.test(value)) {
      var stripped = value.replace(SAFE_URL_REF, '');
      if (/url\s*\(/i.test(stripped)) return null;
      value = value.replace(SAFE_URL_REF, function (_, quote, id) { return 'url(#' + prefix + id + ')'; });
    }
    return value;
  }

  function sanitizeStyle(raw, prefix) {
    var out = [];
    String(raw).split(';').forEach(function (part) {
      var index = part.indexOf(':');
      if (index < 1) return;
      var property = part.slice(0, index).trim().toLowerCase();
      if (!STYLE_PROPS[property]) return;
      var cleaned = safeValue(part.slice(index + 1).trim(), prefix);
      if (cleaned !== null && cleaned !== '') out.push(property + ':' + cleaned);
    });
    return out.join(';');
  }

  function cleanAttributes(elementName, attrs, prefix) {
    var out = Object.create(null);
    Object.keys(attrs).forEach(function (rawName) {
      var lower = rawName.toLowerCase();
      if (lower === 'xlink:href') lower = 'href';
      if (lower.indexOf('on') === 0 || lower.indexOf('xmlns') === 0 || lower.indexOf('xml:') === 0) return;
      var raw = attrs[rawName];
      if (lower === 'id') {
        if (/^[A-Za-z][\w-]{0,40}$/.test(raw)) out.id = prefix + raw;
        return;
      }
      if (lower === 'href') {
        if (HREF_ELEMENTS[elementName] && /^#[A-Za-z][\w-]{0,40}$/.test(raw)) out.href = '#' + prefix + raw.slice(1);
        return;
      }
      if (lower === 'style') {
        var style = sanitizeStyle(raw, prefix);
        if (style) out.style = style;
        return;
      }
      if (lower === 'attributename') {
        if (ANIM_ELEMENTS[elementName] && ANIM_TARGETS[String(raw).trim().toLowerCase()]) out.attributeName = String(raw).trim();
        return;
      }
      var canonical = ATTRS[lower];
      if (!canonical) return;
      var value = safeValue(raw, prefix, canonical === 'd' || canonical === 'path' || canonical === 'points' ? MAX_PATH_ATTR : MAX_ATTR);
      if (value !== null) out[canonical] = value;
    });
    return out;
  }

  function sanitizeSvg(nodes, prefix) {
    var rootNode = findSvgRoot(nodes);
    if (!rootNode) return { ok: false, error: 'No <svg> element found' };
    var count = 0;
    var overflow = false;
    prefix = prefix || '';

    function clean(node, depth) {
      if (overflow) return null;
      if (node.text !== undefined) return null;
      var canonical = ELEMENTS[node.name];
      if (!canonical || depth > MAX_DEPTH) return null;
      count++;
      if (count > MAX_NODES) { overflow = true; return null; }
      var attrs = cleanAttributes(node.name, node.attrs, prefix);
      if (ANIM_ELEMENTS[node.name] && !attrs.attributeName && node.name !== 'animatemotion') return null;
      if (node.name === 'use' && !attrs.href) return null;
      var out = { name: canonical, attrs: attrs, kids: [] };
      var textBudget = MAX_TEXT;
      node.kids.forEach(function (child) {
        if (child.text !== undefined) {
          if (!TEXT_ELEMENTS[node.name] || textBudget <= 0) return;
          var text = child.text.replace(/\u0000/g, '').slice(0, textBudget);
          textBudget -= text.length;
          if (text) out.kids.push({ text: text });
          return;
        }
        var cleaned = clean(child, depth + 1);
        if (cleaned) out.kids.push(cleaned);
      });
      return out;
    }

    var cleanedRoot = clean(rootNode, 0);
    if (overflow) return { ok: false, error: 'Drawing has too many elements' };
    if (!cleanedRoot) return { ok: false, error: 'Unsupported drawing' };
    var attrs = cleanedRoot.attrs;
    var width = parseFloat(attrs.width);
    var height = parseFloat(attrs.height);
    if (!attrs.viewBox || !/^[\s\d.,eE+-]+$/.test(attrs.viewBox)) {
      attrs.viewBox = isFinite(width) && isFinite(height) && width > 0 && height > 0 ? '0 0 ' + width + ' ' + height : '0 0 400 300';
    }
    delete attrs.width;
    delete attrs.height;
    delete attrs.style;
    delete attrs.id;
    attrs.preserveAspectRatio = attrs.preserveAspectRatio || 'xMidYMid meet';
    attrs.role = 'img';
    return { ok: true, root: cleanedRoot };
  }

  function escapeText(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(value) {
    return escapeText(value).replace(/"/g, '&quot;');
  }
  function svgToString(node) {
    if (node.text !== undefined) return escapeText(node.text);
    var attrs = Object.keys(node.attrs).map(function (key) { return ' ' + key + '="' + escapeAttr(node.attrs[key]) + '"'; }).join('');
    return '<' + node.name + attrs + '>' + node.kids.map(svgToString).join('') + '</' + node.name + '>';
  }

  var svgCounter = 0;
  function parseAndSanitizeSvg(source, prefix) {
    var text = String(source || '');
    if (text.length > MAX_SVG_CHARS) return { ok: false, error: 'Drawing is too large' };
    var parsed = parseMarkup(text);
    if (!parsed.ok) return parsed;
    return sanitizeSvg(parsed.nodes, prefix);
  }

  function buildSvgElement(doc, node, isRoot) {
    var element = doc.createElementNS(SVG_NS, node.name);
    Object.keys(node.attrs).forEach(function (key) {
      if (key === 'href') element.setAttribute('href', node.attrs[key]);
      else element.setAttribute(key, node.attrs[key]);
    });
    if (isRoot) element.setAttribute('style', 'display:block;width:100%;height:auto;max-height:78vh');
    node.kids.forEach(function (child) {
      if (child.text !== undefined) element.appendChild(doc.createTextNode(child.text));
      else element.appendChild(buildSvgElement(doc, child, false));
    });
    return element;
  }

  // ---------------------------------------------------------------------------------------------
  // Sandboxed HTML frame
  // ---------------------------------------------------------------------------------------------
  var CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; " +
    "font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; " +
    "form-action 'none'; base-uri 'none'";

  function frameThemeCss(dark) {
    var light = '--sd-fg:#1b2033;--sd-muted:#5d667d;--sd-card:#f4f6fb;--sd-border:#dde2ee;--sd-accent:#4d6bfe;--sd-bg:transparent;';
    var night = '--sd-fg:#e9ecf5;--sd-muted:#9aa3b8;--sd-card:#1b1f2e;--sd-border:#2b3145;--sd-accent:#7c8cff;--sd-bg:transparent;';
    return ':root{color-scheme:' + (dark ? 'dark' : 'light') + ';' + (dark ? night : light) + '}' +
      '*{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent}' +
      'body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Bengali","Noto Sans",sans-serif;color:var(--sd-fg);' +
      '-webkit-text-size-adjust:100%;overflow-wrap:anywhere}';
  }

  function frameBootScript(id) {
    return '(function(){var id=' + JSON.stringify(String(id)) + ';function send(t,x){try{parent.postMessage({sds:1,id:id,type:t,v:x},"*")}catch(e){}}' +
      'var last=0;function h(){var d=document.documentElement,b=document.body;var v=Math.ceil(Math.max(d?d.scrollHeight:0,b?b.scrollHeight:0));' +
      'if(v!==last){last=v;send("h",v)}}' +
      'window.addEventListener("error",function(e){send("error",String(e&&e.message||"error").slice(0,200))});' +
      'window.addEventListener("unhandledrejection",function(e){send("error",String(e&&e.reason||"rejection").slice(0,200))});' +
      'document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a");if(a){e.preventDefault()}},true);' +
      'window.addEventListener("load",function(){send("ready");h();if(typeof ResizeObserver==="function"){new ResizeObserver(h).observe(document.documentElement)}else{setInterval(h,500)}});' +
      'setTimeout(function(){send("ready");h()},120);})();';
  }

  function buildDocument(html, id, dark) {
    var body = String(html || '').slice(0, MAX_HTML_CHARS)
      .replace(/<meta[^>]+http-equiv\s*=\s*["']?\s*refresh[^>]*>/gi, '')
      .replace(/<base\b[^>]*>/gi, '');
    return '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>' + frameThemeCss(dark) + '</style>' +
      '<script>' + frameBootScript(id) + '</script></head><body>' + body;
  }

  // ---------------------------------------------------------------------------------------------
  // Prompt extension
  // ---------------------------------------------------------------------------------------------
  var VISUAL_INTENT = new RegExp('(' + [
    '\\bdraw\\b', '\\bdrawing\\b', '\\bsketch\\b', '\\billustrat', '\\bdesign\\b', 'mock\\s?-?up', 'wireframe', 'prototype',
    'poster', 'infographic', 'diagram', 'flow\\s?chart', 'visuali[sz]', 'animat', 'simulat', '\\bgame\\b', 'interactive',
    '\\bui\\b', '\\bux\\b', 'landing page', '\\blogo\\b', '\\bicon\\b', 'app screen', 'dashboard', 'infograph', 'mind map',
    'concept map', 'floor plan', 'blueprint', 'timeline', 'widget', 'calculator', 'visual\\b', '\\bscene\\b', 'artwork',
    'আঁক', 'ডিজাইন', 'ইলাস্ট্রেশন', 'মকআপ', 'পোস্টার', 'ডায়াগ্রাম', 'ভিজ্যুয়াল', 'ভিজুয়াল', 'অ্যানিমেশন', 'এনিমেশন', 'সিমুলেশন',
    'গেম', 'ইন্টারঅ্যাক্টিভ', 'ইন্টারঅ্যাকটিভ', 'প্রোটোটাইপ', 'লোগো', 'আইকন', 'ইউআই', 'ইন্টারফেস', 'নকশা', 'ছবি', 'চিত্র', 'দেখাও'
  ].join('|') + ')', 'i');

  var PROMPT_EXT = EXT_MARK + '\n## Free-form visuals (SDS GenUI v1.1)\n' +
    'Besides sds-ui you can draw and build anything the user wants to SEE or USE inside this chat. Pick exactly ONE block type for the visual and use it instead of sds-ui when it fits better:\n' +
    '- ```sds-svg — one complete <svg> element for illustrations, icons, logos, posters, maps, scenes, infographics, diagrams and charts. Use viewBox (no width/height). Allowed: shapes, paths, text, gradients, patterns, clipPath, mask, filters, <use href="#id">, and SMIL animate/animateTransform/set. Forbidden (they are removed): <script>, <style>, <foreignObject>, <image>, <a>, event attributes and any external or data: reference.\n' +
    '- ```sds-html — one complete self-contained HTML document (inline CSS plus vanilla JavaScript) for interactive tools, games, simulations, animations, canvas drawings and UI or app-screen mockups. It runs in a sandboxed frame with NO network: never use fetch/XHR, CDN scripts or libraries, external fonts or images, localStorage, forms, popups or links. Draw with CSS, inline SVG, canvas, emoji and data: URIs.\n' +
    'Rules: mobile-first (about 360px wide, touch targets at least 44px), responsive, no horizontal scroll, readable contrast. Use the CSS variables var(--sd-fg), var(--sd-muted), var(--sd-card), var(--sd-border) and var(--sd-accent) for colours so the design fits light and dark mode, and keep the page background transparent. Keep each block under about 100 KB, valid and complete. Put one short explanation outside the block, never a second copy of the code. ' +
    'Use sds-ui for simple dashboards and calculators, sds-svg for static drawings, sds-html for anything interactive or custom designed. If the user asks for project files, code or an app to run in the Linux sandbox, use the normal tools or code blocks instead. This extension overrides the earlier rule against SVG/HTML output, but only inside sds-svg and sds-html blocks.\n' +
    '[/SDS:GENUI_FREE]';

  function wantsVisual(text) {
    return VISUAL_INTENT.test(String(text || ''));
  }

  function extendBody(bodyText) {
    var data;
    try { data = JSON.parse(bodyText); } catch (_) { return null; }
    if (!isObject(data)) return null;
    if (typeof data.prompt === 'string') {
      if (data.prompt.indexOf(EXT_MARK) >= 0 || !wantsVisual(data.prompt)) return null;
      data.prompt = PROMPT_EXT + '\n\n' + data.prompt;
      return JSON.stringify(data);
    }
    var messages = Array.isArray(data.messages) ? data.messages : (isObject(data.data) && Array.isArray(data.data.messages) ? data.data.messages : null);
    if (messages) {
      for (var k = messages.length - 1; k >= 0; k--) {
        var message = messages[k];
        if (!isObject(message)) continue;
        var role = String(message.role || message.author || '').toLowerCase();
        if (role !== 'user' && role !== 'human') continue;
        if (typeof message.content !== 'string') return null;
        if (message.content.indexOf(EXT_MARK) >= 0 || !wantsVisual(message.content)) return null;
        message.content = PROMPT_EXT + '\n\n' + message.content;
        return JSON.stringify(data);
      }
    }
    return null;
  }

  var requestPattern = /\/(?:chat\/completion|chat\/edit_message)(?:[/?#]|$)/;
  function isTargetUrl(url) {
    try { return requestPattern.test(String(url || '')); } catch (_) { return false; }
  }
  function isEnabled() {
    try { return !(root.localStorage && root.localStorage.getItem(PREF_KEY) === '0'); } catch (_) { return true; }
  }
  function setEnabled(value) {
    try { if (root.localStorage) root.localStorage.setItem(PREF_KEY, value ? '1' : '0'); } catch (_) {}
  }

  function installNetworkHooks() {
    if (root.__sdGenUIHtmlNet) return;
    root.__sdGenUIHtmlNet = true;
    if (typeof root.fetch === 'function') {
      var originalFetch = root.fetch;
      root.fetch = function (input, init) {
        try {
          var url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
          if (isEnabled() && isTargetUrl(url)) {
            if (init && typeof init.body === 'string') {
              var extended = extendBody(init.body);
              if (extended) return originalFetch.call(root, input, Object.assign({}, init, { body: extended }));
            } else if (!(init && init.body) && input && typeof input.clone === 'function' && typeof input.text === 'function') {
              return input.clone().text().then(function (text) {
                var next = extendBody(text);
                if (!next) return originalFetch.call(root, input, init);
                return originalFetch.call(root, new root.Request(input, { body: next }), init);
              });
            }
          }
        } catch (_) {}
        return originalFetch.apply(this, arguments);
      };
    }
    if (root.XMLHttpRequest && root.XMLHttpRequest.prototype) {
      var proto = root.XMLHttpRequest.prototype;
      var originalOpen = proto.open;
      var originalSend = proto.send;
      proto.open = function (method, url) {
        try { this.__sdFreeUrl = String(url || ''); } catch (_) {}
        return originalOpen.apply(this, arguments);
      };
      proto.send = function (body) {
        try {
          if (typeof body === 'string' && isEnabled() && isTargetUrl(this.__sdFreeUrl)) {
            var extended = extendBody(body);
            if (extended) return originalSend.call(this, extended);
          }
        } catch (_) {}
        return originalSend.apply(this, arguments);
      };
    }
  }

  // ---------------------------------------------------------------------------------------------
  // DOM layer (only runs inside a real page)
  // ---------------------------------------------------------------------------------------------
  var STYLE = [
    '.sd-free{margin:10px 0;border:1px solid rgba(127,127,127,.28);border-radius:16px;background:rgba(127,127,127,.07);overflow:hidden;max-width:100%}',
    '.sd-free-bar{display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid rgba(127,127,127,.2);font-size:12.5px}',
    '.sd-free-title{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.75;font-weight:600}',
    '.sd-free-btn{appearance:none;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;border-radius:999px;padding:4px 11px;font:inherit;line-height:1.2;cursor:pointer}',
    '.sd-free-btn:active{background:rgba(127,127,127,.2)}',
    '.sd-free-body{position:relative;padding:0}',
    '.sd-free[data-kind=svg] .sd-free-body{padding:8px}',
    '.sd-free-frame{display:block;width:100%;height:180px;border:0;background:transparent}',
    '.sd-free-status{padding:14px;font-size:13px;opacity:.75}',
    '.sd-free-status[data-tone=error]{color:#e5484d;opacity:1}',
    '.sd-free-note{padding:6px 12px 8px;font-size:12px;color:#e5484d}',
    'pre[data-sd-free-hidden="1"]:not([data-sd-free-showcode="1"]){display:none!important}',
    '.sd-free.sd-free-full{position:fixed;inset:0;z-index:2147483000;border-radius:0;border:0;display:flex;flex-direction:column;background:Canvas;color:CanvasText;margin:0}',
    '.sd-free.sd-free-full .sd-free-body{flex:1;min-height:0;overflow:auto}',
    '.sd-free.sd-free-full .sd-free-frame{height:100%!important}',
    'html.sd-free-lock{overflow:hidden!important}'
  ].join('\n');

  var doc = root.document;
  var states = typeof WeakMap === 'function' ? new WeakMap() : null;
  var registry = Object.create(null);
  var idCounter = 0;
  var fullscreen = null;
  var scanTimer = null;
  var observer = null;
  var started = false;

  function isBangla() {
    try {
      var engine = root.__sdEngine;
      var language = engine && typeof engine.locale === 'function' ? engine.locale() : '';
      return String(language || (root.navigator && root.navigator.language) || '').toLowerCase().indexOf('bn') === 0;
    } catch (_) { return false; }
  }
  function label(en, bn) { return isBangla() ? bn : en; }

  function el(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function isDarkPage() {
    try {
      var style = root.getComputedStyle(doc.body);
      var match = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?/.exec(style.backgroundColor || '');
      if (match && (match[4] === undefined || parseFloat(match[4]) > 0.4)) {
        return (0.299 * match[1] + 0.587 * match[2] + 0.114 * match[3]) < 140;
      }
      var text = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(style.color || '');
      if (text) return (0.299 * text[1] + 0.587 * text[2] + 0.114 * text[3]) > 150;
    } catch (_) {}
    return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function injectStyle() {
    if (doc.getElementById('sd-free-css')) return;
    var style = doc.createElement('style');
    style.id = 'sd-free-css';
    style.textContent = STYLE;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function setFullscreen(state) {
    if (fullscreen && fullscreen !== state) {
      fullscreen.card.classList.remove('sd-free-full');
      fullscreen.expand.textContent = label('Expand', 'বড় করুন');
    }
    fullscreen = state || null;
    if (state) {
      state.card.classList.add('sd-free-full');
      state.expand.textContent = label('Close', 'বন্ধ');
    }
    doc.documentElement.classList.toggle('sd-free-lock', !!state);
  }
  function closeFullscreen() {
    if (!fullscreen) return false;
    var current = fullscreen;
    setFullscreen(null);
    current.card.classList.remove('sd-free-full');
    current.expand.textContent = label('Expand', 'বড় করুন');
    return true;
  }

  function showStatus(state, text, tone) {
    var status = el('div', 'sd-free-status', text);
    if (tone) status.setAttribute('data-tone', tone);
    state.body.replaceChildren(status);
    state.frame = null;
  }

  function createCard(code, pre, kind) {
    var state = { kind: kind, code: code, pre: pre, last: '', timer: null, rendered: null, ok: false, ready: false, mode: 'srcdoc', readyTimer: null };
    state.card = el('section', 'sd-free');
    state.card.setAttribute('data-kind', kind);
    var bar = el('div', 'sd-free-bar');
    bar.appendChild(el('span', 'sd-free-title', kind === 'html' ? label('Interactive design', 'ইন্টারঅ্যাক্টিভ ডিজাইন') : label('Illustration', 'ইলাস্ট্রেশন')));
    if (kind === 'html') {
      var reload = el('button', 'sd-free-btn', label('Reload', 'রিলোড'));
      reload.type = 'button';
      reload.addEventListener('click', function () { renderState(state, true); });
      bar.appendChild(reload);
    }
    var codeButton = el('button', 'sd-free-btn', label('Code', 'কোড'));
    codeButton.type = 'button';
    codeButton.addEventListener('click', function () {
      var shown = pre.getAttribute('data-sd-free-showcode') === '1';
      pre.setAttribute('data-sd-free-showcode', shown ? '0' : '1');
    });
    bar.appendChild(codeButton);
    state.expand = el('button', 'sd-free-btn', label('Expand', 'বড় করুন'));
    state.expand.type = 'button';
    state.expand.addEventListener('click', function () { setFullscreen(fullscreen === state ? null : state); });
    bar.appendChild(state.expand);
    state.body = el('div', 'sd-free-body');
    state.card.appendChild(bar);
    state.card.appendChild(state.body);
    pre.parentNode.insertBefore(state.card, pre);
    pre.setAttribute('data-sd-free-hidden', '1');
    pre.setAttribute('data-sd-free-showcode', '0');
    showStatus(state, kind === 'html' ? label('Building the design…', 'ডিজাইন তৈরি হচ্ছে…') : label('Drawing…', 'আঁকা হচ্ছে…'));
    return state;
  }

  function renderSvg(state) {
    var source = state.last;
    svgCounter++;
    var result = parseAndSanitizeSvg(source, 'sdf' + svgCounter + '-');
    if (!result.ok) {
      if (!state.ok) {
        showStatus(state, label('Could not draw this: ', 'আঁকা যায়নি: ') + result.error, 'error');
        state.pre.setAttribute('data-sd-free-showcode', '1');
      }
      return;
    }
    state.body.replaceChildren(buildSvgElement(doc, result.root, true));
    state.ok = true;
    state.rendered = source;
    state.pre.setAttribute('data-sd-free-showcode', '0');
  }

  function renderHtml(state, force) {
    var source = state.last;
    if (!force && state.rendered === source) return;
    if (source.length > MAX_HTML_CHARS) {
      showStatus(state, label('This design is too large to preview.', 'ডিজাইনটি প্রিভিউয়ের জন্য অনেক বড়।'), 'error');
      state.pre.setAttribute('data-sd-free-showcode', '1');
      return;
    }
    if (!state.id) { state.id = 'f' + (++idCounter); }
    registry[state.id] = state;
    state.rendered = source;
    state.ready = false;
    state.mode = 'srcdoc';
    mountFrame(state);
  }

  function mountFrame(state) {
    var iframe = doc.createElement('iframe');
    iframe.className = 'sd-free-frame';
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('title', 'Generated design');
    iframe.setAttribute('allow', '');
    var documentText = buildDocument(state.rendered, state.id, isDarkPage());
    if (state.mode === 'srcdoc') {
      iframe.srcdoc = documentText;
    } else {
      iframe.src = FRAME_URL + '#' + state.id;
    }
    state.frame = iframe;
    state.pending = documentText;
    state.body.replaceChildren(iframe);
    if (state.readyTimer) clearTimeout(state.readyTimer);
    state.readyTimer = setTimeout(function () {
      if (state.ready || state.frame !== iframe) return;
      if (state.mode === 'srcdoc') {
        state.mode = 'url';
        mountFrame(state);
      } else {
        showStatus(state, label('The preview could not start here. Use Code to see the source.', 'এখানে প্রিভিউ চালু হয়নি। সোর্স দেখতে "কোড" চাপুন।'), 'error');
        state.pre.setAttribute('data-sd-free-showcode', '1');
      }
    }, READY_TIMEOUT_MS);
  }

  function renderState(state, force) {
    state.timer = null;
    try {
      if (state.kind === 'svg') renderSvg(state);
      else renderHtml(state, force);
    } catch (error) {
      try { console.warn('[SDS GenUI free] render failed', error); } catch (_) {}
      showStatus(state, label('Could not render this block.', 'ব্লকটি রেন্ডার করা যায়নি।'), 'error');
      state.pre.setAttribute('data-sd-free-showcode', '1');
    }
  }

  function schedule(state) {
    if (state.timer) clearTimeout(state.timer);
    var complete = state.kind === 'html' ? /<\/html\s*>/i.test(state.last) : /<\/svg\s*>/i.test(state.last);
    var wait = state.kind === 'svg' ? SETTLE_SVG_MS : (complete ? SETTLE_HTML_DONE_MS : SETTLE_HTML_IDLE_MS);
    state.timer = setTimeout(function () { renderState(state, false); }, wait);
  }

  function blockKind(code) {
    var cls = code.className || '';
    if (/(?:^|\s)(?:language|lang)-sds-svg(?:\s|$)/.test(cls)) return 'svg';
    if (/(?:^|\s)(?:language|lang)-sds-html(?:\s|$)/.test(cls)) return 'html';
    return null;
  }

  function scan() {
    if (!doc || !doc.body || !states) return;
    var nodes = doc.querySelectorAll('code.language-sds-svg, code.lang-sds-svg, code.language-sds-html, code.lang-sds-html');
    for (var i = 0; i < nodes.length; i++) {
      var code = nodes[i];
      var kind = blockKind(code);
      if (!kind || !isEnabled()) continue;
      if (code.closest && code.closest('textarea, [contenteditable="true"], .sd-free')) continue;
      var pre = code.closest ? code.closest('pre') : code.parentNode;
      if (!pre || !pre.parentNode) continue;
      var state = states.get(code);
      if (!state) {
        state = createCard(code, pre, kind);
        states.set(code, state);
      }
      var text = code.textContent || '';
      if (text !== state.last) {
        state.last = text;
        schedule(state);
      }
    }
  }

  function scheduleScan() {
    if (scanTimer !== null) return;
    scanTimer = setTimeout(function () { scanTimer = null; scan(); }, 160);
  }

  function onMessage(event) {
    var data = event && event.data;
    if (!isObject(data) || data.sds !== 1 || typeof data.id !== 'string') return;
    var state = registry[data.id];
    if (!state || !state.frame || event.source !== state.frame.contentWindow) return;
    if (data.type === 'frame-loaded') {
      try { state.frame.contentWindow.postMessage({ sds: 1, type: 'render', html: state.pending }, '*'); } catch (_) {}
    } else if (data.type === 'ready') {
      state.ready = true;
      if (state.readyTimer) { clearTimeout(state.readyTimer); state.readyTimer = null; }
      state.pre.setAttribute('data-sd-free-showcode', '0');
    } else if (data.type === 'h') {
      var height = Math.max(80, Math.min(2400, Number(data.v) || 0));
      if (height && state.frame) state.frame.style.height = height + 'px';
    } else if (data.type === 'error') {
      var note = state.card.querySelector('.sd-free-note');
      if (!note) { note = el('div', 'sd-free-note'); state.card.appendChild(note); }
      note.textContent = label('Script error: ', 'স্ক্রিপ্ট ত্রুটি: ') + String(data.v || '').slice(0, 160);
    }
  }

  function hookBack() {
    var attempts = 0;
    function wrap() {
      var previous = root.__sdHandleBack;
      if (typeof previous === 'function') {
        if (previous.__sdFreeWrapped) return;
        var wrapped = function () {
          if (closeFullscreen()) return true;
          return previous.apply(this, arguments);
        };
        wrapped.__sdFreeWrapped = true;
        root.__sdHandleBack = wrapped;
        return;
      }
      if (++attempts < 20) setTimeout(wrap, 500);
    }
    wrap();
  }

  function start() {
    if (started || !doc || !doc.body || typeof MutationObserver !== 'function') return;
    started = true;
    injectStyle();
    root.addEventListener('message', onMessage);
    hookBack();
    scan();
    observer = new MutationObserver(scheduleScan);
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
  }

  root.__sdGenUIHtml = {
    version: 1,
    parseMarkup: parseMarkup,
    sanitizeSvg: sanitizeSvg,
    parseAndSanitizeSvg: parseAndSanitizeSvg,
    svgToString: svgToString,
    buildDocument: buildDocument,
    wantsVisual: wantsVisual,
    extendBody: extendBody,
    promptExtension: PROMPT_EXT,
    csp: CSP,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    setRequestPattern: function (pattern) { if (pattern instanceof RegExp) requestPattern = pattern; },
    scan: scan,
    start: start
  };

  installNetworkHooks();
  if (doc && doc.body) start();
  else if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('DOMContentLoaded', start, { once: true });
})(window);
