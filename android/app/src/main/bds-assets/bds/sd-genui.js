(function (root) {
  'use strict';
  if (root.__sdGenUI && root.__sdGenUI.version === 1) return;

  var MAX_SPEC_CHARS = 25000;
  var MAX_COMPONENTS = 40;
  var MAX_TEXT = 2400;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var COLORS = ['#818cf8', '#2dd4bf', '#f59e0b', '#f472b6', '#60a5fa', '#a3e635', '#fb7185', '#c084fc'];

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function cleanText(value, max) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value).replace(/\u0000/g, '').slice(0, max || MAX_TEXT);
  }
  function numberInRange(value, fallback, min, max) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = fallback;
    return Math.min(max, Math.max(min, number));
  }
  function choose(value, list, fallback) {
    return list.indexOf(value) >= 0 ? value : fallback;
  }
  function validId(value) {
    return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value);
  }

  // A small arithmetic parser keeps model-authored formulas away from dynamic code execution.
  function tokenizeFormula(source) {
    var input = String(source || '');
    if (!input.trim() || input.length > 160) throw new Error('Empty or oversized formula');
    var tokens = [];
    var index = 0;
    while (index < input.length) {
      var remaining = input.slice(index);
      var whitespace = /^\s+/.exec(remaining);
      if (whitespace) { index += whitespace[0].length; continue; }
      var numeric = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(remaining);
      if (numeric) {
        tokens.push({ type: 'number', value: Number(numeric[0]) });
        index += numeric[0].length;
        continue;
      }
      var name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(remaining);
      if (name) {
        tokens.push({ type: 'name', value: name[0] });
        index += name[0].length;
        continue;
      }
      var ch = input.charAt(index);
      if ('+-*/%^(),'.indexOf(ch) >= 0) {
        tokens.push({ type: 'symbol', value: ch });
        index++;
        continue;
      }
      throw new Error('Unsupported formula token');
    }
    return tokens;
  }

  function evaluateFormula(source, state) {
    var tokens = tokenizeFormula(source);
    var position = 0;
    state = isObject(state) ? state : {};
    function peek(value) {
      var token = tokens[position];
      return !!token && (value === undefined || token.value === value);
    }
    function take(value) {
      if (!peek(value)) throw new Error('Unexpected formula token');
      return tokens[position++];
    }
    function finite(value) {
      if (!Number.isFinite(value) || Math.abs(value) > 1e15) throw new Error('Formula result out of range');
      return value;
    }
    function expression() {
      var value = term();
      while (peek('+') || peek('-')) {
        var operator = tokens[position++].value;
        var right = term();
        value = finite(operator === '+' ? value + right : value - right);
      }
      return value;
    }
    function term() {
      var value = unary();
      while (peek('*') || peek('/') || peek('%')) {
        var operator = tokens[position++].value;
        var right = unary();
        if ((operator === '/' || operator === '%') && right === 0) throw new Error('Division by zero');
        value = finite(operator === '*' ? value * right : operator === '/' ? value / right : value % right);
      }
      return value;
    }
    function unary() {
      if (peek('+')) { position++; return unary(); }
      if (peek('-')) { position++; return finite(-unary()); }
      return power();
    }
    function power() {
      var value = primary();
      if (peek('^')) {
        position++;
        value = finite(Math.pow(value, unary()));
      }
      return value;
    }
    function primary() {
      if (peek('(')) {
        position++;
        var grouped = expression();
        take(')');
        return grouped;
      }
      var token = tokens[position++];
      if (!token) throw new Error('Missing formula value');
      if (token.type === 'number') return finite(token.value);
      if (token.type !== 'name') throw new Error('Expected formula value');
      if (peek('(')) {
        position++;
        var args = [];
        if (!peek(')')) {
          args.push(expression());
          while (peek(',')) { position++; args.push(expression()); }
        }
        take(')');
        var functions = {
          abs: function (a) { return Math.abs(a[0]); },
          ceil: function (a) { return Math.ceil(a[0]); },
          floor: function (a) { return Math.floor(a[0]); },
          max: function (a) { return Math.max.apply(Math, a); },
          min: function (a) { return Math.min.apply(Math, a); },
          pow: function (a) { return Math.pow(a[0], a[1]); },
          round: function (a) { return Math.round(a[0]); },
          sqrt: function (a) { return Math.sqrt(a[0]); }
        };
        if (!Object.prototype.hasOwnProperty.call(functions, token.value)) throw new Error('Function is not allowed');
        var validCount = token.value === 'min' || token.value === 'max' ? args.length >= 1 :
          token.value === 'pow' ? args.length === 2 : args.length === 1;
        if (!validCount) throw new Error('Wrong number of formula arguments');
        return finite(functions[token.value](args));
      }
      if (token.value === 'pi') return Math.PI;
      if (token.value === 'e') return Math.E;
      if (!Object.prototype.hasOwnProperty.call(state, token.value)) throw new Error('Unknown formula variable');
      var variable = state[token.value];
      if (typeof variable === 'boolean') return variable ? 1 : 0;
      if (typeof variable === 'number' && Number.isFinite(variable)) return finite(variable);
      if (typeof variable === 'string' && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(variable)) return finite(Number(variable));
      throw new Error('Formula variable is not numeric');
    }
    var result = expression();
    if (position !== tokens.length) throw new Error('Extra formula tokens');
    return finite(result);
  }

  function verifyFormula(source, state) {
    if (source === undefined || source === null || source === '') return;
    if (typeof source !== 'string') throw new Error('Formula must be text');
    evaluateFormula(source, state);
  }

  function sanitizeComponent(input, ids) {
    if (!isObject(input)) throw new Error('Component must be an object');
    var type = cleanText(input.type, 32);
    var out = { type: type };
    if (type === 'text') {
      out.text = cleanText(input.text, MAX_TEXT);
      out.tone = choose(input.tone, ['normal', 'secondary', 'strong'], 'normal');
    } else if (type === 'stat') {
      out.label = cleanText(input.label, 100);
      out.value = typeof input.value === 'number' && Number.isFinite(input.value) ? input.value : cleanText(input.value, 180);
      out.formula = cleanText(input.formula, 160);
      out.format = choose(input.format, ['number', 'integer', 'currency', 'percent'], 'number');
      out.currency = /^[A-Z]{3}$/.test(input.currency || '') ? input.currency : 'USD';
      out.caption = cleanText(input.caption, 240);
    } else if (type === 'badge') {
      out.label = cleanText(input.label, 120);
      out.tone = choose(input.tone, ['neutral', 'info', 'success', 'warning', 'danger'], 'neutral');
    } else if (type === 'progress') {
      out.label = cleanText(input.label, 120);
      out.value = numberInRange(input.value, 0, 0, 1e12);
      out.formula = cleanText(input.formula, 160);
      out.max = numberInRange(input.max, 100, 0.000001, 1e12);
      out.format = choose(input.format, ['number', 'integer', 'currency', 'percent'], 'percent');
    } else if (type === 'slider') {
      out.id = input.id;
      if (!validId(out.id) || ids[out.id]) throw new Error('Control IDs must be unique identifiers');
      ids[out.id] = true;
      out.label = cleanText(input.label, 120);
      out.min = numberInRange(input.min, 0, -1e9, 1e9);
      out.max = numberInRange(input.max, 100, -1e9, 1e9);
      if (out.max <= out.min) throw new Error('Slider max must be greater than min');
      out.step = numberInRange(input.step, 1, 0.000001, Math.max(0.000001, out.max - out.min));
      out.value = numberInRange(input.value, out.min, out.min, out.max);
      out.format = choose(input.format, ['number', 'integer', 'currency', 'percent'], 'number');
      out.currency = /^[A-Z]{3}$/.test(input.currency || '') ? input.currency : 'USD';
    } else if (type === 'select') {
      out.id = input.id;
      if (!validId(out.id) || ids[out.id]) throw new Error('Control IDs must be unique identifiers');
      ids[out.id] = true;
      out.label = cleanText(input.label, 120);
      if (!Array.isArray(input.options) || input.options.length < 1 || input.options.length > 20) throw new Error('Select needs 1–20 options');
      out.options = input.options.map(function (option) { return cleanText(option, 120); });
      if (out.options.some(function (option) { return !option; })) throw new Error('Select options cannot be empty');
      out.value = out.options.indexOf(cleanText(input.value, 120)) >= 0 ? cleanText(input.value, 120) : out.options[0];
    } else if (type === 'toggle') {
      out.id = input.id;
      if (!validId(out.id) || ids[out.id]) throw new Error('Control IDs must be unique identifiers');
      ids[out.id] = true;
      out.label = cleanText(input.label, 120);
      out.value = input.value === true;
    } else if (type === 'chart') {
      out.kind = choose(input.kind, ['bar', 'line', 'pie'], 'bar');
      out.title = cleanText(input.title, 160);
      out.description = cleanText(input.description, 240);
      if (!Array.isArray(input.data) || input.data.length < 1 || input.data.length > 24) throw new Error('Chart needs 1–24 points');
      out.data = input.data.map(function (point) {
        if (!isObject(point)) throw new Error('Chart point must be an object');
        return {
          label: cleanText(point.label, 70) || 'Item',
          value: numberInRange(point.value, 0, -1e12, 1e12),
          formula: cleanText(point.formula, 160)
        };
      });
    } else if (type === 'table') {
      if (!Array.isArray(input.columns) || input.columns.length < 1 || input.columns.length > 8) throw new Error('Table needs 1–8 columns');
      out.columns = input.columns.map(function (column) { return cleanText(column, 80); });
      if (!Array.isArray(input.rows) || input.rows.length > 20) throw new Error('Table supports up to 20 rows');
      out.rows = input.rows.map(function (row) {
        if (!Array.isArray(row) || row.length > out.columns.length) throw new Error('Table row does not fit its columns');
        var cells = row.map(function (cell) { return cleanText(cell, 240); });
        while (cells.length < out.columns.length) cells.push('');
        return cells;
      });
    } else if (type === 'button') {
      out.label = cleanText(input.label, 120);
      if (input.action !== 'copy') throw new Error('Only the copy action is available');
      out.action = 'copy';
      out.value = cleanText(input.value, 800);
    } else {
      throw new Error('Unsupported UI component: ' + type);
    }
    return out;
  }

  function parseSpec(input) {
    try {
      var data = input;
      if (typeof input === 'string') {
        if (input.length > MAX_SPEC_CHARS) throw new Error('UI specification is too large');
        data = JSON.parse(input);
      }
      if (!isObject(data) || data.version !== 1 || !Array.isArray(data.components)) {
        throw new Error('Expected version 1 and a components array');
      }
      if (data.components.length < 1 || data.components.length > MAX_COMPONENTS) throw new Error('Component count is out of range');
      var ids = Object.create(null);
      var spec = {
        version: 1,
        title: cleanText(data.title, 120),
        description: cleanText(data.description, 300),
        components: data.components.map(function (component) { return sanitizeComponent(component, ids); })
      };
      var state = Object.create(null);
      spec.components.forEach(function (component) {
        if (component.type === 'slider' || component.type === 'select' || component.type === 'toggle') state[component.id] = component.value;
      });
      spec.components.forEach(function (component) {
        if (component.formula) verifyFormula(component.formula, state);
        if (component.type === 'chart') component.data.forEach(function (point) {
          if (point.formula) verifyFormula(point.formula, state);
        });
      });
      return { ok: true, spec: spec };
    } catch (error) {
      return { ok: false, error: cleanText(error && error.message, 180) || 'Invalid UI specification' };
    }
  }

  function formatValue(value, format, currency) {
    var number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return value === undefined || value === null || value === '' ? '—' : cleanText(value, 160);
    try {
      if (format === 'currency') return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(number);
      if (format === 'integer') return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(number);
      if (format === 'percent') return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number) + '%';
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number);
    } catch (_) {
      return String(format === 'integer' ? Math.round(number) : Math.round(number * 100) / 100) + (format === 'percent' ? '%' : '');
    }
  }
  function templateText(value, state) {
    return cleanText(value, MAX_TEXT).replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]{0,31})\s*\}\}/g, function (_, key) {
      if (!Object.prototype.hasOwnProperty.call(state, key)) return '';
      var value = state[key];
      return typeof value === 'boolean' ? (value ? 'On' : 'Off') : formatValue(value, 'number');
    });
  }
  function valueOf(component, state) {
    if (component.formula) {
      try { return evaluateFormula(component.formula, state); } catch (_) { return null; }
    }
    return component.value;
  }
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function svgElement(tag, attrs, text) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, String(attrs[key])); });
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function chartValues(component, state) {
    return component.data.map(function (point) {
      var value = point.formula ? valueOf({ formula: point.formula }, state) : point.value;
      return { label: point.label, value: Number.isFinite(value) ? value : 0 };
    });
  }
  function renderChart(target, component, state) {
    var values = chartValues(component, state);
    var svg = svgElement('svg', {
      viewBox: component.kind === 'pie' ? '0 0 320 210' : '0 0 360 220',
      role: 'img', 'aria-label': component.title || 'Data chart',
      class: 'sd-genui-chart-svg', preserveAspectRatio: 'xMidYMid meet'
    });
    if (component.kind === 'pie') {
      var positive = values.map(function (point) { return Math.max(0, point.value); });
      var total = positive.reduce(function (sum, number) { return sum + number; }, 0) || 1;
      var angle = -Math.PI / 2;
      var cx = 95, cy = 100, radius = 72;
      values.forEach(function (point, index) {
        var slice = positive[index] / total * Math.PI * 2;
        if (slice <= 0) return;
        var end = angle + slice;
        var x1 = cx + radius * Math.cos(angle), y1 = cy + radius * Math.sin(angle);
        var x2 = cx + radius * Math.cos(end), y2 = cy + radius * Math.sin(end);
        var arc = slice > Math.PI ? 1 : 0;
        var path = 'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + radius + ' ' + radius + ' 0 ' + arc + ' 1 ' + x2 + ' ' + y2 + ' Z';
        svg.appendChild(svgElement('path', { d: path, fill: COLORS[index % COLORS.length], stroke: 'currentColor', 'stroke-opacity': 0.15, 'stroke-width': 1 }));
        angle = end;
      });
      values.slice(0, 8).forEach(function (point, index) {
        var y = 38 + index * 21;
        svg.appendChild(svgElement('rect', { x: 184, y: y - 8, width: 9, height: 9, rx: 2, fill: COLORS[index % COLORS.length] }));
        svg.appendChild(svgElement('text', { x: 199, y: y, class: 'sd-genui-chart-label' }, point.label.slice(0, 13)));
        svg.appendChild(svgElement('text', { x: 199, y: y + 10, class: 'sd-genui-chart-value' }, formatValue(point.value, 'number')));
      });
      target.replaceChildren(svg);
      return;
    }

    var left = 35, right = 12, top = 16, bottom = 53;
    var width = 360 - left - right, height = 220 - top - bottom;
    var numbers = values.map(function (point) { return point.value; });
    var min = Math.min(0, Math.min.apply(Math, numbers));
    var max = Math.max(1, Math.max.apply(Math, numbers));
    var range = max - min || 1;
    for (var grid = 0; grid <= 4; grid++) {
      var y = top + height * grid / 4;
      var tick = max - range * grid / 4;
      svg.appendChild(svgElement('line', { x1: left, y1: y, x2: 360 - right, y2: y, class: 'sd-genui-chart-grid' }));
      svg.appendChild(svgElement('text', { x: left - 5, y: y + 3, 'text-anchor': 'end', class: 'sd-genui-chart-tick' }, formatValue(tick, 'number')));
    }
    var zeroY = top + max / range * height;
    if (component.kind === 'bar') {
      var slot = width / values.length;
      values.forEach(function (point, index) {
        var barWidth = Math.max(3, Math.min(34, slot * 0.58));
        var x = left + slot * index + (slot - barWidth) / 2;
        var valueY = top + (max - point.value) / range * height;
        svg.appendChild(svgElement('rect', {
          x: x, y: Math.min(zeroY, valueY), width: barWidth,
          height: Math.max(1, Math.abs(zeroY - valueY)), rx: 4,
          fill: COLORS[index % COLORS.length]
        }));
        if (values.length <= 10) svg.appendChild(svgElement('text', {
          x: x + barWidth / 2, y: 205, 'text-anchor': 'middle', class: 'sd-genui-chart-label'
        }, point.label.slice(0, 10)));
      });
    } else {
      var d = '';
      values.forEach(function (point, index) {
        var x = left + (values.length === 1 ? width / 2 : width * index / (values.length - 1));
        var y = top + (max - point.value) / range * height;
        d += (index ? ' L ' : 'M ') + x + ' ' + y;
        if (values.length <= 10) svg.appendChild(svgElement('text', {
          x: x, y: 205, 'text-anchor': 'middle', class: 'sd-genui-chart-label'
        }, point.label.slice(0, 10)));
      });
      svg.appendChild(svgElement('path', { d: d, fill: 'none', stroke: COLORS[0], 'stroke-width': 2.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      values.forEach(function (point, index) {
        var x = left + (values.length === 1 ? width / 2 : width * index / (values.length - 1));
        var y = top + (max - point.value) / range * height;
        svg.appendChild(svgElement('circle', { cx: x, cy: y, r: 3.5, fill: COLORS[0] }));
      });
    }
    target.replaceChildren(svg);
  }

  function isBangla() {
    try {
      var engine = root.__sdEngine;
      var language = engine && typeof engine.locale === 'function' ? engine.locale() : '';
      return String(language || (root.navigator && root.navigator.language) || '').toLowerCase().indexOf('bn') === 0;
    } catch (_) { return false; }
  }
  function copyText(value) {
    var text = String(value || '');
    try {
      if (root.navigator && root.navigator.clipboard && typeof root.navigator.clipboard.writeText === 'function') {
        return root.navigator.clipboard.writeText(text);
      }
    } catch (_) {}
    return new Promise(function (resolve, reject) {
      var input;
      try {
        input = element('textarea', 'sd-genui-copy-buffer');
        input.value = text;
        input.setAttribute('readonly', 'readonly');
        document.body.appendChild(input);
        input.select();
        var copied = document.execCommand && document.execCommand('copy');
        input.remove();
        if (copied) resolve(); else reject(new Error('Copy is not available'));
      } catch (error) {
        if (input && input.parentNode) input.parentNode.removeChild(input);
        reject(error);
      }
    });
  }

  function buildComponent(component, index, scope) {
    var card = element('section', 'sd-genui-item sd-genui-item-' + component.type);
    card.setAttribute('data-sd-genui-index', String(index));
    if (component.type === 'text') {
      card.classList.add('sd-genui-text-' + component.tone);
      card.setAttribute('data-sd-genui-template', component.text);
      card.textContent = templateText(component.text, scope.state);
    } else if (component.type === 'stat') {
      card.appendChild(element('div', 'sd-genui-kicker', component.label));
      card.appendChild(element('div', 'sd-genui-stat-value', ''));
      var statValue = card.lastChild;
      statValue.setAttribute('data-sd-genui-value', '1');
      if (component.caption) {
        var caption = element('div', 'sd-genui-caption', component.caption);
        caption.setAttribute('data-sd-genui-template', component.caption);
        card.appendChild(caption);
      }
    } else if (component.type === 'badge') {
      card.appendChild(element('span', 'sd-genui-badge sd-genui-tone-' + component.tone, component.label));
    } else if (component.type === 'progress') {
      var row = element('div', 'sd-genui-progress-label');
      row.appendChild(element('span', '', component.label));
      row.appendChild(element('span', 'sd-genui-progress-value', ''));
      card.appendChild(row);
      var track = element('div', 'sd-genui-progress-track');
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-label', component.label || 'Progress');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', String(component.max));
      track.appendChild(element('div', 'sd-genui-progress-fill'));
      card.appendChild(track);
    } else if (component.type === 'slider') {
      var sliderId = 'sd-genui-control-' + scope.instanceId + '-' + component.id;
      var head = element('div', 'sd-genui-control-head');
      var label = element('label', '', component.label);
      label.setAttribute('for', sliderId);
      head.appendChild(label);
      head.appendChild(element('output', 'sd-genui-control-value', formatValue(scope.state[component.id], component.format, component.currency)));
      card.appendChild(head);
      var slider = element('input', 'sd-genui-slider');
      slider.type = 'range';
      slider.id = sliderId;
      slider.min = String(component.min);
      slider.max = String(component.max);
      slider.step = String(component.step);
      slider.value = String(scope.state[component.id]);
      slider.setAttribute('data-sd-genui-control', component.id);
      slider.addEventListener('input', function () {
        scope.state[component.id] = Number(slider.value);
        updateSurface(scope);
      });
      card.appendChild(slider);
      var bounds = element('div', 'sd-genui-bounds');
      bounds.appendChild(element('span', '', formatValue(component.min, component.format, component.currency)));
      bounds.appendChild(element('span', '', formatValue(component.max, component.format, component.currency)));
      card.appendChild(bounds);
    } else if (component.type === 'select') {
      var selectId = 'sd-genui-control-' + scope.instanceId + '-' + component.id;
      var selectLabel = element('label', 'sd-genui-control-label', component.label);
      selectLabel.setAttribute('for', selectId);
      card.appendChild(selectLabel);
      var select = element('select', 'sd-genui-select');
      select.id = selectId;
      select.setAttribute('data-sd-genui-control', component.id);
      component.options.forEach(function (option) {
        var node = element('option', '', option);
        node.value = option;
        if (option === scope.state[component.id]) node.selected = true;
        select.appendChild(node);
      });
      select.addEventListener('change', function () {
        scope.state[component.id] = select.value;
        updateSurface(scope);
      });
      card.appendChild(select);
    } else if (component.type === 'toggle') {
      var toggleId = 'sd-genui-control-' + scope.instanceId + '-' + component.id;
      var toggleLabel = element('label', 'sd-genui-toggle');
      var toggle = element('input', '');
      toggle.type = 'checkbox';
      toggle.id = toggleId;
      toggle.checked = !!scope.state[component.id];
      toggle.setAttribute('data-sd-genui-control', component.id);
      toggle.addEventListener('change', function () {
        scope.state[component.id] = !!toggle.checked;
        updateSurface(scope);
      });
      toggleLabel.appendChild(toggle);
      toggleLabel.appendChild(element('span', '', component.label));
      card.appendChild(toggleLabel);
    } else if (component.type === 'chart') {
      if (component.title) card.appendChild(element('h3', 'sd-genui-chart-title', component.title));
      if (component.description) card.appendChild(element('p', 'sd-genui-caption', component.description));
      var plot = element('div', 'sd-genui-chart-plot');
      card.appendChild(plot);
      renderChart(plot, component, scope.state);
    } else if (component.type === 'table') {
      var wrap = element('div', 'sd-genui-table-wrap');
      var table = element('table', 'sd-genui-table');
      var thead = element('thead', '');
      var header = element('tr', '');
      component.columns.forEach(function (column) { header.appendChild(element('th', '', column)); });
      thead.appendChild(header);
      table.appendChild(thead);
      var body = element('tbody', '');
      component.rows.forEach(function (row) {
        var tr = element('tr', '');
        row.forEach(function (cell) {
          var td = element('td', '');
          td.setAttribute('data-sd-genui-template', cell);
          td.textContent = templateText(cell, scope.state);
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      table.appendChild(body);
      wrap.appendChild(table);
      card.appendChild(wrap);
    } else if (component.type === 'button') {
      var button = element('button', 'sd-genui-button', component.label);
      button.type = 'button';
      var status = element('span', 'sd-genui-button-status', '');
      button.addEventListener('click', function () {
        copyText(templateText(component.value, scope.state)).then(function () {
          status.textContent = isBangla() ? 'কপি হয়েছে' : 'Copied';
        }).catch(function () {
          status.textContent = isBangla() ? 'কপি করা যায়নি' : 'Copy failed';
        });
      });
      card.appendChild(button);
      card.appendChild(status);
    }
    return card;
  }

  function initialState(spec) {
    var state = Object.create(null);
    spec.components.forEach(function (component) {
      if (component.type === 'slider' || component.type === 'select' || component.type === 'toggle') state[component.id] = component.value;
    });
    return state;
  }
  function updateSurface(scope) {
    if (!scope || !scope.surface || !scope.surface.isConnected) return;
    scope.spec.components.forEach(function (component, index) {
      var card = scope.surface.querySelector('[data-sd-genui-index="' + index + '"]');
      if (!card) return;
      if (component.type === 'text') {
        card.textContent = templateText(component.text, scope.state);
      } else if (component.type === 'stat') {
        var output = card.querySelector('[data-sd-genui-value]');
        if (output) {
          var value = valueOf(component, scope.state);
          output.textContent = component.formula ? formatValue(value, component.format, component.currency) :
            (typeof value === 'number' ? formatValue(value, component.format, component.currency) : templateText(value, scope.state));
        }
        var caption = card.querySelector('.sd-genui-caption');
        if (caption) caption.textContent = templateText(component.caption, scope.state);
      } else if (component.type === 'progress') {
        var raw = valueOf(component, scope.state);
        var value = Number.isFinite(raw) ? raw : 0;
        var percent = Math.max(0, Math.min(100, value / component.max * 100));
        var fill = card.querySelector('.sd-genui-progress-fill');
        var track = card.querySelector('.sd-genui-progress-track');
        var label = card.querySelector('.sd-genui-progress-value');
        if (fill) fill.style.width = percent + '%';
        if (track) track.setAttribute('aria-valuenow', String(Math.max(0, Math.min(component.max, value))));
        if (label) label.textContent = formatValue(value, component.format, component.currency);
      } else if (component.type === 'chart') {
        var plot = card.querySelector('.sd-genui-chart-plot');
        if (plot) renderChart(plot, component, scope.state);
      } else if (component.type === 'table') {
        var cells = card.querySelectorAll('[data-sd-genui-template]');
        for (var i = 0; i < cells.length; i++) cells[i].textContent = templateText(cells[i].getAttribute('data-sd-genui-template') || '', scope.state);
      }
    });
    var controls = scope.surface.querySelectorAll('[data-sd-genui-control]');
    for (var i = 0; i < controls.length; i++) {
      var control = controls[i];
      var id = control.getAttribute('data-sd-genui-control');
      var component = scope.spec.components.find(function (item) { return item.id === id; });
      if (!component) continue;
      if (component.type === 'slider') {
        var output = control.parentNode && control.parentNode.querySelector('.sd-genui-control-value');
        if (output) output.textContent = formatValue(scope.state[id], component.format, component.currency);
      } else if (component.type === 'select' && control.value !== scope.state[id]) {
        control.value = String(scope.state[id]);
      } else if (component.type === 'toggle') {
        control.checked = !!scope.state[id];
      }
    }
  }

  var instanceCount = 0;
  function renderSpec(spec) {
    instanceCount++;
    var scope = { instanceId: String(instanceCount), spec: spec, state: initialState(spec), surface: null };
    var surface = element('div', 'sd-genui-surface');
    if (spec.title) surface.appendChild(element('h2', 'sd-genui-title', spec.title));
    if (spec.description) surface.appendChild(element('p', 'sd-genui-description', spec.description));
    var grid = element('div', 'sd-genui-grid');
    spec.components.forEach(function (component, index) { grid.appendChild(buildComponent(component, index, scope)); });
    surface.appendChild(grid);
    scope.surface = surface;
    surface.__sdGenUIScope = scope;
    return surface;
  }

  function scan() {
    if (!document || !document.body) return;
    var messages = document.querySelectorAll('.ds-message');
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];
      if (message.querySelector('.sd-genui-surface')) continue;
      var codes = message.querySelectorAll('pre code.language-sds-ui, pre code.lang-sds-ui, code.language-sds-ui, code.lang-sds-ui');
      for (var j = 0; j < codes.length; j++) {
        var code = codes[j];
        if (code.getAttribute('data-sd-genui-rendered') === '1') continue;
        var pre = code.closest ? code.closest('pre') : code.parentNode;
        if (!pre || !pre.parentNode) continue;
        var parsed = parseSpec(code.textContent || '');
        if (!parsed.ok) continue; // Keep invalid or incomplete streaming output visible.
        try {
          var surface = renderSpec(parsed.spec);
          surface.setAttribute('data-sd-genui', '1');
          pre.parentNode.insertBefore(surface, pre);
          updateSurface(surface.__sdGenUIScope);
          pre.setAttribute('data-sd-genui-hidden', '1');
          pre.setAttribute('aria-hidden', 'true');
          code.setAttribute('data-sd-genui-rendered', '1');
          break;
        } catch (error) {
          console.warn('[SDS GenUI] Could not render UI specification', error);
        }
      }
    }
  }
  var observer = null;
  var scanTimer = null;
  function scheduleScan() {
    if (scanTimer !== null) return;
    scanTimer = setTimeout(function () {
      scanTimer = null;
      scan();
    }, 180);
  }
  function start() {
    if (observer || !document || !document.body || typeof MutationObserver !== 'function') return;
    scan();
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  root.__sdGenUI = {
    version: 1,
    parseSpec: parseSpec,
    evaluateFormula: evaluateFormula,
    formatValue: formatValue,
    renderSpec: renderSpec,
    scan: scan,
    start: start
  };
  if (document && document.body) start();
})(window);
