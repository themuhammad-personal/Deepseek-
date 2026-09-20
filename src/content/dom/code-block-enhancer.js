/**
 * Mobile-First Code Block Enhancer for Super DeepSeek.
 * Injects floating language badges, quick-copy with haptics,
 * and horizontal scroll indicators for narrow screens.
 */

import { i18n } from "../../lib/i18n.svelte.js";

const CODE_ENHANCED_ATTR = "data-bds-code-enhanced";

function triggerHaptic() {
  if (typeof window !== "undefined") {
    if (window.AndroidBridge?.performHaptic) {
      window.AndroidBridge.performHaptic("CLICK");
    } else if (navigator?.vibrate) {
      navigator.vibrate(10);
    }
  }
}

/**
 * Scan message node and enhance any code blocks with mobile-first controls.
 * @param {HTMLElement} node - Message root DOM element
 */
export function enhanceCodeBlocks(node) {
  if (!node || typeof node.querySelectorAll !== "function") return;

  const preBlocks = node.querySelectorAll(`pre:not([${CODE_ENHANCED_ATTR}])`);

  for (const pre of preBlocks) {
    pre.setAttribute(CODE_ENHANCED_ATTR, "true");
    pre.classList.add("bds-code-pre");

    // Enable smooth touch scrolling on mobile
    pre.style.webkitOverflowScrolling = "touch";

    // Detect language
    const codeEl = pre.querySelector("code");
    const lang = detectLanguage(pre, codeEl);

    // If pre doesn't already have an enclosing banner or container
    const parent = pre.parentElement;
    const isMdBlock = parent?.classList?.contains("md-code-block") || parent?.querySelector?.(".md-code-block-banner");

    if (!isMdBlock) {
      injectStandaloneCodeHeader(pre, lang);
    }

    setupScrollIndicators(pre);
  }
}

function detectLanguage(pre, codeEl) {
  if (codeEl) {
    const classes = Array.from(codeEl.classList);
    for (const c of classes) {
      if (c.startsWith("language-")) {
        return c.replace("language-", "").toLowerCase();
      }
    }
  }
  const preClasses = Array.from(pre.classList);
  for (const c of preClasses) {
    if (c.startsWith("language-")) {
      return c.replace("language-", "").toLowerCase();
    }
  }
  return "code";
}

function injectStandaloneCodeHeader(pre, lang) {
  const header = document.createElement("div");
  header.className = "bds-code-floating-header";

  const isArtifactCapable = ["html", "svg", "xml", "markdown", "md", "mermaid", "javascript", "js", "typescript", "ts", "python", "py", "css", "json"].includes(lang);

  header.innerHTML = `
    <span class="bds-code-lang-tag">${lang.toUpperCase()}</span>
    <div class="bds-code-actions-group">
      ${isArtifactCapable ? `
      <button type="button" class="bds-code-artifact-btn" title="Open Claude-style Artifact">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        <span>Artifact</span>
      </button>` : ''}
      <button type="button" class="bds-code-copy-btn" title="${i18n.t('common.copy') || 'Copy code'}">
        <svg class="bds-copy-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <svg class="bds-check-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>${i18n.t('common.copy') || 'Copy'}</span>
      </button>
    </div>
  `;

  const artifactBtn = header.querySelector(".bds-code-artifact-btn");
  if (artifactBtn) {
    artifactBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerHaptic();
      const codeText = pre.querySelector("code")?.textContent || pre.textContent || "";
      window.dispatchEvent(new CustomEvent("bds:open-artifact", {
        detail: {
          title: `${lang.toUpperCase()} Artifact`,
          language: lang,
          code: codeText,
        }
      }));
    });
  }

  const copyBtn = header.querySelector(".bds-code-copy-btn");
  copyBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    triggerHaptic();

    const codeText = pre.querySelector("code")?.textContent || pre.textContent || "";
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(codeText);
      }
      const copySvg = header.querySelector(".bds-copy-svg");
      const checkSvg = header.querySelector(".bds-check-svg");
      const textSpan = copyBtn.querySelector("span");
      if (copySvg && checkSvg) {
        copySvg.style.display = "none";
        checkSvg.style.display = "inline-block";
        if (textSpan) textSpan.textContent = i18n.t("common.copied") || "Copied";
        copyBtn.classList.add("bds-btn-success");

        setTimeout(() => {
          copySvg.style.display = "inline-block";
          checkSvg.style.display = "none";
          if (textSpan) textSpan.textContent = i18n.t("common.copy") || "Copy";
          copyBtn.classList.remove("bds-btn-success");
        }, 2000);
      }
    } catch (err) {
      console.error("[BDS] Code copy failed:", err);
    }
  });

  if (pre.parentNode) {
    const wrapper = document.createElement("div");
    wrapper.className = "bds-code-wrapper";
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  }
}

function setupScrollIndicators(pre) {
  const updateScroll = () => {
    const isScrollable = pre.scrollWidth > pre.clientWidth;
    if (!isScrollable) {
      pre.classList.remove("bds-can-scroll-left", "bds-can-scroll-right");
      return;
    }
    const atLeft = pre.scrollLeft <= 4;
    const atRight = pre.scrollLeft + pre.clientWidth >= pre.scrollWidth - 4;

    pre.classList.toggle("bds-can-scroll-left", !atLeft);
    pre.classList.toggle("bds-can-scroll-right", !atRight);
  };

  pre.addEventListener("scroll", updateScroll, { passive: true });
  // Initial check
  requestAnimationFrame(updateScroll);
}
