// Tests for bds/sd-agent.js (sandbox agent glue). Run: npm run test:engine
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, '../../main/bds-assets/bds/sd-agent.js'), 'utf8');

const plain = (v) => JSON.parse(JSON.stringify(v));

function load({ info = { supported: true, enabled: true, mode: 'auto' }, history = null, href = 'https://chat.deepseek.com/a/chat/s/abc' } = {}) {
  const events = new EventTarget();
  const calls = [];
  const stops = [];
  const actives = [];
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, JSON, Math, Object, Array, String, Date,
    Uint8Array, TextDecoder, CustomEvent,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    navigator: { language: 'en' },
    location: { href },
    document: {
      documentElement: { lang: 'en' },
      body: null,
      querySelector: () => null,
      addEventListener: () => {},
    },
    AndroidBridge: {
      sandboxInfo: () => JSON.stringify(info),
      sandboxStop: () => { stops.push(1); return 0; },
      setStorage: () => {},
      sandboxAgentActive: (v) => { actives.push(v); },
    },
    addEventListener: (...a) => events.addEventListener(...a),
    removeEventListener: (...a) => events.removeEventListener(...a),
    dispatchEvent: (e) => {
      events.dispatchEvent(e);
      if (e.type === 'bds:request-history-msgs' && history) {
        const { sessionId } = JSON.parse(e.detail);
        setTimeout(() => events.dispatchEvent(new CustomEvent('bds:history-msgs', {
          detail: JSON.stringify({ data: { biz_data: { chat_session: { id: sessionId }, chat_messages: history } } }),
        })), 5);
      }
      return true;
    },
  };
  ctx.window = ctx;
  ctx.__sdBridgeFetch = async (payload) => { calls.push(payload); return { ok: true, result: { content: [] } }; };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { win: ctx, calls, stops, actives };
}

test('parses MCP tags: body JSON, args attribute, base64Args, self-closing', () => {
  const { win } = load();
  const b64 = Buffer.from(JSON.stringify({ command: 'echo "hi"' })).toString('base64url');
  const text = [
    'Plan first.',
    '<BDS:AUTO:MCP url="sandbox" tool="write_file">{"path":"a_b.py","content":"x = \\"*y*\\"\\n"}</BDS:AUTO:MCP>',
    `<BDS:AUTO:MCP url="sandbox" tool="run" args='{"command":"ls -la"}'>`,
    `<BDS:AUTO:MCP url="sandbox://linux" tool="run" base64Args="${b64}"/>`,
  ].join('\n');
  const tags = win.__sdAgent._parseTags(text);
  assert.equal(tags.length, 3);
  assert.deepEqual(plain(win.__sdAgent._tagArgs(tags[0])), { path: 'a_b.py', content: 'x = "*y*"\n' });
  assert.deepEqual(plain(win.__sdAgent._tagArgs(tags[1])), { command: 'ls -la' });
  assert.deepEqual(plain(win.__sdAgent._tagArgs(tags[2])), { command: 'echo "hi"' });
});

test('SDS tags (the current spelling) are parsed like BDS ones', () => {
  const { win } = load();
  const tags = win.__sdAgent._parseTags('<SDS:AUTO:MCP url="sandbox" tool="run">{"command":"echo a_b"}</SDS:AUTO:MCP>');
  assert.equal(tags.length, 1);
  assert.deepEqual(plain(win.__sdAgent._tagArgs(tags[0])), { command: 'echo a_b' });
});

test('a ">" inside a quoted attribute does not end the tag', () => {
  const { win } = load();
  const tags = win.__sdAgent._parseTags(`<BDS:AUTO:MCP url="sandbox" tool="run" args='{"command":"echo 1 > f"}'></BDS:AUTO:MCP>`);
  assert.equal(tags.length, 1);
  assert.deepEqual(plain(win.__sdAgent._tagArgs(tags[0])), { command: 'echo 1 > f' });
});

test('picks the raw args of the matching sandbox call, newest reply first', () => {
  const { win } = load();
  const older = '<BDS:AUTO:MCP url="sandbox" tool="run">{"command":"old"}</BDS:AUTO:MCP>';
  const newer = [
    '<BDS:AUTO:MCP url="https://other.example/mcp" tool="run">{"command":"not sandbox"}</BDS:AUTO:MCP>',
    '<BDS:AUTO:MCP url="sandbox" tool="write_file">{"path":"x"}</BDS:AUTO:MCP>',
    '<BDS:AUTO:MCP url="sandbox" tool="run">{"command":"pytest -k \\"a_b\\""}</BDS:AUTO:MCP>',
  ].join('\n');
  const raw = win.__sdAgent._pickRawArgs([newer, older], 'run', { command: 'pytest -k "ab"' });
  assert.deepEqual(plain(raw), { command: 'pytest -k "a_b"' });
  assert.equal(win.__sdAgent._pickRawArgs([newer], 'edit_file', {}), null);
});

test('assistant texts skip thinking fragments and user messages', () => {
  const { win } = load();
  const texts = win.__sdAgent._assistantTexts([
    { role: 'USER', content: 'hi' },
    { role: 'ASSISTANT', fragments: [{ type: 'THINK', content: 'hmm' }, { type: 'RESPONSE', content: 'answer' }] },
    { role: 'ASSISTANT', content: 'plain' },
  ]);
  assert.deepEqual(plain(texts), ['plain', 'answer']);
});

