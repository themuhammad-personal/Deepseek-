import { extractArtifacts } from "./artifacts";
import { createSseAcc, parseSseChunk } from "./deepseek/parse-sse";
import { emptyMessage, useAppStore } from "./app-store";
import { buildSystemPrompt } from "./ai/system-prompt";
import { performHaptic } from "./haptics";
import { formatRagContext, ragRetrieve } from "./rag";
import type { Attachment, ChatMode, Message, ResearchStep } from "./types";
import { uid } from "./utils";
import { toast } from "sonner";
import { t } from "./i18n";

export type SendPayload = {
  content: string;
  attachments?: Attachment[];
  chatId?: string;
  mode?: ChatMode;
  webSearch?: boolean;
};

const RESEARCH_STEPS: Omit<ResearchStep, "status">[] = [
  { id: "frame", title: "Framing the question" },
  { id: "search", title: "Searching the web" },
  { id: "read", title: "Reading sources" },
  { id: "check", title: "Cross-checking claims" },
  { id: "write", title: "Composing the report" },
];

function researchSeed(): ResearchStep[] {
  return RESEARCH_STEPS.map((s, i) => ({
    ...s,
    status: i === 0 ? "running" : "pending",
  }));
}

function advanceSteps(steps: ResearchStep[], chars: number): ResearchStep[] {
  const idx = Math.min(steps.length - 1, Math.floor(chars / 180));
  return steps.map((s, i) => ({
    ...s,
    status: i < idx ? "done" : i === idx ? "running" : "pending",
  }));
}

function shouldInjectPrompt(userCount: number): boolean {
  const freq = useAppStore.getState().settings.systemPromptInjectionFrequency;
  const n = useAppStore.getState().settings.systemPromptInjectionInterval || 3;
  if (freq === "always") return true;
  if (freq === "every_n") return userCount % n === 1;
  return userCount <= 1;
}

