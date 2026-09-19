import { devLog } from "../lib/dev-log.js";

/**
 * Hides the "Get App" promotional button injected by chat.deepseek.com on mobile viewports.
 * Installed by src/platform/globals-android.js when the Android content bundle starts.
 *
 * Uses a CSS rule with !important so the hiding survives framework re-renders that
 * overwrite inline styles. A MutationObserver re-marks any freshly created elements.
 */
export function hideGetAppButton() {
  if (window.__bdsGetAppObserver) return;

  const HIDE_ATTR = "data-bds-hide";

  const style = document.createElement("style");
  style.textContent = `[${HIDE_ATTR}] { display: none !important; }`;
  (document.head || document.documentElement).appendChild(style);

  function getHideTarget(label) {
    const control = label.closest?.("button, .ds-button, [role='button']");
    if (!control) return null;
    return control.matches?.(".ds-button") ? control : (control.parentElement || control);
  }

  function hideButton() {
    const candidates = document.querySelectorAll("span, .ds-button__content, .ds-button, button, [role='button']");
    for (const el of candidates) {
      const text = el.textContent.replace(/\s+/g, " ").trim();
      if (
        text !== "Get App" &&
        text !== "অ্যাপ পান" &&
        text !== "下载APP" &&
        text !== "下载 APP" &&
        !text.includes("অ্যাপ পান") &&
        !text.includes("下载APP")
      ) {
        continue;
      }
      const target = getHideTarget(el) || el;
      if (target && !target.hasAttribute(HIDE_ATTR)) {
        target.setAttribute(HIDE_ATTR, "");
        devLog("HideGetApp", "Hidden Get App container");
      }
    }
  }

  hideButton();

  let rafId = 0;
  const observer = new MutationObserver(() => {
    hideButton();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(hideButton);
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  window.__bdsGetAppObserver = observer;
}
