<script>
  import SettingsPanel from "./SettingsPanel.svelte";
  import CharacterList from "./CharacterList.svelte";
  import SkillList from "./SkillList.svelte";
  import MemoryList from "./MemoryList.svelte";
  import ProjectsManager from "./ProjectsManager.svelte";
  import CommandManager from "../commands/CommandManager.svelte";
  import { findChatEditor, setChatInputText } from "../auto.js";
  import appState from "../state.js";
  import { i18n, t } from "../../lib/i18n.svelte.js";
  import { getExtensionVersion } from "../../lib/extension-version.js";

  let { open = false, onclose, onopenapiplayground } = $props();

  const extensionVersion = getExtensionVersion();

  // Navigation section: 'overview' | 'prompts' | 'mcp' | 'deep_research' | 'memory' | 'commands' | 'data' | 'chat'
  let currentSection = $state("overview");

  // Sub-tab for Prompts: 'characters' | 'skills' | 'system'
  let promptSubTab = $state("system");

  // Instant search query
  let searchQuery = $state("");

  let TIP_COUNT = $derived.by(() => {
    const tips = i18n.messages?.messages?.tips;
    return tips ? Object.keys(tips).filter((k) => /^\d+$/.test(k)).length : 0;
  });
  let currentTipIndex = $state(-1);
  let disableTipBox = $state(Boolean(appState.settings.disableTipBox));

  function handleSettingsSaved() {
    disableTipBox = Boolean(appState.settings.disableTipBox);
  }

  $effect(() => {
    disableTipBox = Boolean(appState.settings.disableTipBox);
    if (open && !disableTipBox && TIP_COUNT > 0) {
      queueMicrotask(() => {
        currentTipIndex = Math.floor(Math.random() * TIP_COUNT);
      });
    } else {
      currentTipIndex = -1;
    }
  });

  function openApiPlayground() {
    onclose();
    onopenapiplayground();
  }

  let settingsRef = $state(null);
  let charactersRef = $state(null);
  let skillsRef = $state(null);
  let memoryRef = $state(null);
  let projectsManagerRef = $state(null);
  let showProjectsManager = $state(false);

  export function refreshSettings() {
    if (settingsRef) settingsRef.refresh();
  }
  export function refreshCharacters() {
    if (charactersRef) charactersRef.refresh();
  }
  export function refreshSkills() {
    if (skillsRef) skillsRef.refresh();
  }
  export function refreshMemories() {
    if (memoryRef) memoryRef.refresh();
  }
  export function refreshProjects() {
    if (projectsManagerRef) projectsManagerRef.refresh();
    if (settingsRef) settingsRef.refreshProject();
  }
  export function refreshSavedItems() {}
  export function refreshCssSnippets() {
    if (settingsRef) settingsRef.refreshCssSnippets();
  }

  function openProjectsManager() {
    showProjectsManager = true;
  }

  function closeProjectsManager() {
    showProjectsManager = false;
  }

  function insertCommand(cmdId) {
    const editor = findChatEditor();
    if (!editor) return;
    setChatInputText("/" + cmdId + " ");
    editor.focus();
    onclose();
  }

  export async function handleClose() {
    if (settingsRef && settingsRef.checkBeforeClose) {
      const ok = await settingsRef.checkBeforeClose();
      if (ok) onclose();
    } else {
      onclose();
    }
  }

  function clearSearch() {
    searchQuery = "";
  }

  function toggleMemorySetting(e) {
    e?.stopPropagation();
    appState.settings.disableMemory = !appState.settings.disableMemory;
    saveSettingDirectly();
  }

  function toggleVoiceSetting(e) {
    e?.stopPropagation();
    appState.settings.voiceMode = !appState.settings.voiceMode;
    saveSettingDirectly();
  }

  function saveSettingDirectly() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ bds_settings: JSON.parse(JSON.stringify(appState.settings)) });
      }
      appState.ui?.showToast?.(t("settings.saved") || "Settings saved.");
    } catch (e) {
      console.warn("[BDS] Direct save error:", e);
    }
  }

  function getSectionTitle(section) {
    switch (section) {
      case "prompts": return t("drawer.sectionPrompts") || "System Prompts";
      case "mcp": return t("drawer.sectionMcpServers") || "MCP Servers & Tools";
      case "deep_research": return t("settings.subResearch") || "Deep Research";
      case "memory": return t("drawer.sectionMemories") || "Stored Memories";
      case "commands": return t("drawer.sectionSavedItems") || "Custom Commands";
      case "data": return t("settings.subIntegrations") || "Data Controls";
      case "chat": return t("settings.subChat") || "Chat & Messages";
      case "projects": return t("drawer.sectionProjects") || "Projects & Workspaces";
      default: return t("drawer.sectionSettings") || "Settings";
    }
  }
