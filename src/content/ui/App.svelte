<script>
  import Drawer from "./Drawer.svelte";
  import ToastStack from "./ToastStack.svelte";
  import QuestionPanel from "./QuestionPanel.svelte";
  import QueuePanel from "./QueuePanel.svelte";
  import DeepResearchRevisionPanel from "./DeepResearchRevisionPanel.svelte";
  import WhatsNewModal from "./WhatsNewModal.svelte";
  import SelectionOverlay from "./SelectionOverlay.svelte";
  import StatusBanner from "./StatusBanner.svelte";
  import AnnouncementBanner from "./AnnouncementBanner.svelte";
  import PreviewPanel from "./PreviewPanel.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import DeepCodeModal from "./DeepCodeModal.svelte";
  import ArtifactsView from "./ArtifactsView.svelte";
  import CommandsHelp from "../commands/CommandsHelp.svelte";
  import ApiPlayground from "../api-playground/ApiPlayground.svelte";
  import appState from "../state.js";

  let drawerOpen = $state(false);
  let apiPlaygroundOpen = $state(false);
  let deepCodeModalOpen = $state(false);
  let whatsNewPending = $state(appState.whatsNewPending);

  let artifactVisible = $state(false);
  let artifactTitle = $state("Artifact");
  let artifactLanguage = $state("code");
  let artifactCode = $state("");

  let previewVisible = $state(false);
  let previewTitle = $state("");
  let previewContent = $state("");

  /** @type {Array<{id: number, message: string}>} */
  let toasts = $state([]);
  let toastId = 0;

  let confirmVisible = $state(false);
  let confirmMessage = $state("");
  let confirmResolve = null;

  export function showConfirm(message) {
    return new Promise((resolve) => {
      confirmResolve = resolve;
      confirmMessage = message;
      confirmVisible = true;
    });
  }

  function handleConfirm(result) {
    confirmVisible = false;
    confirmMessage = "";
    if (confirmResolve) {
      confirmResolve(result);
      confirmResolve = null;
    }
  }

  // ── Public API (called from non-Svelte code via mount.js) ──

  export function showToast(message, duration = 2880) {
    const id = ++toastId;
    toasts = [...toasts, { id, message }];

    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, duration);
  }

  export function showLongWorkOverlay(_visible) {}

  // Settings/skills/memories refresh — forwarded to Drawer
  let drawerRef = $state(null);

  export function refreshSettings() {
    if (drawerRef) drawerRef.refreshSettings();
  }
  export function refreshSkills() {
    if (drawerRef) drawerRef.refreshSkills();
  }
  export function refreshCharacters() {
    if (drawerRef) drawerRef.refreshCharacters();
  }
  export function refreshMemories() {
    if (drawerRef) drawerRef.refreshMemories();
  }
  export function refreshProjects() {
    if (drawerRef) drawerRef.refreshProjects();
    if (appState.heroBarRef) appState.heroBarRef.refresh();
  }
  export function refreshSavedItems() {
    if (drawerRef) drawerRef.refreshSavedItems();
  }
  export function refreshCssSnippets() {
    if (drawerRef) drawerRef.refreshCssSnippets();
  }

  export function refreshWhatsNew() {
    whatsNewPending = appState.whatsNewPending;
  }

  export function showPreviewPanel(title, content) {
    previewTitle = title;
    previewContent = content;
    previewVisible = true;
  }

  export function hidePreviewPanel() {
    previewVisible = false;
    previewTitle = "";
    previewContent = "";
  }

  async function toggleDrawer() {
    if (drawerOpen) {
      if (drawerRef && drawerRef.handleClose) {
        await drawerRef.handleClose();
      } else {
        drawerOpen = false;
      }
    } else {
      drawerOpen = true;
    }
  }

  function closeDrawer() {
    drawerOpen = false;
  }

  function openApiPlayground() {
    apiPlaygroundOpen = true;
  }

  function closeApiPlayground() {
    apiPlaygroundOpen = false;
  }

  // Handle external selection mode toggle
  window.addEventListener("bds:toggleSelectionMode", () => {
    appState.selectionMode = true;
    closeDrawer();
  });

  window.addEventListener("bds:open-deep-code-modal", () => {
    deepCodeModalOpen = true;
  });

  window.addEventListener("bds:toggle-drawer", () => {
    toggleDrawer();
  });

  window.addEventListener("bds:open-drawer", () => {
    drawerOpen = true;
  });

  window.addEventListener("bds:close-drawer", () => {
    closeDrawer();
  });

  window.addEventListener("bds:open-artifact", (e) => {
    artifactTitle = e.detail?.title || "Artifact";
    artifactLanguage = e.detail?.language || "code";
    artifactCode = e.detail?.code || "";
    artifactVisible = true;
  });

  export function toggleDrawerPublic() {
    toggleDrawer();
  }
</script>

<button id="bds-toggle" type="button" onclick={toggleDrawer} aria-label="Better DeepSeek" style="display: none !important;">
  <span class="bds-toggle-icon" aria-hidden="true">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
  </span>
  <span class="bds-toggle-full" aria-hidden="true">BDS</span>
  <span class="bds-toggle-short" aria-hidden="true">B</span>
  {#if appState.mcpServers && appState.mcpServers.some(s => s.enabled)}
    <span class="bds-toggle-dot" title="MCP Active" aria-hidden="true"></span>
  {/if}
</button>

<Drawer bind:this={drawerRef} open={drawerOpen} onclose={closeDrawer} onopenapiplayground={openApiPlayground} />

{#if apiPlaygroundOpen}
  <ApiPlayground onclose={closeApiPlayground} />
{/if}

<DeepCodeModal
  show={deepCodeModalOpen}
  activeDirectory={appState.deepCode.activeDirectory}
  fileCount={appState.deepCode.fileCount}
  onclose={() => deepCodeModalOpen = false}
/>

<ToastStack {toasts} />
<QuestionPanel />
<QueuePanel />
<DeepResearchRevisionPanel />

{#if whatsNewPending}
  <WhatsNewModal onDismiss={() => whatsNewPending = false} />
{/if}

<SelectionOverlay />
<StatusBanner />
<AnnouncementBanner />
<PreviewPanel
  visible={previewVisible}
  title={previewTitle}
  content={previewContent}
  onclose={hidePreviewPanel}
/>

<ArtifactsView
  visible={artifactVisible}
  title={artifactTitle}
  language={artifactLanguage}
  code={artifactCode}
  onclose={() => (artifactVisible = false)}
/>

<CommandsHelp />

<ConfirmDialog
  show={confirmVisible}
  message={confirmMessage}
  onconfirm={() => handleConfirm(true)}
  oncancel={() => handleConfirm(false)}
/>
