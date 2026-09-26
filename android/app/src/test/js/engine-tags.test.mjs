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
  const lines = vm.runInNewContext(CONTENT.slice(i + 4, j + 1));
  // One line explains the old name, so the model can map it; nothing else may use it.
  const prompt = lines.filter((l) => !l.startsWith('Older messages, memories')).join('\n');
  assert.equal(lines.length - prompt.split('\n').length, 1);
  assert.match(prompt, /^You are Super DeepSeek/);
  assert.match(prompt, /YOUR LINUX SANDBOX/);
  assert.match(prompt, /Never claim that you cannot run code/);
  assert.doesNotMatch(prompt, /<BDS:|\bBDS\b|Better ?DeepSeek|you cannot execute code yourself/i);
  assert.match(CONTENT, /,N1=17\b/, 'template version bumped so stored copies are replaced');
});

test('no Better DeepSeek branding is left in what the model or the user reads', () => {
  // Allowed: the one-time migration of stored data and the prompt line that
  // explains the old name.
  const content = CONTENT
    .replace(/async function sdsRebrandStored\(\)\{[\s\S]*?\}function fmt\(/, 'function fmt(')
    .replace(/"Older messages, memories[^"\\]*(?:\\.[^"\\]*)*"/, '""');
  for (const [name, src] of [['content.js', content], ['injected.js', INJECTED]]) {
    assert.doesNotMatch(src, /Better DeepSeek|BetterDeepSeek/, name);
    assert.doesNotMatch(src, /"<BDS:|`<BDS:|\[BDS:AUTO\]/, name);
  }
});

test('stored data from Better DeepSeek is renamed once, and only once', async () => {
  const code = DECLS.get('sdsRebrandStored');
  assert.ok(code, 'engine code moved: sdsRebrandStored');
  const saved = [];
  const B = {
    skills: [{ id: 's1', name: 'BDS helper', content: 'Wrap in <BetterDeepSeek>x</BetterDeepSeek>, keep BDS_TOKEN.' }],
    memories: [{ id: 'm1', text: 'User likes Better DeepSeek and BetterDeepSeek.' }],
    characters: [],
    settings: {
      customSystemPrompts: [{ id: 'c1', name: 'Mine', content: 'You are BDS.' }],
      systemPromptEntries: [{ id: 'e1', content: 'Use <BDS:create_file> tags.' }],
      unrelated: 'Better DeepSeek',
    },
  };
  const ctx = vm.createContext({
    console,
    B,
    st: { skills: 'k_skills', memories: 'k_mem', characters: 'k_char', settings: 'k_set' },
    chrome: { storage: { local: { set: async (o) => { saved.push(JSON.parse(JSON.stringify(o))); } } } },
  });
  const run = vm.runInContext(`${code};sdsRebrandStored`, ctx);
  await run();
  const out = JSON.parse(JSON.stringify(B));
  assert.equal(out.skills[0].name, 'SDS helper');
  assert.equal(out.skills[0].content, 'Wrap in <SuperDeepSeek>x</SuperDeepSeek>, keep BDS_TOKEN.');
  assert.equal(out.memories[0].text, 'User likes Super DeepSeek and Super DeepSeek.');
  assert.equal(out.settings.customSystemPrompts[0].content, 'You are SDS.');
  assert.equal(out.settings.systemPromptEntries[0].content, 'Use <SDS:create_file> tags.');
  assert.equal(out.settings.unrelated, 'Better DeepSeek', 'only the listed fields are touched');
  assert.equal(out.settings.sdsBrandVersion, 1);
  assert.equal(saved.length, 1);
  await run();
  assert.equal(saved.length, 1, 'second run is a no-op');
});

test('old default prompts are still recognised after the rename', () => {
  const isLegacy = engineFn('fmt');
  const N1 = Number(/\bN1=(\d+)/.exec(CONTENT)[1]);
  assert.equal(isLegacy({ systemPrompt: 'You are Better DeepSeek inside a tool-enabled extension. More…' }), true);
  assert.equal(isLegacy({ systemPrompt: 'You are Super DeepSeek inside a tool-enabled extension.' }), true);
  assert.equal(isLegacy({ systemPrompt: 'You are now Better DeepSeek.\nWhen using <BDS:LONG_WORK>...</BDS:LONG_WORK>:' }), true);
  assert.equal(isLegacy({ systemPrompt: 'My own prompt' }), false);
  assert.equal(isLegacy({ systemPrompt: 'You are Better DeepSeek inside a tool-enabled extension.', systemPromptTemplateVersion: N1 }), false);
});

// ── Auto-sent messages are not shown being typed ─────────────────────────────

function quietCtx() {
  const classes = new Set();
  const ctx = vm.createContext({
    console, Promise, setTimeout,
    window: {},
    document: { documentElement: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } } },
  });
  ctx.window = ctx;
  vm.runInContext(`${DECLS.get('sdQuiet')};this.sdQuiet=sdQuiet;`, ctx);
  return { sdQuiet: ctx.sdQuiet, classes };
}

test('sdQuiet marks the page while an engine message is being sent, and clears it after', async () => {
  const { sdQuiet, classes } = quietCtx();
  let seen = null;
  const r = sdQuiet(async () => { seen = classes.has('sd-auto-send'); return 7; });
  assert.equal(await r, 7);
  assert.equal(seen, true);
  assert.equal(classes.has('sd-auto-send'), false);
});

test('sdQuiet copes with overlapping sends and failures', async () => {
  const { sdQuiet, classes } = quietCtx();
  let release;
  const slow = sdQuiet(() => new Promise((res) => { release = res; }));
  await assert.rejects(sdQuiet(async () => { throw new Error('x'); }));
  assert.equal(classes.has('sd-auto-send'), true, 'still sending the slow one');
  release();
  await slow;
  assert.equal(classes.has('sd-auto-send'), false);
});

test('engine sends go through sdQuiet', () => {
  assert.match(DECLS.get('nc'), /sdQuiet\(/);
  assert.match(DECLS.get('ml'), /sdQuiet\(/);
});

// ── Mixed Arabic + Bengali replies are not flipped as a whole ────────────────

test('a reply with Arabic in it no longer forces the whole message right-to-left', () => {
  const nct = engineFn('nct');
  const attrs = { dir: 'rtl' };
  const removed = [];
  const old = {
    classList: { remove: (c) => removed.push(c) },
    getAttribute: (n) => attrs[n] ?? null,
    removeAttribute: (n) => { delete attrs[n]; },
    style: { direction: 'rtl', textAlign: 'right' },
  };
  const md = { querySelectorAll: (sel) => (sel === '.bds-rtl-native' ? [old] : []) };
  nct(md, true);
  assert.deepEqual(removed, ['bds-rtl-native']);
  assert.equal(attrs.dir, undefined);
  assert.equal(old.style.direction, '');
  assert.equal(old.style.textAlign, '');
  assert.doesNotMatch(DECLS.get('nct'), /setAttribute\("dir","rtl"\)/);
  assert.doesNotMatch(DECLS.get('xg'), /Pe\(U,"dir",s\(\)\?"rtl":"ltr"\)/);
});

test('each paragraph takes its own direction (skin CSS)', () => {
  const skin = fs.readFileSync(path.join(bds, 'our-skin.css'), 'utf8');
  assert.match(skin, /unicode-bidi:\s*plaintext/);
});

test('the prompt keeps tool work out of LONG_WORK', () => {
  assert.match(CONTENT, /Never wrap sandbox work or tool calls in LONG_WORK/);
});
