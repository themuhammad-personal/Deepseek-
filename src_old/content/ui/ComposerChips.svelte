<script module>
  export { getFileCategory, formatFileSize, setInputFiles } from "../../lib/composer/composer-utils.js";
</script>

<script>
  import { onMount, onDestroy } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import appState from "../state.js";
  import { dragToDismiss } from "../../lib/gestures/drag-to-dismiss.js";
  import { getFileCategory, formatFileSize, setInputFiles } from "../../lib/composer/composer-utils.js";

  /**
   * Props
   * @type {{ nativeInput?: HTMLInputElement | null }}
   */
  let { nativeInput = null } = $props();

  let rootEl = $state(null);
  let textareaEl = $state(null);
  let containerEl = $state(null);
  let files = $state([]);
  let isDraggingOver = $state(false);
  let activePreviewImage = $state(null);
  let activePreviewDoc = $state(null);
  let currentFileInput = $state(null);

  // Map of file object URLs for memory management
  const objectUrlMap = new Map();

  function triggerHaptic() {
    if (typeof window !== "undefined") {
      if (window.AndroidBridge?.performHaptic) {
        window.AndroidBridge.performHaptic("CLICK");
      } else if (navigator?.vibrate) {
        navigator.vibrate(10);
      }
    }
  }

  function resolveInput() {
    if (nativeInput && document.contains(nativeInput)) {
      return nativeInput;
    }
    if (currentFileInput && document.contains(currentFileInput)) {
      return currentFileInput;
    }
    const found = document.querySelector('input[type="file"][multiple]') ||
                  document.querySelector('input[type="file"]');
    if (found) {
      currentFileInput = found;
    }
    return currentFileInput || nativeInput;
  }

  function findTextarea() {
    return document.querySelector("textarea#chat-input") ||
           document.querySelector(".ds-textarea textarea") ||
           document.querySelector("textarea");
  }

  function findChatContainer() {
    return document.querySelector("._75e1990") ||
           document.querySelector("._6f68655") ||
           document.querySelector("._77cefa5") ||
           document.querySelector("._24fad49") ||
           document.querySelector(".ds-textarea") ||
           findTextarea()?.closest(".ds-textarea") ||
           findTextarea()?.parentElement;
  }

  function findSendButton() {
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    return buttons.find((button) => {
      if (button.closest("#bds-root")) return false;
      return (
        button.querySelector?.('svg path[d*="M8.3125"], .ds-icon-send') ||
        button.querySelector?.('svg path[d*="M13.12 19.98"]') ||
        button.title === "Send message" ||
        button.ariaLabel === "Send Message" ||
        button.getAttribute("aria-label") === "Send Message"
      );
    }) || null;
  }

  export function syncFiles() {
    const input = resolveInput();
    const inputFiles = Array.from(input?.files || []);

    // Clean up URLs for removed files
    const newFilesSet = new Set(inputFiles);
    for (const [f, url] of objectUrlMap.entries()) {
      if (!newFilesSet.has(f)) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
        objectUrlMap.delete(f);
      }
    }

    const processed = inputFiles.map((file, index) => {
      const category = getFileCategory(file);
      const isImage = category === "image";
      let previewUrl = null;

      if (isImage) {
        if (objectUrlMap.has(file)) {
          previewUrl = objectUrlMap.get(file);
        } else {
          try {
            previewUrl = URL.createObjectURL(file);
            objectUrlMap.set(file, previewUrl);
          } catch {
            previewUrl = null;
          }
        }
      }

      const dotIdx = file.name.lastIndexOf(".");
      const extension = dotIdx > 0 ? file.name.slice(dotIdx).toUpperCase() : "";

      return {
        id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
        file,
        name: file.name,
        size: formatFileSize(file.size),
        rawSize: file.size,
        type: file.type,
        extension,
        category,
        isImage,
        previewUrl,
      };
    });

    files = processed;
  }

  export function removeFile(index) {
    triggerHaptic();
    const input = resolveInput();
    if (!input) return;

    const current = Array.from(input.files || []);
    if (index >= 0 && index < current.length) {
      const removed = current.splice(index, 1)[0];
      if (removed && objectUrlMap.has(removed)) {
        try {
          URL.revokeObjectURL(objectUrlMap.get(removed));
        } catch {}
        objectUrlMap.delete(removed);
      }

      setInputFiles(input, current);
      input.dispatchEvent(new Event("change", { bubbles: true }));
      syncFiles();
      window.dispatchEvent(new CustomEvent("bds:files-changed"));
    }
  }

  export function clearAll() {
    triggerHaptic();
    const input = resolveInput();
    if (input) {
      input.value = "";
      setInputFiles(input, []);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // Clean up all object URLs
    for (const url of objectUrlMap.values()) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    objectUrlMap.clear();
    files = [];
    window.dispatchEvent(new CustomEvent("bds:files-changed"));
  }

  export function addFiles(newFiles) {
    const input = resolveInput();
    if (!input || !newFiles || newFiles.length === 0) return;

    const combined = [...Array.from(input.files || []), ...Array.from(newFiles)];
    setInputFiles(input, combined);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    syncFiles();
    window.dispatchEvent(new CustomEvent("bds:files-changed"));
  }

  async function handleChipClick(item, index) {
    triggerHaptic();
    if (item.isImage && item.previewUrl) {
      activePreviewImage = { ...item, index };
    } else if (item.category === "code" || item.category === "text") {
      try {
        const text = await item.file.text();
        if (appState?.ui?.showPreviewPanel) {
          appState.ui.showPreviewPanel(item.name, text);
        } else {
          activePreviewDoc = { ...item, content: text.slice(0, 10000) };
        }
      } catch (err) {
        console.warn("[ComposerChips] Failed to read text file:", err);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════
     Auto-Expanding Textarea Engine
     ══════════════════════════════════════════════════════════════ */
  let baseMinHeight = 44;

  export function autoResizeTextarea() {
    if (!textareaEl) {
      textareaEl = findTextarea();
    }
    if (!textareaEl) return;

    // Do not interfere if user activated full 70vh expand mode
    const parentContainer = textareaEl.closest(".bds-prompt-expanded");
    if (parentContainer) return;

    const val = textareaEl.value || "";

    // Measure min and max heights
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const maxHeight = isMobile ? 210 : 280;

    if (!val.trim()) {
      // Empty input -> smoothly return to min-height
      textareaEl.style.height = `${baseMinHeight}px`;
      textareaEl.style.overflowY = "hidden";
      return;
    }

    // Measure scrollHeight safely
    const prevHeight = textareaEl.style.height;
    textareaEl.style.height = "auto";
    const scrollHeight = textareaEl.scrollHeight;

    const targetHeight = Math.min(Math.max(scrollHeight, baseMinHeight), maxHeight);
    textareaEl.style.height = `${targetHeight}px`;

    if (scrollHeight > maxHeight) {
      textareaEl.style.overflowY = "auto";
    } else {
      textareaEl.style.overflowY = "hidden";
    }
  }

  /* ══════════════════════════════════════════════════════════════
     Clipboard Image Paste & Drag-and-Drop
     ══════════════════════════════════════════════════════════════ */
  function onPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
      if (appState?.ui?.showToast) {
        appState.ui.showToast(t("composer.imagePasted") || "Image attached from clipboard");
      }
    }
  }

  function onDragOver(e) {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      isDraggingOver = true;
    }
  }

  function onDragLeave(e) {
    if (!containerEl || !containerEl.contains(e.relatedTarget)) {
      isDraggingOver = false;
    }
  }

  function onDrop(e) {
    isDraggingOver = false;
    const dropped = Array.from(e.dataTransfer?.files || []);
    if (dropped.length > 0) {
      e.preventDefault();
      addFiles(dropped);
      triggerHaptic();
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      // Sent message: poll quickly to reset height and clear files when send completes
      setTimeout(() => {
        autoResizeTextarea();
        syncFiles();
      }, 60);
      setTimeout(() => {
        autoResizeTextarea();
        syncFiles();
      }, 250);
    }
  }

  function onInput() {
    autoResizeTextarea();
  }

  function attachToDom() {
    if (!rootEl) return;
    textareaEl = findTextarea();
    containerEl = findChatContainer();

    if (textareaEl && textareaEl.parentElement) {
      const parent = textareaEl.parentElement;
      if (rootEl.parentElement !== parent) {
        parent.insertBefore(rootEl, textareaEl);
      }
    } else if (containerEl && rootEl.parentElement !== containerEl) {
      containerEl.prepend(rootEl);
    }
  }

  let cleanupListeners = [];

  onMount(() => {
    attachToDom();
    syncFiles();

    // Attach DOM repositioner
    const intervalId = setInterval(() => {
      attachToDom();
      // Also catch if nativeInput changed or was rendered
      const cur = resolveInput();
      if (cur && cur.files && cur.files.length !== files.length) {
        syncFiles();
      }
    }, 500);

    // Listeners for textarea
    if (textareaEl) {
      textareaEl.addEventListener("input", onInput);
      textareaEl.addEventListener("keydown", onKeyDown);
      textareaEl.addEventListener("paste", onPaste);
      cleanupListeners.push(() => {
        textareaEl?.removeEventListener("input", onInput);
        textareaEl?.removeEventListener("keydown", onKeyDown);
        textareaEl?.removeEventListener("paste", onPaste);
      });
      autoResizeTextarea();
    }

    // Listeners for drag & drop
    const chatContainer = findChatContainer();
    if (chatContainer) {
      chatContainer.addEventListener("dragover", onDragOver);
      chatContainer.addEventListener("dragleave", onDragLeave);
      chatContainer.addEventListener("drop", onDrop);
      cleanupListeners.push(() => {
        chatContainer.removeEventListener("dragover", onDragOver);
        chatContainer.removeEventListener("dragleave", onDragLeave);
        chatContainer.removeEventListener("drop", onDrop);
      });
    }

    // Native input change listener
    const curInput = resolveInput();
    const onInputChange = () => syncFiles();
    if (curInput) {
      curInput.addEventListener("change", onInputChange);
      cleanupListeners.push(() => curInput.removeEventListener("change", onInputChange));
    }

    // Custom events
    const onFilesChanged = () => syncFiles();
    window.addEventListener("bds:files-changed", onFilesChanged);
    cleanupListeners.push(() => window.removeEventListener("bds:files-changed", onFilesChanged));

    // Send button listener
    const sendBtn = findSendButton();
    const onSendClick = () => {
      setTimeout(() => {
        autoResizeTextarea();
        syncFiles();
      }, 100);
      setTimeout(() => {
        autoResizeTextarea();
        syncFiles();
      }, 350);
    };
    if (sendBtn) {
      sendBtn.addEventListener("click", onSendClick);
      cleanupListeners.push(() => sendBtn.removeEventListener("click", onSendClick));
    }

    return () => {
      clearInterval(intervalId);
      cleanupListeners.forEach((fn) => fn());
      for (const url of objectUrlMap.values()) {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }
      objectUrlMap.clear();
    };
  });

  onDestroy(() => {
    cleanupListeners.forEach((fn) => fn());
    for (const url of objectUrlMap.values()) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    objectUrlMap.clear();
  });
</script>

<div
  bind:this={rootEl}
  class="bds-composer-chips {files.length === 0 ? 'bds-composer-chips-empty' : ''} {isDraggingOver ? 'bds-composer-dragover' : ''}"
  role="region"
  aria-label={t("composer.attachments") || "Attachments"}
>
  {#if isDraggingOver}
    <div class="bds-composer-drop-banner">
      <svg class="bds-drop-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      <span>{t("composer.dropToAttach") || "Drop files here to attach"}</span>
    </div>
  {/if}

  {#if files.length > 0}
    <div class="bds-composer-chips-header">
      <span class="bds-composer-chips-count">
        {t("composer.attachments") || "Attachments"} ({files.length})
      </span>
      {#if files.length > 1}
        <button
          type="button"
          class="bds-composer-clear-all"
          onclick={clearAll}
          title={t("composer.clearAll") || "Clear all"}
        >
          {t("composer.clearAll") || "Clear all"}
        </button>
      {/if}
    </div>

    <div class="bds-composer-chips-tray">
      {#each files as item, index (item.id)}
        <div
          class="bds-chip-item bds-chip-{item.category}"
          title={item.name}
        >
          {#if item.isImage && item.previewUrl}
            <!-- Image Chip with Thumbnail -->
            <button
              type="button"
              class="bds-chip-thumb-btn"
              onclick={() => handleChipClick(item, index)}
              title="{t('composer.previewImage') || 'Preview image'}: {item.name}"
            >
              <img src={item.previewUrl} alt={item.name} class="bds-chip-thumb" />
            </button>
            <button
              type="button"
              class="bds-chip-info"
              onclick={() => handleChipClick(item, index)}
              title="{t('composer.previewImage') || 'Preview image'}: {item.name}"
            >
              <span class="bds-chip-name">{item.name}</span>
              <span class="bds-chip-size">{item.size}</span>
            </button>
          {:else}
            <!-- Document / Code / File Chip -->
            <button
              type="button"
              class="bds-chip-icon-box bds-chip-icon-{item.category}"
              onclick={() => handleChipClick(item, index)}
              title="{t('composer.previewFile') || 'Preview file'}: {item.name}"
            >
              {#if item.category === "pdf"}
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              {:else if item.category === "code"}
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="16 18 22 12 16 6"></polyline>
                  <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
              {:else if item.category === "sheet"}
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="3" y1="15" x2="21" y2="15"></line>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                  <line x1="15" y1="3" x2="15" y2="21"></line>
                </svg>
              {:else if item.category === "archive"}
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 8v13H3V8"></path>
                  <path d="M1 3h22v5H1z"></path>
                  <line x1="10" y1="12" x2="14" y2="12"></line>
                </svg>
              {:else}
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                  <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
              {/if}
            </button>
            <button
              type="button"
              class="bds-chip-info"
              onclick={() => handleChipClick(item, index)}
              title="{t('composer.previewFile') || 'Preview file'}: {item.name}"
            >
              <span class="bds-chip-name">{item.name}</span>
              <span class="bds-chip-meta">
                {#if item.extension}
                  <span class="bds-chip-badge">{item.extension.replace(".", "")}</span>
                {/if}
                <span class="bds-chip-size">{item.size}</span>
              </span>
            </button>
          {/if}

          <!-- Remove Chip Button -->
          <button
            type="button"
            class="bds-chip-remove"
            onclick={() => removeFile(index)}
            aria-label="{t('composer.removeFile') || 'Remove file'} {item.name}"
            title={t("composer.removeFile") || "Remove file"}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Image Lightbox Modal -->
{#if activePreviewImage}
  <div
    class="bds-chip-lightbox-backdrop"
    onclick={() => (activePreviewImage = null)}
    onkeydown={(e) => { if (e.key === 'Escape') activePreviewImage = null; }}
    tabindex="-1"
    role="presentation"
  >
    <div
      class="bds-chip-lightbox-dialog"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label={activePreviewImage.name}
      use:dragToDismiss={{
        onDismiss: () => (activePreviewImage = null),
        handleSelector: ".bds-chip-lightbox-header, .bds-chip-lightbox-img",
        backdropSelector: ".bds-chip-lightbox-backdrop"
      }}
    >
      <div class="bds-drag-handle" style="width: 36px; height: 4px; background: rgba(255,255,255,0.25); border-radius: 2px; margin: 8px auto 4px;"></div>
      <div class="bds-chip-lightbox-header">
        <div class="bds-chip-lightbox-title-group">
          <span class="bds-chip-lightbox-name">{activePreviewImage.name}</span>
          <span class="bds-chip-lightbox-meta">{activePreviewImage.size}</span>
        </div>
        <button
          type="button"
          class="bds-chip-lightbox-close"
          onclick={() => (activePreviewImage = null)}
          aria-label={t("common.close") || "Close"}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="bds-chip-lightbox-body">
        <img src={activePreviewImage.previewUrl} alt={activePreviewImage.name} class="bds-chip-lightbox-img" />
      </div>

      <div class="bds-chip-lightbox-footer">
        <button
          type="button"
          class="bds-chip-lightbox-delete"
          onclick={() => {
            removeFile(activePreviewImage.index);
            activePreviewImage = null;
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <span>{t("common.delete") || "Delete"}</span>
        </button>
        <button
          type="button"
          class="bds-chip-lightbox-done"
          onclick={() => (activePreviewImage = null)}
        >
          {t("common.close") || "Close"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Document Preview Modal (for non-image text/code) -->
{#if activePreviewDoc}
  <div
    class="bds-chip-lightbox-backdrop"
    onclick={() => (activePreviewDoc = null)}
    onkeydown={(e) => { if (e.key === 'Escape') activePreviewDoc = null; }}
    tabindex="-1"
    role="presentation"
  >
    <div
      class="bds-chip-lightbox-dialog"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label={activePreviewDoc.name}
      use:dragToDismiss={{
        onDismiss: () => (activePreviewDoc = null),
        handleSelector: ".bds-chip-lightbox-header",
        backdropSelector: ".bds-chip-lightbox-backdrop"
      }}
    >
      <div class="bds-drag-handle" style="width: 36px; height: 4px; background: rgba(255,255,255,0.25); border-radius: 2px; margin: 8px auto 4px;"></div>
      <div class="bds-chip-lightbox-header">
        <div class="bds-chip-lightbox-title-group">
          <span class="bds-chip-lightbox-name">{activePreviewDoc.name}</span>
          <span class="bds-chip-lightbox-meta">{activePreviewDoc.size}</span>
        </div>
        <button
          type="button"
          class="bds-chip-lightbox-close"
          onclick={() => (activePreviewDoc = null)}
          aria-label={t("common.close") || "Close"}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="bds-chip-lightbox-body bds-doc-preview-body">
        <pre class="bds-doc-preview-code"><code>{activePreviewDoc.content}</code></pre>
      </div>

      <div class="bds-chip-lightbox-footer">
        <button
          type="button"
          class="bds-chip-lightbox-done"
          onclick={() => (activePreviewDoc = null)}
        >
          {t("common.close") || "Close"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ══════════════════════════════════════════════════════════════
     Composer Chips & Auto-Expanding Tray Styles (Claude Style)
     ══════════════════════════════════════════════════════════════ */
  .bds-composer-chips {
    display: flex;
    flex-direction: column;
    width: 100%;
    margin-bottom: 6px;
    transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
    box-sizing: border-box;
  }

  .bds-composer-chips-empty {
    display: none;
    margin-bottom: 0;
  }

  .bds-composer-dragover {
    border: 2px dashed #4f9bff !important;
    border-radius: 12px;
    background: rgba(79, 155, 255, 0.08) !important;
    padding: 8px;
  }

  .bds-composer-drop-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 500;
    color: #4f9bff;
    background: rgba(79, 155, 255, 0.12);
    border-radius: 10px;
    margin-bottom: 6px;
  }

  .bds-composer-chips-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 4px 6px 4px;
  }

  .bds-composer-chips-count {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--bds-text-muted, #8e8ea0);
    text-transform: uppercase;
  }

  .bds-composer-clear-all {
    background: none;
    border: none;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 500;
    color: #ef4444;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s ease, opacity 0.15s ease;
  }

  .bds-composer-clear-all:hover {
    background: rgba(239, 68, 68, 0.12);
  }

  /* Horizontal Tray */
  .bds-composer-chips-tray {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 2px 2px 6px 2px;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
  }

  .bds-composer-chips-tray::-webkit-scrollbar {
    height: 4px;
  }

  .bds-composer-chips-tray::-webkit-scrollbar-thumb {
    background: var(--bds-border, rgba(255, 255, 255, 0.2));
    border-radius: 2px;
  }

  /* Chip Card */
  .bds-chip-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    max-width: 220px;
    height: 46px;
    padding: 4px 6px 4px 4px;
    background: var(--bds-bg-panel, #202020);
    border: 1px solid var(--bds-border, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    position: relative;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    animation: bds-chip-in 0.2s cubic-bezier(0.2, 0, 0, 1);
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .bds-chip-item:hover {
    border-color: var(--bds-border-hover, rgba(255, 255, 255, 0.24));
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
  }

  @keyframes bds-chip-in {
    from {
      opacity: 0;
      transform: scale(0.92) translateY(4px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  /* Thumbnails */
  .bds-chip-thumb-btn {
    padding: 0;
    margin: 0;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 7px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bds-chip-thumb {
    width: 38px;
    height: 38px;
    object-fit: cover;
    border-radius: 7px;
    background: #111;
  }

  /* Icon Box */
  .bds-chip-icon-box {
    width: 36px;
    height: 36px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
  }

  .bds-chip-icon-pdf {
    background: rgba(239, 68, 68, 0.16);
    color: #ef4444;
  }

  .bds-chip-icon-doc {
    background: rgba(59, 130, 246, 0.16);
    color: #3b82f6;
  }

  .bds-chip-icon-sheet {
    background: rgba(16, 185, 129, 0.16);
    color: #10b981;
  }

  .bds-chip-icon-presentation {
    background: rgba(245, 158, 11, 0.16);
    color: #f59e0b;
  }

  .bds-chip-icon-code {
    background: rgba(6, 182, 212, 0.16);
    color: #06b6d4;
  }

  .bds-chip-icon-archive {
    background: rgba(217, 119, 6, 0.16);
    color: #d97706;
  }

  .bds-chip-icon-text,
  .bds-chip-icon-file {
    background: rgba(148, 163, 184, 0.16);
    color: #94a3b8;
  }

  /* Info */
  .bds-chip-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    flex: 1;
    cursor: pointer;
  }

  .bds-chip-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--bds-text, #ececf1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }

  .bds-chip-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 1px;
  }

  .bds-chip-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 3px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--bds-text-muted, #aaa);
    letter-spacing: 0.02em;
  }

  .bds-chip-size {
    font-size: 10px;
    color: var(--bds-text-muted, #8e8ea0);
    line-height: 1;
  }

  /* Remove Button */
  .bds-chip-remove {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: none;
    color: var(--bds-text-muted, #8e8ea0);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    margin-left: 2px;
    padding: 0;
    transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
  }

  .bds-chip-remove:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    transform: scale(1.1);
  }

  /* ══════════════════════════════════════════════════════════════
     Lightbox & Doc Modal
     ══════════════════════════════════════════════════════════════ */
  .bds-chip-lightbox-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10001;
    background: rgba(0, 0, 0, 0.78);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
    animation: bds-fade-in 0.2s ease-out;
  }

  @keyframes bds-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .bds-chip-lightbox-dialog {
    background: var(--bds-bg-panel, #1e1e24);
    border: 1px solid var(--bds-border, rgba(255, 255, 255, 0.15));
    border-radius: 16px;
    max-width: 92vw;
    max-height: 88vh;
    width: 480px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
    animation: bds-dialog-in 0.24s cubic-bezier(0.2, 0, 0, 1);
  }

  @keyframes bds-dialog-in {
    from {
      opacity: 0;
      transform: scale(0.92) translateY(12px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .bds-chip-lightbox-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px 10px;
    border-bottom: 1px solid var(--bds-border, rgba(255, 255, 255, 0.08));
  }

  .bds-chip-lightbox-title-group {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .bds-chip-lightbox-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--bds-text, #fff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bds-chip-lightbox-meta {
    font-size: 11px;
    color: var(--bds-text-muted, #8e8ea0);
    margin-top: 1px;
  }

  .bds-chip-lightbox-close {
    background: none;
    border: none;
    color: var(--bds-text-muted, #8e8ea0);
    cursor: pointer;
    padding: 6px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .bds-chip-lightbox-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .bds-chip-lightbox-body {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    overflow: auto;
    max-height: 60vh;
    background: rgba(0, 0, 0, 0.25);
  }

  .bds-chip-lightbox-img {
    max-width: 100%;
    max-height: 55vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .bds-doc-preview-body {
    padding: 12px 16px;
    background: #141416;
    max-height: 50vh;
    overflow-y: auto;
  }

  .bds-doc-preview-code {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    color: #cbd5e1;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .bds-chip-lightbox-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-top: 1px solid var(--bds-border, rgba(255, 255, 255, 0.08));
    background: var(--bds-bg-panel, #1e1e24);
  }

  .bds-chip-lightbox-delete {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 500;
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .bds-chip-lightbox-delete:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .bds-chip-lightbox-done {
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    background: var(--bds-accent, #4f9bff);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .bds-chip-lightbox-done:hover {
    opacity: 0.9;
  }
</style>
