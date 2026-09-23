/**
 * DeepSeek chat API client — the single code path for both the APK and the web app.
 *
 * Why this file exists
 * --------------------
 * The previous design routed every message through a 4-hop JS <-> Kotlin bridge
 * (dsChatNative -> OkHttp -> inject PoW JS -> onPowSolved -> OkHttp) because it
 * assumed an AWS WAF blocked `chat.deepseek.com/api/*`. It does not: probing the
 * endpoints shows only `GET /` and `POST /users/login` are behind the WAF, while
 * `chat_session/create`, `chat/create_pow_challenge` and `chat/completion` all
 * answer a plain HTTP client with normal JSON. See docs/DIAGNOSIS-AND-FIX-PLAN.md.
 *
 * The real obstacle for a WebView was CORS: an OPTIONS preflight to the API
 * returns 403 and the responses carry no `Access-Control-Allow-Origin`, so a
 * cross-origin `fetch` with an `Authorization` header is blocked by the browser.
 *
 * The fix is to stop being cross-origin. The Android asset loader now serves the
 * SPA from `https://chat.deepseek.com/`, so every `/api/v0/...` call below is
 * same-origin: no preflight, real cookies, and the request looks exactly like the
 * official web app's. In `npm run dev` the same relative path is handled by the
 * Vite proxy, so this module never needs to know where it is running.
 */
import { solvePow, type PowChallenge } from "./pow-browser";

/** Relative on purpose — see the module comment. */
export const DS_API_BASE = "/api/v0";

export type DsEnvelope<T> = {
  code?: number;
  msg?: string;
  data?: T & { biz_code?: number; biz_msg?: string; biz_data?: unknown };
};

export class DsApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "DsApiError";
  }
}

type Biz<T> = { biz_code?: number; biz_msg?: string; biz_data?: T };

