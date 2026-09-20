// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { enhanceCodeBlocks } from "../../../src/content/dom/code-block-enhancer.js";

describe("Code Block Enhancer", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
  });

  it("injects floating header with language tag and copy button on standalone code blocks", () => {
    const pre = document.createElement("pre");
    pre.className = "language-python";
    pre.innerHTML = "<code>print('Hello World')</code>";
    container.appendChild(pre);

    enhanceCodeBlocks(container);

    expect(pre.getAttribute("data-bds-code-enhanced")).toBe("true");

    const header = container.querySelector(".bds-code-floating-header");
    expect(header).not.toBeNull();

    const langTag = header.querySelector(".bds-code-lang-tag");
    expect(langTag.textContent).toBe("PYTHON");

    const copyBtn = header.querySelector(".bds-code-copy-btn");
    expect(copyBtn).not.toBeNull();
  });

  it("copies code content on copy button click", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const pre = document.createElement("pre");
    pre.innerHTML = "<code class=\"language-javascript\">console.log(42);</code>";
    container.appendChild(pre);

    enhanceCodeBlocks(container);

    const copyBtn = container.querySelector(".bds-code-copy-btn");
    copyBtn.click();

    expect(writeTextMock).toHaveBeenCalledWith("console.log(42);");
  });

  it("does not re-enhance already enhanced pre elements", () => {
    const pre = document.createElement("pre");
    pre.innerHTML = "<code>const x = 1;</code>";
    container.appendChild(pre);

    enhanceCodeBlocks(container);
    enhanceCodeBlocks(container);

    const wrappers = container.querySelectorAll(".bds-code-wrapper");
    expect(wrappers.length).toBe(1);
  });
});
