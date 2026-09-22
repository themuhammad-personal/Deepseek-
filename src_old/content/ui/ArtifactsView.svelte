<script>
  import { onMount, onDestroy } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { triggerTextDownload } from "../../lib/utils/download.js";
  import { dragToDismiss } from "../../lib/gestures/drag-to-dismiss.js";

  let {
    visible = false,
    title = "Artifact",
    language = "html",
    code = "",
    onclose = null,
  } = $props();

  let activeTab = $state("preview"); // "preview" | "code"
  let isFullscreen = $state(false);
  let panelWidth = $state(560);
  let isDraggingResize = $state(false);
  let iframeEl = $state(null);
  let copySuccess = $state(false);

  // Determine if code has an interactive visual preview (HTML, SVG, Markdown, CSS, JS)
  let canPreview = $derived(
    ["html", "svg", "xml", "markdown", "md", "mermaid", "css", "javascript", "js"].includes((language || "").toLowerCase())
  );

  let initializedVisible = false;
  $effect(() => {
    if (visible && !initializedVisible) {
      initializedVisible = true;
      activeTab = canPreview ? "preview" : "code";
      copySuccess = false;
    } else if (!visible) {
      initializedVisible = false;
    }
  });

  function triggerHaptic(type = "CLICK") {
    if (typeof window !== "undefined") {
      if (window.AndroidBridge?.performHaptic) {
        window.AndroidBridge.performHaptic(type);
      } else if (navigator?.vibrate) {
        navigator.vibrate(10);
      }
    }
  }

  function handleResizeStart(e) {
    e.preventDefault();
    isDraggingResize = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    function onMove(e) {
      const delta = e.clientX - startX;
      panelWidth = Math.min(Math.max(startWidth - delta, 340), window.innerWidth * 0.85);
    }

    function onUp() {
      isDraggingResize = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function handleCopy() {
    triggerHaptic("CLICK");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      }
      copySuccess = true;
      setTimeout(() => (copySuccess = false), 2000);
    } catch (err) {
      console.error("[BDS] Artifact copy failed:", err);
    }
  }

  function handleDownload() {
    triggerHaptic("CLICK");
    const extMap = {
      html: "html",
      svg: "svg",
      xml: "xml",
      markdown: "md",
      md: "md",
      javascript: "js",
      js: "js",
      typescript: "ts",
      ts: "ts",
      python: "py",
      py: "py",
      json: "json",
      css: "css",
    };
    const ext = extMap[(language || "").toLowerCase()] || "txt";
    const filename = `${(title || "artifact").replace(/[<>:"/\\|?*]/g, "_")}.${ext}`;
    triggerTextDownload(code, filename);
  }

  function toggleFullscreen() {
    triggerHaptic("CLICK");
    isFullscreen = !isFullscreen;
  }

  function close() {
    triggerHaptic("CLICK");
    if (onclose) onclose();
  }

  // Generate safe sandboxed HTML payload for iframe
  let previewSrcDoc = $derived.by(() => {
    const l = (language || "").toLowerCase();
    if (l === "svg") {
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 16px; height: 100%; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: #fff; font-family: sans-serif; }
  svg { max-width: 100%; max-height: 100%; height: auto; }
</style>
</head>
<body>
  ${code}
</body>
</html>`;
    }

    if (l === "markdown" || l === "md") {
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; padding: 20px; color: #1f2937; max-width: 800px; margin: 0 auto; }
  pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
  code { font-family: monospace; }
  h1, h2, h3 { border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
</style>
</head>
<body>
  <div style="white-space: pre-wrap;">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
</body>
</html>`;
    }

    // Default HTML / Web
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
</style>
</head>
<body>
  ${code}
</body>
</html>`;
  });

  // Keydown shortcut to close (Escape)
  function handleKeydown(e) {
    if (e.key === "Escape" && visible) {
      close();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeydown);
  });
</script>

{#if visible}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="bds-artifact-backdrop" onclick={(e) => e.target === e.currentTarget && close()} role="presentation">
    <aside
      class="bds-artifact-panel"
      class:bds-artifact-fullscreen={isFullscreen}
      class:bds-dragging={isDraggingResize}
      style={!isFullscreen ? `width: ${panelWidth}px` : ""}
      use:dragToDismiss={{ onDismiss: close, handleSelector: ".bds-artifact-handle, .bds-artifact-header" }}
      role="region"
      aria-label="Claude Artifact Viewer"
    >
      <!-- Mobile Drag Handle -->
      <div class="bds-artifact-handle" aria-hidden="true"></div>

      <!-- Desktop Resize Handle -->
      {#if !isFullscreen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="bds-artifact-resize-handle" onmousedown={handleResizeStart} aria-hidden="true"></div>
      {/if}

      <!-- Header -->
      <header class="bds-artifact-header">
        <div class="bds-artifact-header-left">
          <div class="bds-artifact-icon-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </div>
          <div class="bds-artifact-meta">
            <span class="bds-artifact-title" title={title}>{title || "Artifact"}</span>
            <span class="bds-artifact-lang-badge">{(language || "code").toUpperCase()}</span>
          </div>
        </div>

        <!-- Center View Switcher (Preview vs Code) -->
        {#if canPreview}
          <div class="bds-artifact-tab-group" role="tablist">
            <button
              type="button"
              class="bds-artifact-tab"
              class:active={activeTab === "preview"}
              onclick={() => { triggerHaptic("CLICK"); activeTab = "preview"; }}
              role="tab"
              aria-selected={activeTab === "preview"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span>Preview</span>
            </button>
            <button
              type="button"
              class="bds-artifact-tab"
              class:active={activeTab === "code"}
              onclick={() => { triggerHaptic("CLICK"); activeTab = "code"; }}
              role="tab"
              aria-selected={activeTab === "code"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
              <span>Code</span>
            </button>
          </div>
        {/if}

        <!-- Right Action Controls -->
        <div class="bds-artifact-header-right">
          <!-- Copy Button -->
          <button
            type="button"
            class="bds-artifact-btn"
            class:bds-btn-success={copySuccess}
            onclick={handleCopy}
            title={copySuccess ? "Copied" : "Copy Code"}
            aria-label="Copy Code"
          >
            {#if copySuccess}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            {:else}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            {/if}
          </button>

          <!-- Download Button -->
          <button
            type="button"
            class="bds-artifact-btn"
            onclick={handleDownload}
            title="Download Artifact"
            aria-label="Download Artifact"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>

          <!-- Fullscreen Toggle -->
          <button
            type="button"
            class="bds-artifact-btn bds-artifact-fullscreen-btn"
            onclick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            aria-label="Fullscreen Toggle"
          >
            {#if isFullscreen}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            {:else}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            {/if}
          </button>

          <!-- Close Button -->
          <button
            type="button"
            class="bds-artifact-btn bds-artifact-close-btn"
            onclick={close}
            title="Close"
            aria-label="Close Artifact"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>

      <!-- Panel Body -->
      <main class="bds-artifact-body">
        {#if activeTab === "preview" && canPreview}
          <div class="bds-artifact-preview-wrap">
            <iframe
              bind:this={iframeEl}
              class="bds-artifact-frame"
              sandbox="allow-scripts allow-forms"
              srcdoc={previewSrcDoc}
              title={title}
            ></iframe>
          </div>
        {:else}
          <div class="bds-artifact-code-wrap">
            <pre class="bds-artifact-code-pre"><code>{code}</code></pre>
          </div>
        {/if}
      </main>
    </aside>
  </div>
{/if}

<style>
  .bds-artifact-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483640;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    animation: bdsArtifactFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes bdsArtifactFade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .bds-artifact-panel {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    max-height: 100vh;
    background: var(--bds-bg-panel, #ffffff);
    border-left: 1px solid var(--bds-border, #e4e4e7);
    box-shadow: -10px 0 36px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    z-index: 2147483641;
    animation: bdsArtifactSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    box-sizing: border-box;
    transition: width 0.2s ease;
  }

  .bds-artifact-panel.bds-artifact-fullscreen {
    width: 100vw !important;
    border-left: none;
  }

  @keyframes bdsArtifactSlideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .bds-artifact-resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    margin-left: -4px;
    cursor: ew-resize;
    background: transparent;
    transition: background 0.15s;
    z-index: 10;
  }

  .bds-artifact-resize-handle:hover,
  .bds-artifact-resize-handle:active {
    background: var(--bds-accent, #4d6bfe);
  }

  .bds-artifact-handle {
    display: none;
    width: 36px;
    height: 4px;
    border-radius: 999px;
    background: var(--bds-border, #d4d4d8);
    margin: 8px auto 2px;
    flex-shrink: 0;
  }

  .bds-artifact-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--bds-border, #e4e4e7);
    gap: 12px;
    flex-shrink: 0;
    background: var(--bds-bg-elevated, #fbfbfb);
  }

  .bds-artifact-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }

  .bds-artifact-icon-badge {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(77, 107, 254, 0.12);
    color: var(--bds-accent, #4d6bfe);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .bds-artifact-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .bds-artifact-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--bds-text-primary, #18181b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bds-artifact-lang-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--bds-border, #e4e4e7);
    color: var(--bds-text-secondary, #71717a);
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }

  /* Center Tab Group */
  .bds-artifact-tab-group {
    display: flex;
    align-items: center;
    background: var(--bds-border, #e4e4e7);
    padding: 3px;
    border-radius: 8px;
    gap: 2px;
    flex-shrink: 0;
  }

  .bds-artifact-tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--bds-text-secondary, #71717a);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bds-artifact-tab:hover {
    color: var(--bds-text-primary, #18181b);
  }

  .bds-artifact-tab.active {
    background: var(--bds-bg-panel, #ffffff);
    color: var(--bds-text-primary, #18181b);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  /* Right Buttons */
  .bds-artifact-header-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .bds-artifact-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--bds-border, #e4e4e7);
    background: var(--bds-bg-panel, #ffffff);
    color: var(--bds-text-secondary, #71717a);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bds-artifact-btn:hover {
    background: var(--bds-bg-hover, #f4f4f5);
    color: var(--bds-text-primary, #18181b);
    border-color: var(--bds-border-hover, #d4d4d8);
  }

  .bds-artifact-btn.bds-btn-success {
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.08);
  }

  .bds-artifact-close-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border-color: rgba(239, 68, 68, 0.3);
  }

  /* Body Content */
  .bds-artifact-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    background: var(--bds-bg-panel, #ffffff);
  }

  .bds-artifact-preview-wrap {
    width: 100%;
    height: 100%;
    flex: 1;
    overflow: hidden;
  }

  .bds-artifact-frame {
    width: 100%;
    height: 100%;
    border: none;
    background: #ffffff;
    display: block;
  }

  .bds-artifact-code-wrap {
    width: 100%;
    height: 100%;
    flex: 1;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px;
    box-sizing: border-box;
    background: #09090b;
  }

  .bds-artifact-code-pre {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 13px;
    line-height: 1.6;
    color: #e4e4e7;
    white-space: pre-wrap;
    word-break: break-all;
  }

  /* Pure OLED & Dark Theme adjustments */
  :global(.dark) .bds-artifact-panel {
    background: var(--bds-bg-panel, #121214);
    border-color: var(--bds-border, #27272a);
    box-shadow: -10px 0 36px rgba(0, 0, 0, 0.6);
  }

  :global(.dark) .bds-artifact-header {
    background: var(--bds-bg-elevated, #18181b);
    border-color: var(--bds-border, #27272a);
  }

  :global(.dark) .bds-artifact-title {
    color: var(--bds-text-primary, #f4f4f5);
  }

  :global(.dark) .bds-artifact-lang-badge {
    background: #27272a;
    color: #a1a1aa;
  }

  :global(.dark) .bds-artifact-tab-group {
    background: #27272a;
  }

  :global(.dark) .bds-artifact-tab {
    color: #a1a1aa;
  }

  :global(.dark) .bds-artifact-tab.active {
    background: #18181b;
    color: #f4f4f5;
  }

  :global(.dark) .bds-artifact-btn {
    background: #18181b;
    border-color: #27272a;
    color: #a1a1aa;
  }

  :global(.dark) .bds-artifact-btn:hover {
    background: #27272a;
    color: #f4f4f5;
  }

  :global(.bds-oled-dark) .bds-artifact-panel,
  :global(.bds-oled-dark) .bds-artifact-header {
    background: #000000 !important;
    border-color: #18181b !important;
  }

  /* Responsive Mobile / Bottom Sheet Layout */
  @media (max-width: 768px) {
    .bds-artifact-panel {
      top: auto !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      width: 100vw !important;
      max-width: 100vw !important;
      height: 90vh !important;
      max-height: 90vh !important;
      border-radius: 20px 20px 0 0 !important;
      border-left: none !important;
      border-top: 1px solid var(--bds-border, #27272a) !important;
      animation: bdsArtifactSlideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1) !important;
    }

    .bds-artifact-handle {
      display: block !important;
    }

    .bds-artifact-resize-handle,
    .bds-artifact-fullscreen-btn {
      display: none !important;
    }

    @keyframes bdsArtifactSlideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
  }
</style>
