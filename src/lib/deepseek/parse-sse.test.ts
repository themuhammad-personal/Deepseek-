import assert from "node:assert/strict";
import test from "node:test";
import { parseSseChunk } from "./parse-sse.ts";

test("parseSseChunk handles [DONE] and errors", () => {
  const acc = { thinking: "", text: "" };
  assert.deepEqual(parseSseChunk("[DONE]", acc), { done: true });
  const err = parseSseChunk(JSON.stringify({ type: "error", content: "boom" }), acc);
  assert.equal(err?.error, "boom");
});

test("parseSseChunk appends DeepSeek JSON-patch fragments", () => {
  const acc = { thinking: "", text: "" };
  parseSseChunk(
    JSON.stringify({
      p: "/thinking",
      o: "APPEND",
      v: "reason ",
    }),
    acc,
  );
  parseSseChunk(
    JSON.stringify({
      o: "BATCH",
      v: [{ p: "/content", o: "APPEND", v: "hello" }],
    }),
    acc,
  );
  assert.equal(acc.thinking, "reason ");
  assert.equal(acc.text, "hello");
});

test("parseSseChunk accepts OpenAI-like deltas", () => {
  const acc = { thinking: "", text: "" };
  parseSseChunk(
    JSON.stringify({
      choices: [{ delta: { reasoning_content: "hmm", content: "hi" } }],
    }),
    acc,
  );
  assert.equal(acc.thinking, "hmm");
  assert.equal(acc.text, "hi");
});
