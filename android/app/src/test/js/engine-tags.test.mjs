// The engine's tag parser (content.js: pxe) and the built-in system prompt,
// after the Super DeepSeek rebrand: the model is taught SDS: tags, and every
// parser still understands the BDS: tags found in older chats.
// Run: npm run test:engine
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const here = path.dirname(fileURLToPath(import.meta.url));
const bds = path.join(here, '../../main/bds-assets/bds');
const CONTENT = fs.readFileSync(path.join(bds, 'content.js'), 'utf8');
const INJECTED = fs.readFileSync(path.join(bds, 'injected.js'), 'utf8');

// Top-level declarations of the engine bundle's main IIFE, by name.
const DECLS = (() => {
  const ast = acorn.parse(CONTENT, { ecmaVersion: 'latest' });
  const iife = ast.body.find((n) => n.type === 'ExpressionStatement' && n.end - n.start > 1e6);
  const out = new Map();
  for (const n of iife.expression.callee.body.body) {
    if (n.type === 'FunctionDeclaration') out.set(n.id.name, CONTENT.slice(n.start, n.end));
    else if (n.type === 'VariableDeclaration') {
      for (const d of n.declarations) {
        if (d.id.type === 'Identifier' && d.init) out.set(d.id.name, `${n.kind} ${CONTENT.slice(d.start, d.end)};`);
      }
    }
  }
  return out;
})();

/**
 * `name` from the bundle, plus whatever it needs: missing declarations are
 * pulled in on demand (a ReferenceError names them) and the call retried.
 */
function engineFn(name) {
  const have = new Set([name]);
  let code = DECLS.get(name);
  assert.ok(code, `engine code moved: ${name}`);
  let fn = null;
  const build = () => {
    const ctx = vm.createContext({ console, window: {}, document: { querySelector: () => null }, navigator: { language: 'en' } });
    fn = vm.runInContext(`${code};${name}`, ctx);
  };
  build();
  return (...args) => {
    for (let i = 0; i < 200; i++) {
      try {
        return fn(...args);
      } catch (e) {
        const m = /^(\S+) is not defined/.exec(e.message);
        if (!m || !DECLS.has(m[1]) || have.has(m[1])) throw e;
        have.add(m[1]);
        code = `${DECLS.get(m[1])}\n${code}`;
        build();
      }
    }
    throw new Error(`could not resolve ${name}`);
  };
}

const parse = engineFn('pxe');
const plain = (v) => JSON.parse(JSON.stringify(v));

test('SDS MCP tags are parsed', () => {
  const r = parse('Plan.\n<SDS:AUTO:MCP url="sandbox" tool="run">{"command":"ls -la"}</SDS:AUTO:MCP>');
  assert.deepEqual(plain(r.autoRequests.mcpCalls), [{ serverUrl: 'sandbox', toolName: 'run', args: { command: 'ls -la' } }]);
  assert.equal(r.containsControlTags, true);
});

test('BDS tags from older chats still work', () => {
  const r = parse(`<BDS:AUTO:MCP url="exa" tool="search" args='{"q":"x"}'></BDS:AUTO:MCP>`);
  assert.deepEqual(plain(r.autoRequests.mcpCalls), [{ serverUrl: 'exa', toolName: 'search', args: { q: 'x' } }]);
});

test('SDS create_file and LONG_WORK are parsed and hidden from the visible text', () => {
  const r = parse('Hi <SDS:LONG_WORK>\n<SDS:create_file fileName="a.py">\n\n```python\nprint(1)\n```\n\n</SDS:create_file>\n</SDS:LONG_WORK> done');
  assert.deepEqual(plain(r.createFiles), [{ fileName: 'a.py', content: 'print(1)\n' }]);
  assert.equal(r.longWorkOpen, true);
  assert.equal(r.longWorkClose, true);
  assert.ok(!r.visibleText.includes('SDS'));
});

test('every tag means the same with SDS: as with BDS:', () => {
  const samples = [
    '<X:AUTO:REQUEST_WEB_FETCH>https://example.com</X:AUTO:REQUEST_WEB_FETCH>',
    '<X:AUTO:REQUEST_GITHUB_FETCH>owner/repo</X:AUTO:REQUEST_GITHUB_FETCH>',
    '<X:AUTO:SEARCH deepFetch="2">alpine linux proot</X:AUTO:SEARCH>',
    '<X:IMAGE>Eiffel Tower</X:IMAGE>',
    '<X:chart>{"mark":"bar"}</X:chart>',
    '<X:VISUALIZER><div>hi</div></X:VISUALIZER>',
    '<X:todo>\n### Step\nDo it\n</X:todo>',
    '<X:ask_question>[{"id":"a","question":"Q?","type":"input"}]</X:ask_question>',
    '<X:memory_write key_name="user_name" importance="always">Alex</X:memory_write>',
    '<X:skill_create name="Style">Always be brief.</X:skill_create>',
    '<X:pptx>const p = new PptxGenJS();</X:pptx>',
  ];
  for (const sample of samples) {
    const sds = plain(parse(sample.replaceAll('X:', 'SDS:')));
    const old = plain(parse(sample.replaceAll('X:', 'BDS:')));
    assert.deepEqual(sds, old, sample);
    assert.equal(sds.containsControlTags, true, sample);
  }
});

test('the built-in system prompt is Super DeepSeek, SDS and sandbox-first', () => {
  const i = CONTENT.indexOf(',du=[');
  const j = CONTENT.indexOf('].join(', i);
  const prompt = vm.runInNewContext(CONTENT.slice(i + 4, j + 1)).join('\n');
  assert.match(prompt, /^You are Super DeepSeek/);
  assert.match(prompt, /YOUR LINUX SANDBOX/);
  assert.match(prompt, /Never claim that you cannot run code/);
  assert.doesNotMatch(prompt, /<BDS:|\bBDS\b|Better ?DeepSeek|you cannot execute code yourself/i);
  assert.match(CONTENT, /,N1=17\b/, 'template version bumped so stored copies are replaced');
});

test('no Better DeepSeek branding is left in what the model or the user reads', () => {
  for (const [name, src] of [['content.js', CONTENT], ['injected.js', INJECTED]]) {
    assert.doesNotMatch(src, /Better DeepSeek|BetterDeepSeek/, name);
    assert.doesNotMatch(src, /"<BDS:|`<BDS:|\[BDS:AUTO\]/, name);
  }
});