test('sandbox calls get their exact arguments from the chat history', async () => {
  const history = [
    { role: 'USER', content: 'make it' },
    { role: 'ASSISTANT', content: 'Writing.\n<BDS:AUTO:MCP url="sandbox" tool="write_file">{"path":"my_app.py","content":"print(\\"__main__\\")\\n"}</BDS:AUTO:MCP>' },
  ];
  const { win, calls } = load({ history });
  // What the engine read from the rendered Markdown: underscores and escapes lost.
  const mangled = { path: 'myapp.py', content: 'print("main")\n' };
  const reply = await win.__sdBridgeFetch({ type: 'bds-mcp-call', serverUrl: 'sandbox', toolName: 'write_file', args: mangled });
  assert.equal(reply.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(plain(calls[0].args), { path: 'my_app.py', content: 'print("__main__")\n' });
});

test('falls back to the engine args when the history has no match', async () => {
  const { win, calls } = load({ history: [{ role: 'ASSISTANT', content: 'no tags here' }] });
  await win.__sdBridgeFetch({ type: 'bds-mcp-call', serverUrl: 'sandbox://linux', toolName: 'run', args: { command: 'ls' } });
  assert.deepEqual(plain(calls[0].args), { command: 'ls' });
});

test('other bridge messages pass straight through', async () => {
  const { win, calls } = load();
  await win.__sdBridgeFetch({ type: 'bds-fetch-url', url: 'https://x' });
  await win.__sdBridgeFetch({ type: 'bds-mcp-call', serverUrl: 'https://mcp.example', toolName: 't', args: {} });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].serverUrl, 'https://mcp.example');
});

test('after Stop, sandbox calls are refused without reaching the device', async () => {
  const { win, calls, stops } = load();
  win.__sdAgent.stop(true);
  assert.equal(stops.length, 1);
  assert.equal(win.__sdAgentStopped, true);
  const reply = await win.__sdBridgeFetch({ type: 'bds-mcp-call', serverUrl: 'sandbox', toolName: 'run', args: { command: 'ls' } });
  assert.equal(reply.ok, false);
  assert.equal(calls.length, 0);
});

test('the sandbox server is offered only when supported and enabled', () => {
  assert.equal(load().win.__sdSandboxServers().length, 1);
  assert.equal(load().win.__sdSandboxServers()[0].serverUrl, 'sandbox://linux');
  assert.equal(load({ info: { supported: false } }).win.__sdSandboxServers().length, 0);
  assert.equal(load({ info: { supported: true, enabled: false } }).win.__sdSandboxServers().length, 0);
});

test('sandbox URL detection', () => {
  const { win } = load();
  const f = win.__sdAgent._isSandboxUrl;
  assert.equal(f('sandbox'), true);
  assert.equal(f('Sandbox://linux'), true);
  assert.equal(f('[sandbox](sandbox://linux)'), true);
  assert.equal(f('https://sandbox.example.com'), false);
});

test('the app is told while the agent works, and when it stops', async () => {
  const { win, actives } = load();
  assert.deepEqual(actives, [false], 'a fresh page clears any stale flag');
  await win.__sdBridgeFetch({ type: 'bds-mcp-call', serverUrl: 'sandbox', toolName: 'run', args: { command: 'ls' } });
  assert.equal(actives.at(-1), true);
  win.__sdAgent.stop(true);
  assert.equal(actives.at(-1), false);
  assert.deepEqual(actives, [false, true, false], 'reported only on changes');
});

test('tool-call spinners stop once a later message exists, or when all is idle', async () => {
  const { win } = load();
  const m1 = { id: 1, contains(x) { return x === this; } };
  const m2 = { id: 2, contains(x) { return x === this; } };
  const card = (msg) => {
    const cls = new Set(['bds-mcp-loading']);
    return { classList: { add: (c) => cls.add(c), has: (c) => cls.has(c) }, closest: () => msg, cls };
  };
  const old = card(m1);
  const current = card(m2);
  win.document.querySelectorAll = (sel) => {
    if (sel.startsWith('.bds-mcp-loading')) return [old, current].filter((c) => !c.cls.has('sd-done') && !c.cls.has('sd-stopped'));
    if (sel === '.ds-message') return [m1, m2];
    return [];
  };
  // A call is still running for the last message: only the older card is done.
  const running = win.__sdBridgeFetch({ type: 'bds-mcp-call', serverUrl: 'https://other.example/mcp', toolName: 't', args: {} });
  assert.equal(win.__sdAgent._sweepCards(), 1);
  assert.ok(old.cls.has('sd-done'));
  assert.ok(!current.cls.has('sd-done'));
  await running;
  // Finished, but still inside the idle grace period.
  assert.equal(win.__sdAgent._sweepCards(), 1);
  // Later: idle → done.
  const realNow = win.Date.now;
  win.Date.now = () => realNow() + 10000;
  try {
    assert.equal(win.__sdAgent._sweepCards(), 0);
  } finally {
    win.Date.now = realNow;
  }
  assert.ok(current.cls.has('sd-done'));
});
