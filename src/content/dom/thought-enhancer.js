/**
 * Native Thought Block Enhancer for DeepSeek & Super DeepSeek.
 * Elevates raw chain-of-thought blocks into sleek OpenAI 'o1' and Claude 3.7
 * style step-by-step thinking progress dropdowns with duration badges,
 * milestone rails, and smooth collapsible accordions.
 */

import { i18n } from "../../lib/i18n.svelte.js";

const ENHANCED_ATTR = "data-bds-thought-enhanced";
const START_TIME_ATTR = "data-bds-start-time";
const DURATION_ATTR = "data-bds-duration";

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

  if (isGenerating && !thinkEl.hasAttribute(START_TIME_ATTR)) {
    thinkEl.setAttribute(START_TIME_ATTR, String(Date.now()));
  }

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

    const headerText = getHeaderText(existingHeader, isGenerating, thinkEl);

    header.innerHTML = `
      <div class="bds-thought-header-left">
        <div class="bds-thought-spark-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
          </svg>
        </div>
        <span class="bds-thought-label">${headerText}</span>
        <div class="bds-thought-pulse-dot" style="display: ${isGenerating ? 'inline-block' : 'none'};"></div>
        <span class="bds-thought-step-count" style="display: none;"></span>
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
        renderMilestoneRail(thinkEl);
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
    renderMilestoneRail(thinkEl);
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

    const startTime = parseInt(box.getAttribute(START_TIME_ATTR) || "0", 10);
    if (startTime > 0) {
      const elapsed = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      if (label) {
        label.textContent = `Thinking (${elapsed}s)...`;
      }
    } else if (label && label.textContent !== i18n.t("thought.thinking")) {
      label.textContent = i18n.t("thought.thinking") || "Thinking...";
    }
  } else {
    box.classList.remove("bds-thinking-active");
    if (pulseDot) pulseDot.style.display = "none";
    if (shimmer) shimmer.remove();

    // Finalize duration if not already set
    if (!box.hasAttribute(DURATION_ATTR) && box.hasAttribute(START_TIME_ATTR)) {
      const startTime = parseInt(box.getAttribute(START_TIME_ATTR) || "0", 10);
      const elapsed = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      box.setAttribute(DURATION_ATTR, String(elapsed));
      if (label) {
        label.textContent = `Thought for ${elapsed}s`;
      }
    } else if (box.hasAttribute(DURATION_ATTR) && label) {
      const dur = box.getAttribute(DURATION_ATTR);
      label.textContent = `Thought for ${dur}s`;
    }

    renderMilestoneRail(box);
  }
}

/**
 * Extract step-by-step thinking milestones and render an OpenAI 'o1' timeline rail.
 */
function renderMilestoneRail(thinkEl) {
  if (!thinkEl) return;
  const content = thinkEl.textContent || "";
  if (content.length < 50) return;

  const milestones = extractMilestones(content);
  const countBadge = thinkEl.querySelector(".bds-thought-step-count");
  if (countBadge) {
    if (milestones.length >= 2) {
      countBadge.textContent = `${milestones.length} steps`;
      countBadge.style.display = "inline-block";
    } else {
      countBadge.style.display = "none";
    }
  }

  // If already rendered milestone rail, don't duplicate
  let rail = thinkEl.querySelector(".bds-thought-milestones-rail");
  if (milestones.length < 2) {
    if (rail) rail.remove();
    return;
  }

  if (!rail) {
    rail = document.createElement("div");
    rail.className = "bds-thought-milestones-rail";
    const header = thinkEl.querySelector(".bds-thought-header");
    if (header && header.nextSibling) {
      thinkEl.insertBefore(rail, header.nextSibling);
    } else {
      thinkEl.appendChild(rail);
    }
  }

  rail.innerHTML = milestones.map((step, idx) => `
    <div class="bds-thought-step-item">
      <div class="bds-thought-step-node">
        <span class="bds-thought-step-num">${idx + 1}</span>
      </div>
      <div class="bds-thought-step-text" title="${step}">${step}</div>
    </div>
  `).join("");
}

function extractMilestones(text) {
  const steps = [];
  const lines = text.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Pattern 1: Markdown headers e.g. ### Step 1 or ## Analysis
    const headerMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headerMatch && headerMatch[1].length < 80) {
      steps.push(cleanStepText(headerMatch[1]));
      continue;
    }

    // Pattern 2: Bold steps e.g. **1. Understanding requirement** or **Analyzing constraints:**
    const boldMatch = line.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch && boldMatch[1].length > 4 && boldMatch[1].length < 80) {
      steps.push(cleanStepText(boldMatch[1]));
      continue;
    }

    // Pattern 3: Numbered steps at line start e.g. 1. Deconstruct problem
    const numMatch = line.match(/^(\d+[\.\)]\s+)(.+)$/);
    if (numMatch && numMatch[2].length > 5 && numMatch[2].length < 80) {
      steps.push(cleanStepText(numMatch[2]));
      continue;
    }
  }

  // Deduplicate and cap at 8 milestones
  const unique = Array.from(new Set(steps));
  return unique.slice(0, 8);
}

function cleanStepText(text) {
  return text.replace(/[:：]$/, "").replace(/^\d+[\.\)]\s*/, "").trim();
}

function getHeaderText(existingHeader, isGenerating, thinkEl) {
  if (isGenerating) {
    return i18n.t("thought.thinking") || "Thinking...";
  }
  if (thinkEl && thinkEl.hasAttribute(DURATION_ATTR)) {
    return `Thought for ${thinkEl.getAttribute(DURATION_ATTR)}s`;
  }
  if (existingHeader && existingHeader.textContent?.trim()) {
    const txt = existingHeader.textContent.trim();
    // If original text has "Thought for Xs", retain it
    if (/thought\s+for/i.test(txt)) return txt;
    return txt;
  }
  return i18n.t("thought.thoughtProcess") || "Thought Process";
}

