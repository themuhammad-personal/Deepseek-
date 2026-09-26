// Tests for bds/sd-native.js (the page-side native glue). Run: npm run test:engine
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, '../../main/bds-assets/bds/sd-native.js'), 'utf8');

function load({ blobs = {}, bridge = {} } = {}) {
  const fetched = [];
  const released = [];
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Object, Array, String, Date, Uint8Array,
    Blob, File, URL,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    navigator: { language: 'en' },
    document: { documentElement: { lang: 'en' }, querySelector: () => null, querySelectorAll: () => [] },
    location: { pathname: '/', host: 'chat.deepseek.com', search: '' },
    fetch: async (url) => {
      fetched.push(url);
      if (!(url in blobs)) return { ok: false, status: 404 };
      const b = blobs[url];
      return { ok: true, status: 200, blob: async () => b, text: async () => b.text() };
    },
    AndroidBridge: { releaseBlob: (p) => released.push(p), ...bridge },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { win: ctx, fetched, released };
}

const P = (t) => '/__sd/blob/' + t.padEnd(32, '0');

test('resolves text and binary blob entries into Files', async () => {
  const { win, released } = load({
    blobs: {
      [P('a')]: new Blob(['hello π'], { type: 'text/plain' }),
      [P('b')]: new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }),
    },
  });
  const res = await win.__sdResolvePickedBlobs({
    files: [
      { name: 'src/notes.md', content: '', blob: P('a'), text: true, mime: 'text/plain', size: 8 },
      { name: 'doc.pdf', content: '', encoding: 'base64', blob: P('b'), mime: 'application/pdf', size: 3 },
    ],
    skipped: [],
    folderName: 'x',
  });
  assert.equal(res.files.length, 2);
  assert.equal(res.folderName, 'x');
  const [t, b] = res.files;
  assert.equal(t.content, 'hello π');
  assert.equal(t.encoding, null);
  assert.equal(t.name, 'src/notes.md', 'relative path kept for folder context');
  assert.equal(t.file.name, 'notes.md');
  assert.equal(t.file.type, 'text/plain');
  assert.equal(b.encoding, 'base64', 'binary entries keep their marker');
  assert.equal(b.file.type, 'application/pdf');
  assert.equal(b.file.size, 3);
  assert.equal(b.blob, undefined);
  assert.deepEqual(released.sort(), [P('a'), P('b')].sort());
});

test('unreadable blobs move to skipped instead of failing the pick', async () => {
  const { win } = load({ blobs: { [P('a')]: new Blob(['x']) } });
  const res = await win.__sdResolvePickedBlobs({
    files: [
      { name: 'ok.txt', blob: P('a'), text: true },
      { name: 'gone.txt', blob: P('c'), text: true },
    ],
    skipped: [{ name: 'big.bin', reason: 'too-large' }],
  });
  const plain = (v) => JSON.parse(JSON.stringify(v)); // values from the vm realm
  assert.deepEqual(plain(res.files.map((f) => f.name)), ['ok.txt']);
  assert.deepEqual(plain(res.skipped), [
    { name: 'big.bin', reason: 'too-large' },
    { name: 'gone.txt', reason: 'unreadable' },
  ]);
});

test('legacy inline entries pass through untouched', async () => {
  const { win, fetched } = load();
  const q = { files: [{ name: 'a.txt', content: 'hi' }], skipped: [] };
  assert.equal(await win.__sdResolvePickedBlobs(q), q);
  assert.equal(fetched.length, 0);
});

test('pool keeps order and caps concurrency', async () => {
  const { win } = load();
  let inFlight = 0;
  let peak = 0;
  const out = await win.__sdNative._pool([5, 1, 4, 2, 3, 0, 6, 7], 3, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, n * 3));
    inFlight--;
    return n * 10;
  });
  assert.deepEqual(Array.from(out), [50, 10, 40, 20, 30, 0, 60, 70]);
  assert.ok(peak <= 3);
});

test('accept matching and text renaming', () => {
  const { win } = load();
  const acc = win.__sdNative._acceptsFile;
  const f = (n, t) => new File(['x'], n, { type: t });
  assert.ok(acc('', f('a.rs', 'text/plain')));
  assert.ok(acc('.pdf,.txt', f('a.TXT', 'text/plain')));
  assert.ok(acc('image/*', f('a.png', 'image/png')));
  assert.ok(!acc('.pdf,.txt', f('a.rs', 'text/plain')));

  const input = { accept: '.pdf,.txt' };
  const renamed = win.__sdAdaptUpload(f('main.rs', 'text/plain'), input);
  assert.equal(renamed.name, 'main.rs.txt');
  assert.equal(renamed.type, 'text/plain');
  const bin = f('x.bin', 'application/octet-stream');
  assert.equal(win.__sdAdaptUpload(bin, input), bin, 'binaries are not disguised');
  const ok = f('a.pdf', 'application/pdf');
  assert.equal(win.__sdAdaptUpload(ok, input), ok);
});

test('bridge fetch: async reply inline and via blob', async () => {
  let calls = [];
  const blobs = { [P('r')]: new Blob([JSON.stringify({ ok: true, html: 'big' })]) };
  const { win } = load({ blobs, bridge: { fetchAsync: (body, id) => calls.push({ body, id }) } });
  const p1 = win.__sdBridgeFetch({ type: 'bds-fetch-url', url: 'https://e.com' });
  const p2 = win.__sdBridgeFetch({ type: 'bds-fetch-url', url: 'https://f.com' });
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].body), { type: 'bds-fetch-url', url: 'https://e.com' });
  win.__sdBridgeReply(calls[1].id, null, P('r'));
  win.__sdBridgeReply(calls[0].id, JSON.stringify({ ok: true, status: 200 }), null);
  assert.deepEqual(JSON.parse(JSON.stringify(await p1)), { ok: true, status: 200 });
  assert.deepEqual(JSON.parse(JSON.stringify(await p2)), { ok: true, html: 'big' });
  // Unknown / repeated ids are ignored.
  win.__sdBridgeReply(calls[0].id, '{}', null);
  win.__sdBridgeReply('nope', '{}', null);
});

test('bridge fetch falls back to the blocking call on old native sides', async () => {
  const { win } = load({ bridge: { fetch: (body) => JSON.stringify({ echo: JSON.parse(body).type }) } });
  assert.deepEqual(JSON.parse(JSON.stringify(await win.__sdBridgeFetch({ type: 't' }))), { echo: 't' });
});

test('bridge fetch reports malformed replies', async () => {
  let id;
  const { win } = load({ bridge: { fetchAsync: (_b, i) => { id = i; } } });
  const p = win.__sdBridgeFetch({});
  win.__sdBridgeReply(id, 'not json', null);
  const r = await p;
  assert.equal(r.ok, false);
  assert.match(r.error, /parse/i);
});

test('loads once per document', () => {
  const { win } = load();
  const first = win.__sdNative;
  vm.runInContext(SRC, win);
  assert.equal(win.__sdNative, first);
});
