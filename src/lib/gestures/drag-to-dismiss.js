import { spring } from "svelte/motion";

/**
 * Svelte Action: dragToDismiss
 * Provides buttery smooth native drag-to-dismiss gesture physics for bottom sheets and modals.
 *
 * @param {HTMLElement} node - The bottom sheet or modal container element
 * @param {Object} options
 * @param {() => void} [options.onDismiss] - Callback when dragged past threshold
 * @param {string} [options.handleSelector] - CSS selector for specific drag handle(s)
 * @param {number} [options.threshold] - Vertical drag distance (px) to trigger dismiss (defaults to 90 or 25% of height)
 * @param {string} [options.backdropSelector] - Optional backdrop element selector to fade with drag
 * @param {boolean} [options.disabled] - Whether drag gesture is disabled
 */
export function dragToDismiss(node, options = {}) {
  let {
    onDismiss,
    handleSelector = ".bds-drag-handle, .bds-sheet-handle, .ds-modal-content__header, .bds-drawer-header",
    threshold = null,
    backdropSelector = ".bds-drawer-backdrop, .bds-attach-backdrop, .bds-confirm-overlay, .ds-modal-backdrop",
    disabled = false,
  } = options;

  const ySpring = spring(0, {
    stiffness: 0.22,
    damping: 0.78,
  });

  let isDragging = false;
  let startY = 0;
  let currentY = 0;
  let startTime = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;
  let unsubscribeSpring = null;
  let backdropEl = null;

  function findBackdrop() {
    if (backdropSelector) {
      return (
        node.parentElement?.querySelector(backdropSelector) ||
        document.querySelector(backdropSelector)
      );
    }
    return null;
  }

  function applyTransform(y) {
    if (!node) return;
    if (y <= 0) {
      node.style.transform = "";
    } else {
      node.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
    }

    if (!backdropEl) backdropEl = findBackdrop();
    if (backdropEl) {
      const height = node.offsetHeight || 300;
      const progress = Math.min(1, Math.max(0, y / height));
      backdropEl.style.opacity = (1 - progress * 0.85).toFixed(3);
    }
  }

  unsubscribeSpring = ySpring.subscribe((val) => {
    if (!isDragging) {
      applyTransform(val);
    }
  });

  function triggerHaptic() {
    try {
      if (window?.AndroidBridge?.performHaptic) {
        window.AndroidBridge.performHaptic("CLICK");
      } else if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch (_) {
      // Ignored in non-supported environments
    }
  }

  function shouldStartDrag(target, clientY) {
    if (disabled) return false;
    // Check if target is or is inside handleSelector
    if (handleSelector) {
      const handle = node.querySelector(handleSelector);
      if (handle && (handle === target || handle.contains(target))) {
        return true;
      }
    }
    // If scrolled to very top, dragging down from top 60px of the sheet initiates drag
    const rect = node.getBoundingClientRect();
    const isNearTop = clientY - rect.top <= 64;
    const isAtScrollTop = (node.scrollTop || 0) <= 2;
    return isNearTop && isAtScrollTop;
  }

  function onTouchStart(e) {
    if (disabled) return;
    const touch = e.touches ? e.touches[0] : e;
    if (!shouldStartDrag(e.target, touch.clientY)) return;

    isDragging = true;
    startY = touch.clientY;
    currentY = touch.clientY;
    lastY = touch.clientY;
    startTime = performance.now();
    lastTime = startTime;
    velocity = 0;
    backdropEl = findBackdrop();

    // Remove transition during active finger tracking for instant 1:1 response
    node.style.transition = "none";
    if (backdropEl) backdropEl.style.transition = "none";
  }

  function onTouchMove(e) {
    if (!isDragging) return;
    const touch = e.touches ? e.touches[0] : e;
    const now = performance.now();
    const deltaY = touch.clientY - startY;

    // Calculate instantaneous velocity (px/ms)
    const dt = now - lastTime;
    if (dt >= 0) {
      velocity = (touch.clientY - lastY) / Math.max(1, dt);
      lastY = touch.clientY;
      lastTime = now;
    }

    if (deltaY > 0) {
      // If user drags down, prevent parent scroll
      if (e.cancelable) e.preventDefault();
      currentY = deltaY;
      applyTransform(currentY);
    } else {
      // Resistance when pulling up past top (rubber band effect)
      const resistance = -Math.pow(Math.abs(deltaY), 0.68) * 2;
      currentY = resistance;
      applyTransform(currentY);
    }
  }

  async function onTouchEnd(e) {
    if (!isDragging) return;
    isDragging = false;

    const sheetHeight = node.offsetHeight || 320;
    const dismissThreshold = threshold || Math.min(130, sheetHeight * 0.28);
    const hasFastDownwardFlick = velocity > 0.42 && currentY > 35;
    const isPastThreshold = currentY >= dismissThreshold || hasFastDownwardFlick;

    if (isPastThreshold) {
      triggerHaptic();
      // Animate offscreen smoothly with spring
      ySpring.set(sheetHeight + 80);
      if (typeof onDismiss === "function") {
        onDismiss();
      }
    } else {
      // Snap back with spring
      ySpring.set(0);
      if (backdropEl) {
        backdropEl.style.opacity = "";
      }
    }
  }

  // Bind touch events with passive: false for touchmove to allow preventDefault
  node.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });

  // Pointer / Mouse events for desktop testing and mouse drags
  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    onTouchStart(e);
  }

  node.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointermove", onTouchMove, { passive: false });
  window.addEventListener("pointerup", onTouchEnd, { passive: true });

  return {
    update(newOptions) {
      onDismiss = newOptions.onDismiss ?? onDismiss;
      handleSelector = newOptions.handleSelector ?? handleSelector;
      threshold = newOptions.threshold ?? threshold;
      backdropSelector = newOptions.backdropSelector ?? backdropSelector;
      disabled = Boolean(newOptions.disabled);
    },
    destroy() {
      if (unsubscribeSpring) unsubscribeSpring();
      node.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      node.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onTouchMove);
      window.removeEventListener("pointerup", onTouchEnd);
    },
  };
}
