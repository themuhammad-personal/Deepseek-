// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import state from "../../../src/content/state.js";
import {
  isSessionPinned,
  toggleSessionPin,
  getPinnedSessions,
  loadPinnedSessions,
} from "../../../src/content/pins/pin-manager.js";

describe("Chat Pinning Manager", () => {
  beforeEach(() => {
    state.pinnedSessionIds = [];
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ bds_pinned_sessions: ["session-1", "session-2"] }),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  it("loads pinned sessions from chrome storage", async () => {
    const list = await loadPinnedSessions();
    expect(list).toEqual(["session-1", "session-2"]);
    expect(isSessionPinned("session-1")).toBe(true);
    expect(isSessionPinned("session-3")).toBe(false);
  });

  it("toggles pin status and updates storage", async () => {
    state.pinnedSessionIds = ["session-1"];

    // Unpin session-1
    const unpinned = await toggleSessionPin("session-1");
    expect(unpinned).toBe(false);
    expect(isSessionPinned("session-1")).toBe(false);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ bds_pinned_sessions: [] });

    // Pin session-2
    const pinned = await toggleSessionPin("session-2");
    expect(pinned).toBe(true);
    expect(isSessionPinned("session-2")).toBe(true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ bds_pinned_sessions: ["session-2"] });
  });

  it("returns a copy of pinned sessions list", () => {
    state.pinnedSessionIds = ["a", "b", "c"];
    const copy = getPinnedSessions();
    expect(copy).toEqual(["a", "b", "c"]);
    copy.push("d");
    expect(getPinnedSessions()).toEqual(["a", "b", "c"]);
  });
});
