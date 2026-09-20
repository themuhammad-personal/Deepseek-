// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dragToDismiss } from "../../src/lib/gestures/drag-to-dismiss.js";

describe("dragToDismiss gesture", () => {
  let node;
  let handle;

  beforeEach(() => {
    node = document.createElement("div");
    handle = document.createElement("div");
    handle.className = "bds-drag-handle";
    node.appendChild(handle);
    document.body.appendChild(node);
  });

  it("initializes without crashing and binds listeners", () => {
    const onDismiss = vi.fn();
    const action = dragToDismiss(node, { onDismiss });
    expect(action).toBeDefined();
    expect(typeof action.destroy).toBe("function");
    expect(typeof action.update).toBe("function");
    action.destroy();
  });

  it("triggers onDismiss when dragged down past threshold", async () => {
    const onDismiss = vi.fn();
    const action = dragToDismiss(node, { onDismiss, threshold: 50 });

    Object.defineProperty(node, "offsetHeight", { value: 400, configurable: true });

    // Simulate touchstart on handle
    handle.dispatchEvent(new TouchEvent("touchstart", {
      bubbles: true,
      touches: [{ clientY: 100 }],
      target: handle,
    }));

    // Simulate touchmove past threshold
    window.dispatchEvent(new TouchEvent("touchmove", {
      bubbles: true,
      touches: [{ clientY: 200 }],
      cancelable: true,
    }));

    // Simulate touchend
    await window.dispatchEvent(new TouchEvent("touchend", {
      bubbles: true,
      touches: [],
    }));

    // Give microtask/spring time to invoke callback
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    action.destroy();
  });

  it("does not trigger onDismiss if released before threshold", async () => {
    const onDismiss = vi.fn();
    const action = dragToDismiss(node, { onDismiss, threshold: 80 });

    handle.dispatchEvent(new TouchEvent("touchstart", {
      bubbles: true,
      touches: [{ clientY: 100 }],
      target: handle,
    }));

    // Small drag only 20px
    window.dispatchEvent(new TouchEvent("touchmove", {
      bubbles: true,
      touches: [{ clientY: 120 }],
      cancelable: true,
    }));

    window.dispatchEvent(new TouchEvent("touchend", {
      bubbles: true,
      touches: [],
    }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onDismiss).not.toHaveBeenCalled();
    action.destroy();
  });

  it("triggers onDismiss on fast downward flick even under threshold", async () => {
    const onDismiss = vi.fn();
    const action = dragToDismiss(node, { onDismiss, threshold: 150 });

    handle.dispatchEvent(new TouchEvent("touchstart", {
      bubbles: true,
      touches: [{ clientY: 100 }],
      target: handle,
    }));

    // Fast movement: 50px in 20ms = 2.5px/ms velocity
    window.dispatchEvent(new TouchEvent("touchmove", {
      bubbles: true,
      touches: [{ clientY: 150 }],
      cancelable: true,
    }));

    window.dispatchEvent(new TouchEvent("touchend", {
      bubbles: true,
      touches: [],
    }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    action.destroy();
  });
});