</script>

{#if open}
  <!-- Backdrop for clean dismissal -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="bds-drawer-backdrop" onclick={handleClose} role="presentation"></div>
{/if}

<aside id="bds-drawer" class={open ? "bds-open" : "bds-closed"}>
  <!-- Drag Handle for Mobile Sheet -->
  <div class="bds-drag-handle" aria-hidden="true"></div>

  <!-- Header -->
  <div class="bds-drawer-header">
    {#if currentSection !== "overview" && !showProjectsManager}
      <button
        type="button"
        class="bds-back-btn"
        onclick={() => (currentSection = "overview")}
        aria-label="Back to overview"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span>ব্যাক</span>
      </button>
      <span class="bds-header-title">{getSectionTitle(currentSection)}</span>
    {:else}
      <div class="bds-header-brand">
        <span class="bds-brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </span>
        <div class="bds-header-text">
          <span class="bds-brand-title">Super DeepSeek</span>
          <span class="bds-version-pill">v{extensionVersion}</span>
        </div>
      </div>
    {/if}

    <button
      id="bds-close"
      type="button"
      onclick={handleClose}
      aria-label={t("drawer.close")}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>

  <!-- Quick Filter / Search Bar -->
  <div class="bds-drawer-search-bar">
    <span class="bds-search-icon">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    </span>
    <input
      type="text"
      placeholder="সার্চ সেটিংস, প্লাগইন, প্রম্পটস..."
      bind:value={searchQuery}
      class="bds-drawer-search-input"
    />
    {#if searchQuery}
      <button class="bds-clear-search-btn" type="button" onclick={clearSearch} aria-label="Clear Search">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    {/if}
  </div>

  {#if showProjectsManager}
    <div class="bds-projects-body">
      <ProjectsManager
        bind:this={projectsManagerRef}
        onback={closeProjectsManager}
      />
    </div>
  {:else}
    <div class="bds-drawer-body">
      {#if searchQuery.trim().length > 0}
        <!-- Unified search results view -->
        <div class="bds-search-results-banner">
          <span>Search results for "<strong>{searchQuery}</strong>"</span>
        </div>
        <SettingsPanel
          bind:this={settingsRef}
          activeTab="all"
          {searchQuery}
          onsave={handleSettingsSaved}
          onapiplayground={openApiPlayground}
          onimportdata={() => {
            refreshSettings();
            refreshCharacters();
            refreshSkills();
            refreshMemories();
            refreshProjects();
          }}
        />

      {:else if currentSection === "overview"}
        <!-- ══════════════════════════════════════════════════════════════
             ChatGPT Mobile Settings (Grouped Rounded Cards Layout)
             ══════════════════════════════════════════════════════════════ -->
        <div class="bds-settings-screen">
          <!-- GROUP 1: Core -->
          <div class="bds-settings-group">
            <div class="bds-settings-group-title">{t("drawer.sectionSettings") || "Settings"}</div>
            <div class="bds-settings-card">
              <!-- Personalization Row -->
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="bds-settings-row" onclick={() => (currentSection = "prompts")}>
                <div class="bds-settings-row-left">
                  <div class="bds-settings-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      <line x1="9" y1="9" x2="15" y2="9"></line>
                      <line x1="9" y1="13" x2="13" y2="13"></line>
                    </svg>
                  </div>
                  <div class="bds-settings-row-text">
                    <span class="bds-settings-row-title">{t("settings.systemPrompts") || "System Prompts"}</span>
                    <span class="bds-settings-row-sub">{t("drawer.sectionPrompts") || "Custom system prompts & rules"}</span>
                  </div>
                </div>
                <div class="bds-settings-row-right">
                  <span class="bds-badge-value">{appState.settings.activeSystemPromptId === "default" ? (t("settings.defaultPromptName") || "Default") : (t("settings.customPromptStatus") || "Custom")}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </div>

              <!-- Memory Row -->
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="bds-settings-row" onclick={() => (currentSection = "memory")}>
                <div class="bds-settings-row-left">
                  <div class="bds-settings-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </div>
                  <div class="bds-settings-row-text">
                    <span class="bds-settings-row-title">{t("drawer.sectionMemories") || "Stored Memories"}</span>
                    <span class="bds-settings-row-sub">{t("settings.disableMemory") ? (!appState.settings.disableMemory ? (t("settings.enabled") || "Enabled") : "Disabled") : "Remember across chats"}</span>
                  </div>
                </div>
                <div class="bds-settings-row-right">
                  <label class="bds-ios-switch" onclick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!appState.settings.disableMemory}
                      onchange={toggleMemorySetting}
                    />
                    <span class="bds-ios-slider"></span>
                  </label>
                </div>
              </div>

              <!-- Plugins & MCP Tools Row -->
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="bds-settings-row" onclick={() => (currentSection = "mcp")}>
                <div class="bds-settings-row-left">
                  <div class="bds-settings-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="7" height="7"></rect>
                      <rect x="14" y="3" width="7" height="7"></rect>
                      <rect x="14" y="14" width="7" height="7"></rect>
                      <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                  </div>
                  <div class="bds-settings-row-text">
                    <span class="bds-settings-row-title">{t("drawer.sectionMcpServers") || "MCP Servers & Tools"}</span>
                    <span class="bds-settings-row-sub">{t("mcp.title") || "External tools & local server integration"}</span>
                  </div>
                </div>
                <div class="bds-settings-row-right">
                  <span class="bds-badge-value">{appState.mcpServers?.filter(s => s.enabled)?.length || 0}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </div>
            </div>
          </div>

          <!-- GROUP 2: App & Voice Settings -->
          <div class="bds-settings-group">
            <div class="bds-settings-group-title">{t("settings.generalSettings") || "General Settings"}</div>
            <div class="bds-settings-card">
              <!-- Language Row -->
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="bds-settings-row" onclick={() => (currentSection = "chat")}>
                <div class="bds-settings-row-left">
                  <div class="bds-settings-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="2" y1="12" x2="22" y2="12"></line>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                  </div>
                  <div class="bds-settings-row-text">
                    <span class="bds-settings-row-title">{t("settings.languageSettings") || "Language"}</span>
                    <span class="bds-settings-row-sub">{t("settings.preferredLang") || "Response language"}</span>
                  </div>
                </div>
                <div class="bds-settings-row-right">
                  <span class="bds-badge-value">{appState.settings.preferredLang || "বাংলা"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </div>

              <!-- Voice Mode Row -->
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="bds-settings-row" onclick={() => (currentSection = "chat")}>
                <div class="bds-settings-row-left">
                  <div class="bds-settings-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                      <line x1="12" y1="19" x2="12" y2="23"></line>
                      <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                  </div>
                  <div class="bds-settings-row-text">
                    <span class="bds-settings-row-title">{t("settings.voiceMode") || "Voice Mode"}</span>
                    <span class="bds-settings-row-sub">{t("settings.autoSubmitVoice") || "Automatic voice readout"}</span>
                  </div>
                </div>
                <div class="bds-settings-row-right">
                  <label class="bds-ios-switch" onclick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={Boolean(appState.settings.voiceMode)}
                      onchange={toggleVoiceSetting}
                    />
                    <span class="bds-ios-slider"></span>
                  </label>
                </div>
              </div>

              <!-- Appearance Row -->
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="bds-settings-row" onclick={() => (currentSection = "chat")}>
                <div class="bds-settings-row-left">
                  <div class="bds-settings-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="5"></circle>
                      <line x1="12" y1="1" x2="12" y2="3"></line>
                      <line x1="12" y1="21" x2="12" y2="23"></line>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                      <line x1="1" y1="12" x2="3" y2="12"></line>
                      <line x1="21" y1="12" x2="23" y2="12"></line>
                    </svg>
                  </div>
                  <div class="bds-settings-row-text">
                    <span class="bds-settings-row-title">{t("settings.subCSS") || "Appearance"}</span>
                    <span class="bds-settings-row-sub">{t("settings.presetCompact") || "Theme & display preferences"}</span>
                  </div>
                </div>
                <div class="bds-settings-row-right">
                  <span class="bds-badge-value">Dark</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </div>
            </div>
          </div>

          <!-- GROUP 3: Advanced Capabilities & Data -->
          <div class="bds-settings-group">
            <div class="bds-settings-group-title">{t("settings.advancedSettings") || "Advanced Settings"}</div>
            <div class="bds-settings-card">
              <!-- Deep Research Row -->
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="bds-settings-row" onclick={() => (currentSection = "deep_research")}>
                <div class="bds-settings-row-left">
                  <div class="bds-settings-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                  </div>
                  <div class="bds-settings-row-text">
                    <span class="bds-settings-row-title">{t("settings.subResearch") || "Deep Research"}</span>
                    <span class="bds-settings-row-sub">{t("settings.deepResearchContextGuard") || "Multi-step automated web research"}</span>
                  </div>
                </div>
                <div class="bds-settings-row-right">
                  <span class="bds-badge-value">{appState.settings.deepResearchDeepFetch || 1} Fetch</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </div>

              <!-- Projects Row -->
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="bds-settings-row" onclick={openProjectsManager}>
                <div class="bds-settings-row-left">
                  <div class="bds-settings-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </div>
                  <div class="bds-settings-row-text">
                    <span class="bds-settings-row-title">{t("drawer.sectionProjects") || "Projects & Workspaces"}</span>
                    <span class="bds-settings-row-sub">{t("settings.projectAutoContext") || "Local files & code context"}</span>
                  </div>
                </div>
                <div class="bds-settings-row-right">
                  <span class="bds-badge-value">{appState.projects?.length || 0}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </div>

              <!-- Custom Commands Row -->
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="bds-settings-row" onclick={() => (currentSection = "commands")}>
                <div class="bds-settings-row-left">
                  <div class="bds-settings-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                    </svg>
                  </div>
                  <div class="bds-settings-row-text">
                    <span class="bds-settings-row-title">{t("drawer.sectionSavedItems") || "Custom Commands"}</span>
                    <span class="bds-settings-row-sub">{t("drawer.sectionSavedItems") || "Slash (/) shortcuts & prompts"}</span>
                  </div>
                </div>
                <div class="bds-settings-row-right">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </div>

              <!-- Data Controls Row -->
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="bds-settings-row" onclick={() => (currentSection = "data")}>
                <div class="bds-settings-row-left">
                  <div class="bds-settings-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                  </div>
                  <div class="bds-settings-row-text">
                    <span class="bds-settings-row-title">{t("settings.subIntegrations") || "Data Controls"}</span>
                    <span class="bds-settings-row-sub">{t("drawer.exportAll") || "Data backup, cache & storage"}</span>
                  </div>
                </div>
                <div class="bds-settings-row-right">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </div>

              <!-- API Playground Row -->
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="bds-settings-row" onclick={openApiPlayground}>
                <div class="bds-settings-row-left">
                  <div class="bds-settings-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="16 18 22 12 16 6"></polyline>
                      <polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                  </div>
                  <div class="bds-settings-row-text">
                    <span class="bds-settings-row-title">API Playground</span>
                    <span class="bds-settings-row-sub">{t("mcp.tools", { count: "" }) || "Interactive API & live tool testing"}</span>
                  </div>
                </div>
                <div class="bds-settings-row-right">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </div>
            </div>
          </div>

          <!-- GROUP 4: About -->
          <div class="bds-settings-group">
            <div class="bds-settings-group-title">{t("settings.about") || "About"}</div>
            <div class="bds-settings-card">
              <a
                href="https://github.com/themuhammad-personal/Deepseek-"
                target="_blank"
                rel="noopener noreferrer"
                class="bds-settings-row"
                style="text-decoration: none;"
              >
                <div class="bds-settings-row-left">
                  <div class="bds-settings-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="16" x2="12" y2="12"></line>
                      <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                  </div>
                  <div class="bds-settings-row-text">
                    <span class="bds-settings-row-title">DeepSeek Mobile</span>
                    <span class="bds-settings-row-sub">v{extensionVersion} • Standalone Edition</span>
                  </div>
                </div>
                <div class="bds-settings-row-right">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </a>
            </div>
          </div>
        </div>

      {:else if currentSection === "prompts"}
        <!-- Sub-View: Prompts & Personas -->
        <div class="bds-sub-segment-bar">
          <button
            type="button"
            class="bds-sub-segment-btn"
            class:active={promptSubTab === 'system'}
            onclick={() => (promptSubTab = 'system')}
          >
            System Prompts
          </button>
          <button
            type="button"
            class="bds-sub-segment-btn"
            class:active={promptSubTab === 'characters'}
            onclick={() => (promptSubTab = 'characters')}
          >
            Personas
          </button>
          <button
            type="button"
            class="bds-sub-segment-btn"
            class:active={promptSubTab === 'skills'}
            onclick={() => (promptSubTab = 'skills')}
          >
            Skills
          </button>
        </div>

        {#if promptSubTab === 'system'}
          <SettingsPanel
            bind:this={settingsRef}
            activeTab="prompts"
            onsave={handleSettingsSaved}
            onapiplayground={openApiPlayground}
            onimportdata={() => {
              refreshSettings();
              refreshCharacters();
              refreshSkills();
              refreshMemories();
              refreshProjects();
            }}
          />
        {:else if promptSubTab === 'characters'}
          <CharacterList bind:this={charactersRef} />
        {:else if promptSubTab === 'skills'}
          <SkillList bind:this={skillsRef} />
        {/if}

      {:else if currentSection === "mcp"}
        <!-- Sub-View: MCP Tools & Plugins -->
        <SettingsPanel
          bind:this={settingsRef}
          activeTab="mcp"
          onsave={handleSettingsSaved}
          onapiplayground={openApiPlayground}
          onimportdata={() => {
            refreshSettings();
            refreshCharacters();
            refreshSkills();
            refreshMemories();
            refreshProjects();
          }}
        />

      {:else if currentSection === "deep_research"}
        <!-- Sub-View: Deep Research & Context Guard -->
        <SettingsPanel
          bind:this={settingsRef}
          activeTab="deep_research"
          onsave={handleSettingsSaved}
          onapiplayground={openApiPlayground}
          onimportdata={() => {
            refreshSettings();
            refreshCharacters();
            refreshSkills();
            refreshMemories();
            refreshProjects();
          }}
        />

      {:else if currentSection === "memory"}
        <!-- Sub-View: Persistent Memory -->
        <MemoryList bind:this={memoryRef} />

      {:else if currentSection === "commands"}
        <!-- Sub-View: Custom Commands -->
        <CommandManager onselect={(cmd) => insertCommand(cmd.id)} />

      {:else if currentSection === "data"}
        <!-- Sub-View: Data Controls & Exports -->
        <SettingsPanel
          bind:this={settingsRef}
          activeTab="data"
          onsave={handleSettingsSaved}
          onapiplayground={openApiPlayground}
          onimportdata={() => {
            refreshSettings();
            refreshCharacters();
            refreshSkills();
            refreshMemories();
            refreshProjects();
          }}
        />

      {:else if currentSection === "chat"}
        <!-- Sub-View: Chat & General Settings -->
        <SettingsPanel
          bind:this={settingsRef}
          activeTab="chat"
          onsave={handleSettingsSaved}
          onapiplayground={openApiPlayground}
          onimportdata={() => {
            refreshSettings();
            refreshCharacters();
            refreshSkills();
            refreshMemories();
            refreshProjects();
          }}
        />
      {/if}
    </div>

    <!-- Clean Unobtrusive Tip Indicator (if enabled) -->
    {#if TIP_COUNT > 0 && !disableTipBox && currentTipIndex >= 0}
      <div class="bds-tip-bar">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18h6" /><path d="M10 22h4" />
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
        </svg>
        <span>{@html t("tips." + currentTipIndex)}</span>
      </div>
    {/if}
  {/if}
</aside>
