// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { swipeToDismiss } from "./gestures.js";

describe("gestures - swipeToDismiss", () => {
  it("initializes without throwing", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    const onDismiss = vi.fn();
    const action = swipeToDismiss(el, { onDismiss });

    expect(action).toBeTruthy();
    expect(typeof action.destroy).toBe("function");

    action.destroy();
    el.remove();
  });

  it("triggers onDismiss when dragged past threshold", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    const onDismiss = vi.fn();
    const action = swipeToDismiss(el, { onDismiss, threshold: 50 });

    // Touch start at y = 100
    const touchStartEvent = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStartEvent, "touches", {
      value: [{ clientY: 100, clientX: 50 }],
    });
    el.dispatchEvent(touchStartEvent);

    // Touch move to y = 200 (delta = 100 > threshold 50)
    const touchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(touchMoveEvent, "touches", {
      value: [{ clientY: 200, clientX: 50 }],
    });
    el.dispatchEvent(touchMoveEvent);

    // Touch end
    const touchEndEvent = new Event("touchend", { bubbles: true, cancelable: true });
    el.dispatchEvent(touchEndEvent);

    // Wait for spring animation completion
    await new Promise((r) => setTimeout(r, 100));

    expect(onDismiss).toHaveBeenCalled();

    action.destroy();
    el.remove();
  });

  it("does not dismiss when dragged below threshold", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    const onDismiss = vi.fn();
    const action = swipeToDismiss(el, { onDismiss, threshold: 80 });

    // Touch start at y = 100
    const touchStartEvent = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStartEvent, "touches", {
      value: [{ clientY: 100, clientX: 50 }],
    });
    el.dispatchEvent(touchStartEvent);

    // Small move to y = 110 (delta = 10 < threshold)
    const touchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(touchMoveEvent, "touches", {
      value: [{ clientY: 110, clientX: 50 }],
    });
    el.dispatchEvent(touchMoveEvent);

    const touchEndEvent = new Event("touchend", { bubbles: true, cancelable: true });
    el.dispatchEvent(touchEndEvent);

    await new Promise((r) => setTimeout(r, 60));

    expect(onDismiss).not.toHaveBeenCalled();

    action.destroy();
    el.remove();
  });
});
