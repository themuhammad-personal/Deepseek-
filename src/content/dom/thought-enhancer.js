/**
 * Native Thought Block Enhancer for DeepSeek & Super DeepSeek.
 * Elevates raw chain-of-thought blocks into sleek Claude/ChatGPT-style
 * collapsible capsule cards with animated pulse/shimmer effects.
 */

import { i18n } from "../../lib/i18n.svelte.js";

const ENHANCED_ATTR = "data-bds-thought-enhanced";

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
 * Scan assistant message node and enhance any thinking/reasoning blocks.
 * @param {HTMLElement} node - Message root DOM element
 * @param {boolean} isLatestAssistant - Whether this is the latest assistant message
 * @param {boolean} isGenerating - Whether the model is currently streaming
 */
export function enhanceThoughtBlocks(node, isLatestAssistant = false, isGenerating = false) {
  if (!node || typeof node.querySelectorAll !== "function") return;

  // DeepSeek reasoning blocks: .ds-think-content or container holding it
  const thinkContainers = node.querySelectorAll('.ds-think-content, [class*="think"]');

  for (const thinkEl of thinkContainers) {
    // Avoid double-enhancing or enhancing inside already enhanced wrappers
    if (thinkEl.getAttribute(ENHANCED_ATTR) || thinkEl.closest(`[${ENHANCED_ATTR}]`)) {
      updateActiveState(thinkEl.closest(`[${ENHANCED_ATTR}]`) || thinkEl, isGenerating);
      continue;
    }

    // Only enhance top-level thought containers (not child spans/paragraphs)
    if (thinkEl.tagName === "SPAN" && !thinkEl.classList.contains("ds-think-content")) {
      continue;
    }

    applyThoughtEnhancement(thinkEl, isGenerating);
  }
}

function applyThoughtEnhancement(thinkEl, isGenerating) {
  // Find or identify original header / toggle if present in DeepSeek DOM
  const existingHeader = 
    thinkEl.querySelector("._5255ff8") || 
    thinkEl.querySelector("._74c0879") ||
    thinkEl.previousElementSibling?.matches?.("._5255ff8, ._74c0879, [class*='think']") ? thinkEl.previousElementSibling : null;

  // Mark element
  thinkEl.setAttribute(ENHANCED_ATTR, "true");
  thinkEl.classList.add("bds-thought-box");

  // Determine if it should be collapsed by default (historical messages collapsed, active stream expanded)
  const isCollapsed = !isGenerating && !thinkEl.classList.contains("bds-thought-expanded");

  // Build the native capsule header
  let header = thinkEl.querySelector(".bds-thought-header");
  if (!header) {
    header = document.createElement("div");
    header.className = "bds-thought-header";
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    header.setAttribute("aria-expanded", isCollapsed ? "false" : "true");

    const headerText = getHeaderText(existingHeader, isGenerating);

    header.innerHTML = `
      <div class="bds-thought-header-left">
        <div class="bds-thought-spark-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
          </svg>
        </div>
        <span class="bds-thought-label">${headerText}</span>
        <div class="bds-thought-pulse-dot" style="display: ${isGenerating ? 'inline-block' : 'none'};"></div>
      </div>
      <div class="bds-thought-header-right">
        <svg class="bds-thought-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    `;

    // Toggle collapse on click / enter / space
    const toggleHandler = (e) => {
      e.stopPropagation();
      triggerHaptic();
      const currentlyCollapsed = thinkEl.classList.contains("bds-thought-collapsed");
      if (currentlyCollapsed) {
        thinkEl.classList.remove("bds-thought-collapsed");
        thinkEl.classList.add("bds-thought-expanded");
        header.setAttribute("aria-expanded", "true");
      } else {
        thinkEl.classList.add("bds-thought-collapsed");
        thinkEl.classList.remove("bds-thought-expanded");
        header.setAttribute("aria-expanded", "false");
      }
    };

    header.addEventListener("click", toggleHandler);
    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleHandler(e);
      }
    });

    // Insert header at top of think container
    if (thinkEl.firstChild) {
      thinkEl.insertBefore(header, thinkEl.firstChild);
    } else {
      thinkEl.appendChild(header);
    }

    // Hide original duplicate header if found
    if (existingHeader && existingHeader !== header && existingHeader.parentNode) {
      existingHeader.style.display = "none";
    }
  }

  // Set initial collapse state
  if (isCollapsed) {
    thinkEl.classList.add("bds-thought-collapsed");
    thinkEl.classList.remove("bds-thought-expanded");
    if (header) header.setAttribute("aria-expanded", "false");
  } else {
    thinkEl.classList.remove("bds-thought-collapsed");
    thinkEl.classList.add("bds-thought-expanded");
    if (header) header.setAttribute("aria-expanded", "true");
  }

  // Shimmer indicator
  let shimmer = thinkEl.querySelector(".bds-thought-shimmer");
  if (!shimmer && isGenerating) {
    shimmer = document.createElement("div");
    shimmer.className = "bds-thought-shimmer";
    header.appendChild(shimmer);
  }

  updateActiveState(thinkEl, isGenerating);
}

function updateActiveState(box, isGenerating) {
  if (!box) return;
  const pulseDot = box.querySelector(".bds-thought-pulse-dot");
  const shimmer = box.querySelector(".bds-thought-shimmer");
  const label = box.querySelector(".bds-thought-label");

  if (isGenerating) {
    box.classList.add("bds-thinking-active");
    if (pulseDot) pulseDot.style.display = "inline-block";
    if (label && label.textContent !== i18n.t("thought.thinking")) {
      label.textContent = i18n.t("thought.thinking") || "Thinking...";
    }
  } else {
    box.classList.remove("bds-thinking-active");
    if (pulseDot) pulseDot.style.display = "none";
    if (shimmer) shimmer.remove();
  }
}

function getHeaderText(existingHeader, isGenerating) {
  if (isGenerating) {
    return i18n.t("thought.thinking") || "Thinking...";
  }
  if (existingHeader && existingHeader.textContent?.trim()) {
    return existingHeader.textContent.trim();
  }
  return i18n.t("thought.thoughtProcess") || "Thought Process";
}
