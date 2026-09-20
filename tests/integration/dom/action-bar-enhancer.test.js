// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { injectActionBar } from "../../../src/content/dom/action-bar-enhancer.js";

describe("Action Bar Enhancer", () => {
  let messageNode;
  let actionRow;
  let buttonContainer;

  beforeEach(() => {
    document.body.innerHTML = `
      <div class="_4f9bf79 _43c05b5">
        <div class="message-node">
          <div class="ds-markdown">Hello, this is assistant text.</div>
        </div>
        <div class="_0a3d93b">
          <div class="_965abe9">
            <button class="ds-button ds-button--iconLabelTertiary">Existing Button</button>
          </div>
        </div>
      </div>
    `;

    messageNode = document.querySelector(".message-node");
    actionRow = document.querySelector("._0a3d93b");
    buttonContainer = document.querySelector("._965abe9");
  });

  it("injects copy, speak, and fork buttons into assistant action row", () => {
    injectActionBar(messageNode);

    const copyBtn = buttonContainer.querySelector(".bds-action-copy-btn");
    const speakBtn = buttonContainer.querySelector(".bds-action-speak-btn");
    const forkBtn = buttonContainer.querySelector(".bds-action-fork-btn");

    expect(copyBtn).not.toBeNull();
    expect(speakBtn).not.toBeNull();
    expect(forkBtn).not.toBeNull();
  });

  it("performs copy with clipboard write and icon toggle on copy button click", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    injectActionBar(messageNode);
    const copyBtn = buttonContainer.querySelector(".bds-action-copy-btn");

    copyBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(writeTextMock).toHaveBeenCalledWith("Hello, this is assistant text.");
    expect(copyBtn.classList.contains("bds-btn-success")).toBe(true);
  });

  it("dispatches bds:fork-chat event when fork button is clicked", () => {
    injectActionBar(messageNode);
    const forkBtn = buttonContainer.querySelector(".bds-action-fork-btn");

    const forkHandler = vi.fn();
    window.addEventListener("bds:fork-chat", forkHandler);

    forkBtn.click();

    expect(forkHandler).toHaveBeenCalledTimes(1);
    const eventDetail = forkHandler.mock.calls[0][0].detail;
    expect(eventDetail.messageNode).toBe(messageNode);
    expect(eventDetail.rawText).toContain("Hello, this is assistant text.");

    window.removeEventListener("bds:fork-chat", forkHandler);
  });

  it("controls speech synthesis when speak button is clicked", () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    window.speechSynthesis = {
      speak: speakMock,
      cancel: cancelMock,
      getVoices: vi.fn(() => []),
    };

    injectActionBar(messageNode);
    const speakBtn = buttonContainer.querySelector(".bds-action-speak-btn");

    speakBtn.click();

    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-inject buttons if already injected", () => {
    injectActionBar(messageNode);
    const copyCount1 = buttonContainer.querySelectorAll(".bds-action-copy-btn").length;

    injectActionBar(messageNode);
    const copyCount2 = buttonContainer.querySelectorAll(".bds-action-copy-btn").length;

    expect(copyCount1).toBe(1);
    expect(copyCount2).toBe(1);
  });
});