function composePrompt(
  userText: string,
  attachments: Attachment[],
  isFirst: boolean,
  userCount: number,
): string {
  const store = useAppStore.getState();
  const custom = store.prompts.find((p) => p.id === store.settings.activeSystemPromptId);
  const character = store.characters.find((c) => c.active) ?? null;
  const project = store.projects.find((p) => p.active) ?? null;
  const inject = shouldInjectPrompt(userCount);
  const prefix = inject
    ? buildSystemPrompt({
        mode: store.ui.mode,
        webSearch: store.ui.webSearch,
        locale: store.settings.locale,
        mcp: store.mcp.filter((m) => m.enabled).map((m) => m.id),
        rag: "",
        preferredLang: store.settings.preferredLang,
        injectDate: store.settings.injectSystemDateTime,
        disableCore: store.settings.disableSystemPrompt,
        customPrompt: custom?.content,
        memories: store.settings.disableMemory ? [] : store.memories,
        skills: store.skills,
        character,
      })
    : "";

  const files = attachments
    .map((a) => {
      if (a.text) return `Attached ${a.name}:\n${a.text.slice(0, 12000)}`;
      if (a.ocrText) return `OCR from ${a.name}:\n${a.ocrText}`;
      return a.kind === "image" ? `[Image attached: ${a.name}]` : `Attached file: ${a.name}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const projectBlock =
    isFirst && project?.instructions
      ? `Active project "${project.name}" instructions:\n${project.instructions}`
      : "";

  return [prefix, projectBlock, userText, files].filter(Boolean).join("\n\n");
}

export async function sendChat(payload: SendPayload, abort?: AbortController): Promise<void> {
  const store = useAppStore.getState();
  const content = payload.content.trim();
  const attachments = payload.attachments ?? [];
  if (!content && attachments.length === 0) return;

  if (!store.account?.token) {
    const locale = store.settings.locale;
    store.setLoginError(t(locale, "signInToSend"));
    toast.error(t(locale, "signInToSend"));
    return;
  }

  const chatId = payload.chatId ?? store.ensureChat(content || "Attachment");
  const mode = payload.mode ?? store.ui.mode;
  const webSearch = payload.webSearch ?? store.ui.webSearch;

  const userMsg = emptyMessage({
    role: "user",
    content: content || (attachments.length ? "Please review the attached files." : ""),
    attachments,
  });
  store.appendMessage(chatId, userMsg);

  if (!store.ui.online) {
    store.enqueue({ chatId, content: userMsg.content, attachments, mode, webSearch });
    store.patchMessage(chatId, userMsg.id, { queued: true });
    return;
  }

  const asst = emptyMessage({
    role: "assistant",
    content: "",
    thinking: mode === "think" || mode === "research" ? "" : undefined,
    researchSteps: mode === "research" ? researchSeed() : undefined,
  });
  store.appendMessage(chatId, asst);
  store.setStreaming(asst.id);
  performHaptic("send", store.settings.haptics);

  const started = Date.now();
  let rag = "";
  try {
    if (store.settings.projectRagEnabled) {
      const docs = await ragRetrieve(content, store.settings.ragChunks);
      rag = formatRagContext(docs);
    }
  } catch {
    rag = "";
  }

  const chat = useAppStore.getState().chats.find((c) => c.id === chatId);
  const userCount = chat?.messages.filter((m) => m.role === "user").length ?? 1;
  const isFirst = userCount <= 1;
  let prompt = composePrompt(userMsg.content, attachments, isFirst, userCount);
  if (rag) prompt += `\n\n${rag}`;

  if (
    mode === "research" &&
    store.settings.deepResearchContextGuardEnabled
  ) {
    const est = Math.ceil(prompt.length / 4);
    const cap =
      store.settings.deepResearchContextLimitTokens *
      (store.settings.deepResearchContextStopPercent / 100);
    if (est > cap) {
      store.patchMessage(chatId, asst.id, {
        error: "Deep Research stopped: context guard limit reached.",
        content: "",
      });
      store.setStreaming(null);
      return;
    }
  }

  try {
    // One code path for the APK and the web app: `/api/v0/...` is same-origin in
    // both (see src/lib/deepseek/api.ts). The old Android branch went through a
    // JS<->Kotlin bridge and then fell back to `/api/ds/complete`, which does not
    // exist inside the APK — that fallback is what produced the misleading
    // "DeepSeek is unavailable right now." for every single failure.
    const { createSession, completeStream } = await import("./deepseek/api.ts");

    let sessionId = chat?.dsSessionId;
    if (!sessionId) {
      sessionId = await createSession(store.account.token);
      useAppStore.getState().bindDsSession(chatId, sessionId);
    }

    const completeOpts = {
      token: store.account.token,
      sessionId,
      prompt,
      thinking: mode === "think" || mode === "research",
      search: webSearch || mode === "research",
      parentMessageId: null,
      signal: abort?.signal,
    };
    let res = await completeStream(completeOpts);

    if (res.status === 401) {
      useAppStore.getState().setAccount(null);
      store.patchMessage(chatId, asst.id, {
        error: "Session expired. Please sign in again.",
        content: "",
      });
      performHaptic("error", store.settings.haptics);
      return;
    }

    const acc = createSseAcc();
    let streamError: string | null = null;
    let sawDone = false;

    const applyToUi = () => {
      const patch: Partial<Message> = { content: acc.text };
      if (acc.thinking) patch.thinking = acc.thinking;
      if (mode === "research") {
        patch.researchSteps = advanceSteps(asst.researchSteps ?? researchSeed(), acc.text.length);
      }
      store.patchMessage(chatId, asst.id, patch);
    };

    const feedLine = (line: string) => {
      const delta = parseSseChunk(line, acc);
      if (!delta) return;
      if (delta.error) {
        streamError = delta.error;
        return;
      }
      if (delta.done) {
        sawDone = true;
        return;
      }
      applyToUi();
    };

    const pump = async (body: ReadableStream<Uint8Array>) => {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n")) !== -1) {
            feedLine(buf.slice(0, idx));
            buf = buf.slice(idx + 1);
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (buf.trim()) feedLine(buf);
    };

    // Android WebView surfaces abrupt HTTP/2 stream resets and flaky-link drops
    // as `TypeError: network error`. The upstream answer has usually completed
    // (or nearly so) by then; only a zero-progress death earns one full retry.
    for (let attempt = 0; ; attempt++) {
      if (!res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          errText
            ? `DeepSeek returned an empty stream: ${errText.slice(0, 200)}`
            : "DeepSeek returned an empty stream.",
        );
      }
      try {
        await pump(res.body);
        break;
      } catch (e) {
        const hasProgress = acc.text.length > 0 || acc.thinking.length > 0;
        if (
          attempt === 0 &&
          !sawDone &&
          !hasProgress &&
          e instanceof TypeError &&
          abort?.signal.aborted !== true
        ) {
          console.warn("[SendChat] stream died with no progress; retrying completion once", e);
          res = await completeStream(completeOpts);
          continue;
        }
        if (hasProgress || sawDone) break; // keep whatever arrived
        throw e;
      }
    }

    const text = acc.text;
    const thinking = acc.thinking;

    if (streamError && !text) {
      store.patchMessage(chatId, asst.id, { error: streamError, content: "" });
      performHaptic("error", store.settings.haptics);
      return;
    }
    if (!text && !thinking) {
      store.patchMessage(chatId, asst.id, {
        error: "DeepSeek returned an empty reply. Send the message again.",
        content: "",
      });
      performHaptic("error", store.settings.haptics);
      return;
    }

    const artifacts = extractArtifacts(text);
    const steps = (
      useAppStore.getState().chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === asst.id)
        ?.researchSteps ?? []
    ).map((s) => ({ ...s, status: "done" as const }));

    store.patchMessage(chatId, asst.id, {
      content: text,
      thinking: thinking || undefined,
      thinkingMs: Date.now() - started,
      artifacts: artifacts.length ? artifacts : undefined,
      researchSteps: mode === "research" ? steps : undefined,
    });
    if (artifacts[0]) store.setArtifact(artifacts[0].id);
    performHaptic("success", store.settings.haptics);
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      store.patchMessage(chatId, asst.id, {
        content:
          useAppStore.getState().chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === asst.id)
            ?.content || "Stopped.",
      });
      return;
    }
    // Surface the real reason. A blanket "Could not reach DeepSeek" is what made
    // this project impossible to debug for 86 builds.
    const message = err instanceof Error ? err.message : String(err ?? "unknown error");
    console.error("[SendChat] DeepSeek call failed:", err);
    if (/sign in again|expired/i.test(message)) {
      useAppStore.getState().setAccount(null);
    }
    store.patchMessage(chatId, asst.id, {
      error: message,
    });
    performHaptic("error", store.settings.haptics);
  } finally {
    useAppStore.getState().setStreaming(null);
  }
}

export function runJsInSandbox(code: string): { stdout: string; stderr: string; exitCode: number } {
  const logs: string[] = [];
  const errs: string[] = [];
  const fake = {
    log: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
    warn: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
    error: (...a: unknown[]) => errs.push(a.map(String).join(" ")),
  };
  try {
    const fn = new Function("console", `"use strict";\n${code}`);
    fn(fake);
    return { stdout: logs.join("\n"), stderr: errs.join("\n"), exitCode: errs.length ? 1 : 0 };
  } catch (e) {
    return { stdout: logs.join("\n"), stderr: String(e), exitCode: 1 };
  }
}

export function attachTerminal(chatId: string, command: string, result: ReturnType<typeof runJsInSandbox>) {
  const store = useAppStore.getState();
  store.appendMessage(
    chatId,
    emptyMessage({
      role: "assistant",
      content: "",
      terminal: {
        id: uid("term"),
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      },
    }),
  );
}
