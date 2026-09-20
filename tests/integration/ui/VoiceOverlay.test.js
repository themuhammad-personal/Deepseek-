// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import VoiceOverlay from "../../../src/content/ui/VoiceOverlay.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("VoiceOverlay (ChatGPT / Gemini Live style)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders when visible is true with header status and controls", async () => {
    const { target, cleanup } = renderSvelte(VoiceOverlay, {
      visible: true,
      onclose: vi.fn(),
    });
    await flushUi();

    const overlay = target.querySelector(".bds-voice-overlay");
    expect(overlay).toBeTruthy();

    const statusText = target.querySelector(".bds-voice-status-text");
    expect(statusText).toBeTruthy();

    const canvas = target.querySelector("canvas.bds-voice-canvas");
    expect(canvas).toBeTruthy();

    const muteBtn = target.querySelector(".bds-voice-deck-btn[aria-label*='Mute']");
    expect(muteBtn).toBeTruthy();

    cleanup();
  });

  it("triggers onclose callback when exit button is clicked", async () => {
    const closeSpy = vi.fn();
    const { target, cleanup } = renderSvelte(VoiceOverlay, {
      visible: true,
      onclose: closeSpy,
    });
    await flushUi();

    const closeBtn = target.querySelector(".bds-voice-close-btn");
    expect(closeBtn).toBeTruthy();
    closeBtn.click();
    await flushUi();

    expect(closeSpy).toHaveBeenCalled();
    cleanup();
  });
});
