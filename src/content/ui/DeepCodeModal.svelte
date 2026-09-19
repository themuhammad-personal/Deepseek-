<script>
  import { onMount, onDestroy } from "svelte";
  import appState from "../state.js";
  import {
    pickAndLinkDeepCodeDirectory,
    activateDeepCodeDirectory,
    selectRecentDirectory,
    removeRecentDirectory,
    setDeepCodeEnabled,
  } from "../deep-code.js";
  import { supportsLocalDirectoryLinking } from "../../lib/local-directory-source.js";
  import { isNativeFilePickerAvailable, nativePickFiles } from "../../platform/android-file-picker.js";
  import { t } from "../../lib/i18n.svelte.js";

  let { show = false, activeDirectory = null, fileCount = 0, onclose = null } = $props();

  let loading = $state(false);
  let feedback = $state("");
  let localEnabled = $state(Boolean(appState.deepCode?.enabled));
  let recentDirectories = $state(appState.deepCode?.recentDirectories || []);
  let manualPath = $state(appState.deepCode?.manualPath || "");

  let lastEventRecent = null;

  onMount(() => {
    localEnabled = Boolean(appState.deepCode?.enabled);
    const handler = (event) => {
      const detail = event.detail || {};
      localEnabled = Boolean(detail.enabled ?? appState.deepCode?.enabled);
      lastEventRecent = Array.isArray(detail.recentDirectories) ? detail.recentDirectories : lastEventRecent;
      manualPath = detail.manualPath ?? manualPath;
      if (lastEventRecent) recentDirectories = lastEventRecent;
    };
    window.addEventListener("bds:deep-code-toggle-state", handler);
    return () => window.removeEventListener("bds:deep-code-toggle-state", handler);
  });

  onDestroy(() => {
    lastEventRecent = null;
  });

  $effect(() => {
    localEnabled = Boolean(appState.deepCode?.enabled);
    recentDirectories = appState.deepCode?.recentDirectories || [];
    manualPath = appState.deepCode?.manualPath || "";
  });

  function handleToggle() {
    const next = !localEnabled;
    localEnabled = next;
    setDeepCodeEnabled(next);
  }

  async function handleSelectFolder() {
    feedback = "";
    loading = true;
    try {
      if (supportsLocalDirectoryLinking()) {
        const res = await pickAndLinkDeepCodeDirectory();
        feedback = t("deepCodeModal.linkedFeedback", { name: res.rootName, count: res.fileCount });
        setTimeout(() => { feedback = ""; }, 3500);
      } else if (isNativeFilePickerAvailable()) {
        const res = await nativePickFiles("folder");
        if (res && res.files && res.files.length > 0) {
          const first = res.files[0];
          let root = "project";
          if (first.name && first.name.includes("/")) {
            root = first.name.split("/")[0];
          }
          await activateDeepCodeDirectory(root, res.files.length, manualPath || root);
          feedback = t("deepCodeModal.linkedFeedback", { name: root, count: res.files.length });
          setTimeout(() => { feedback = ""; }, 3500);
        }
      } else {
        feedback = t("deepCodeModal.fsApiUnsupported");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        feedback = err.message || t("deepCodeModal.selectFailed");
      }
    } finally {
      loading = false;
    }
  }

  async function handleManualSave() {
    const p = manualPath.trim().replace(/[\\/]+$/, "");
    if (!p) return;
    const folderName = p.split(/[/\\]/).pop() || "project";
    await activateDeepCodeDirectory(folderName, fileCount || 0, p);
    feedback = t("deepCodeModal.pathSaved") || "Path saved!";
    setTimeout(() => { feedback = ""; }, 3000);
  }

  async function handleSelectRecent(entry) {
    await selectRecentDirectory(entry);
    feedback = t("deepCodeModal.switchedFeedback", { name: entry.name });
    setTimeout(() => { feedback = ""; }, 2500);
  }

  async function handleRemoveRecent(entry, e) {
    e?.stopPropagation?.();
    await removeRecentDirectory(entry.path || entry.name);
  }

  function handleOverlayClick() {
    if (onclose) onclose();
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bds-modal-backdrop"
    role="dialog"
    tabindex="-1"
    onclick={handleOverlayClick}
    onkeydown={(e) => e.key === 'Escape' && onclose?.()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bds-dc-modal" onclick={(e) => e.stopPropagation()}>
      <div class="bds-drawer-header">
        <div class="ds-modal-content__title">{t("deepCodeModal.title")}</div>
        <button id="bds-close" type="button" onclick={onclose} aria-label={t("deepCodeModal.closeAria")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14.1871 13.1265L13.1265 14.1872L1.81275 2.87347L2.87341 1.81281L14.1871 13.1265Z" fill="currentColor"></path>
            <path d="M13.1265 1.81282L14.1871 2.87348L2.8734 14.1872L1.81274 13.1265L13.1265 1.81282Z" fill="currentColor"></path>
          </svg>
        </button>
      </div>

      <div class="bds-drawer-body">
        <p class="bds-dc-subtitle">
          {t("deepCodeModal.subtitle")}
        </p>

        <!-- Master Switch Card -->
        <div class="bds-dc-toggle-card">
          <div class="bds-dc-toggle-info">
            <span class="bds-dc-toggle-title">{t("deepCodeToggle.enableToggle") || "Enable Deep Code"}</span>
            <span class="bds-dc-toggle-sub">{t("deepCodeToggle.integrationDesc") || "Inject codebase context & run local Harness tasks"}</span>
          </div>
          <label class="bds-ios-switch">
            <input type="checkbox" checked={localEnabled} onchange={handleToggle} />
            <span class="bds-ios-slider"></span>
          </label>
        </div>

        {#if activeDirectory || manualPath}
          <div class="bds-skill-item bds-active-dir-item" style="margin-bottom: 12px;">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="bds-active-dot"></span>
                <strong class="bds-dc-dir-name" style="font-size: 13px; color: var(--bds-text-primary);">{activeDirectory || t("deepCodeModal.activeCodebase")}</strong>
                {#if fileCount > 0}
                  <span class="bds-count-badge bds-dc-dir-meta">{t("deepCodeModal.filesIndexed", { count: fileCount })}</span>
                {/if}
              </div>
              {#if manualPath}
                <div class="bds-path-code-text" title={manualPath}>{manualPath}</div>
              {/if}
            </div>
          </div>
        {/if}

        <button
          type="button"
          class="bds-btn"
          style="width: 100%; justify-content: center; padding: 9px 14px; font-size: 13px; margin-bottom: 12px;"
          disabled={loading}
          onclick={handleSelectFolder}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>{loading ? t("deepCodeModal.indexing") : t("deepCodeModal.linkFolder")}</span>
        </button>

        <!-- Manual Path Input Section -->
        <div class="bds-manual-section">
          <label class="bds-manual-label" for="bds-dc-manual-input">
            {t("deepCodeModal.manualPathLabel") || "System Directory Path (Harness CWD):"}
          </label>
          <div class="bds-manual-input-row">
            <input
              id="bds-dc-manual-input"
              type="text"
              placeholder={t("deepCodeModal.manualPathPlaceholder") || "e.g. /sdcard/projects/app or C:/code"}
              bind:value={manualPath}
              class="bds-manual-input"
            />
            <button type="button" class="bds-btn" onclick={handleManualSave}>
              {t("deepCodeModal.savePath") || "Save"}
            </button>
          </div>
          <p class="bds-manual-hint">{t("deepCodeModal.manualPathHint") || "Enter your local codebase directory path."}</p>
        </div>

        {#if feedback}
          <p class="bds-dc-feedback">{feedback}</p>
        {/if}

        <hr class="bds-dc-hr" />

        <div class="bds-section-title">
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <span>{t("deepCodeModal.recentTitle")}</span>
            {#if recentDirectories.length > 0}
              <span style="font-size: 11px; color: var(--bds-text-tertiary);">{recentDirectories.length}</span>
            {/if}
          </div>
        </div>

        <div class="bds-list" style="max-height: 200px; overflow-y: auto;">
          {#if recentDirectories && recentDirectories.length > 0}
            {#each recentDirectories as dir}
              {@const isSelected = activeDirectory === dir.name || (manualPath && dir.path && manualPath.toLowerCase() === dir.path.toLowerCase())}
              <div
                class="bds-skill-item"
                class:bds-active={isSelected}
                role="button"
                tabindex="0"
                onclick={() => handleSelectRecent(dir)}
                onkeydown={(e) => e.key === "Enter" && handleSelectRecent(dir)}
                title={dir.path || dir.name}
              >
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-weight: 500; font-size: 13px; color: var(--bds-text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                      {dir.name}
                    </span>
                    {#if dir.fileCount}
                      <span class="bds-count-badge">{dir.fileCount}f</span>
                    {/if}
                    {#if isSelected}
                      <span style="color: var(--bds-accent); font-size: 12px;">✓</span>
                    {/if}
                  </div>
                  {#if dir.path}
                    <div class="bds-path-code-text" title={dir.path}>{dir.path}</div>
                  {/if}
                </div>
                <button
                  type="button"
                  class="bds-item-remove-btn"
                  title={t("deepCodeModal.removeHistory")}
                  onclick={(e) => handleRemoveRecent(dir, e)}
                >
                  ×
                </button>
              </div>
            {/each}
          {:else}
            <p class="bds-empty" style="font-size: 11px; padding: 12px 0;">{t("deepCodeModal.emptyRecent")}</p>
          {/if}
        </div>
      </div>

      <div class="bds-drawer-bottom" style="display: flex; justify-content: flex-end; margin-top: 14px;">
        <button type="button" class="bds-btn-outlined" style="font-size: 12px; padding: 6px 16px;" onclick={onclose}>
          {t("deepCodeModal.done")}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bds-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    padding: 16px;
    animation: bds-modal-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes bds-modal-in {
    from { opacity: 0; transform: scale(0.98); }
    to { opacity: 1; transform: scale(1); }
  }

  .bds-dc-modal {
    width: min(92vw, 420px);
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius, 16px);
    background: var(--bds-bg-panel);
    box-shadow: var(--bds-shadow);
    color: var(--bds-text-primary);
    padding: 22px;
    display: flex;
    flex-direction: column;
    max-height: 85vh;
    box-sizing: border-box;
    font-family: inherit;
  }

  .bds-dc-modal .bds-drawer-header {
    margin-bottom: 16px;
  }

  .bds-dc-subtitle {
    font-size: 12px;
    color: var(--bds-text-secondary);
    margin: 0 0 14px;
    line-height: 1.45;
  }

  .bds-dc-toggle-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    margin-bottom: 14px;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: 12px;
    gap: 10px;
  }

  .bds-dc-toggle-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .bds-dc-toggle-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary);
  }

  .bds-dc-toggle-sub {
    font-size: 10.5px;
    color: var(--bds-text-tertiary);
    margin-top: 2px;
  }

  .bds-ios-switch {
    position: relative;
    display: inline-block;
    width: 38px;
    height: 22px;
    flex-shrink: 0;
  }

  .bds-ios-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .bds-ios-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: var(--bds-bg-hover, #3a3b3f);
    transition: 0.25s;
    border-radius: 22px;
  }

  .bds-ios-slider:before {
    position: absolute;
    content: "";
    height: 16px;
    width: 16px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.25s;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .bds-ios-switch input:checked + .bds-ios-slider {
    background-color: #10b981;
  }

  .bds-ios-switch input:checked + .bds-ios-slider:before {
    transform: translateX(16px);
  }

  .bds-manual-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .bds-manual-label {
    font-size: 11px;
    color: var(--bds-text-secondary);
    font-weight: 500;
  }

  .bds-manual-input-row {
    display: flex;
    gap: 8px;
  }

  .bds-manual-input {
    flex: 1;
    min-width: 0;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 12px;
    font-family: monospace;
    color: var(--bds-text-primary);
    outline: none;
  }

  .bds-manual-input:focus {
    border-color: var(--bds-accent);
  }

  .bds-manual-hint {
    font-size: 10px;
    color: var(--bds-text-tertiary);
    margin: 0;
    line-height: 1.35;
  }

  .bds-dc-hr {
    border: none;
    height: 1px;
    background: var(--bds-border);
    margin: 14px 0;
  }

  .bds-dc-feedback {
    font-size: 11px;
    color: var(--bds-accent);
    margin: 6px 0 0;
    text-align: center;
  }

  .bds-active-dir-item {
    background: var(--bds-bg-elevated);
    padding: 10px 12px;
    border-radius: 10px;
  }

  .bds-active-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
    flex-shrink: 0;
  }

  .bds-count-badge {
    font-size: 10px;
    background: var(--bds-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--bds-text-secondary);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .bds-path-code-text {
    font-size: 10.5px;
    color: var(--bds-text-tertiary);
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  .bds-item-remove-btn {
    opacity: 0;
    background: transparent;
    border: none;
    color: var(--bds-text-tertiary);
    font-size: 14px;
    cursor: pointer;
    padding: 0 4px;
    border-radius: 4px;
    transition: all var(--bds-transition, 0.15s ease);
    flex-shrink: 0;
  }

  .bds-skill-item:hover .bds-item-remove-btn {
    opacity: 0.8;
  }

  .bds-item-remove-btn:hover {
    opacity: 1 !important;
    color: #f87171;
    background: rgba(239, 68, 68, 0.15);
  }

  @media (max-width: 767px) {
    .bds-dc-modal {
      width: 100vw !important;
      max-width: 100vw !important;
      margin: 0 !important;
      border-radius: 20px 20px 0 0 !important;
      position: fixed !important;
      bottom: 0 !important;
      max-height: 88vh !important;
      padding: 20px 16px !important;
    }
  }
</style>