function bearer(token: string): string {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

/**
 * Unwrap DeepSeek's `{code, msg, data:{biz_code, biz_msg, biz_data}}` envelope.
 * The outer `code` is the transport-level status; `biz_code` is the business one.
 */
function unwrap<T>(json: { code?: number; msg?: string; data?: Biz<T> | null }, fallback: string): T {
  if (json.code && json.code !== 0) {
    throw new DsApiError(json.msg || fallback, undefined, json.code);
  }
  const biz = json.data;
  if (!biz) throw new DsApiError(json.msg || fallback);
  if (biz.biz_code && biz.biz_code !== 0) {
    throw new DsApiError(biz.biz_msg || fallback, undefined, biz.biz_code);
  }
  if (!biz.biz_data) throw new DsApiError(json.msg || fallback);
  return biz.biz_data as T;
}

async function post<T>(path: string, token: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(`${DS_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: bearer(token),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: { code?: number; msg?: string; data?: Biz<T> | null };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    // A non-JSON body here is almost always the AWS WAF challenge page.
    throw new DsApiError(
      res.status === 202
        ? "DeepSeek's anti-bot challenge blocked the request. Reopen the app to solve it."
        : `DeepSeek returned a non-JSON response (HTTP ${res.status}).`,
      res.status,
    );
  }
  if (!res.ok && !json.code) {
    throw new DsApiError(`DeepSeek error ${res.status}`, res.status);
  }
  return unwrap<T>(json, fallback);
}

async function get<T>(path: string, token: string, fallback: string): Promise<T> {
  const res = await fetch(`${DS_API_BASE}${path}`, {
    headers: { Authorization: bearer(token) },
  });
  const text = await res.text();
  let json: { code?: number; msg?: string; data?: Biz<T> | null };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new DsApiError(`DeepSeek returned a non-JSON response (HTTP ${res.status}).`, res.status);
  }
  if (json.code === 40003) {
    throw new DsApiError("Session expired. Please sign in again.", res.status, json.code);
  }
  if (!res.ok && !json.code) throw new DsApiError(`DeepSeek error ${res.status}`, res.status);
  return unwrap<T>(json, fallback);
}

/** Validate a token before trusting it. Returns the signed-in user. */
export async function currentUser(token: string) {
  return get<{ user?: { email?: string; mobile?: string; id?: string } }>(
    "/users/current",
    token,
    "Session expired.",
  );
}

export async function createSession(token: string): Promise<string> {
  const data = await post<{ chat_session?: { id?: string } }>(
    "/chat_session/create",
    token,
    {},
    "Could not start a chat.",
  );
  const id = data.chat_session?.id;
  if (!id) throw new DsApiError("Could not start a chat.");
  return id;
}

export async function createPowChallenge(token: string): Promise<PowChallenge> {
  const data = await post<{ challenge?: PowChallenge }>(
    "/chat/create_pow_challenge",
    token,
    { target_path: "/api/v0/chat/completion" },
    "PoW challenge failed.",
  );
  if (!data.challenge) throw new DsApiError("PoW challenge missing.");
  return data.challenge;
}

/**
 * The WASM solver hex-decodes `challenge` and treats `difficulty` as an
 * iteration budget. A base64 challenge or a missing salt makes it bail instantly
 * and used to surface as an opaque "no solution" — fail loudly instead.
 */
export function assertSolvable(challenge: PowChallenge): void {
  const hex = String(challenge?.challenge ?? "");
  const isHex = hex.length > 0 && hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex);
  if (!isHex) {
    throw new DsApiError(
      `DeepSeek sent a PoW challenge this build cannot solve (challenge is not hex; ${hex.length} chars).`,
    );
  }
  if (!challenge.salt || challenge.expire_at == null) {
    throw new DsApiError("DeepSeek sent a PoW challenge without salt/expire_at.");
  }
  const budget = Number(challenge.difficulty);
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new DsApiError(`PoW challenge has an unusable budget (${challenge.difficulty}).`);
  }
}

export type CompleteOptions = {
  token: string;
  sessionId: string;
  prompt: string;
  thinking: boolean;
  search: boolean;
  parentMessageId?: string | null;
  signal?: AbortSignal;
};

/**
 * Request a streamed completion. Returns the upstream SSE Response; the caller
 * parses it with `parseSseChunk`.
 *
 * A rejected proof-of-work (40300/40301) is retried exactly once with a fresh
 * challenge, which is what the official client does too.
 */
export async function completeStream(opts: CompleteOptions): Promise<Response> {
  const body = JSON.stringify({
    chat_session_id: opts.sessionId,
    parent_message_id: opts.parentMessageId ?? null,
    prompt: opts.prompt,
    ref_file_ids: [],
    thinking_enabled: opts.thinking,
    search_enabled: opts.search,
    preempt: false,
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const challenge = await createPowChallenge(opts.token);
    assertSolvable(challenge);
    console.info("[ds] PoW challenge", {
      algorithm: challenge.algorithm,
      challengeLen: String(challenge.challenge ?? "").length,
      budget: challenge.difficulty,
      expire_at: challenge.expire_at,
      target_path: challenge.target_path,
    });
    const pow = await solvePow(challenge);

    const res = await fetch(`${DS_API_BASE}/chat/completion`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        Authorization: bearer(opts.token),
        "X-Ds-Pow-Response": pow,
      },
      body,
      signal: opts.signal,
    });

    // DeepSeek reports business errors as HTTP 200 with a JSON envelope
    // ({"code":40003,...}), so `res.ok` alone is not enough — a successful
    // completion is a stream, an error is JSON.
    const contentType = res.headers.get("content-type") ?? "";
    if (res.ok && !contentType.includes("application/json")) return res;

    const text = await res.text().catch(() => "");
    let code: number | undefined;
    let msg: string | undefined;
    try {
      const j = JSON.parse(text) as { code?: number; msg?: string };
      code = j.code;
      msg = j.msg;
    } catch {
      /* not JSON */
    }

    const powRejected = code === 40300 || code === 40301;
    if (powRejected && attempt === 0) {
      console.warn("[ds] PoW rejected, re-solving once", { code, msg });
      continue;
    }
    if (code === 40003) {
      throw new DsApiError("Session expired. Please sign in again.", res.status, code);
    }
    throw new DsApiError(
      msg || `DeepSeek error ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      res.status,
      code,
    );
  }
  throw new DsApiError("DeepSeek rejected the proof-of-work twice.");
}
