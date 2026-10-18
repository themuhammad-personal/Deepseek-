import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bds = path.join(here, '../../main/bds-assets/bds');
const SOURCE = fs.readFileSync(path.join(bds, 'sd-genui-html.js'), 'utf8');
const FRAME = fs.readFileSync(path.join(bds, 'sd-frame.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(here, '../../main/java/com/superdeepseek/app/MainActivity.kt'), 'utf8');

function load(extra = {}) {
  const window = { navigator: { language: 'en' }, ...extra };
  const context = vm.createContext({ window, document: { body: null }, console, JSON, Object, Array, String, Number, RegExp, Math, WeakMap, Promise });
  vm.runInContext(SOURCE, context, { filename: 'sd-genui-html.js' });
  return window;
}
function api() { return load().__sdGenUIHtml; }

test('sanitizer keeps drawing primitives and removes scripts, handlers and external references', () => {
  const ui = api();
  const result = ui.parseAndSanitizeSvg(`<?xml version="1.0"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" onload="alert(1)">
      <script>alert(1)</script>
      <style>@import url(http://evil.example/x.css);</style>
      <defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>
      <rect x="1" y="2" width="50" height="40" fill="url(#g)" onclick="alert(2)" style="stroke:red;background:url(http://evil.example/a.png);opacity:.5"/>
      <image href="https://evil.example/a.png" width="10" height="10"/>
      <foreignObject><div>hi</div></foreignObject>
      <a href="javascript:alert(3)"><circle r="5"/></a>
      <circle cx="9" cy="9" r="4" fill="url(https://evil.example/x)"/>
      <use href="https://evil.example/x.svg#a"/>
      <text x="5" y="5">Hello &amp; <tspan>world</tspan></text>
    </svg>`, 'p-');
  assert.equal(result.ok, true, result.error);
  const out = ui.svgToString(result.root);
  assert.match(out, /<rect /);
  assert.match(out, /fill="url\(#p-g\)"/);
  assert.match(out, /id="p-g"/);
  assert.match(out, /Hello &amp; <tspan>world<\/tspan>/);
  assert.match(out, /viewBox="0 0 200 100"/);
  assert.doesNotMatch(out, /script|onload|onclick|image|foreignObject|evil|javascript|<a[ >]|<use/i);
  assert.match(out, /style="stroke:red;opacity:\.5"/);
  assert.doesNotMatch(out, /background/);
});

test('sanitizer decodes entities before checking values and rejects encoded script URLs', () => {
  const ui = api();
  const result = ui.parseAndSanitizeSvg('<svg viewBox="0 0 10 10"><rect width="5" height="5" fill="&#106;avascript:alert(1)"/><rect width="5" height="5" stroke="data:text/html,x"/></svg>', '');
  assert.equal(result.ok, true);
  assert.doesNotMatch(ui.svgToString(result.root), /javascript|data:|fill=|stroke=/);
});

test('animation elements need an allowed target attribute', () => {
  const ui = api();
  const ok = ui.parseAndSanitizeSvg('<svg viewBox="0 0 10 10"><circle r="2"><animate attributeName="r" values="2;4;2" dur="1s" repeatCount="indefinite"/><animate attributeName="href" values="#a;#b" dur="1s"/><set attributeName="onclick" to="x"/></circle></svg>', '');
  assert.equal(ok.ok, true);
  const out = ui.svgToString(ok.root);
  assert.match(out, /attributeName="r"/);
  assert.doesNotMatch(out, /href|onclick/);
  assert.equal((out.match(/<animate /g) || []).length, 1);
});

test('partial streamed markup renders what has arrived', () => {
  const ui = api();
  const partial = ui.parseAndSanitizeSvg('<svg viewBox="0 0 100 100"><g><circle cx="50" cy="50" r="20" fill="#0a0"/><rect x="1" y="1" wid', '');
  assert.equal(partial.ok, true);
  const out = ui.svgToString(partial.root);
  assert.match(out, /<circle/);
  assert.doesNotMatch(out, /<rect/);
  assert.equal(ui.parseAndSanitizeSvg('no svg here', '').ok, false);
});

test('limits protect against huge or deeply nested drawings', () => {
  const ui = api();
  assert.equal(ui.parseAndSanitizeSvg('<svg>' + '<g>'.repeat(10) + '</svg>'.padEnd(70000, ' '), '').ok, false);
  const many = '<svg viewBox="0 0 1 1">' + '<circle r="1"/>'.repeat(1600) + '</svg>';
  assert.equal(ui.parseAndSanitizeSvg(many, '').ok, false);
  const deep = '<svg viewBox="0 0 1 1">' + '<g>'.repeat(40) + '<circle r="1"/>' + '</g>'.repeat(40) + '</svg>';
  const deepResult = ui.parseAndSanitizeSvg(deep, '');
  assert.equal(deepResult.ok, true);
  assert.doesNotMatch(ui.svgToString(deepResult.root), /<circle/);
});

test('html documents are wrapped with a network-blocking CSP and a handshake script', () => {
  const ui = api();
  const documentText = ui.buildDocument('<!doctype html><meta http-equiv="refresh" content="0;url=https://evil.example"><base href="https://evil.example/"><h1>Hi</h1><script>document.title="x"</script>', 'f1', true);
  assert.match(documentText, /^<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"/);
  assert.match(documentText, /connect-src 'none'/);
  assert.match(documentText, /default-src 'none'/);
  assert.match(documentText, /base-uri 'none'/);
  assert.match(documentText, /form-action 'none'/);
  assert.match(documentText, /color-scheme:dark/);
  assert.match(documentText, /var id="f1"/);
  assert.doesNotMatch(documentText, /http-equiv="?refresh|<base\b/i);
  assert.match(documentText, /<h1>Hi<\/h1>/);
  assert.ok(documentText.indexOf('Content-Security-Policy') < documentText.indexOf('<h1>'));
});

test('prompt extension is added only for visual requests and only once', () => {
  const ui = api();
  assert.equal(ui.wantsVisual('Draw a cat riding a bike'), true);
  assert.equal(ui.wantsVisual('একটি ডায়াগ্রাম আঁকো'), true);
  assert.equal(ui.wantsVisual('What is the capital of France?'), false);
  const body = ui.extendBody(JSON.stringify({ chat_session_id: 'a', prompt: 'Build an interactive mortgage calculator' }));
  assert.ok(body);
  const parsed = JSON.parse(body);
  assert.equal(parsed.chat_session_id, 'a');
  assert.ok(parsed.prompt.startsWith('[SDS:GENUI_FREE]'));
  assert.match(parsed.prompt, /sds-svg/);
  assert.match(parsed.prompt, /sds-html/);
  assert.match(parsed.prompt, /Build an interactive mortgage calculator$/);
  assert.equal(ui.extendBody(body), null);
  assert.equal(ui.extendBody(JSON.stringify({ prompt: 'Tell me a joke' })), null);
  assert.equal(ui.extendBody('not json'), null);
  const chat = JSON.parse(ui.extendBody(JSON.stringify({ messages: [{ role: 'system', content: 'x' }, { role: 'user', content: 'Design a poster' }] })));
  assert.ok(chat.messages[1].content.includes('[SDS:GENUI_FREE]'));
  assert.equal(chat.messages[0].content, 'x');
});

test('fetch wrapper extends completion requests and leaves other requests untouched', async () => {
  const calls = [];
  const window = load({
    fetch: (input, init) => { calls.push({ input, init }); return Promise.resolve({ ok: true }); }
  });
  await window.fetch('https://chat.deepseek.com/api/v0/chat/completion', { method: 'POST', body: JSON.stringify({ prompt: 'visualize my budget' }) });
  await window.fetch('https://chat.deepseek.com/api/v0/chat/completion', { method: 'POST', body: JSON.stringify({ prompt: 'hello there' }) });
  await window.fetch('https://chat.deepseek.com/api/v0/other', { method: 'POST', body: JSON.stringify({ prompt: 'draw something' }) });
  assert.match(JSON.parse(calls[0].init.body).prompt, /^\[SDS:GENUI_FREE\]/);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(JSON.parse(calls[1].init.body).prompt, 'hello there');
  assert.equal(JSON.parse(calls[2].init.body).prompt, 'draw something');
});

test('the preference switch disables the prompt extension', async () => {
  const store = new Map([['sd_genui_free', '0']]);
  const calls = [];
  const window = load({
    localStorage: { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, value) },
    fetch: (input, init) => { calls.push(init); return Promise.resolve({}); }
  });
  await window.fetch('/api/v0/chat/completion', { body: JSON.stringify({ prompt: 'draw a cat' }) });
  assert.equal(JSON.parse(calls[0].body).prompt, 'draw a cat');
  window.__sdGenUIHtml.setEnabled(true);
  await window.fetch('/api/v0/chat/completion', { body: JSON.stringify({ prompt: 'draw a cat' }) });
  assert.match(JSON.parse(calls[1].body).prompt, /GENUI_FREE/);
});

test('renderer never evaluates generated code and keeps the frame isolated', () => {
  assert.doesNotMatch(SOURCE, /\beval\s*\(|new Function|innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|document\.write/);
  assert.match(SOURCE, /setAttribute\('sandbox', 'allow-scripts'\)/);
  assert.doesNotMatch(SOURCE, /allow-same-origin|allow-top-navigation|allow-popups|allow-forms/);
  assert.match(SOURCE, /language-sds-svg/);
  assert.match(SOURCE, /language-sds-html/);
  assert.match(SOURCE, /data-sd-free-hidden/);
  assert.match(FRAME, /event\.source !== window\.parent/);
  assert.match(FRAME, /data\.type !== 'render'/);
});

test('the module is injected by the Android shell after the schema renderer', () => {
  assert.match(MAIN, /readAsset\("sd-genui\.js"\),\s*readAsset\("sd-genui-html\.js"\)/);
});
