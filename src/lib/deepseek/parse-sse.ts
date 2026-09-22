/** Parse DeepSeek web completion SSE (JSON-patch fragments) into thinking + text. */

export type DsDelta = {
  thinking?: string;
  text?: string;
  error?: string;
  done?: boolean;
};

type Patch = {
  p?: string;
  o?: string;
  v?: unknown;
};

function applyValue(acc: { thinking: string; text: string }, path: string, op: string, value: unknown) {
  const v = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  const isThink = /think|reasoning/i.test(path);
  const isContent = /content|fragments/i.test(path) && !/status|type|id/.test(path);
  if (!isContent && !isThink) return;
  const target = isThink ? "thinking" : "text";
  if (op === "APPEND" || op === "append") acc[target] += v;
  else if (op === "SET" || op === "set") {
    if (typeof value === "string" && value.length < 24 && /FINISHED|READY|WIP/i.test(value)) return;
    acc[target] = v;
  }
}

export function parseSseChunk(
  raw: string,
  acc: { thinking: string; text: string },
): DsDelta | null {
  const line = raw.trim();
  if (!line || line === "[DONE]") return { done: true };
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const obj = json as Patch & { type?: string; content?: string; v?: unknown; p?: string };

  if (obj.type === "error" || (obj as { hint?: string }).hint === "error") {
    const content = String((obj as { content?: string }).content || "DeepSeek returned an error.");
    return { error: content };
  }

  if (Array.isArray(obj.v) && obj.o === "BATCH") {
    for (const item of obj.v as Patch[]) {
      if (item && typeof item === "object" && item.p) {
        applyValue(acc, String(item.p), String(item.o || "SET"), item.v);
      }
    }
    return { thinking: acc.thinking, text: acc.text };
  }

  if (obj.p) {
    applyValue(acc, String(obj.p), String(obj.o || "SET"), obj.v);
    return { thinking: acc.thinking, text: acc.text };
  }

  // Fallback OpenAI-like
  const choices = (obj as { choices?: { delta?: { content?: string; reasoning_content?: string } }[] }).choices;
  if (choices?.[0]?.delta) {
    const d = choices[0].delta;
    if (d.reasoning_content) acc.thinking += d.reasoning_content;
    if (d.content) acc.text += d.content;
    return { thinking: acc.thinking, text: acc.text };
  }

  return { thinking: acc.thinking, text: acc.text };
}
