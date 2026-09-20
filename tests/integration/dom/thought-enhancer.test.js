// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { enhanceThoughtBlocks } from "../../../src/content/dom/thought-enhancer.js";

describe("Thought Enhancer", () => {
  let root;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(root);
  });

  it("enhances .ds-think-content container with custom capsule header and toggle", () => {
    const thinkEl = document.createElement("div");
    thinkEl.className = "ds-think-content";
    thinkEl.innerHTML = "<p>Analyzing problem step by step...</p>";
    root.appendChild(thinkEl);

    enhanceThoughtBlocks(root, false, false);

    expect(thinkEl.getAttribute("data-bds-thought-enhanced")).toBe("true");
    expect(thinkEl.classList.contains("bds-thought-box")).toBe(true);

    const header = thinkEl.querySelector(".bds-thought-header");
    expect(header).not.toBeNull();
    expect(header.getAttribute("role")).toBe("button");

    const label = header.querySelector(".bds-thought-label");
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("Thought Process");

    const chevron = header.querySelector(".bds-thought-chevron");
    expect(chevron).not.toBeNull();

    // Default historical state is collapsed
    expect(thinkEl.classList.contains("bds-thought-collapsed")).toBe(true);
    expect(header.getAttribute("aria-expanded")).toBe("false");

    // Click to expand
    header.click();
    expect(thinkEl.classList.contains("bds-thought-collapsed")).toBe(false);
    expect(thinkEl.classList.contains("bds-thought-expanded")).toBe(true);
    expect(header.getAttribute("aria-expanded")).toBe("true");

    // Click to collapse again
    header.click();
    expect(thinkEl.classList.contains("bds-thought-collapsed")).toBe(true);
    expect(thinkEl.classList.contains("bds-thought-expanded")).toBe(false);
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });

  it("supports keyboard toggling via Enter and Space", () => {
    const thinkEl = document.createElement("div");
    thinkEl.className = "ds-think-content";
    thinkEl.innerHTML = "<p>Step 1</p>";
    root.appendChild(thinkEl);

    enhanceThoughtBlocks(root, false, false);

    const header = thinkEl.querySelector(".bds-thought-header");
    expect(thinkEl.classList.contains("bds-thought-collapsed")).toBe(true);

    // Press Enter
    header.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(thinkEl.classList.contains("bds-thought-expanded")).toBe(true);

    // Press Space
    header.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(thinkEl.classList.contains("bds-thought-collapsed")).toBe(true);
  });

  it("shows active thinking indicators (shimmer and pulse dot) while generating", () => {
    const thinkEl = document.createElement("div");
    thinkEl.className = "ds-think-content";
    thinkEl.innerHTML = "<p>Streaming thought...</p>";
    root.appendChild(thinkEl);

    enhanceThoughtBlocks(root, true, true);

    expect(thinkEl.classList.contains("bds-thinking-active")).toBe(true);
    expect(thinkEl.classList.contains("bds-thought-expanded")).toBe(true);

    const pulseDot = thinkEl.querySelector(".bds-thought-pulse-dot");
    expect(pulseDot).not.toBeNull();
    expect(pulseDot.style.display).toBe("inline-block");

    const shimmer = thinkEl.querySelector(".bds-thought-shimmer");
    expect(shimmer).not.toBeNull();

    // When generation completes on subsequent call
    enhanceThoughtBlocks(root, true, false);

    expect(thinkEl.classList.contains("bds-thinking-active")).toBe(false);
    expect(pulseDot.style.display).toBe("none");
    expect(thinkEl.querySelector(".bds-thought-shimmer")).toBeNull();
  });

  it("does not re-enhance already enhanced blocks", () => {
    const thinkEl = document.createElement("div");
    thinkEl.className = "ds-think-content";
    thinkEl.innerHTML = "<p>Content</p>";
    root.appendChild(thinkEl);

    enhanceThoughtBlocks(root, false, false);
    const headerCount1 = thinkEl.querySelectorAll(".bds-thought-header").length;

    enhanceThoughtBlocks(root, false, false);
    const headerCount2 = thinkEl.querySelectorAll(".bds-thought-header").length;

    expect(headerCount1).toBe(1);
    expect(headerCount2).toBe(1);
  });
});
