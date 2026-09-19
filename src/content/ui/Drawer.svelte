<script>
  import SettingsPanel from "./SettingsPanel.svelte";
  import CharacterList from "./CharacterList.svelte";
  import SkillList from "./SkillList.svelte";
  import MemoryList from "./MemoryList.svelte";
  import ProjectsManager from "./ProjectsManager.svelte";
  import ProjectsCard from "./ProjectsCard.svelte";
  import SavedItems from "./SavedItems.svelte";
  import CommandManager from "../commands/CommandManager.svelte";
  import { COMMANDS } from "../commands/registry.js";
  import { findChatEditor, setChatInputText } from "../auto.js";
  import appState from "../state.js";
  import { i18n, t } from "../../lib/i18n.svelte.js";
  import { getExtensionVersion } from "../../lib/extension-version.js";

  let { open = false, onclose, onopenapiplayground } = $props();

  const extensionVersion = getExtensionVersion();

  // Active top-level navigation tab: 'mcp' | 'chat' | 'prompts' | 'projects' | 'commands' | 'settings'
  let activeNav = $state("mcp");

  // Sub-tab for Prompts: 'characters' | 'skills' | 'memory'
  let promptSubTab = $state("characters");

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
  let savedItemsRef = $state(null);
  let showCmdManager = $state(false);
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
  export function refreshSavedItems() {
    if (savedItemsRef) savedItemsRef.refresh();
  }
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
    <div class="bds-header-brand">
      <span class="bds-brand-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
          <circle cx="12" cy="12" r="4"/>
        </svg>
      </span>
      <div class="bds-header-text">
        <span class="bds-brand-title">Better DeepSeek</span>
        <span class="bds-version-pill">v{extensionVersion}</span>
      </div>
    </div>

    <button
      id="bds-close"
      type="button"
      onclick={handleClose}
      aria-label={t("drawer.close")}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M14.1871 13.1265L13.1265 14.1872L1.81275 2.87347L2.87341 1.81281L14.1871 13.1265Z"
          fill="currentColor"
        ></path>
        <path
          d="M13.1265 1.81282L14.1871 2.87348L2.8734 14.1872L1.81274 13.1265L13.1265 1.81282Z"
          fill="currentColor"
        ></path>
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
      placeholder="Search settings, MCP, prompts, tools..."
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

  <!-- Segmented Tab Navigation Bar (Claude / ChatGPT Style) -->
  {#if !showProjectsManager && !searchQuery}
    <div class="bds-tab-bar" role="tablist">
      <button
        type="button"
        class="bds-tab-item"
        class:active={activeNav === 'mcp'}
        onclick={() => activeNav = 'mcp'}
        role="tab"
        aria-selected={activeNav === 'mcp'}
      >
        <span class="bds-tab-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        </span>
        <span class="bds-tab-label">MCP & Tools</span>
        {#if appState.mcpServers?.some(s => s.enabled)}
          <span class="bds-tab-badge">{appState.mcpServers.filter(s => s.enabled).length}</span>
        {/if}
      </button>

      <button
        type="button"
        class="bds-tab-item"
        class:active={activeNav === 'chat'}
        onclick={() => activeNav = 'chat'}
        role="tab"
        aria-selected={activeNav === 'chat'}
      >
        <span class="bds-tab-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
        </span>
        <span class="bds-tab-label">Chat & AI</span>
      </button>

      <button
        type="button"
        class="bds-tab-item"
        class:active={activeNav === 'prompts'}
        onclick={() => activeNav = 'prompts'}
        role="tab"
        aria-selected={activeNav === 'prompts'}
      >
        <span class="bds-tab-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><line x1="9" y1="9" x2="15" y2="9"></line><line x1="9" y1="13" x2="13" y2="13"></line></svg>
        </span>
        <span class="bds-tab-label">Prompts</span>
      </button>

      <button
        type="button"
        class="bds-tab-item"
        class:active={activeNav === 'projects'}
        onclick={() => activeNav = 'projects'}
        role="tab"
        aria-selected={activeNav === 'projects'}
      >
        <span class="bds-tab-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        </span>
        <span class="bds-tab-label">Projects</span>
      </button>

      <button
        type="button"
        class="bds-tab-item"
        class:active={activeNav === 'commands'}
        onclick={() => activeNav = 'commands'}
        role="tab"
        aria-selected={activeNav === 'commands'}
      >
        <span class="bds-tab-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        </span>
        <span class="bds-tab-label">Commands</span>
      </button>

      <button
        type="button"
        class="bds-tab-item"
        class:active={activeNav === 'settings'}
        onclick={() => activeNav = 'settings'}
        role="tab"
        aria-selected={activeNav === 'settings'}
      >
        <span class="bds-tab-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </span>
        <span class="bds-tab-label">Settings</span>
      </button>
    </div>
  {/if}

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
        <!-- Unified search results view across settings and lists -->
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
            refreshSkills();
            refreshCharacters();
            refreshMemories();
            refreshProjects();
            refreshSavedItems();
          }}
        />
      {:else if activeNav === 'mcp'}
        <!-- MCP & Tools Tab -->
        <div class="bds-tab-section-intro">
          <div class="bds-intro-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            Custom MCP Engine Active
          </div>
          <h3>Model Context Protocol & Web Tools</h3>
          <p>Connect local servers (LAN / HTTP), remote tools, search engines, and code execution environments.</p>
        </div>
        <SettingsPanel
          bind:this={settingsRef}
          activeTab="mcp"
          onsave={handleSettingsSaved}
          onapiplayground={openApiPlayground}
          onimportdata={() => {
            refreshSettings();
            refreshSkills();
            refreshCharacters();
            refreshMemories();
            refreshProjects();
            refreshSavedItems();
          }}
        />

      {:else if activeNav === 'chat'}
        <!-- Chat & AI Tab -->
        <SettingsPanel
          bind:this={settingsRef}
          activeTab="chat"
          onsave={handleSettingsSaved}
          onapiplayground={openApiPlayground}
          onimportdata={() => {
            refreshSettings();
            refreshSkills();
            refreshCharacters();
            refreshMemories();
            refreshProjects();
            refreshSavedItems();
          }}
        />

      {:else if activeNav === 'prompts'}
        <!-- Prompts & Skills Tab -->
        <div class="bds-sub-segment-bar">
          <button
            type="button"
            class="bds-sub-segment-btn"
            class:active={promptSubTab === 'characters'}
            onclick={() => promptSubTab = 'characters'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><circle cx="12" cy="7" r="4"></circle><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path></svg>
            Characters & Personas
          </button>
          <button
            type="button"
            class="bds-sub-segment-btn"
            class:active={promptSubTab === 'skills'}
            onclick={() => promptSubTab = 'skills'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            Assistant Skills
          </button>
          <button
            type="button"
            class="bds-sub-segment-btn"
            class:active={promptSubTab === 'memory'}
            onclick={() => promptSubTab = 'memory'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
            Persistent Memory
          </button>
        </div>

        {#if promptSubTab === 'characters'}
          <CharacterList bind:this={charactersRef} />
        {:else if promptSubTab === 'skills'}
          <SkillList bind:this={skillsRef} />
        {:else if promptSubTab === 'memory'}
          <MemoryList bind:this={memoryRef} />
        {/if}

      {:else if activeNav === 'projects'}
        <!-- Projects & Files Tab -->
        <ProjectsCard onmanage={openProjectsManager} />

        <div style="margin-top: 14px;">
          <SettingsPanel
            bind:this={settingsRef}
            activeTab="projects"
            onsave={handleSettingsSaved}
            onapiplayground={openApiPlayground}
            onimportdata={() => {
              refreshSettings();
              refreshSkills();
              refreshCharacters();
              refreshMemories();
              refreshProjects();
              refreshSavedItems();
            }}
          />
        </div>

        <div style="margin-top: 14px;">
          <SavedItems bind:this={savedItemsRef} />
        </div>

      {:else if activeNav === 'commands'}
        <!-- Slash Commands Tab -->
        <div class="bds-section-title">
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="bds-icon-inline">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              </span>
              <span>{t("commands.title")}</span>
            </div>
            <button
              type="button"
              class="bds-btn-outlined"
              style="font-size:12px;padding:4px 10px;"
              onclick={() => (showCmdManager = !showCmdManager)}
            >
              {showCmdManager ? t("commands.done") : t("commands.manage")}
            </button>
          </div>
        </div>

        {#if !showCmdManager}
          <div class="bds-featured-list">
            <h4>{t("commands.builtinCommands")}</h4>
            {#each COMMANDS as cmd}
              <button
                type="button"
                class="bds-featured-item"
                onclick={() => insertCommand(cmd.id)}
              >
                <span class="bds-cmd-icon">{@html cmd.icon}</span>
                <span class="bds-cmd-info">
                  <span class="bds-cmd-name">/{cmd.id}</span>
                  <span class="bds-cmd-desc">{t(cmd.descKey)}</span>
                </span>
                <span class="bds-cmd-usage">{t(cmd.usageKey)}</span>
              </button>
            {/each}
          </div>
        {/if}

        {#if showCmdManager}
          <CommandManager onclose={() => (showCmdManager = false)} />
        {/if}

      {:else if activeNav === 'settings'}
        <!-- Global Settings Tab -->
        <SettingsPanel
          bind:this={settingsRef}
          activeTab="settings"
          onsave={handleSettingsSaved}
          onapiplayground={openApiPlayground}
          onimportdata={() => {
            refreshSettings();
            refreshSkills();
            refreshCharacters();
            refreshMemories();
            refreshProjects();
            refreshSavedItems();
          }}
        />
      {/if}
    </div>

    <!-- Drawer Footer -->
    <div class="bds-drawer-bottom">
      {#if TIP_COUNT > 0 && !disableTipBox && currentTipIndex >= 0}
        <div class="bds-tip-bar">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          ><path d="M9 18h6" /><path d="M10 22h4" /><path
            d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"
          /></svg>
          <span>{@html t("tips." + currentTipIndex)}</span>
        </div>
      {/if}

      <div class="bds-drawer-footer">
        <a
          href="https://github.com/EdgeTypE/better-deepseek"
          target="_blank"
          rel="noopener noreferrer"
          class="bds-github-link"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            ></path>
          </svg>
          <span>Android Edition <small style="opacity: 0.6; margin-left: 4px;">v{extensionVersion}</small></span>
        </a>
      </div>
    </div>
  {/if}
</aside>
