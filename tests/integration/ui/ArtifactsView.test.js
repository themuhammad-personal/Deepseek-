// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import ArtifactsView from "../../../src/content/ui/ArtifactsView.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("ArtifactsView (Claude Artifacts Layout)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders when visible is true with title and language badge", async () => {
    const { target, cleanup } = renderSvelte(ArtifactsView, {
      visible: true,
      title: "Sample HTML Card",
      language: "html",
      code: "<h1>Hello Artifacts</h1>",
    });
    await flushUi();

    const titleEl = target.querySelector(".bds-artifact-title");
    expect(titleEl).toBeTruthy();
    expect(titleEl.textContent).toBe("Sample HTML Card");

    const badge = target.querySelector(".bds-artifact-lang-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("HTML");

    cleanup();
  });

  it("provides Preview and Code tabs for visual languages like HTML", async () => {
    const { target, cleanup } = renderSvelte(ArtifactsView, {
      visible: true,
      title: "Interactive Widget",
      language: "html",
      code: "<button>Click me</button>",
    });
    await flushUi();

    const tabs = target.querySelectorAll(".bds-artifact-tab");
    expect(tabs.length).toBe(2);

    // Default tab for HTML is preview
    const iframe = target.querySelector("iframe.bds-artifact-frame");
    expect(iframe).toBeTruthy();

    // Click code tab
    tabs[1].click();
    await flushUi();

    const codePre = target.querySelector(".bds-artifact-code-pre");
    expect(codePre).toBeTruthy();
    expect(codePre.textContent).toContain("<button>Click me</button>");

    cleanup();
  });

  it("defaults to Code tab for non-visual languages like Python", async () => {
    const { target, cleanup } = renderSvelte(ArtifactsView, {
      visible: true,
      title: "Data Processing Script",
      language: "python",
      code: "def process(x):\n    return x * 2",
    });
    await flushUi();

    const codePre = target.querySelector(".bds-artifact-code-pre");
    expect(codePre).toBeTruthy();
    expect(codePre.textContent).toContain("def process(x):");

    cleanup();
  });

  it("copies code to clipboard when copy button is clicked", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const { target, cleanup } = renderSvelte(ArtifactsView, {
      visible: true,
      title: "SVG Graphic",
      language: "svg",
      code: "<svg viewBox='0 0 10 10'></svg>",
    });
    await flushUi();

    const copyBtn = target.querySelector(".bds-artifact-btn[title*='Copy']");
    expect(copyBtn).toBeTruthy();
    copyBtn.click();
    await flushUi();

    expect(writeTextMock).toHaveBeenCalledWith("<svg viewBox='0 0 10 10'></svg>");

    cleanup();
  });

  it("fires onclose callback when close button is clicked", async () => {
    const closeSpy = vi.fn();
    const { target, cleanup } = renderSvelte(ArtifactsView, {
      visible: true,
      title: "Doc",
      language: "markdown",
      code: "# Heading",
      onclose: closeSpy,
    });
    await flushUi();

    const closeBtn = target.querySelector(".bds-artifact-close-btn");
    expect(closeBtn).toBeTruthy();
    closeBtn.click();
    await flushUi();

    expect(closeSpy).toHaveBeenCalled();

    cleanup();
  });
});
