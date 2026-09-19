// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import DeepCodeModal from "../../../src/content/ui/DeepCodeModal.svelte";
import AttachMenu from "../../../src/content/ui/AttachMenu.svelte";
import appState from "../../../src/content/state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

vi.mock("../../../src/content/deep-code.js", () => ({
  pickAndLinkDeepCodeDirectory: vi.fn(),
  activateDeepCodeDirectory: vi.fn(),
  selectRecentDirectory: vi.fn(),
  removeRecentDirectory: vi.fn(),
  setDeepCodeEnabled: vi.fn((val) => {
    appState.deepCode.enabled = val;
  }),
}));

describe("DeepCodeModal & AttachMenu Integration", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    appState.deepCode = {
      enabled: false,
      activeDirectory: null,
      fileCount: 0,
      recentDirectories: [],
      manualPath: "",
    };
  });

  it("renders DeepCodeModal with enable toggle and path input", async () => {
    const { target, cleanup } = renderSvelte(DeepCodeModal, {
      show: true,
      activeDirectory: "/test/project",
      fileCount: 42,
    });
    await flushUi();

    expect(target.querySelector(".bds-dc-modal")).toBeTruthy();
    expect(target.querySelector(".ds-modal-content__title")?.textContent).toContain("DeepCode");
    expect(target.querySelector(".bds-dc-dir-name")?.textContent).toBe("/test/project");
    expect(target.querySelector(".bds-dc-dir-meta")?.textContent).toContain("42");

    cleanup();
  });

  it("AttachMenu renders Deep Code option and handles click", async () => {
    let deepCodeModalEventFired = false;
    window.addEventListener("bds:open-deep-code-modal", () => {
      deepCodeModalEventFired = true;
    });

    const nativeInput = document.createElement("input");
    nativeInput.type = "file";
    document.body.appendChild(nativeInput);

    const { target, cleanup } = renderSvelte(AttachMenu, {
      nativeInput,
    });
    await flushUi();

    // Click plus button to open attach menu
    const plusBtn = target.querySelector(".bds-plus-btn");
    expect(plusBtn).toBeTruthy();
    plusBtn.click();
    await flushUi();

    // Verify Deep Code button exists in menu
    const deepCodeBtn = document.querySelector('[data-testid="attach-menu-deep-code"]');
    expect(deepCodeBtn).toBeTruthy();
    expect(deepCodeBtn.textContent).toContain("Deep Code");

    // Click Deep Code item
    deepCodeBtn.click();
    await flushUi();

    expect(deepCodeModalEventFired).toBe(true);

    cleanup();
  });
});
