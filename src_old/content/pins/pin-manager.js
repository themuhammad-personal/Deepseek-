/**
 * Chat History Pinning & Organization Manager for Super DeepSeek.
 * Persists pinned conversation sessions in chrome.storage.local,
 * decorates pinned chat nodes, and provides organization functions.
 */

import state from "../state.js";
import { STORAGE_KEYS } from "../../lib/constants.js";

const PINNED_EVENT = "bds:pinned-chats-changed";

export async function loadPinnedSessions() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const res = await chrome.storage.local.get(STORAGE_KEYS.pinnedSessions);
      state.pinnedSessionIds = Array.isArray(res[STORAGE_KEYS.pinnedSessions])
        ? res[STORAGE_KEYS.pinnedSessions]
        : [];
    } else {
      state.pinnedSessionIds = state.pinnedSessionIds || [];
    }
  } catch (err) {
    console.warn("[BDS] Failed to load pinned sessions:", err);
    state.pinnedSessionIds = [];
  }
  return state.pinnedSessionIds;
}

export function isSessionPinned(sessionId) {
  if (!sessionId) return false;
  const list = state.pinnedSessionIds || [];
  return list.includes(sessionId);
}

export async function toggleSessionPin(sessionId) {
  if (!sessionId) return false;
  const list = state.pinnedSessionIds || [];
  let updated;
  let isPinned;

  if (list.includes(sessionId)) {
    updated = list.filter((id) => id !== sessionId);
    isPinned = false;
  } else {
    updated = [sessionId, ...list];
    isPinned = true;
  }

  state.pinnedSessionIds = updated;

  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.pinnedSessions]: updated });
    }
  } catch (err) {
    console.warn("[BDS] Failed to save pinned sessions:", err);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PINNED_EVENT, { detail: { sessionId, isPinned, pinnedList: updated } }));
  }

  return isPinned;
}

export function getPinnedSessions() {
  return [...(state.pinnedSessionIds || [])];
}
