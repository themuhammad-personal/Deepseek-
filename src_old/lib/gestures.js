/**
 * Gesture helper for mobile bottom sheets and modals.
 * Enables butter-smooth drag-to-dismiss gesture with spring physics.
 */
import { spring } from "svelte/motion";

export function swipeToDismiss(node, options = {}) {
  let {
    onDismiss = () => {},
    handleSelector = null,
    threshold = 85,
    velocityThreshold = 0.45,
    axis = "y",
  } = options;

  let startCoord = 0;
  let currentCoord = 0;
  let startTime = 0;
  let isDragging = false;
  let initialScrollTop = 0;
  let hasTriggeredHaptic = false;

  const offset = spring(0, {
    stiffness: 0.18,
    damping: 0.75,
  });

  const unsubscribe = offset.subscribe((val) => {
    if (!node) return;
    if (isDragging) {
      node.style.transform = `translateY(${Math.max(0, val)}px)`;
      node.style.transition = "none";
    } else if (val === 0) {
      node.style.transform = "";
      node.style.transition = "";
    } else {
      node.style.transform = `translateY(${Math.max(0, val)}px)`;
      node.style.transition = "none";
    }
  });

  function getScrollParent(element) {
    let parent = element;
    while (parent && parent !== node && parent !== document.body) {
      const overflowY = window.getComputedStyle(parent).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        return parent;
      }
      parent = parent.parentElement;
    }
    return node;
  }

  function handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

    // If handleSelector specified, only start if touch is inside handle or header
    if (handleSelector) {
      const handle = node.querySelector(handleSelector);
      if (handle && !handle.contains(e.target)) {
        // If not in handle, only allow dragging if inside a scroll container scrolled to top
        const scrollEl = getScrollParent(e.target);
        if (scrollEl && scrollEl.scrollTop > 0) return;
      }
    } else {
      const scrollEl = getScrollParent(e.target);
      if (scrollEl && scrollEl.scrollTop > 0) return;
    }

    startCoord = touch.clientY;
    currentCoord = startCoord;
    startTime = Date.now();
    isDragging = true;
    hasTriggeredHaptic = false;
    offset.set(0, { hard: true });
  }

  function handleTouchMove(e) {
    if (!isDragging) return;
    const touch = e.touches[0];
    const delta = touch.clientY - startCoord;

    if (delta > 0) {
      // User is dragging downwards
      currentCoord = touch.clientY;
      // Add slight resistance after threshold
      const dampedDelta = delta > threshold ? threshold + (delta - threshold) * 0.6 : delta;
      offset.set(dampedDelta, { hard: true });

      if (delta > threshold && !hasTriggeredHaptic) {
        hasTriggeredHaptic = true;
        if (typeof window !== "undefined" && window.AndroidBridge?.performHaptic) {
          try {
            window.AndroidBridge.performHaptic("light");
          } catch {}
        }
      } else if (delta < threshold) {
        hasTriggeredHaptic = false;
      }

      if (e.cancelable) {
        e.preventDefault();
      }
    } else {
      // Swiping up, reset to 0
      offset.set(0, { hard: true });
    }
  }

  function handleTouchEnd() {
    if (!isDragging) return;
    isDragging = false;
    const delta = currentCoord - startCoord;
    const elapsed = Math.max(1, Date.now() - startTime);
    const velocity = delta / elapsed;

    if (delta > threshold || (delta > 35 && velocity > velocityThreshold)) {
      // User dragged past threshold or flicked downwards
      if (typeof window !== "undefined" && window.AndroidBridge?.performHaptic) {
        try {
          window.AndroidBridge.performHaptic("medium");
        } catch {}
      }
      // Animate off screen then dismiss
      node.style.transition = "transform 0.18s cubic-bezier(0.32, 0.72, 0, 1)";
      node.style.transform = "translateY(100%)";
      setTimeout(() => {
        onDismiss();
      }, 60);
    } else {
      // Spring back to rest position
      offset.set(0);
    }
  }

  node.addEventListener("touchstart", handleTouchStart, { passive: true });
  node.addEventListener("touchmove", handleTouchMove, { passive: false });
  node.addEventListener("touchend", handleTouchEnd, { passive: true });
  node.addEventListener("touchcancel", handleTouchEnd, { passive: true });

  return {
    update(newOptions) {
      if (newOptions.onDismiss) onDismiss = newOptions.onDismiss;
      if (newOptions.threshold) threshold = newOptions.threshold;
      if (newOptions.handleSelector !== undefined) handleSelector = newOptions.handleSelector;
    },
    destroy() {
      unsubscribe();
      if (!node) return;
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", handleTouchEnd);
      node.removeEventListener("touchcancel", handleTouchEnd);
    },
  };
}
