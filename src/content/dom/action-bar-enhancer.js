/**
 * Native Assistant Message Action Bar Enhancer for Super DeepSeek.
 * Provides ChatGPT & Claude-style one-tap Copy with haptics,
 * Read Aloud (TTS), and Conversation Fork / Branch actions.
 */

import state from "../state.js";
import { i18n } from "../../lib/i18n.svelte.js";
import { extractMessageRawText } from "./message-text.js";
import { safeAppendChild, safeAddClass, safeRemoveClass } from "./dom-safety.js";

const INJECTED_ACTIONS_ATTR = "data-bds-actions-injected";

function triggerHaptic() {
  if (typeof window !== "undefined") {
    if (window.AndroidBridge?.performHaptic) {
      window.AndroidBridge.performHaptic("CLICK");
    } else if (navigator?.vibrate) {
      navigator.vibrate(10);
    }
  }
}

/**
 * Scan assistant message node and enhance its action button row.
 * @param {HTMLElement} node - Message root DOM element
 */
export function injectActionBar(node) {
  if (!node || typeof node.querySelector !== "function") return;
  if (node.getAttribute(INJECTED_ACTIONS_ATTR)) return;

  const wrapper = node.closest("._4f9bf79._43c05b5") || node.parentElement || node;
  const actionRow = wrapper.querySelector("._0a3d93b") || wrapper.querySelector(".ds-flex._0a3d93b");
  if (!actionRow) return;

  const container = actionRow.querySelector("._965abe9") || actionRow.querySelector(".ds-flex._965abe9._54866f7") || actionRow;
  if (!container) return;

  node.setAttribute(INJECTED_ACTIONS_ATTR, "true");

  // Inject Quick Copy Button if not already present
  if (!container.querySelector(".bds-action-copy-btn")) {
    const copyBtn = createCopyButton(node);
    safeAppendChild(container, copyBtn);
  }

  // Inject Read Aloud Button if not already present
  if (!container.querySelector(".bds-action-speak-btn")) {
    const speakBtn = createSpeakButton(node);
    safeAppendChild(container, speakBtn);
  }

  // Inject Fork / Branch Button if not already present
  if (!container.querySelector(".bds-action-fork-btn")) {
    const forkBtn = createForkButton(node);
    safeAppendChild(container, forkBtn);
  }
}

function createCopyButton(node) {
  const btn = document.createElement("div");
  btn.className = "ds-button ds-button--iconLabelTertiary ds-button--icon ds-button--capsule ds-button--xs bds-action-copy-btn";
  btn.setAttribute("tabindex", "0");
  btn.setAttribute("role", "button");
  btn.title = i18n.t("common.copy") || "Copy";

  btn.innerHTML = `
    <div class="ds-button__background"></div>
    <div class="ds-button__icon ds-button__icon--last-child">
      <div class="ds-icon bds-action-icon-wrapper">
        <svg class="bds-copy-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <svg class="bds-check-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    </div>
  `;

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    triggerHaptic();

    const text = extractMessageRawText(node);
    if (!text) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }

      // Success animation
      const copyIcon = btn.querySelector(".bds-copy-icon");
      const checkIcon = btn.querySelector(".bds-check-icon");
      if (copyIcon && checkIcon) {
        copyIcon.style.display = "none";
        checkIcon.style.display = "inline-block";
        safeAddClass(btn, "bds-btn-success");

        if (state.ui?.showToast) {
          state.ui.showToast(i18n.t("common.copied") || "Copied to clipboard");
        }

        setTimeout(() => {
          copyIcon.style.display = "inline-block";
          checkIcon.style.display = "none";
          safeRemoveClass(btn, "bds-btn-success");
        }, 2000);
      }
    } catch (err) {
      console.error("[BDS] Copy failed:", err);
    }
  });

  return btn;
}

function createSpeakButton(node) {
  const btn = document.createElement("div");
  btn.className = "ds-button ds-button--iconLabelTertiary ds-button--icon ds-button--capsule ds-button--xs bds-action-speak-btn";
  btn.setAttribute("tabindex", "0");
  btn.setAttribute("role", "button");
  btn.title = i18n.t("actionBar.readAloud") || "Read aloud";

  btn.innerHTML = `
    <div class="ds-button__background"></div>
    <div class="ds-button__icon ds-button__icon--last-child">
      <div class="ds-icon bds-action-icon-wrapper">
        <svg class="bds-speak-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
        <svg class="bds-stop-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
          <rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect>
        </svg>
      </div>
    </div>
  `;

  let isSpeaking = false;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    triggerHaptic();

    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const speakIcon = btn.querySelector(".bds-speak-icon");
    const stopIcon = btn.querySelector(".bds-stop-icon");

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
      if (speakIcon) speakIcon.style.display = "inline-block";
      if (stopIcon) stopIcon.style.display = "none";
      safeRemoveClass(btn, "bds-btn-speaking");
      return;
    }

    const rawText = extractMessageRawText(node);
    const cleanText = rawText
      .replace(/<(BDS|BetterDeepSeek):[\s\S]*?<\/(BDS|BetterDeepSeek):[\s\S]*?>/gi, "")
      .replace(/<[^>]*>?/gm, "")
      .trim();

    if (!cleanText) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = state.settings?.voiceLanguage || navigator.language || "en-US";

    utterance.onstart = () => {
      isSpeaking = true;
      if (speakIcon) speakIcon.style.display = "none";
      if (stopIcon) stopIcon.style.display = "inline-block";
      safeAddClass(btn, "bds-btn-speaking");
    };

    utterance.onend = utterance.onerror = () => {
      isSpeaking = false;
      if (speakIcon) speakIcon.style.display = "inline-block";
      if (stopIcon) stopIcon.style.display = "none";
      safeRemoveClass(btn, "bds-btn-speaking");
    };

    window.speechSynthesis.speak(utterance);
  });

  return btn;
}

function createForkButton(node) {
  const btn = document.createElement("div");
  btn.className = "ds-button ds-button--iconLabelTertiary ds-button--icon ds-button--capsule ds-button--xs bds-action-fork-btn";
  btn.setAttribute("tabindex", "0");
  btn.setAttribute("role", "button");
  btn.title = i18n.t("actionBar.forkChat") || "Fork conversation";

  btn.innerHTML = `
    <div class="ds-button__background"></div>
    <div class="ds-button__icon ds-button__icon--last-child">
      <div class="ds-icon bds-action-icon-wrapper">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="18" r="3"></circle>
          <circle cx="6" cy="6" r="3"></circle>
          <circle cx="18" cy="6" r="3"></circle>
          <path d="M18 9v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path>
          <path d="M12 12v3"></path>
        </svg>
      </div>
    </div>
  `;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    triggerHaptic();

    // Dispatch fork event with the node
    window.dispatchEvent(new CustomEvent("bds:fork-chat", {
      detail: {
        messageNode: node,
        rawText: extractMessageRawText(node)
      }
    }));

    if (state.ui?.showToast) {
      state.ui.showToast(i18n.t("actionBar.forked") || "Branched from this message");
    }
  });

  return btn;
}
