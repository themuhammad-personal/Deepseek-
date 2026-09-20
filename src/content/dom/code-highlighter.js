/**
 * Pro Typography & Code Highlighting Engine using Prism.js.
 * Features:
 * - High-speed syntax highlighting for JavaScript, TypeScript, Python, Bash, JSON, SQL, Rust, C/C++
 * - Sticky language banner and "Copy Code" button during code block scroll
 */
import Prism from "prismjs";
import "prismjs/components/prism-python.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-markdown.js";
import "prismjs/components/prism-sql.js";
import "prismjs/components/prism-c.js";
import "prismjs/components/prism-cpp.js";
import "prismjs/components/prism-rust.js";

const HIGHLIGHTED_ATTR = "data-bds-highlighted";

export function highlightCodeBlocks(rootNode = document) {
  if (!rootNode || !rootNode.querySelectorAll) return;

  const blocks = rootNode.querySelectorAll(`.md-code-block:not([${HIGHLIGHTED_ATTR}]), pre > code:not([${HIGHLIGHTED_ATTR}])`);

  for (const block of blocks) {
    let preEl = null;
    let codeEl = null;
    let bannerEl = null;

    if (block.tagName.toLowerCase() === "code") {
      codeEl = block;
      preEl = block.parentElement;
      const parentBlock = preEl?.closest?.(".md-code-block");
      bannerEl = parentBlock?.querySelector?.(".md-code-block-banner");
    } else {
      preEl = block.querySelector("pre");
      codeEl = preEl?.querySelector("code");
      bannerEl = block.querySelector(".md-code-block-banner") || block.querySelector('[class*="code-block-banner"]');
    }

    if (!codeEl) continue;

    // Make banner sticky
    if (bannerEl) {
      bannerEl.classList.add("bds-code-sticky-banner");
    }

    // Determine language
    const lang = detectLanguage(codeEl, bannerEl);
    if (lang && Prism.languages[lang]) {
      try {
        codeEl.classList.add(`language-${lang}`);
        if (preEl) preEl.classList.add(`language-${lang}`);
        Prism.highlightElement(codeEl);
      } catch (err) {
        // Fallback gracefully if Prism highlighting encounters unexpected tokens
      }
    }

    block.setAttribute(HIGHLIGHTED_ATTR, "1");
    codeEl.setAttribute(HIGHLIGHTED_ATTR, "1");
  }
}

function detectLanguage(codeEl, bannerEl) {
  // Check className on code or pre
  const classString = `${codeEl.className} ${codeEl.parentElement?.className || ""}`;
  const match = classString.match(/language-([a-zA-Z0-9_+-]+)/i);
  if (match) {
    const raw = match[1].toLowerCase();
    return normalizeLanguage(raw);
  }

  // Check banner text
  if (bannerEl) {
    const text = bannerEl.textContent.trim().toLowerCase();
    const firstWord = text.split(/\s+/)[0];
    const normalized = normalizeLanguage(firstWord);
    if (normalized) return normalized;
  }

  return null;
}

function normalizeLanguage(lang) {
  if (!lang) return null;
  const l = lang.toLowerCase();
  if (l === "js" || l === "javascript" || l === "jsx") return "javascript";
  if (l === "ts" || l === "typescript" || l === "tsx") return "typescript";
  if (l === "py" || l === "python") return "python";
  if (l === "sh" || l === "bash" || l === "shell" || l === "zsh") return "bash";
  if (l === "json") return "json";
  if (l === "md" || l === "markdown") return "markdown";
  if (l === "sql") return "sql";
  if (l === "rs" || l === "rust") return "rust";
  if (l === "c") return "c";
  if (l === "cpp" || l === "c++") return "cpp";
  if (l === "html" || l === "xml" || l === "svg") return "markup";
  if (l === "css") return "css";
  return null;
}
