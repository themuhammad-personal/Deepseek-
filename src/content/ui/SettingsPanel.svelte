<script>
  import { onMount } from "svelte";
  import appState from "../state.js";
  import { pushConfigToPage, discoverMcpToolSchemas } from "../bridge.js";
  import {
    STORAGE_KEYS,
    SYSTEM_PROMPT_TEMPLATE_VERSION,
    DOWNLOAD_BEHAVIOR_VERSION,
    DEFAULT_SYSTEM_PROMPT,
  } from "../../lib/constants.js";
  import { getActiveProject, updateProject } from "../project-manager.js";
  import { t, i18n, availableLocaleCodes } from "../../lib/i18n.svelte.js";
  import { SEARCH_PROVIDER_CATALOG } from "../files/search-reader.js";
  import { CSS_PRESETS } from "../../lib/constants.js";
  import { openNativeFilePicker } from "../files/native-file-input.js";
  import { encryptData, decryptData } from "../../lib/utils/crypto.js";
  import { makeId } from "../../lib/utils/helpers.js";
  import SnippetList from "./SnippetList.svelte";
  import { triggerBlobDownload } from "../../lib/utils/download.js";
  import { setDeepCodeEnabled } from "../deep-code.js";

  let { onapiplayground, onimportdata, onsave, activeTab = "all", searchQuery = "" } = $props();

  let activeCategory = $state("all");

  let customSystemPrompts = $state(appState.settings.customSystemPrompts || []);
  let activeSystemPromptId = $state(appState.settings.activeSystemPromptId || "default");
  
  let showPromptEditor = $state(false);
  let editingPrompt = $state(null);
  let promptEditorName = $state("");
  let promptEditorContent = $state("");
  let promptEditorIsNew = $state(false);

  let multiEntryScheduleType = $state("first");
  let multiEntryScheduleInterval = $state(3);
  let multiEntryEnabled = $state(true);

  let autoFiles = $state(Boolean(appState.settings.autoDownloadFiles));
  let autoZip = $state(Boolean(appState.settings.autoDownloadLongWorkZip));
  let voiceMode = $state(Boolean(appState.settings.voiceMode));
  let voiceLanguage = $state(
    appState.settings.voiceLanguage ||
      (typeof navigator !== "undefined" ? navigator.language : "en-US"),
  );
  let autoSubmitVoice = $state(Boolean(appState.settings.autoSubmitVoice));
  let vadSilenceTimeout = $state(Number(appState.settings.vadSilenceTimeout) || 1500);
  let preferredLang = $state(appState.settings.preferredLang || "");
  let githubToken = $state(appState.settings.githubToken || "");
  let showGithubToken = $state(shouldShowGithubTokenByDefault(appState.settings.githubToken));
  let disableSystemPrompt = $state(
    Boolean(appState.settings.disableSystemPrompt),
  );
  let systemPromptMultiMode = $state(Boolean(appState.settings.systemPromptMultiMode));
  let systemPromptEntries = $state(Array.isArray(appState.settings.systemPromptEntries) ? appState.settings.systemPromptEntries : []);
  let safeSystemPromptEntries = $derived(Array.isArray(systemPromptEntries) ? systemPromptEntries : []);
  let systemPromptInjectionFrequency = $state(
    appState.settings.systemPromptInjectionFrequency || "first",
  );
  let systemPromptInjectionInterval = $state(
    Number(appState.settings.systemPromptInjectionInterval) || 3,
  );
  let disableMemory = $state(Boolean(appState.settings.disableMemory));
  let htmlToMarkdownMaxDepth = $state(
    Number(appState.settings.htmlToMarkdownMaxDepth) || 200,
  );
  let maxChatSessions = $state(
    Number(appState.settings.maxChatSessions) || 500,
  );
  let tokenPriceDisplay = $state(Boolean(appState.settings.tokenPriceDisplay));
  let showTimestamps = $state(Boolean(appState.settings.showTimestamps));
  let oledDarkMode = $state(Boolean(appState.settings.oledDarkMode));
  let collapseLongUserMessages = $state(Boolean(appState.settings.collapseLongUserMessages));
  let loadAllHistoryOnSession = $state(Boolean(appState.settings.loadAllHistoryOnSession));
  let projectRagEnabled = $state(Boolean(appState.settings.projectRagEnabled));
  let projectRagLimit = $state(Number(appState.settings.projectRagLimit) || 5);
  let processGitignoreOnUpload = $state(Boolean(appState.settings.processGitignoreOnUpload));
  let injectSystemDateTime = $state(Boolean(appState.settings.injectSystemDateTime));
  let skipDeletionConfirmation = $state(Boolean(appState.settings.skipDeletionConfirmation));
  let deepResearchDeepFetch = $state(Number(appState.settings.deepResearchDeepFetch) ?? 1);
  let deepResearchContextGuardEnabled = $state(Boolean(appState.settings.deepResearchContextGuardEnabled));
  let deepResearchContextLimitTokens = $state(Number(appState.settings.deepResearchContextLimitTokens) || 128000);
  let deepResearchContextStopPercent = $state(Number(appState.settings.deepResearchContextStopPercent) || 70);
  let searchProviderRows = $state(buildSearchProviderRows(appState.settings.searchProviders));
  let activeSearchProviderCount = $derived(searchProviderRows.filter((row) => row.enabled).length);
  let locale = $state(appState.settings.locale || availableLocaleCodes[0] || "en");
  let syncLocale = $state(Boolean(appState.settings.syncLocale));
  let customCSS = $state(appState.settings.customCSS || "");
  let editingSnippetId = $state(null);
  let snippetListRef = $state(null);
  let isSnippetsOpen = $state(false);
  let cssSnippets = $state([...appState.cssSnippets]);
  let activeSnippetsCount = $derived(cssSnippets.filter(s => s.active).length);
  let showSaveSnippetModal = $state(false);
  let newSnippetName = $state("");
  let saveSnippetError = $state("");
  let advancedOpen = $state(false);
  let subLanguageOpen = $state(false);
  let subChatOpen = $state(false);
  let subProjectsOpen = $state(false);
  let subInjectionOpen = $state(false);
  let subResearchOpen = $state(false);
  let subDeepCodeOpen = $state(false);
  let deepCodeEnabled = $state(Boolean(appState.deepCode?.enabled));
  let deepCodeActiveDir = $derived(appState.deepCode?.activeDirectory || "");
  let deepCodeFileCount = $derived(appState.deepCode?.fileCount || 0);
  let deepCodeManualPath = $derived(appState.deepCode?.manualPath || "");
  let subVoiceOpen = $state(false);
  let subIntegrationsOpen = $state(false);
  let subUtilitiesOpen = $state(false);
  let subCSSOpen = $state(false);
  let subMcpOpen = $state(false);
  let showMcpEditor = $state(false);
  let editingMcp = $state(null);
  let mcpEditorName = $state("");
  let mcpEditorUrl = $state("");
  let mcpEditorApiKey = $state("");
  let mcpEditorEnabled = $state(true);
  let mcpEditorIsNew = $state(false);
  let mcpTestingIndex = $state(-1);
  let mcpServers = $state([...appState.mcpServers]);
  let mcpInlineMaxChars = $state(Number(appState.settings.mcpInlineMaxChars) || 8000);
  let disableTipBox = $state(Boolean(appState.settings.disableTipBox));
  let advancedSearchQuery = $state("");
  let autocompleteSelectedIndex = $state(-1);
  let savedSectionStates = $state(null);
  let lastCheckedDate = $state("");
  let updatingLanguages = $state(false);

  let dirty = $state(false);
  let showUnsavedModal = $state(false);
  let unsavedResolve = null;

  // ── Export / Import All ──
  let showExportAllModal = $state(false);
  let showImportPasswordModal = $state(false);
  let showImportSelectModal = $state(false);
  let exportPassword = $state("");
  let exportPasswordConfirm = $state("");
  let exportEncrypt = $state(false);
  let importAllFileInput = $state(null);
  let importPassword = $state("");
  let importData = $state(null);
  let importEncrypted = $state(false);
  let importPasswordError = $state("");
  let exportPasswordError = $state("");
  let isExporting = $state(false);
  let isImporting = $state(false);

  const EXPORT_SECTIONS = [
    { key: "settings", label: t('drawer.sectionSettings') },
    { key: "customSystemPrompts", label: t('drawer.sectionPrompts') },
    { key: "skills", label: t('drawer.sectionSkills') },
    { key: "characters", label: t('drawer.sectionCharacters') },
    { key: "memories", label: t('drawer.sectionMemories') },
    { key: "mcpServers", label: t('drawer.sectionMcpServers') },
    { key: "cssSnippets", label: t('drawer.sectionCssSnippets') },
    { key: "projects", label: t('drawer.sectionProjects') },
    { key: "projectFiles", label: t('drawer.sectionProjectFiles') },
    { key: "chatTags", label: t('drawer.sectionChatTags') },
    { key: "savedItems", label: t('drawer.sectionSavedItems') },
  ];
  let selectedSections = $state(new Set(EXPORT_SECTIONS.map(s => s.key)));

  function normalizeSearchProvidersSetting(raw) {
    const known = new Set(SEARCH_PROVIDER_CATALOG.map((provider) => provider.id));
    const seen = new Set();
    const enabled = [];
    if (Array.isArray(raw)) {
      for (const id of raw) {
        const key = String(id);
        if (known.has(key) && !seen.has(key)) {
          enabled.push(key);
          seen.add(key);
        }
      }
    }
    return enabled;
  }

  function buildSearchProviderRows(raw) {
    // Enabled providers keep their configured order; disabled ones follow in
    // canonical catalog order so every provider stays visible and toggleable.
    const enabled = normalizeSearchProvidersSetting(raw);
    return SEARCH_PROVIDER_CATALOG.map((provider) => ({
      id: provider.id,
      labelKey: provider.labelKey,
      name: provider.name,
      enabled: enabled.includes(provider.id),
    })).sort((a, b) => {
      const ai = enabled.indexOf(a.id);
      const bi = enabled.indexOf(b.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
    });
  }

  function enabledSearchProviderIds() {
    return searchProviderRows.filter((row) => row.enabled).map((row) => row.id);
  }

  function toggleSearchProvider(row) {
    if (row.enabled && activeSearchProviderCount <= 1) return;
    searchProviderRows = searchProviderRows.map((candidate) =>
      candidate.id === row.id ? { ...candidate, enabled: !candidate.enabled } : candidate
    );
  }

  function moveSearchProvider(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= searchProviderRows.length) return;
    if (searchProviderRows[target].enabled !== searchProviderRows[index].enabled) return;
    const next = [...searchProviderRows];
    [next[index], next[target]] = [next[target], next[index]];
    searchProviderRows = next;
  }

  function captureFormSnapshot() {
    return JSON.stringify({
      autoFiles, autoZip, voiceMode, voiceLanguage, autoSubmitVoice,
      vadSilenceTimeout,
      preferredLang, githubToken, disableSystemPrompt,
      systemPromptMultiMode, systemPromptEntries,
      systemPromptInjectionFrequency, systemPromptInjectionInterval,
      disableMemory, htmlToMarkdownMaxDepth, maxChatSessions,
      tokenPriceDisplay, showTimestamps, projectRagEnabled, projectRagLimit,
      processGitignoreOnUpload, injectSystemDateTime, skipDeletionConfirmation,
      deepResearchDeepFetch,
      searchProviders: enabledSearchProviderIds(),
      mcpInlineMaxChars,
      locale, syncLocale, collapseLongUserMessages,
      loadAllHistoryOnSession, customCSS, disableTipBox, oledDarkMode
    });
  }

  let formSnapshot = $state(captureFormSnapshot());

  // ── Export / Import All ──

  function resetExportAllModal() {
    exportPassword = "";
    exportPasswordConfirm = "";
    exportEncrypt = false;
    exportPasswordError = "";
    isExporting = false;
  }

  function openExportAllModal() {
    resetExportAllModal();
    showExportAllModal = true;
  }

  function closeExportAllModal() {
    showExportAllModal = false;
  }

  /**
   * Returns true when a chrome API call fails because the extension was
   * reloaded/updated while the page tab was still open (orphaned content script).
   * The user must reload the page to re-establish the extension context.
   */
  function isExtensionContextError(e) {
    const msg = (e && e.message) ? e.message.toLowerCase() : "";
    return msg.includes("extension context invalidated") ||
           msg.includes("context invalidated") ||
           msg.includes("cannot access");
  }

  async function doExportAll() {
    if (exportEncrypt) {
      if (!exportPassword || exportPassword.length < 4) {
        exportPasswordError = t('drawer.passwordTooShort');
        return;
      }
      if (exportPassword !== exportPasswordConfirm) {
        exportPasswordError = t('drawer.passwordMismatch');
        return;
      }
    }
    exportPasswordError = "";
    isExporting = true;

    try {
      // Strip migration-only flags from exported settings so they don't
      // corrupt the version-upgrade logic on the destination device.
      const settingsToExport = { ...appState.settings, githubToken: "" };
      delete settingsToExport.systemPromptBackupDone;
      delete settingsToExport.systemPromptTemplateVersion;
      delete settingsToExport.downloadBehaviorVersion;
      // customSystemPrompts is exported as its own top-level key so it can be
      // imported independently; remove it from the settings blob to avoid
      // double-importing when the settings section is selected.
      delete settingsToExport.customSystemPrompts;

      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: settingsToExport,
        cssSnippets: appState.cssSnippets,
        customSystemPrompts: appState.settings.customSystemPrompts || [],
        skills: appState.skills,
        characters: appState.characters,
        memories: appState.memories,
        mcpServers: appState.mcpServers,
        projects: appState.projects,
        projectFiles: appState.projectFiles,
        chatTags: appState.chatTags,
        savedItems: appState.savedItems,
      };

      let blob;
      if (exportEncrypt) {
        const encrypted = await encryptData(JSON.stringify(data), exportPassword);
        blob = new Blob([JSON.stringify(encrypted)], { type: "application/json" });
      } else {
        blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      }

      const fileName = `bds_backup_${new Date().toISOString().slice(0, 10)}.json`;
      triggerBlobDownload(blob, fileName);

      closeExportAllModal();
      if (appState.ui) appState.ui.showToast(t('drawer.exportDone'));
    } catch (e) {
      if (isExtensionContextError(e)) {
        if (appState.ui) appState.ui.showToast(t('drawer.importContextError'), 8000);
      } else {
        if (appState.ui) appState.ui.showToast(t('drawer.exportFailed'));
      }
    }

    isExporting = false;
  }

  function triggerImportAll() {
    openNativeFilePicker(importAllFileInput, { preferSingle: true });
  }

  function resetImportState() {
    importPassword = "";
    importData = null;
    importEncrypted = false;
    importPasswordError = "";
    isImporting = false;
    selectedSections = new Set(EXPORT_SECTIONS.map(s => s.key));
  }

  async function handleImportAll(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);

      if (parsed.encrypted) {
        resetImportState();
        importData = parsed;
        importEncrypted = true;
        showImportPasswordModal = true;
      } else {
        resetImportState();
        importData = parsed;
        importEncrypted = false;
        showImportSelectModal = true;
      }
    } catch (e) {
      if (appState.ui) appState.ui.showToast(t('drawer.importParseError'));
    } finally {
      input.value = "";
    }
  }

  async function doDecryptAndShow() {
    if (!importPassword) {
      importPasswordError = t('drawer.passwordRequired');
      return;
    }
    importPasswordError = "";
    isImporting = true;

    try {
      const decrypted = await decryptData(importData, importPassword);
      importData = JSON.parse(decrypted);
      showImportPasswordModal = false;
      importPassword = "";
      showImportSelectModal = true;
    } catch (e) {
      importPasswordError = t('drawer.passwordWrong');
    }

    isImporting = false;
  }

  function toggleSection(key) {
    const next = new Set(selectedSections);
    if (next.has(key)) next.delete(key); else next.add(key);
    selectedSections = next;
  }

  async function doImportAll() {
    if (!importData) return;
    isImporting = true;

    // Toast message is deferred until after the modal closes (finally block)
    // so it is never hidden behind the overlay or cut off by its animation.
    let pendingToast = null;
    let pendingToastDuration = 2880;

    try {
      const d = importData;

      const plain = (obj) => JSON.parse(JSON.stringify(obj ?? null));

      // Sections this file can actually satisfy. A single-section export
      // dropped into "Import All Data" matches none of them, and reporting
      // success for a no-op is worse than reporting nothing happened.
      const matchedSections = EXPORT_SECTIONS.filter(
        (section) => selectedSections.has(section.key) && Boolean(d[section.key]),
      );

      if (selectedSections.has("settings") && d.settings) {
        const oldToken = appState.settings.githubToken;
        // Preserve migration flags from the destination device so that
        // loadStateFromStorage()'s upgrade logic remains correct after reload.
        const migrationsToKeep = {
          systemPromptBackupDone: appState.settings.systemPromptBackupDone,
          systemPromptTemplateVersion: appState.settings.systemPromptTemplateVersion,
          downloadBehaviorVersion: appState.settings.downloadBehaviorVersion,
        };
        // Use a reactive spread (not Object.assign) so Svelte 5 tracks the change.
        appState.settings = {
          ...appState.settings,
          ...d.settings,
          ...migrationsToKeep,
          githubToken: oldToken,
          // customSystemPrompts is managed by its own section below; prevent
          // the settings blob from silently overwriting it regardless of the
          // user's section selection.
          customSystemPrompts: appState.settings.customSystemPrompts,
        };
        await chrome.storage.local.set({ [STORAGE_KEYS.settings]: plain(appState.settings) });
      }
      if (selectedSections.has("customSystemPrompts") && d.customSystemPrompts) {
        appState.settings = {
          ...appState.settings,
          customSystemPrompts: plain(d.customSystemPrompts),
        };
        await chrome.storage.local.set({ [STORAGE_KEYS.settings]: plain(appState.settings) });
      }
      if (selectedSections.has("cssSnippets") && d.cssSnippets) {
        appState.cssSnippets = plain(d.cssSnippets);
        await chrome.storage.local.set({ [STORAGE_KEYS.cssSnippets]: appState.cssSnippets });
      }
      if (selectedSections.has("skills") && d.skills) {
        appState.skills = plain(d.skills);
        await chrome.storage.local.set({ [STORAGE_KEYS.skills]: appState.skills });
      }
      if (selectedSections.has("characters") && d.characters) {
        appState.characters = plain(d.characters);
        await chrome.storage.local.set({ [STORAGE_KEYS.characters]: appState.characters });
      }
      if (selectedSections.has("memories") && d.memories) {
        appState.memories = plain(d.memories);
        await chrome.storage.local.set({ [STORAGE_KEYS.memories]: appState.memories });
      }
      if (selectedSections.has("mcpServers") && d.mcpServers) {
        appState.mcpServers = plain(d.mcpServers);
        await chrome.storage.local.set({ [STORAGE_KEYS.mcpServers]: appState.mcpServers });
      }
      if (selectedSections.has("projects") && d.projects) {
        appState.projects = plain(d.projects);
        await chrome.storage.local.set({ [STORAGE_KEYS.projects]: appState.projects });
      }
      if (selectedSections.has("projectFiles") && d.projectFiles) {
        appState.projectFiles = plain(d.projectFiles);
        await chrome.storage.local.set({ [STORAGE_KEYS.projectFiles]: appState.projectFiles });
      }
      if (selectedSections.has("chatTags") && d.chatTags) {
        appState.chatTags = plain(d.chatTags);
        await chrome.storage.local.set({ [STORAGE_KEYS.chatTags]: appState.chatTags });
      }
      if (selectedSections.has("savedItems") && d.savedItems) {
        appState.savedItems = plain(d.savedItems);
        await chrome.storage.local.set({ [STORAGE_KEYS.savedItems]: appState.savedItems });
      }

      // Explicitly refresh the settings form so local $state variables
      // reflect the newly imported values without requiring a page reload.
      if (matchedSections.length === 0) {
        pendingToast = t('drawer.importNoSections');
        pendingToastDuration = 6000;
      } else {
        refresh();

        pushConfigToPage();
        onimportdata?.();

        pendingToast = t('drawer.importDone');
      }
    } catch (e) {
      console.error("[BDS] doImportAll error:", e);
      if (isExtensionContextError(e)) {
        pendingToast = t('drawer.importContextError');
        pendingToastDuration = 8000;
      } else {
        pendingToast = t('drawer.importFailed');
      }
    } finally {
      showImportSelectModal = false;
      resetImportState();
      isImporting = false;
    }

    // Show feedback only after the modal is fully closed so the toast is
    // never obscured by the overlay and the user always sees the result.
    if (pendingToast && appState.ui) {
      appState.ui.showToast(pendingToast, pendingToastDuration);
    }
  }


  function closeImportPasswordModal() {
    showImportPasswordModal = false;
    resetImportState();
  }

  function closeImportSelectModal() {
    showImportSelectModal = false;
    resetImportState();
  }

  $effect(() => {
    const current = captureFormSnapshot();
    dirty = current !== formSnapshot;
  });

  export function checkBeforeClose() {
    if (!dirty) return Promise.resolve(true);
    return new Promise((resolve) => {
      unsavedResolve = resolve;
      showUnsavedModal = true;
    });
  }

  function discardAndClose() {
    showUnsavedModal = false;
    if (unsavedResolve) {
      unsavedResolve(true);
      unsavedResolve = null;
    }
  }

  function cancelClose() {
    showUnsavedModal = false;
    if (unsavedResolve) {
      unsavedResolve(false);
      unsavedResolve = null;
    }
  }

  let activeProject = $state(getActiveProject());
  let projectInstructions = $state(getActiveProject()?.customInstructions || "");
  let projectSaveTimer = null;
  const GITHUB_TOKEN_MASK_CHAR = "\u25cf";

  // ── Single source of truth: section → setting i18n keys ──
  const SECTION_SETTINGS = [
    { key: 'subLanguage', labelKey: 'settings.subLanguage', settingKeys: [
      'settings.syncLocale', 'settings.selectLanguage', 'settings.checkUpdates',
      'settings.resetFactory', 'settings.preferredLang',
    ]},
    { key: 'subChat', labelKey: 'settings.subChat', settingKeys: [
      'settings.collapseLongUserMessages', 'settings.loadAllHistoryOnSession', 'settings.chatSessionCap',
    ]},
    { key: 'subProjects', labelKey: 'settings.subProjects', settingKeys: [
      'settings.projectAutoContext', 'settings.processGitignore',
      'settings.autoDownloadFiles', 'settings.autoDownloadZip',
    ]},
    { key: 'subInjection', labelKey: 'settings.subInjection', settingKeys: [
      'settings.disableSystemPrompt', 'settings.disableMemory',
      'settings.injectSystemDateTime', 'settings.skipDeletionConfirmation',
      'settings.injectionFrequency',
    ]},
    { key: 'subResearch', labelKey: 'settings.subResearch', settingKeys: [
      'settings.deepFetchPerSearch',
      'settings.searchProviders', 'settings.searchProvider.ddgLite',
      'settings.searchProvider.ddgHtml', 'settings.searchProvider.bing',
      'settings.contextGuardEnabled', 'settings.contextGuardLimit',
      'settings.contextGuardStopPercent',
    ]},
    { key: 'subDeepCode', labelKey: 'settings.deepCode', settingKeys: [
      'deepCodeToggle.enableToggle', 'deepCodeModal.activeCodebase',
    ]},
    { key: 'subIntegrations', labelKey: 'settings.subIntegrations', settingKeys: [
      'settings.markdownMaxDepth', 'settings.githubToken',
      'settings.tokenPriceEstimation', 'settings.showTimestamps',
    ]},
    { key: 'subCSS', labelKey: 'settings.subCSS', settingKeys: [
      'settings.customCSS', 'settings.cssPresets',
      'settings.saveAsSnippet', 'settings.manageSnippets',
    ]},
    { key: 'subMcp', labelKey: 'mcp.sectionTitle', settingKeys: [
      'mcp.addServer', 'mcp.inlineMaxChars',
    ]},
    { key: 'subUtilities', labelKey: 'settings.subUtilities', settingKeys: [
      'apiPlayground.title', 'drawer.exportAll', 'drawer.importAll', 'settings.disableTipBox',
    ]},
  ];

  let searchIndex = $derived(
    SECTION_SETTINGS.map(s => ({
      sectionKey: s.key,
      sectionLabel: t(s.labelKey),
      settings: s.settingKeys.map(k => ({ label: t(k) }))
    }))
  );

  let filteredSearchSections = $derived.by(() => {
    const q = advancedSearchQuery.toLowerCase().trim();
    if (!q) return null;
    return searchIndex.map(section => {
      const sectionMatch = section.sectionLabel.toLowerCase().includes(q);
      return { ...section, match: sectionMatch || section.settings.some(s => s.label.toLowerCase().includes(q)) };
    }).filter(s => s.match);
  });

  let autocompleteItems = $derived.by(() => {
    const q = advancedSearchQuery.toLowerCase().trim();
    if (!q || q.length < 1) return [];
    const items = [];
    const seen = new Set();
    for (const section of searchIndex) {
      const sl = section.sectionLabel.toLowerCase();
      if (sl.includes(q) && !seen.has(section.sectionKey)) {
        seen.add(section.sectionKey);
        items.push({ type: 'section', sectionKey: section.sectionKey, label: section.sectionLabel });
      }
      for (const setting of section.settings) {
        if (setting.label.toLowerCase().includes(q)) {
          const dedupKey = section.sectionKey + '::' + setting.label;
          if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            items.push({ type: 'setting', sectionKey: section.sectionKey, label: setting.label, parentLabel: section.sectionLabel });
          }
        }
      }
    }
    return items;
  });

  let searchActive = $derived(advancedSearchQuery.trim().length > 0);

  $effect(() => {
    autocompleteItems;
    autocompleteSelectedIndex = -1;
  });

  function snapshotSectionStates() {
    return {
      subLanguage: subLanguageOpen, subChat: subChatOpen,
      subProjects: subProjectsOpen, subInjection: subInjectionOpen,
      subResearch: subResearchOpen, subDeepCode: subDeepCodeOpen,
      subVoice: subVoiceOpen,
      subIntegrations: subIntegrationsOpen, subCSS: subCSSOpen,
      subMcp: subMcpOpen,
      subUtilities: subUtilitiesOpen,
    };
  }

  function restoreSectionStates(states) {
    if (!states) return;
    subLanguageOpen = states.subLanguage; subChatOpen = states.subChat;
    subProjectsOpen = states.subProjects; subInjectionOpen = states.subInjection;
    subResearchOpen = states.subResearch;
    if (typeof states.subDeepCode === "boolean") subDeepCodeOpen = states.subDeepCode;
    subVoiceOpen = states.subVoice;
    subIntegrationsOpen = states.subIntegrations; subCSSOpen = states.subCSS;
    subMcpOpen = states.subMcp;
    subUtilitiesOpen = states.subUtilities;
  }

  let wasSearchActive = false;

  $effect(() => {
    if (searchActive && !wasSearchActive) {
      savedSectionStates = snapshotSectionStates();
    } else if (!searchActive && wasSearchActive && savedSectionStates) {
      restoreSectionStates(savedSectionStates);
      savedSectionStates = null;
    }
    wasSearchActive = searchActive;
    if (!searchActive) return;
    const matchingKeys = new Set(filteredSearchSections?.map(s => s.sectionKey) || []);
    subLanguageOpen = matchingKeys.has('subLanguage');
    subChatOpen = matchingKeys.has('subChat');
    subProjectsOpen = matchingKeys.has('subProjects');
    subInjectionOpen = matchingKeys.has('subInjection');
    subResearchOpen = matchingKeys.has('subResearch');
    subDeepCodeOpen = matchingKeys.has('subDeepCode');
    subVoiceOpen = matchingKeys.has('subVoice');
    subIntegrationsOpen = matchingKeys.has('subIntegrations');
    subCSSOpen = matchingKeys.has('subCSS');
    subMcpOpen = matchingKeys.has('subMcp');
    subUtilitiesOpen = matchingKeys.has('subUtilities');
  });

  $effect(() => {
    if (activeTab === "mcp") {
      advancedOpen = true;
      subMcpOpen = true;
      subResearchOpen = true;
    } else if (activeTab === "appearance") {
      advancedOpen = true;
      subCSSOpen = true;
    } else if (activeTab === "language") {
      advancedOpen = true;
      subLanguageOpen = true;
    } else if (activeTab === "chat") {
      advancedOpen = true;
      subInjectionOpen = true;
      subChatOpen = true;
    } else if (activeTab === "data") {
      advancedOpen = true;
      subIntegrationsOpen = true;
      subUtilitiesOpen = true;
    } else if (activeTab === "deep_research") {
      advancedOpen = true;
      subResearchOpen = true;
    } else if (activeTab === "deep_code") {
      advancedOpen = true;
      subDeepCodeOpen = true;
    } else if (activeTab === "projects") {
      advancedOpen = true;
      subProjectsOpen = true;
    } else if (activeTab === "settings") {
      advancedOpen = true;
      subCSSOpen = true;
      subVoiceOpen = true;
      subIntegrationsOpen = true;
      subLanguageOpen = true;
      subUtilitiesOpen = true;
      subChatOpen = true;
      subInjectionOpen = true;
      subResearchOpen = true;
      subMcpOpen = true;
      subProjectsOpen = true;
    }
  });

  function isTabMatch(sectionKey) {
    const q = (searchQuery || advancedSearchQuery || "").trim();
    if (q.length > 0) return true;
    if (activeTab === "all") return true;
    if (activeTab === "mcp") return sectionKey === "subMcp";
    if (activeTab === "deep_research") return sectionKey === "subResearch";
    if (activeTab === "deep_code") return sectionKey === "subDeepCode";
    if (activeTab === "data") return sectionKey === "subIntegrations" || sectionKey === "subUtilities";
    if (activeTab === "appearance") return sectionKey === "subCSS";
    if (activeTab === "language") return sectionKey === "subLanguage";
    if (activeTab === "chat") return sectionKey === "subChat" || sectionKey === "subInjection";
    if (activeTab === "prompts") return sectionKey === "systemPrompts";
    if (activeTab === "projects") return sectionKey === "subProjects";
    if (activeTab === "settings") {
      if (activeCategory === "all") return sectionKey !== "subVoice";
      if (activeCategory === "general") return sectionKey === "subLanguage" || sectionKey === "subUtilities";
      if (activeCategory === "chat") return sectionKey === "systemPrompts" || sectionKey === "subChat" || sectionKey === "subInjection";
      if (activeCategory === "research") return sectionKey === "subResearch" || sectionKey === "subDeepCode";
      if (activeCategory === "mcp") return sectionKey === "subMcp" || sectionKey === "subDeepCode";
      if (activeCategory === "appearance") return sectionKey === "subCSS";
      if (activeCategory === "integrations") return sectionKey === "subIntegrations";
      if (activeCategory === "backup") return sectionKey === "subUtilities" || sectionKey === "subProjects";
      return sectionKey !== "subVoice";
    }
    return false;
  }

  function isSectionMatch(sectionKey) {
    if (!isTabMatch(sectionKey)) return false;
    const q = (searchQuery || advancedSearchQuery || "").trim();
    if (!q) return true;
    return filteredSearchSections?.some(s => s.sectionKey === sectionKey) ?? true;
  }

  function handleAdvancedSearchKeydown(e) {
    if (!autocompleteItems.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); autocompleteSelectedIndex = Math.min(autocompleteSelectedIndex + 1, autocompleteItems.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); autocompleteSelectedIndex = autocompleteSelectedIndex <= 0 ? autocompleteItems.length - 1 : autocompleteSelectedIndex - 1; }
    else if (e.key === 'Enter') { e.preventDefault(); if (autocompleteSelectedIndex < 0) autocompleteSelectedIndex = 0; selectAutocompleteItem(); }
    else if (e.key === 'Escape') { e.preventDefault(); advancedSearchQuery = ''; }
  }

  function selectAutocompleteItem() {
    const item = autocompleteItems[autocompleteSelectedIndex];
    if (!item) return;
    advancedSearchQuery = item.label;
  }

  function handleAutocompleteMouseDown(e, index) { e.preventDefault(); autocompleteSelectedIndex = index; selectAutocompleteItem(); }

  function shouldShowGithubTokenByDefault(tokenValue = githubToken) {
    return !String(tokenValue || "").trim();
  }

  export function refresh() {
    customSystemPrompts = appState.settings.customSystemPrompts || [];
    activeSystemPromptId = appState.settings.activeSystemPromptId || "default";
    systemPromptMultiMode = Boolean(appState.settings.systemPromptMultiMode);
    systemPromptEntries = Array.isArray(appState.settings.systemPromptEntries) ? appState.settings.systemPromptEntries : [];
    autoFiles = Boolean(appState.settings.autoDownloadFiles);
    autoZip = Boolean(appState.settings.autoDownloadLongWorkZip);
    voiceMode = Boolean(appState.settings.voiceMode);
    voiceLanguage =
      appState.settings.voiceLanguage ||
      (typeof navigator !== "undefined" ? navigator.language : "en-US");
    autoSubmitVoice = Boolean(appState.settings.autoSubmitVoice);
    vadSilenceTimeout = Number(appState.settings.vadSilenceTimeout) || 1500;
    preferredLang = appState.settings.preferredLang || "";
    githubToken = appState.settings.githubToken || "";
    showGithubToken = shouldShowGithubTokenByDefault(githubToken);
    disableSystemPrompt = Boolean(appState.settings.disableSystemPrompt);
    systemPromptInjectionFrequency =
      appState.settings.systemPromptInjectionFrequency || "first";
    systemPromptInjectionInterval =
      Number(appState.settings.systemPromptInjectionInterval) || 3;
    disableMemory = Boolean(appState.settings.disableMemory);
    htmlToMarkdownMaxDepth =
      Number(appState.settings.htmlToMarkdownMaxDepth) || 200;
    maxChatSessions = Number(appState.settings.maxChatSessions) || 500;
    tokenPriceDisplay = Boolean(appState.settings.tokenPriceDisplay);
    showTimestamps = Boolean(appState.settings.showTimestamps);
    oledDarkMode = Boolean(appState.settings.oledDarkMode);
    collapseLongUserMessages = Boolean(appState.settings.collapseLongUserMessages);
    loadAllHistoryOnSession = Boolean(appState.settings.loadAllHistoryOnSession);
    projectRagEnabled = Boolean(appState.settings.projectRagEnabled);
    projectRagLimit = Number(appState.settings.projectRagLimit) || 5;
    deepResearchDeepFetch = Number(appState.settings.deepResearchDeepFetch) ?? 1;
    searchProviderRows = buildSearchProviderRows(appState.settings.searchProviders);
    processGitignoreOnUpload = Boolean(appState.settings.processGitignoreOnUpload);
    injectSystemDateTime = Boolean(appState.settings.injectSystemDateTime);
    skipDeletionConfirmation = Boolean(appState.settings.skipDeletionConfirmation);
    locale = appState.settings.locale || availableLocaleCodes[0] || "en";
    syncLocale = Boolean(appState.settings.syncLocale);
    customCSS = appState.settings.customCSS || "";
    disableTipBox = Boolean(appState.settings.disableTipBox);
    mcpInlineMaxChars = Number(appState.settings.mcpInlineMaxChars) || 8000;
    cssSnippets = [...appState.cssSnippets];
    mcpServers = [...appState.mcpServers];
    if (snippetListRef) snippetListRef.refresh();
    chrome.storage.local.get("bds_locale_update_last_checked", (data) => {
      lastCheckedDate = data.bds_locale_update_last_checked || "";
    });
    formSnapshot = captureFormSnapshot();
  }

  export function refreshCssSnippets() {
    cssSnippets = [...appState.cssSnippets];
    if (snippetListRef) snippetListRef.refresh();
  }

  function editSnippet(snippetId) {
    const snippet = appState.cssSnippets.find((s) => s.id === snippetId);
    if (!snippet) return;
    editingSnippetId = snippet.id;
    customCSS = snippet.css;
    const textarea = document.querySelector(".bds-css-editor");
    if (textarea) {
      textarea.focus();
      textarea.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function cancelEditSnippet() {
    editingSnippetId = null;
    customCSS = appState.settings.customCSS || "";
  }

  async function updateSnippet() {
    if (!editingSnippetId) return;
    const snippet = appState.cssSnippets.find((s) => s.id === editingSnippetId);
    if (!snippet) return;

    snippet.css = customCSS;
    await chrome.storage.local.set({
      [STORAGE_KEYS.cssSnippets]: appState.cssSnippets,
    });

    editingSnippetId = null;
    customCSS = appState.settings.customCSS || "";

    cssSnippets = [...appState.cssSnippets];
    if (snippetListRef) snippetListRef.refresh();
    window.dispatchEvent(new CustomEvent("bds:cssSnippetsChanged"));
    pushConfigToPage();

    if (appState.ui) {
      appState.ui.showToast(t("settings.snippetUpdated"));
    }
  }

  function saveAsSnippet() {
    if (!customCSS || !customCSS.trim()) return;
    newSnippetName = "";
    saveSnippetError = "";
    showSaveSnippetModal = true;
  }

  async function submitSaveSnippet() {
    const trimmedName = newSnippetName.trim();
    if (!trimmedName) {
      saveSnippetError = t("settings.nameRequired");
      return;
    }

    const exists = appState.cssSnippets.some(
      (s) => s.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (exists) {
      saveSnippetError = t("settings.duplicateNameError");
      return;
    }

    const newSnippet = {
      id: makeId(),
      name: trimmedName,
      css: customCSS,
      active: true,
      isPreset: false
    };

    appState.cssSnippets.push(newSnippet);
    await chrome.storage.local.set({
      [STORAGE_KEYS.cssSnippets]: appState.cssSnippets
    });

    customCSS = "";

    cssSnippets = [...appState.cssSnippets];
    if (snippetListRef) snippetListRef.refresh();
    window.dispatchEvent(new CustomEvent("bds:cssSnippetsChanged"));
    pushConfigToPage();

    showSaveSnippetModal = false;

    if (appState.ui) {
      appState.ui.showToast(t("settings.snippetSaved"));
    }
  }

  onMount(() => {
    chrome.storage.local.get("bds_locale_update_last_checked", (data) => {
      lastCheckedDate = data.bds_locale_update_last_checked || "";
    });
    formSnapshot = captureFormSnapshot();
  });

  async function checkLanguageUpdates() {
    if (updatingLanguages) return;
    updatingLanguages = true;

    chrome.runtime.sendMessage({ type: "BDS_UPDATE_LANGUAGES" }, (response) => {
      updatingLanguages = false;
      if (response && response.success) {
        chrome.storage.local.get("bds_locale_update_last_checked", (data) => {
          lastCheckedDate = data.bds_locale_update_last_checked || new Date().toLocaleDateString();
        });
        if (appState.ui) {
          appState.ui.showToast(t("settings.updatedSuccess"));
        }
      } else {
        if (appState.ui) {
          appState.ui.showToast(t("settings.updateFailed"));
        }
      }
    });
  }

  async function resetLanguageFactory() {
    chrome.runtime.sendMessage({ type: "BDS_RESET_LANGUAGES" }, (response) => {
      if (response && response.success) {
        lastCheckedDate = "";
        if (appState.ui) {
          appState.ui.showToast(t("settings.resetSuccess"));
        }
      } else {
        if (appState.ui) {
          appState.ui.showToast(t("settings.updateFailed"));
        }
      }
    });
  }

  export function refreshProject() {
    activeProject = getActiveProject();
    projectInstructions = activeProject?.customInstructions || "";
  }

  function scheduleProjectSave() {
    if (projectSaveTimer) clearTimeout(projectSaveTimer);
    projectSaveTimer = setTimeout(async () => {
      projectSaveTimer = null;
      const project = getActiveProject();
      if (!project) return;
      await updateProject(project.id, {
        customInstructions: projectInstructions,
      });
      pushConfigToPage();
    }, 600);
  }

  async function save() {
    // Ensure we are saving a plain array, not a Svelte proxy
    let snapshots = [];
    try {
      // @ts-ignore
      snapshots = $state.snapshot(customSystemPrompts);
    } catch (e) {
      snapshots = JSON.parse(JSON.stringify(customSystemPrompts));
    }

    appState.settings.customSystemPrompts = snapshots;
    appState.settings.activeSystemPromptId = activeSystemPromptId;
    appState.settings.systemPromptMultiMode = systemPromptMultiMode;
    let entriesSnapshot;
    try {
      entriesSnapshot = $state.snapshot(systemPromptEntries);
    } catch (e) {
      entriesSnapshot = JSON.parse(JSON.stringify(systemPromptEntries));
    }
    if (!Array.isArray(entriesSnapshot)) entriesSnapshot = [];
    appState.settings.systemPromptEntries = entriesSnapshot;

    // When "default" is active, ensure the stored prompt always reflects the
    // latest built-in default so subsequent page loads see the current version.
    if (activeSystemPromptId === "default") {
      appState.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    }

    appState.settings.systemPromptTemplateVersion =
      SYSTEM_PROMPT_TEMPLATE_VERSION;
    appState.settings.downloadBehaviorVersion = DOWNLOAD_BEHAVIOR_VERSION;
    appState.settings.autoDownloadFiles = autoFiles;
    appState.settings.autoDownloadLongWorkZip = autoZip;
    appState.settings.voiceMode = voiceMode;
    appState.settings.voiceLanguage = voiceLanguage;
    appState.settings.autoSubmitVoice = autoSubmitVoice;
    appState.settings.vadSilenceTimeout = Math.max(500, Math.min(3000, Math.round(vadSilenceTimeout)));
    appState.settings.preferredLang = preferredLang.trim();
    appState.settings.githubToken = githubToken.trim();
    appState.settings.disableSystemPrompt = disableSystemPrompt;
    appState.settings.systemPromptInjectionFrequency =
      systemPromptInjectionFrequency;
    appState.settings.systemPromptInjectionInterval =
      systemPromptInjectionInterval;
    appState.settings.disableMemory = disableMemory;
    appState.settings.htmlToMarkdownMaxDepth = Math.max(
      10,
      Math.floor(Number(htmlToMarkdownMaxDepth) || 200),
    );
    appState.settings.maxChatSessions = Math.max(
      10,
      Math.floor(Number(maxChatSessions) || 500),
    );
    appState.settings.tokenPriceDisplay = tokenPriceDisplay;
    appState.settings.showTimestamps = showTimestamps;
    appState.settings.collapseLongUserMessages = collapseLongUserMessages;
    appState.settings.loadAllHistoryOnSession = loadAllHistoryOnSession;
    appState.settings.projectRagEnabled = projectRagEnabled;
    appState.settings.projectRagLimit = Number(projectRagLimit) || 5;
    appState.settings.processGitignoreOnUpload = processGitignoreOnUpload;
    appState.settings.injectSystemDateTime = injectSystemDateTime;
    appState.settings.skipDeletionConfirmation = skipDeletionConfirmation;
    appState.settings.deepResearchDeepFetch = Math.max(0, Math.min(5, Math.round(Number(deepResearchDeepFetch) || 0)));
    // Never persist an empty provider list — fall back to the full default order.
    const enabledProviders = enabledSearchProviderIds();
    appState.settings.searchProviders = enabledProviders.length > 0
      ? enabledProviders
      : SEARCH_PROVIDER_CATALOG.map((provider) => provider.id);
    appState.settings.deepResearchContextGuardEnabled = deepResearchContextGuardEnabled;
    appState.settings.deepResearchContextLimitTokens = Math.max(16000, Math.min(1000000, Math.round(Number(deepResearchContextLimitTokens) || 128000)));
    appState.settings.deepResearchContextStopPercent = Math.max(50, Math.min(95, Math.round(Number(deepResearchContextStopPercent) || 70)));
    appState.settings.locale = locale;
    appState.settings.syncLocale = syncLocale;
    appState.settings.customCSS = customCSS;
    appState.settings.disableTipBox = disableTipBox;
    appState.settings.oledDarkMode = oledDarkMode;
    if (oledDarkMode && document.body.classList.contains("dark")) {
      document.documentElement.classList.add("bds-oled-dark");
      document.body.classList.add("bds-oled-dark");
    } else {
      document.documentElement.classList.remove("bds-oled-dark");
      document.body.classList.remove("bds-oled-dark");
    }
    appState.settings.mcpInlineMaxChars = Math.max(500, Math.min(100000, Math.round(Number(mcpInlineMaxChars) || 8000)));

    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: JSON.parse(JSON.stringify(appState.settings)),
    });
    if (!syncLocale) {
      i18n.setLocale(locale);
    }
    pushConfigToPage();

    formSnapshot = captureFormSnapshot();

    if (appState.ui) {
      appState.ui.showToast(t("settings.settingsSaved"));
    }

    onsave?.();
  }

  function openPromptEditor(prompt = null) {
    if (prompt) {
      editingPrompt = prompt;
      promptEditorName = prompt.name;
      promptEditorContent = prompt.content;
      promptEditorIsNew = false;
    } else {
      editingPrompt = null;
      promptEditorName = "";
      promptEditorContent = "";
      promptEditorIsNew = true;
    }
    showPromptEditor = true;
  }

  function closePromptEditor() {
    showPromptEditor = false;
    editingPrompt = null;
  }

  function savePrompt() {
    if (!promptEditorName.trim() || !promptEditorContent.trim()) {
      if (appState.ui) appState.ui.showToast(t("settings.nameRequired"));
      return;
    }

    if (promptEditorIsNew) {
      const newPrompt = {
        id: "sp_" + Math.random().toString(36).substring(2, 9),
        name: promptEditorName.trim(),
        content: promptEditorContent.trim()
      };
      customSystemPrompts = [...customSystemPrompts, newPrompt];
    } else if (editingPrompt) {
      customSystemPrompts = customSystemPrompts.map(p => 
        p.id === editingPrompt.id 
          ? { ...p, name: promptEditorName.trim(), content: promptEditorContent.trim() }
          : p
      );
    }
    
    closePromptEditor();
    save(); // Persist immediately
  }

  async function deletePrompt(id) {
    const prompt = customSystemPrompts.find(p => p.id === id);
    if (!prompt) return;
    if (!appState.settings?.skipDeletionConfirmation) {
      if (!(await appState.ui.showConfirm(`Delete system prompt "${prompt.name}"?`))) return;
    }
    if (activeSystemPromptId === id) {
      activeSystemPromptId = "default";
    }
    customSystemPrompts = customSystemPrompts.filter(p => p.id !== id);
    save(); // Persist immediately
  }

  function baseOnDefault() {
    promptEditorContent = appState.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  }

  function openMcpEditor(server = null) {
    if (server) {
      editingMcp = server;
      mcpEditorName = server.name;
      mcpEditorUrl = server.serverUrl;
      mcpEditorApiKey = server.apiKey || "";
      mcpEditorEnabled = server.enabled !== false;
      mcpEditorIsNew = false;
    } else {
      editingMcp = null;
      mcpEditorName = "";
      mcpEditorUrl = "";
      mcpEditorApiKey = "";
      mcpEditorEnabled = true;
      mcpEditorIsNew = true;
    }
    showMcpEditor = true;
  }

  function closeMcpEditor() {
    showMcpEditor = false;
    editingMcp = null;
  }

  async function saveMcpServer() {
    if (!mcpEditorName.trim() || !mcpEditorUrl.trim()) return;
    const entry = {
      id: editingMcp ? editingMcp.id : "mcp_" + Math.random().toString(36).substring(2, 9),
      name: mcpEditorName.trim(),
      serverUrl: mcpEditorUrl.trim(),
      apiKey: mcpEditorApiKey.trim(),
      enabled: mcpEditorEnabled,
      tools: editingMcp ? editingMcp.tools : [],
      createdAt: editingMcp ? editingMcp.createdAt : Date.now(),
    };
    if (mcpEditorIsNew) {
      mcpServers = [...mcpServers, entry];
    } else {
      mcpServers = mcpServers.map(s => s.id === entry.id ? entry : s);
    }
    const plain = JSON.parse(JSON.stringify(mcpServers));
    appState.mcpServers = plain;
    await chrome.storage.local.set({ [STORAGE_KEYS.mcpServers]: plain });
    await discoverMcpToolSchemas();
    pushConfigToPage();
    closeMcpEditor();
  }

  async function deleteMcpServer(id) {
    if (!appState.settings?.skipDeletionConfirmation) {
      if (!(await appState.ui.showConfirm(t('mcp.deleteConfirm', { name: mcpServers.find(s => s.id === id)?.name })))) return;
    }
    mcpServers = mcpServers.filter(s => s.id !== id);
    const plainDelete = JSON.parse(JSON.stringify(mcpServers));
    appState.mcpServers = plainDelete;
    await chrome.storage.local.set({ [STORAGE_KEYS.mcpServers]: plainDelete });
    await discoverMcpToolSchemas();
    pushConfigToPage();
  }

  async function toggleMcpEnabled(index) {
    if (!mcpServers[index]) return;
    mcpServers[index] = { ...mcpServers[index], enabled: !mcpServers[index].enabled };
    mcpServers = [...mcpServers];
    const plain = JSON.parse(JSON.stringify(mcpServers));
    appState.mcpServers = plain;
    await chrome.storage.local.set({ [STORAGE_KEYS.mcpServers]: plain });
    await discoverMcpToolSchemas();
    pushConfigToPage();
  }

  const MCP_PRESETS = [
    {
      name: "Brave Web Search",
      serverUrl: "https://api.search.brave.com/res/v1/mcp",
      apiKeyRequired: true,
      description: "Real-time web search and live news queries via Brave Search API",
      defaultTools: ["brave_web_search", "brave_local_search"]
    },
    {
      name: "Web Content Fetcher",
      serverUrl: "https://mcp.deepseek-tools.local/fetch",
      apiKeyRequired: false,
      description: "Extract clean article text and markdown from any web URL",
      defaultTools: ["fetch_html", "fetch_markdown"]
    },
    {
      name: "Weather & Time Clock",
      serverUrl: "https://mcp.deepseek-tools.local/weather",
      apiKeyRequired: false,
      description: "Global real-time forecasts, temperatures, and timezone clock",
      defaultTools: ["get_weather", "get_current_time"]
    },
    {
      name: "GitHub Explorer",
      serverUrl: "https://api.github.com/mcp",
      apiKeyRequired: false,
      description: "Browse GitHub repositories, inspect commits, files, and pull requests",
      defaultTools: ["search_repositories", "get_file_contents"]
    },
    {
      name: "Local Termux Bridge",
      serverUrl: "http://127.0.0.1:8080/sse",
      apiKeyRequired: false,
      description: "Connect to Android Termux local Python/Node development servers",
      defaultTools: ["run_command", "read_local_file"]
    }
  ];

  async function addPresetMcpServer(preset) {
    const existing = mcpServers.find(s => s.serverUrl === preset.serverUrl || s.name === preset.name);
    if (existing) {
      if (appState.ui) appState.ui.showToast(`${preset.name} is already added.`);
      openMcpEditor(existing);
      return;
    }

    if (preset.apiKeyRequired) {
      editingMcp = null;
      mcpEditorName = preset.name;
      mcpEditorUrl = preset.serverUrl;
      mcpEditorApiKey = "";
      mcpEditorEnabled = true;
      mcpEditorIsNew = true;
      showMcpEditor = true;
    } else {
      const entry = {
        id: "mcp_" + Math.random().toString(36).substring(2, 9),
        name: preset.name,
        serverUrl: preset.serverUrl,
        apiKey: "",
        enabled: true,
        tools: preset.defaultTools?.map(t => ({ name: t, description: "" })) || [],
        createdAt: Date.now(),
      };
      mcpServers = [...mcpServers, entry];
      const plain = JSON.parse(JSON.stringify(mcpServers));
      appState.mcpServers = plain;
      await chrome.storage.local.set({ [STORAGE_KEYS.mcpServers]: plain });
      await discoverMcpToolSchemas();
      pushConfigToPage();
      if (appState.ui) appState.ui.showToast(`${preset.name} activated!`);
    }
  }

  async function testMcpServer(index) {
    mcpTestingIndex = index;
    const server = mcpServers[index];
    if (!server) { mcpTestingIndex = -1; return; }
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "bds-mcp-list-tools", serverUrl: server.serverUrl, apiKey: server.apiKey || "" },
          (resp) => {
            if (resp?.ok) resolve(resp);
            else reject(new Error(resp?.error || "Connection failed"));
          }
        );
      });
      if (response.ok) {
        const tools = (Array.isArray(response.tools) ? response.tools : (response.tools?.tools || [])).map(t => ({
          name: t.name,
          description: t.description || "",
          inputSchema: t.inputSchema || {},
        }));
        mcpServers = mcpServers.map((s, idx) => idx === index ? { ...s, tools } : s);
        const plainTest = JSON.parse(JSON.stringify(mcpServers));
        appState.mcpServers = plainTest;
        await chrome.storage.local.set({ [STORAGE_KEYS.mcpServers]: plainTest });
        // Explicit "test connection": bypass the discovery cache so the schema
        // list reflects the server we just reached rather than a stale entry.
        await discoverMcpToolSchemas({ force: true });
        pushConfigToPage();
        if (appState.ui) appState.ui.showToast(t('mcp.connected', { count: tools.length }));
      }
    } catch (err) {
      if (appState.ui) appState.ui.showToast(t('mcp.testFailed', { message: err.message }));
    }
    mcpTestingIndex = -1;
  }

  function scheduleLabel(entry) {
    if (!entry.schedule) return t('settings.firstMessage');
    switch (entry.schedule.type) {
      case "first": return t('settings.firstMessage');
      case "always": return t('settings.everyMessage');
      case "interval": return t('settings.injectEveryN', { n: entry.schedule.everyNTurns || 3 });
      default: return t('settings.firstMessage');
    }
  }

  function openMultiEntryEditor(entry = null) {
    if (entry) {
      editingPrompt = entry;
      promptEditorName = entry.name;
      promptEditorContent = entry.content;
      promptEditorIsNew = false;
      multiEntryScheduleType = entry.schedule?.type || "first";
      multiEntryScheduleInterval = entry.schedule?.everyNTurns || 3;
      multiEntryEnabled = entry.enabled !== false;
    } else {
      editingPrompt = null;
      promptEditorName = "";
      promptEditorContent = "";
      promptEditorIsNew = true;
      multiEntryScheduleType = "first";
      multiEntryScheduleInterval = 3;
      multiEntryEnabled = true;
    }
    showPromptEditor = true;
  }

  function saveMultiEntry() {
    if (!promptEditorName.trim() || !promptEditorContent.trim()) {
      if (appState.ui) appState.ui.showToast(t('settings.nameRequired'));
      return;
    }

    if (promptEditorIsNew) {
      const newEntry = {
        id: "sp_" + Math.random().toString(36).substring(2, 9),
        name: promptEditorName.trim(),
        content: promptEditorContent.trim(),
        enabled: multiEntryEnabled,
        schedule: {
          type: multiEntryScheduleType,
          everyNTurns: multiEntryScheduleType === "interval" ? Math.max(1, Math.floor(Number(multiEntryScheduleInterval) || 3)) : 1,
        },
      };
      const current = Array.isArray(systemPromptEntries) ? systemPromptEntries : [];
      systemPromptEntries = [...current, newEntry];
    } else if (editingPrompt) {
      const current = Array.isArray(systemPromptEntries) ? systemPromptEntries : [];
      systemPromptEntries = current.map(e =>
        e.id === editingPrompt.id
          ? {
              ...e,
              name: promptEditorName.trim(),
              content: promptEditorContent.trim(),
              enabled: multiEntryEnabled,
              schedule: {
                type: multiEntryScheduleType,
                everyNTurns: multiEntryScheduleType === "interval" ? Math.max(1, Math.floor(Number(multiEntryScheduleInterval) || 3)) : 1,
              },
            }
          : e
      );
    }

    closePromptEditor();
    save();
  }

  async function deleteMultiEntry(id) {
    if (!appState.settings?.skipDeletionConfirmation) {
      if (!(await appState.ui.showConfirm(`Delete system prompt entry?`))) return;
    }
    const entries = Array.isArray(systemPromptEntries) ? systemPromptEntries : [];
    systemPromptEntries = entries.filter(e => e.id !== id);
    save();
  }

  function toggleMultiMode() {
    systemPromptMultiMode = !systemPromptMultiMode;
    if (systemPromptMultiMode) {
      const entries = Array.isArray(systemPromptEntries) ? systemPromptEntries : [];
      if (entries.length === 0) {
        const newEntries = [];
        newEntries.push({
          id: "sp_default",
          name: t('settings.defaultPromptName'),
          content: appState.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT,
          enabled: !disableSystemPrompt,
          schedule: {
            type: systemPromptInjectionFrequency === "every_x" ? "interval" : systemPromptInjectionFrequency,
            everyNTurns: Number(systemPromptInjectionInterval) || 3,
          },
        });
        for (const cp of (appState.settings.customSystemPrompts || [])) {
          newEntries.push({
            id: cp.id,
            name: cp.name,
            content: cp.content,
            enabled: cp.id === appState.settings.activeSystemPromptId,
            schedule: { type: "first", everyNTurns: 1 },
          });
        }
        systemPromptEntries = newEntries;
      }
    } else {
      const entries = Array.isArray(systemPromptEntries) ? systemPromptEntries : [];
      const firstEnabled = entries.find(e => e.enabled);
      if (firstEnabled) {
        customSystemPrompts = customSystemPrompts.filter(p => p.id === firstEnabled.id);
        if (!customSystemPrompts.find(p => p.id === firstEnabled.id)) {
          customSystemPrompts = [{
            id: firstEnabled.id,
            name: firstEnabled.name,
            content: firstEnabled.content,
          }, ...customSystemPrompts];
        }
        activeSystemPromptId = firstEnabled.id;
      }
    }
    save();
  }

  function getGithubTokenDisplayValue() {
    if (showGithubToken) {
      return githubToken;
    }

    if (!githubToken) {
      return "";
    }

    // Operational security: Don't show the actual token
    // when "Show" is not active. 
    // Instead, show a fixed number of mask characters to indicate
    // that a token is set without revealing it.
    return GITHUB_TOKEN_MASK_CHAR.repeat(999);
  }
</script>

{#if (activeTab === "settings" || activeTab === "all") && !searchQuery}
  <div class="bds-category-nav" role="tablist" aria-label="Settings categories">
    <button
      type="button"
      class="bds-category-pill"
      class:active={activeCategory === 'all'}
      onclick={() => activeCategory = 'all'}
    >
      <span class="bds-pill-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      </span>
      <span>All Settings</span>
    </button>
    <button
      type="button"
      class="bds-category-pill"
      class:active={activeCategory === 'general'}
      onclick={() => activeCategory = 'general'}
    >
      <span class="bds-pill-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
      </span>
      <span>General & UI</span>
    </button>
    <button
      type="button"
      class="bds-category-pill"
      class:active={activeCategory === 'chat'}
      onclick={() => activeCategory = 'chat'}
    >
      <span class="bds-pill-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><line x1="9" y1="9" x2="15" y2="9"></line><line x1="9" y1="13" x2="13" y2="13"></line></svg>
      </span>
      <span>Chat & Prompts</span>
    </button>
    <button
      type="button"
      class="bds-category-pill"
      class:active={activeCategory === 'research'}
      onclick={() => activeCategory = 'research'}
    >
      <span class="bds-pill-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      </span>
      <span>Deep Research</span>
    </button>
    <button
      type="button"
      class="bds-category-pill"
      class:active={activeCategory === 'mcp'}
      onclick={() => activeCategory = 'mcp'}
    >
      <span class="bds-pill-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
      </span>
      <span>MCP & Tools</span>
    </button>
    <button
      type="button"
      class="bds-category-pill"
      class:active={activeCategory === 'appearance'}
      onclick={() => activeCategory = 'appearance'}
    >
      <span class="bds-pill-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
      </span>
      <span>Appearance & CSS</span>
    </button>
    <button
      type="button"
      class="bds-category-pill"
      class:active={activeCategory === 'integrations'}
      onclick={() => activeCategory = 'integrations'}
    >
      <span class="bds-pill-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
      </span>
      <span>Integrations & API</span>
    </button>
    <button
      type="button"
      class="bds-category-pill"
      class:active={activeCategory === 'backup'}
      onclick={() => activeCategory = 'backup'}
    >
      <span class="bds-pill-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
      </span>
      <span>Backup & Storage</span>
    </button>
  </div>
{/if}

{#if isTabMatch('systemPrompts')}
<div class="bds-card bds-prompt-card-section open" style="margin-bottom: 14px;">
  <div class="bds-card-header bds-static-header">
    <div class="bds-card-header-left">
      <span class="bds-card-icon-badge bds-icon--purple">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><line x1="9" y1="9" x2="15" y2="9"></line><line x1="9" y1="13" x2="13" y2="13"></line></svg>
      </span>
      <div class="bds-card-title-group">
        <span class="bds-card-title">{t('settings.systemPrompts')}</span>
        <span class="bds-card-subtitle">Custom instructions and behavioral guidelines injected into model chats</span>
      </div>
    </div>
    <div class="bds-card-header-right">
      {#if !systemPromptMultiMode}
        {@const activeName = activeSystemPromptId === "default" ? t('settings.defaultPromptName') : customSystemPrompts.find(p => p.id === activeSystemPromptId)?.name || "Custom"}
        <span class="bds-card-badge bds-badge--active">{activeName}</span>
      {:else}
        {@const enabledCount = safeSystemPromptEntries.filter(e => e.enabled).length}
        <span class="bds-card-badge bds-badge--active">{enabledCount} Active</span>
      {/if}
    </div>
  </div>
  <div class="bds-card-body">
    <div class="bds-sub-inner">
<div class="bds-toggle-row" style="margin-bottom: 8px;">
  <span class="bds-toggle-label" style="font-size: 12px;">{t('settings.multiPromptMode')}</span>
  <label class="bds-switch">
    <input type="checkbox" checked={systemPromptMultiMode} onchange={toggleMultiMode} />
    <span class="bds-switch-track"></span>
  </label>
</div>

{#if systemPromptMultiMode}
  <div class="bds-list">
    {#each safeSystemPromptEntries as entry (entry.id)}
      <div class="bds-skill-item">
        <label class="bds-switch" style="margin-right: 8px; flex: none;">
          <input type="checkbox" checked={entry.enabled} onchange={() => {
            systemPromptEntries = (Array.isArray(systemPromptEntries) ? systemPromptEntries : []).map(e =>
              e.id === entry.id ? { ...e, enabled: !e.enabled } : e
            );
            save();
          }} />
          <span class="bds-switch-track"></span>
        </label>
        <div class="bds-prompt-info">
          <span class="bds-prompt-name">{entry.name}</span>
          <span class="bds-prompt-status">{scheduleLabel(entry)}</span>
        </div>
        <div class="bds-prompt-actions">
          <button class="bds-btn-outlined" style="font-size: 11px; padding: 4px 8px;" title={t('settings.edit')} onclick={() => openMultiEntryEditor(entry)}>
            {t('settings.edit')}
          </button>
          <button class="bds-btn-danger" title={t('settings.delete')} onclick={() => deleteMultiEntry(entry.id)}>
            {t('settings.delete')}
          </button>
        </div>
      </div>
    {/each}

    <button class="bds-add-prompt-btn" type="button" onclick={() => openMultiEntryEditor(null)}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="margin-right: 4px;"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      {t('settings.addNewPrompt')}
    </button>
  </div>
{:else}
  <div class="bds-list">
    <div class="bds-skill-item" class:active={activeSystemPromptId === "default"}>
      <label onclick={() => { activeSystemPromptId = "default"; save(); }} role="button" tabindex="0">
        <input type="radio" checked={activeSystemPromptId === "default"} readonly />
        <div class="bds-prompt-info">
          <span class="bds-prompt-name">{t('settings.defaultPromptName')}</span>
          <span class="bds-prompt-status">{t('settings.defaultPromptStatus')}</span>
        </div>
      </label>
      <div class="bds-prompt-actions">
        <button class="bds-btn-outlined" style="font-size: 11px; padding: 4px 8px;" title={t('settings.view')} onclick={() => openPromptEditor({ id: 'default', name: t('settings.defaultPromptName'), content: appState.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT, readonly: true })}>
          {t('settings.view')}
        </button>
      </div>
    </div>

    {#each customSystemPrompts as prompt (prompt.id)}
      <div class="bds-skill-item" class:active={activeSystemPromptId === prompt.id}>
        <label onclick={() => { activeSystemPromptId = prompt.id; save(); }} role="button" tabindex="0">
          <input type="radio" checked={activeSystemPromptId === prompt.id} readonly />
          <div class="bds-prompt-info">
            <span class="bds-prompt-name">{prompt.name}</span>
            <span class="bds-prompt-status">{t('settings.customPromptStatus')}</span>
          </div>
        </label>
        <div class="bds-prompt-actions">
          <button class="bds-btn-outlined" style="font-size: 11px; padding: 4px 8px;" title={t('settings.edit')} onclick={() => openPromptEditor(prompt)}>
            {t('settings.edit')}
          </button>
          <button class="bds-btn-danger" title={t('settings.delete')} onclick={() => deletePrompt(prompt.id)}>
            {t('settings.delete')}
          </button>
        </div>
      </div>
    {/each}

    <button class="bds-add-prompt-btn" type="button" onclick={() => openPromptEditor()}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="margin-right: 4px;"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      {t('settings.addNewPrompt')}
    </button>
  </div>
{/if}
    </div>
  </div>
</div>
{/if}

{#if showPromptEditor}
  <div class="bds-modal-overlay">
    <div class="bds-modal">
      <div class="bds-modal-header">
        <div class="ds-modal-content__title">
          {#if systemPromptMultiMode}
            {promptEditorIsNew ? t('settings.addNewTitle') : t('settings.editTitle')}
          {:else}
            {promptEditorIsNew ? t('settings.addNewTitle') : (editingPrompt?.readonly ? t('settings.viewTitle') : t('settings.editTitle'))}
          {/if}
        </div>
        <button class="bds-modal-close" onclick={closePromptEditor}>×</button>
      </div>
      
      <div class="bds-modal-body">
        <div class="bds-field">
          <label class="bds-label">{t('settings.nameLabel')}</label>
          <input type="text" class="bds-input" bind:value={promptEditorName} placeholder={t('settings.namePlaceholder')} readonly={editingPrompt?.readonly && !systemPromptMultiMode} />
        </div>

        {#if systemPromptMultiMode}
          <div class="bds-field">
            <label class="bds-label">{t('settings.scheduleType')}</label>
            <select class="bds-select" bind:value={multiEntryScheduleType}>
              <option value="first">{t('settings.firstMessage')}</option>
              <option value="always">{t('settings.everyMessage')}</option>
              <option value="interval">{t('settings.everyNMessages')}</option>
            </select>
          </div>

          {#if multiEntryScheduleType === "interval"}
            <div class="bds-field">
              <label class="bds-label">{t('settings.injectionInterval')}</label>
              <input type="number" min="2" class="bds-input" style="width: 100px;" bind:value={multiEntryScheduleInterval} />
              <p style="font-size: 10px; opacity: 0.5; margin: 2px 0 0;">
                {t('settings.injectEveryN', { n: multiEntryScheduleInterval })}
              </p>
            </div>
          {/if}

          <div class="bds-toggle-row" style="padding: 0;">
            <span class="bds-toggle-label">{t('settings.enabled')}</span>
            <label class="bds-switch">
              <input type="checkbox" bind:checked={multiEntryEnabled} />
              <span class="bds-switch-track"></span>
            </label>
          </div>
        {/if}
        
        <div class="bds-field">
          <div class="bds-label-row">
            <label class="bds-label">{t('settings.contentLabel')}</label>
            {#if !editingPrompt?.readonly || systemPromptMultiMode}
              <button class="bds-reset-btn" type="button" onclick={baseOnDefault}>{t('settings.baseOnDefault')}</button>
            {/if}
          </div>
          <textarea class="bds-input" style="min-height: 240px;" bind:value={promptEditorContent} placeholder={t('settings.contentPlaceholder')} readonly={editingPrompt?.readonly && !systemPromptMultiMode}></textarea>
        </div>
      </div>

      <div class="bds-modal-footer">
        <button class="bds-btn-outlined" onclick={closePromptEditor}>{t('settings.cancel')}</button>
        {#if !editingPrompt?.readonly || systemPromptMultiMode}
          <button class="bds-btn" onclick={systemPromptMultiMode ? saveMultiEntry : savePrompt}>{t('settings.savePrompt')}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if activeProject}
  <div class="bds-label-row" style="margin-top: 12px;">
    <label class="bds-label" for="bds-project-instructions">
      {t('settings.projectInstructions')} — <em style="font-weight: 400; opacity: 0.7;"
        >{activeProject.name}</em
      >
    </label>
  </div>
  <textarea
    id="bds-project-instructions"
    class="bds-input"
    spellcheck="false"
    bind:value={projectInstructions}
    oninput={scheduleProjectSave}
    placeholder={t('settings.projectInstructionsPlaceholder')}
  ></textarea>
  <p style="font-size: 10px; opacity: 0.5; margin: 2px 0 12px;">{t('settings.autoSaved')}</p>
{/if}

{#if activeTab === "all" || !activeTab}
<button
  type="button"
  class="bds-advanced-toggle"
  class:open={advancedOpen}
  onclick={() => (advancedOpen = !advancedOpen)}
>
  {t('settings.advancedSettings')}
  <span class="bds-chevron">
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </span>
</button>
{/if}

<div class="bds-advanced-content" class:open={advancedOpen || activeTab !== "all"}>
  {#if advancedOpen}
    <div class="bds-advanced-search-wrapper">
      <div class="bds-advanced-search-input-wrapper">
        <svg class="bds-advanced-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          class="bds-advanced-search-input"
          placeholder={t('settings.advancedSearchPlaceholder')}
          bind:value={advancedSearchQuery}
          onkeydown={handleAdvancedSearchKeydown}
        />
      </div>
      {#if advancedSearchQuery.trim().length > 0 && autocompleteItems.length > 0}
        <div class="bds-advanced-autocomplete">
          {#each autocompleteItems as item, i}
            <button
              type="button"
              class="bds-advanced-ac-item"
              class:selected={i === autocompleteSelectedIndex}
              onmousedown={(e) => handleAutocompleteMouseDown(e, i)}
              onmouseenter={() => { autocompleteSelectedIndex = i; }}
            >
              <span class="bds-advanced-ac-label">{item.label}</span>
              {#if item.type === 'setting'}
                <span class="bds-advanced-ac-section">— {item.parentLabel}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
      {#if advancedSearchQuery.trim().length > 0 && filteredSearchSections?.length === 0}
        <div class="bds-advanced-no-results">{t('settings.advancedNoResults')}</div>
      {/if}
    </div>
  {/if}
  <div class="bds-advanced-inner">
    <!-- Each sub-section visibility is controlled by isSectionMatch() when search is active -->
    {#if isSectionMatch('subLanguage')}
    <div class="bds-card" class:open={subLanguageOpen}>
      <button type="button" class="bds-card-header bds-sub-toggle" class:open={subLanguageOpen} onclick={() => subLanguageOpen = !subLanguageOpen} aria-expanded={subLanguageOpen}>
        <div class="bds-card-header-left">
          <span class="bds-card-icon-badge bds-icon--blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
          </span>
          <div class="bds-card-title-group">
            <span class="bds-card-title">{t('settings.subLanguage')}</span>
            <span class="bds-card-subtitle">Interface translation, deepseek synchronization, and preferred language</span>
          </div>
        </div>
        <div class="bds-card-header-right">
          <span class="bds-chevron">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
      </button>
      <div class="bds-card-body bds-sub-content" class:open={subLanguageOpen}>
<div class="bds-sub-inner">
        <div class="bds-toggle-row">
          <span class="bds-toggle-label">{t('settings.syncLocale')}</span>
          <label class="bds-switch">
            <input type="checkbox" bind:checked={syncLocale} />
            <span class="bds-switch-track"></span>
          </label>
        </div>

        {#if !syncLocale}
          <div class="bds-toggle-row">
            <span class="bds-toggle-label">{t('settings.selectLanguage')}</span>
            <select class="bds-select" bind:value={locale} style="width: 140px; max-width: 100%; box-sizing: border-box;">
              {#each availableLocaleCodes as code}
                <option value={code}>{i18n.getNativeName(code)}</option>
              {/each}
            </select>
          </div>
        {/if}

        <div class="bds-toggle-row" style="flex-direction: column; align-items: stretch; gap: 8px;">
          <div class="bds-lang-btn-group">
            <button type="button" class="bds-btn-outlined bds-lang-btn" onclick={checkLanguageUpdates} disabled={updatingLanguages}>
              {updatingLanguages ? t('common.working') : t('settings.checkUpdates')}
            </button>
            <button type="button" class="bds-btn-outlined bds-lang-btn bds-lang-reset-btn" onclick={resetLanguageFactory}>
              {t('settings.resetFactory')}
            </button>
          </div>
          {#if lastCheckedDate}
            <span style="font-size: 10px; opacity: 0.5; text-align: center; display: block; margin-top: 2px;">
              {t('settings.lastChecked').replace('{{date}}', lastCheckedDate)}
            </span>
          {/if}
        </div>

        <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 6px;">
          <span class="bds-toggle-label">{t('settings.preferredLang')}</span>
          <input id="bds-preferred-lang" type="text" class="bds-input" style="width: 100%; box-sizing: border-box;" placeholder={t('settings.preferredLangPlaceholder')} bind:value={preferredLang} />
          <p style="font-size: 10px; opacity: 0.5; margin: 0;">
            {t('settings.preferredLangHint')}
          </p>
        </div>
      </div>
    </div>
    </div>
    {/if}

    {#if isSectionMatch('subChat')}
    <div class="bds-card" class:open={subChatOpen}>
      <button type="button" class="bds-card-header bds-sub-toggle" class:open={subChatOpen} onclick={() => subChatOpen = !subChatOpen} aria-expanded={subChatOpen}>
        <div class="bds-card-header-left">
          <span class="bds-card-icon-badge bds-icon--green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          </span>
          <div class="bds-card-title-group">
            <span class="bds-card-title">{t('settings.subChat')}</span>
            <span class="bds-card-subtitle">Message display options, history sync, and session capacity</span>
          </div>
        </div>
        <div class="bds-card-header-right">
          <span class="bds-chevron">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
      </button>
      <div class="bds-card-body bds-sub-content" class:open={subChatOpen}>
<div class="bds-sub-inner">
        <div class="bds-toggle-row">
          <span class="bds-toggle-label">{t('settings.collapseLongUserMessages')}</span>
          <label class="bds-switch">
            <input id="bds-collapse-user-messages" type="checkbox" bind:checked={collapseLongUserMessages} />
            <span class="bds-switch-track"></span>
          </label>
        </div>

        <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 6px;">
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px;">
            <span class="bds-toggle-label">{t('settings.loadAllHistoryOnSession')}</span>
            <label class="bds-switch">
              <input id="bds-load-all-history" type="checkbox" bind:checked={loadAllHistoryOnSession} />
              <span class="bds-switch-track"></span>
            </label>
          </div>
          <p style="font-size: 10px; opacity: 0.5; margin: 0;">
            {t('settings.loadAllHistoryHint')}
          </p>
        </div>

        <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 6px;">
          <span class="bds-toggle-label">{t('settings.chatSessionCap')}</span>
          <input id="bds-max-chat-sessions" type="number" min="10" step="50" class="bds-input" style="width: 120px; box-sizing: border-box;" bind:value={maxChatSessions} />
          <p style="font-size: 10px; opacity: 0.5; margin: 0;">
            {t('settings.chatSessionCapHint')}
          </p>
        </div>
      </div>
    </div>
    </div>
    {/if}

    {#if isSectionMatch('subProjects')}
    <div class="bds-card" class:open={subProjectsOpen}>
      <button type="button" class="bds-card-header bds-sub-toggle" class:open={subProjectsOpen} onclick={() => subProjectsOpen = !subProjectsOpen} aria-expanded={subProjectsOpen}>
        <div class="bds-card-header-left">
          <span class="bds-card-icon-badge bds-icon--teal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          </span>
          <div class="bds-card-title-group">
            <span class="bds-card-title">{t('settings.subProjects')}</span>
            <span class="bds-card-subtitle">Context retrieval (RAG), .gitignore filtering, and file download behaviors</span>
          </div>
        </div>
        <div class="bds-card-header-right">
          <span class="bds-chevron">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
      </button>
      <div class="bds-card-body bds-sub-content" class:open={subProjectsOpen}>
<div class="bds-sub-inner">
        <div class="bds-toggle-row">
          <span class="bds-toggle-label">{t('settings.projectAutoContext')}</span>
          <label class="bds-switch">
            <input id="bds-project-rag" type="checkbox" bind:checked={projectRagEnabled} />
            <span class="bds-switch-track"></span>
          </label>
        </div>

        {#if projectRagEnabled}
          <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 6px; padding-left: 12px; border-left: 2px solid rgba(255, 255, 255, 0.1); margin-left: 4px;">
            <span class="bds-toggle-label">{t('settings.ragChunks')}</span>
            <select class="bds-select" bind:value={projectRagLimit}>
              <option value={3}>{t('settings.ragChunks3')}</option>
              <option value={5}>{t('settings.ragChunks5')}</option>
              <option value={8}>{t('settings.ragChunks8')}</option>
              <option value={10}>{t('settings.ragChunks10')}</option>
            </select>
            <p style="font-size: 10px; opacity: 0.5; margin: 0;">
              {t('settings.ragHint')}
            </p>
          </div>
        {/if}

        <div class="bds-toggle-row" style="flex-wrap: wrap;">
          <span class="bds-toggle-label">{t('settings.processGitignore')}</span>
          <label class="bds-switch">
            <input id="bds-gitignore-upload" type="checkbox" bind:checked={processGitignoreOnUpload} />
            <span class="bds-switch-track"></span>
          </label>
        </div>

        <div class="bds-toggle-row">
          <span class="bds-toggle-label">{t('settings.autoDownloadFiles')}</span>
          <label class="bds-switch">
            <input id="bds-auto-files" type="checkbox" bind:checked={autoFiles} />
            <span class="bds-switch-track"></span>
          </label>
        </div>

        <div class="bds-toggle-row">
          <span class="bds-toggle-label">{t('settings.autoDownloadZip')}</span>
          <label class="bds-switch">
            <input id="bds-auto-zip" type="checkbox" bind:checked={autoZip} />
            <span class="bds-switch-track"></span>
          </label>
        </div>
      </div>
    </div>
    </div>
    {/if}

    {#if isSectionMatch('subInjection')}
    <div class="bds-card" class:open={subInjectionOpen}>
      <button type="button" class="bds-card-header bds-sub-toggle" class:open={subInjectionOpen} onclick={() => subInjectionOpen = !subInjectionOpen} aria-expanded={subInjectionOpen}>
        <div class="bds-card-header-left">
          <span class="bds-card-icon-badge bds-icon--amber">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          </span>
          <div class="bds-card-title-group">
            <span class="bds-card-title">{t('settings.subInjection')}</span>
            <span class="bds-card-subtitle">Prompt frequency, automated memory injection, and temporal context</span>
          </div>
        </div>
        <div class="bds-card-header-right">
          <span class="bds-chevron">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
      </button>
      <div class="bds-card-body bds-sub-content" class:open={subInjectionOpen}>
<div class="bds-sub-inner">
        <div class="bds-toggle-row">
          <span class="bds-toggle-label">{t('settings.disableSystemPrompt')}</span>
          <label class="bds-switch">
            <input id="bds-disable-prompt" type="checkbox" bind:checked={disableSystemPrompt} />
            <span class="bds-switch-track"></span>
          </label>
        </div>

        <div class="bds-toggle-row">
          <span class="bds-toggle-label">{t('settings.disableMemory')}</span>
          <label class="bds-switch">
            <input id="bds-disable-memory" type="checkbox" bind:checked={disableMemory} />
            <span class="bds-switch-track"></span>
          </label>
        </div>

        <div class="bds-toggle-row">
          <span class="bds-toggle-label">{t('settings.injectSystemDateTime')}</span>
          <label class="bds-switch">
            <input id="bds-inject-datetime" type="checkbox" bind:checked={injectSystemDateTime} />
            <span class="bds-switch-track"></span>
          </label>
        </div>

        <div class="bds-toggle-row">
          <span class="bds-toggle-label">{t('settings.skipDeletionConfirmation')}</span>
          <label class="bds-switch">
            <input id="bds-skip-deletion-confirm" type="checkbox" bind:checked={skipDeletionConfirmation} />
            <span class="bds-switch-track"></span>
          </label>
        </div>

        <div class="bds-toggle-row">
          <span class="bds-toggle-label">{t('settings.injectionFrequency')}</span>
          <select class="bds-select" bind:value={systemPromptInjectionFrequency}>
            <option value="first">{t('settings.firstMessage')}</option>
            <option value="always">{t('settings.everyMessage')}</option>
            <option value="every_x">{t('settings.everyNMessages')}</option>
          </select>
        </div>

        {#if systemPromptInjectionFrequency === "every_x"}
          <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 6px; padding-left: 12px; border-left: 2px solid rgba(255, 255, 255, 0.1); margin-left: 4px;">
            <span class="bds-toggle-label">{t('settings.injectionInterval')}</span>
            <input id="bds-injection-interval" type="number" min="2" class="bds-input" style="width: 100px; box-sizing: border-box;" bind:value={systemPromptInjectionInterval} />
            <p style="font-size: 10px; opacity: 0.5; margin: 0;">
              {t('settings.injectEveryN', { n: systemPromptInjectionInterval })}
            </p>
          </div>
        {/if}
      </div>
    </div>
    </div>
    {/if}

    {#if isSectionMatch('subResearch')}
    <div class="bds-card" class:open={subResearchOpen}>
      <button type="button" class="bds-card-header bds-sub-toggle" class:open={subResearchOpen} onclick={() => subResearchOpen = !subResearchOpen} aria-expanded={subResearchOpen}>
        <div class="bds-card-header-left">
          <span class="bds-card-icon-badge bds-icon--indigo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </span>
          <div class="bds-card-title-group">
            <span class="bds-card-title">{t('settings.subResearch')}</span>
            <span class="bds-card-subtitle">Deep research page fetching, search providers, and context token guard</span>
          </div>
        </div>
        <div class="bds-card-header-right">
          <span class="bds-chevron">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
      </button>
      <div class="bds-card-body bds-sub-content" class:open={subResearchOpen}>
<div class="bds-sub-inner">
        <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 6px;">
          <span class="bds-toggle-label">Deep Fetch per Search</span>
          <input id="bds-deep-research-deep-fetch" type="number" min="0" max="5" step="1" class="bds-input" style="width: 80px; box-sizing: border-box;" bind:value={deepResearchDeepFetch} />
          <p style="font-size: 10px; opacity: 0.5; margin: 0;">
            How many top search results Deep Research opens and adds as page evidence for each search step. Higher values improve source detail but spend context fast and may stop long runs earlier. Use 0 for results only, 1 for long research, 3+ for short high-detail runs.
          </p>
        </div>

        <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 6px;">
          <span class="bds-toggle-label">{t('settings.searchProviders')}</span>
          <div class="bds-search-provider-list" role="list">
            {#each searchProviderRows as row, index (row.id)}
              <div class="bds-search-provider-row" role="listitem">
                <label class="bds-search-provider-label">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    disabled={row.enabled && activeSearchProviderCount <= 1}
                    onchange={() => toggleSearchProvider(row)}
                  />
                  <span>{t(row.labelKey)}</span>
                </label>
                <span class="bds-search-provider-controls">
                  <button
                    type="button"
                    class="bds-search-provider-move"
                    aria-label={t('settings.providerMoveUp')}
                    title={t('settings.providerMoveUp')}
                    disabled={index === 0 || searchProviderRows[index - 1].enabled !== row.enabled}
                    onclick={() => moveSearchProvider(index, -1)}
                  >↑</button>
                  <button
                    type="button"
                    class="bds-search-provider-move"
                    aria-label={t('settings.providerMoveDown')}
                    title={t('settings.providerMoveDown')}
                    disabled={index === searchProviderRows.length - 1 || searchProviderRows[index + 1].enabled !== row.enabled}
                    onclick={() => moveSearchProvider(index, 1)}
                  >↓</button>
                </span>
              </div>
            {/each}
          </div>
          <p style="font-size: 10px; opacity: 0.5; margin: 0;">{t('settings.searchProvidersHint')}</p>
        </div>

        <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 6px;">
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px;">
            <span class="bds-toggle-label">{t('settings.contextGuardEnabled')}</span>
            <label class="bds-switch">
              <input id="bds-context-guard-enabled" type="checkbox" bind:checked={deepResearchContextGuardEnabled} />
              <span class="bds-switch-track"></span>
            </label>
          </div>
          <p style="font-size: 10px; opacity: 0.5; margin: 0;">
            {t('settings.contextGuardEnabledHint')}
          </p>
        </div>

        {#if deepResearchContextGuardEnabled}
          <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 6px;">
            <span class="bds-toggle-label">{t('settings.contextGuardLimit')}</span>
            <input id="bds-context-guard-limit" type="number" min="16000" max="1000000" step="1000" class="bds-input" style="width: 140px; box-sizing: border-box;" bind:value={deepResearchContextLimitTokens} />
            <p style="font-size: 10px; opacity: 0.5; margin: 0;">
              {t('settings.contextGuardLimitHint')}
            </p>
          </div>

          <div class="bds-toggle-row">
            <span class="bds-toggle-label">{t('settings.contextGuardStopPercent')}</span>
            <div class="bds-slider-group">
              <input type="range" min="50" max="95" step="1" bind:value={deepResearchContextStopPercent} class="bds-slider" />
              <span class="bds-slider-value">{deepResearchContextStopPercent}%</span>
            </div>
          </div>
          <p style="font-size: 10px; opacity: 0.5; margin: -4px 0 8px; padding-left: 0;">
            {t('settings.contextGuardStopPercentHint', { threshold: Math.floor(deepResearchContextLimitTokens * deepResearchContextStopPercent / 100).toLocaleString() })}
          </p>
        {/if}
      </div>
    </div>
    </div>
    {/if}

    {#if isSectionMatch('subDeepCode')}
    <div class="bds-card" class:open={subDeepCodeOpen}>
      <button type="button" class="bds-card-header bds-sub-toggle" class:open={subDeepCodeOpen} onclick={() => subDeepCodeOpen = !subDeepCodeOpen} aria-expanded={subDeepCodeOpen}>
        <div class="bds-card-header-left">
          <span class="bds-card-icon-badge bds-icon--blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
          </span>
          <div class="bds-card-title-group">
            <span class="bds-card-title">{t('settings.deepCode') || 'Deep Code & Harness'}</span>
            <span class="bds-card-subtitle">{t('settings.deepCodeDesc') || 'Autonomous workspace indexing & Harness coding agent'}</span>
          </div>
        </div>
        <div class="bds-card-header-right">
          <span class="bds-chevron">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
      </button>
      <div class="bds-card-body bds-sub-content" class:open={subDeepCodeOpen}>
        <div class="bds-sub-inner">
          <div class="bds-toggle-row">
            <div>
              <span class="bds-toggle-label">{t('deepCodeToggle.enableToggle') || 'Enable Deep Code'}</span>
              <p class="bds-toggle-desc">{t('deepCodeToggle.integrationDesc') || 'Inject codebase context & enable DeepSeek Harness local tasks.'}</p>
            </div>
            <label class="bds-ios-switch">
              <input type="checkbox" checked={deepCodeEnabled} onchange={toggleDeepCodeSetting} />
              <span class="bds-ios-slider"></span>
            </label>
          </div>

          <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
              <div>
                <span class="bds-toggle-label">{t('deepCodeModal.activeCodebase') || 'Active Codebase'}</span>
                {#if deepCodeActiveDir}
                  <p class="bds-toggle-desc" style="color: #10b981; margin: 2px 0 0;">● {deepCodeActiveDir} ({deepCodeFileCount} files)</p>
                {:else}
                  <p class="bds-toggle-desc" style="margin: 2px 0 0;">No folder linked yet.</p>
                {/if}
              </div>
              <button type="button" class="bds-btn" style="padding: 6px 14px; font-size: 11px;" onclick={openDeepCodeModal}>
                {t('deepCodeModal.linkFolder') || 'Manage...'}
              </button>
            </div>
            {#if deepCodeManualPath}
              <p style="font-family: monospace; font-size: 11px; opacity: 0.7; margin: 0;">{deepCodeManualPath}</p>
            {/if}
          </div>
        </div>
      </div>
    </div>
    {/if}

    {#if isSectionMatch('subIntegrations')}
    <div class="bds-card" class:open={subIntegrationsOpen}>
      <button type="button" class="bds-card-header bds-sub-toggle" class:open={subIntegrationsOpen} onclick={() => subIntegrationsOpen = !subIntegrationsOpen} aria-expanded={subIntegrationsOpen}>
        <div class="bds-card-header-left">
          <span class="bds-card-icon-badge bds-icon--slate">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
          </span>
          <div class="bds-card-title-group">
            <span class="bds-card-title">{t('settings.subIntegrations')}</span>
            <span class="bds-card-subtitle">GitHub token access, markdown depth, and token pricing estimation</span>
          </div>
        </div>
        <div class="bds-card-header-right">
          <span class="bds-chevron">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
      </button>
      <div class="bds-card-body bds-sub-content" class:open={subIntegrationsOpen}>
<div class="bds-sub-inner">
        <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 6px;">
          <span class="bds-toggle-label">{t('settings.markdownMaxDepth')}</span>
          <input id="bds-html-md-depth" type="number" min="10" step="10" class="bds-input" style="width: 120px; box-sizing: border-box;" bind:value={htmlToMarkdownMaxDepth} />
          <p style="font-size: 10px; opacity: 0.5; margin: 0;">
            {t('settings.markdownMaxDepthHint')}
          </p>
        </div>

        <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
          <span class="bds-toggle-label">{t('settings.githubToken')}</span>
          <div class="bds-token-field">
            <input id="bds-github-token" type="text" class="bds-input bds-token-text" style="width: 100%; box-sizing: border-box;" placeholder={t('settings.githubTokenPlaceholder')} value={getGithubTokenDisplayValue()} readonly={!showGithubToken} oninput={(e) => { if (showGithubToken) { githubToken = e.currentTarget.value; } }} autocomplete="off" autocapitalize="off" spellcheck="false" />
            <div class="bds-token-actions">
              <button type="button" class="bds-btn-outlined bds-token-btn" onclick={() => (showGithubToken = !showGithubToken)}>
                {showGithubToken ? t('settings.githubTokenHide') : t('settings.githubTokenShow')}
              </button>
              <button type="button" class="bds-btn-outlined bds-token-btn" onclick={() => { githubToken = ""; showGithubToken = true; }} disabled={!githubToken}>
                {t('settings.githubTokenClear')}
              </button>
            </div>
          </div>
          <p class="bds-token-help">
            {t('settings.githubTokenHelp')}
          </p>
        </div>

        <div class="bds-toggle-row">
          <span class="bds-toggle-label">{t('settings.tokenPriceEstimation')}</span>
          <label class="bds-switch">
            <input id="bds-token-price" type="checkbox" bind:checked={tokenPriceDisplay} />
            <span class="bds-switch-track"></span>
          </label>
        </div>
        <p style="font-size: 10px; opacity: 0.5; margin: -8px 0 8px; padding-left: 0;">
          {t('settings.tokenPriceHint')}
        </p>

        <div class="bds-toggle-row">
          <span class="bds-toggle-label">{t('settings.showTimestamps')}</span>
          <label class="bds-switch">
            <input id="bds-show-timestamps" type="checkbox" bind:checked={showTimestamps} />
            <span class="bds-switch-track"></span>
          </label>
        </div>
        <p style="font-size: 10px; opacity: 0.5; margin: -8px 0 8px; padding-left: 0;">
          {t('settings.showTimestampsHint')}
        </p>
      </div>
    </div>
    </div>
    {/if}

    {#if isSectionMatch('subCSS')}
    <div class="bds-card" class:open={subCSSOpen}>
      <button type="button" class="bds-card-header bds-sub-toggle" class:open={subCSSOpen} onclick={() => subCSSOpen = !subCSSOpen} aria-expanded={subCSSOpen}>
        <div class="bds-card-header-left">
          <span class="bds-card-icon-badge bds-icon--pink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          </span>
          <div class="bds-card-title-group">
            <span class="bds-card-title">{t('settings.subCSS')}</span>
            <span class="bds-card-subtitle">Custom CSS theme overrides and reusable style snippets</span>
          </div>
        </div>
        <div class="bds-card-header-right">
          <span class="bds-chevron">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
      </button>
      <div class="bds-card-body bds-sub-content" class:open={subCSSOpen}>
<div class="bds-sub-inner">
        <div class="bds-toggle-row">
          <span class="bds-toggle-label">Pure OLED #000000 Dark Mode</span>
          <label class="bds-switch">
            <input id="bds-oled-dark-mode" type="checkbox" bind:checked={oledDarkMode} onchange={() => {
              if (oledDarkMode && document.body.classList.contains("dark")) {
                document.documentElement.classList.add("bds-oled-dark");
                document.body.classList.add("bds-oled-dark");
              } else {
                document.documentElement.classList.remove("bds-oled-dark");
                document.body.classList.remove("bds-oled-dark");
              }
            }} />
            <span class="bds-switch-track"></span>
          </label>
        </div>
        <p style="font-size: 10px; opacity: 0.5; margin: -8px 0 12px; padding-left: 0;">
          Pure black background for OLED/AMOLED screens to maximize contrast and battery efficiency.
        </p>

        <div class="bds-toggle-row" style="flex-direction: column; align-items: stretch; gap: 0;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
            {#if editingSnippetId}
              {@const activeSnippet = appState.cssSnippets.find(s => s.id === editingSnippetId)}
              {#if activeSnippet}
                {@const displayName = activeSnippet.name.startsWith('preset') ? t('settings.' + activeSnippet.name) : activeSnippet.name}
                <div class="bds-editing-badge">
                  <span>{t('settings.editingSnippet', { name: displayName })}</span>
                  <button type="button" class="bds-exit-edit-btn" onclick={cancelEditSnippet}>
                    {t('settings.exitEditMode')} ×
                  </button>
                </div>
              {/if}
            {/if}
          </div>
          <textarea class="bds-input bds-css-editor" spellcheck="false" bind:value={customCSS} placeholder={t('settings.customCSSPlaceholder')}></textarea>
          <div class="bds-css-toolbar" class:open={isSnippetsOpen}>
            <button type="button" class="bds-css-toggle-btn" class:active={isSnippetsOpen} onclick={() => isSnippetsOpen = !isSnippetsOpen}>
              <svg class="bds-snippets-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              <span>{t('settings.manageSnippets')}</span>
              {#if activeSnippetsCount > 0}
                <span class="bds-snippets-badge">{activeSnippetsCount}</span>
              {/if}
              <svg class="bds-chevron {isSnippetsOpen ? 'bds-chevron-rotated' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <button type="button" class="bds-btn-outlined bds-save-snippet-btn" disabled={!customCSS || !customCSS.trim()} onclick={editingSnippetId ? updateSnippet : saveAsSnippet}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              {editingSnippetId ? t('settings.updateSnippet') : t('settings.saveAsSnippet')}
            </button>
          </div>
          <SnippetList bind:this={snippetListRef} bind:isOpen={isSnippetsOpen} onedit={editSnippet} />
        </div>
      </div>
    </div>
    </div>
    {/if}

    {#if isSectionMatch('subMcp')}
    <div class="bds-card" class:open={subMcpOpen}>
      <button type="button" class="bds-card-header bds-sub-toggle" class:open={subMcpOpen} onclick={() => subMcpOpen = !subMcpOpen} aria-expanded={subMcpOpen}>
        <div class="bds-card-header-left">
          <span class="bds-card-icon-badge bds-icon--violet">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          </span>
          <div class="bds-card-title-group">
            <span class="bds-card-title">{t('mcp.sectionTitle')}</span>
            <span class="bds-card-subtitle">Model Context Protocol servers for tools and integrations</span>
          </div>
        </div>
        <div class="bds-card-header-right">
          <span class="bds-chevron">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
      </button>
      <div class="bds-card-body bds-sub-content" class:open={subMcpOpen}>
<div class="bds-sub-inner">
        <div class="bds-mcp-intro-box">
          <p style="font-size: 12px; margin: 0 0 4px; font-weight: 500; color: var(--bds-text-primary);">{t('mcp.description')}</p>
          <p style="font-size: 11px; opacity: 0.65; margin: 0 0 10px; line-height: 1.4;">{t('mcp.transportNote')}</p>
        </div>

        <!-- 1-Tap Preset MCP Servers -->
        <div class="bds-mcp-presets-header">
          <span class="bds-mcp-presets-title">Preset MCP Servers (1-Tap Activation)</span>
          <span class="bds-mcp-presets-hint">Instantly activate curated mobile-optimized MCP servers and tool plugins:</span>
        </div>
        <div class="bds-mcp-presets-grid">
          {#each MCP_PRESETS as preset}
            {@const isAdded = mcpServers.some(s => s.serverUrl === preset.serverUrl || s.name === preset.name)}
            <div class="bds-mcp-preset-card">
              <div class="bds-mcp-preset-info">
                <div class="bds-mcp-preset-name-row">
                  <span class="bds-mcp-preset-name">{preset.name}</span>
                  {#if preset.apiKeyRequired}
                    <span class="bds-mcp-key-badge">API Key</span>
                  {:else}
                    <span class="bds-mcp-free-badge">Ready</span>
                  {/if}
                </div>
                <span class="bds-mcp-preset-desc">{preset.description}</span>
              </div>
              <button
                type="button"
                class="bds-mcp-preset-add-btn"
                class:bds-mcp-preset-active={isAdded}
                onclick={() => addPresetMcpServer(preset)}
                title="Activate {preset.name}"
              >
                {#if isAdded}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span>Active</span>
                {:else}
                  + Activate
                {/if}
              </button>
            </div>
          {/each}
        </div>

        {#if mcpServers.length === 0}
          <div class="bds-mcp-empty-notice">
            <span style="font-size: 12px; opacity: 0.7;">No custom MCP servers configured yet. Add a custom MCP server below!</span>
          </div>
        {/if}

        {#each mcpServers as server, i}
          <div class="bds-mcp-server-card">
            <div class="bds-mcp-card-header">
              <div class="bds-mcp-status-pill">
                <span class="bds-mcp-status-dot" class:connected={server.tools && server.tools.length > 0} class:disabled={server.enabled === false}></span>
                <span class="bds-mcp-server-name">{server.name}</span>
                <span class="bds-mcp-badge" class:has-tools={server.tools && server.tools.length > 0}>
                  {server.tools?.length ? `${server.tools.length} tools` : 'Untested'}
                </span>
              </div>
              <label class="bds-switch" title={server.enabled !== false ? 'Enabled' : 'Disabled'}>
                <input type="checkbox" checked={server.enabled !== false} onchange={() => toggleMcpEnabled(i)} />
                <span class="bds-switch-track"></span>
              </label>
            </div>

            <div class="bds-mcp-url-display">
              <code>{server.serverUrl}</code>
            </div>

            <div class="bds-prompt-actions" style="margin-top: 8px;">
              <button type="button" class="bds-btn-outlined" style="font-size: 11px; padding: 4px 10px;" onclick={() => testMcpServer(i)} disabled={mcpTestingIndex === i}>
                {#if mcpTestingIndex === i}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> {t('mcp.testLoading')}
                {:else}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> {t('mcp.test')}
                {/if}
              </button>
              <button type="button" class="bds-btn-outlined" style="font-size: 11px; padding: 4px 10px;" onclick={() => openMcpEditor(server)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg> {t('mcp.edit')}
              </button>
              <button type="button" class="bds-btn-danger" style="font-size: 11px; padding: 4px 8px;" onclick={() => deleteMcpServer(server.id)} aria-label="Delete MCP Server">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>

            {#if server.tools && server.tools.length > 0}
              <details class="bds-mcp-tools-details">
                <summary class="bds-mcp-tools-summary">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> View {server.tools.length} available tools
                </summary>
                <div class="bds-mcp-tools-grid">
                  {#each server.tools as tool}
                    <div class="bds-mcp-tool-pill">
                      <strong>{tool.name}</strong>
                      {#if tool.description}
                        <span class="bds-mcp-tool-desc">{tool.description}</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </details>
            {/if}
          </div>
        {/each}

        <button type="button" class="bds-add-prompt-btn" style="margin-top: 10px;" onclick={() => openMcpEditor()}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="margin-right: 6px;"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          {t('mcp.addServer')}
        </button>

        <div class="bds-toggle-row" style="flex-direction: column; align-items: flex-start; gap: 6px; margin-top: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px; min-width: 0; box-sizing: border-box;">
            <span class="bds-toggle-label">{t('mcp.inlineMaxChars')}</span>
            <input id="bds-mcp-inline-max-chars" type="number" min="500" max="100000" step="500" class="bds-input" style="width: 110px; flex-shrink: 0; box-sizing: border-box;" bind:value={mcpInlineMaxChars} />
          </div>
          <p style="font-size: 11px; opacity: 0.6; margin: 0; width: 100%; box-sizing: border-box;">
            {t('mcp.inlineMaxCharsHint')}
          </p>
        </div>
      </div>
    </div>
    </div>
    {/if}

    {#if isSectionMatch('subUtilities')}
    <div class="bds-card" class:open={subUtilitiesOpen}>
      <button type="button" class="bds-card-header bds-sub-toggle" class:open={subUtilitiesOpen} onclick={() => subUtilitiesOpen = !subUtilitiesOpen} aria-expanded={subUtilitiesOpen}>
        <div class="bds-card-header-left">
          <span class="bds-card-icon-badge bds-icon--cyan">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
          </span>
          <div class="bds-card-title-group">
            <span class="bds-card-title">{t('settings.subUtilities')}</span>
            <span class="bds-card-subtitle">API playground workbench, tips, and full JSON backup & restore</span>
          </div>
        </div>
        <div class="bds-card-header-right">
          <span class="bds-chevron">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
      </button>
      <div class="bds-card-body bds-sub-content" class:open={subUtilitiesOpen}>
<div class="bds-sub-inner">
        <div class="bds-toggle-row" role="button" tabindex="0" onclick={onapiplayground} onkeydown={(e) => e.key === 'Enter' && onapiplayground?.()} style="cursor: pointer;">
          <span class="bds-toggle-label">API Playground</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>

        <div class="bds-toggle-row">
          <div>
            <span class="bds-toggle-label">{t('settings.disableTipBox')}</span>
            <p style="font-size: 10px; opacity: 0.5; margin: 2px 0 0;">{t('settings.disableTipBoxHint')}</p>
          </div>
          <label class="bds-switch">
            <input type="checkbox" bind:checked={disableTipBox} />
            <span class="bds-switch-track"></span>
          </label>
        </div>

        <div class="bds-export-section">
          <span>{t('drawer.exportAll')} / {t('drawer.importAll')}</span>
          <div class="bds-export-buttons">
            <button type="button" class="bds-btn-outlined" onclick={openExportAllModal}>
              {t('drawer.exportAll')}
            </button>
            <button type="button" class="bds-btn-outlined" onclick={triggerImportAll}>
              {t('drawer.importAll')}
            </button>
            <input type="file" accept=".json" style="display: none;" bind:this={importAllFileInput} onchange={handleImportAll} />
          </div>
        </div>
      </div>
    </div>
    </div>
    {/if}
  </div>
</div>

{#if showUnsavedModal}
  <div class="bds-modal-overlay">
    <div class="bds-modal bds-unsaved-modal">
      <div class="bds-modal-header">
        <div class="ds-modal-content__title">{t('settings.unsavedTitle')}</div>
      </div>
      <div class="bds-modal-body">
        <p style="margin: 0; font-size: 14px; opacity: 0.85;">{t('settings.unsavedMessage')}</p>
      </div>
      <div class="bds-modal-footer">
        <button class="bds-btn-outlined" onclick={cancelClose}>{t('settings.keepEditing')}</button>
        <button class="bds-btn-danger" onclick={discardAndClose}>{t('settings.discard')}</button>
      </div>
    </div>
  </div>
{/if}
<div class="bds-save-bar">
  <div class="bds-save-status">
    {#if dirty}
      <span class="bds-status-dot unsaved"></span>
      <span>{t('settings.unsavedTitle') || 'Unsaved changes'}</span>
    {:else}
      <span class="bds-status-dot saved"></span>
      <span>{t('settings.settingsSaved') || 'All settings saved'}</span>
    {/if}
  </div>
  <button id="bds-save-settings" type="button" class="bds-btn bds-btn-save-primary" onclick={save}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
    {t('settings.save')}
  </button>
</div>

{#if showExportAllModal}
  <div class="bds-modal-overlay" role="dialog" onclick={closeExportAllModal}>
    <div class="bds-modal" role="document" onclick={(e) => e.stopPropagation()}>
      <div class="bds-modal-header">
        <span>{t('drawer.exportAll')}</span>
        <button class="bds-modal-close" onclick={closeExportAllModal}>×</button>
      </div>
      <div class="bds-modal-body">
        <label class="bds-modal-check">
          <input type="checkbox" bind:checked={exportEncrypt} />
          <span>{t('drawer.exportEncrypt')}</span>
        </label>
        {#if exportEncrypt}
          <input type="password" class="bds-input" placeholder={t('drawer.enterPassword')} bind:value={exportPassword} />
          <input type="password" class="bds-input" placeholder={t('drawer.confirmPassword')} bind:value={exportPasswordConfirm} />
        {/if}
        {#if exportPasswordError}
          <span class="bds-modal-error">{exportPasswordError}</span>
        {/if}
      </div>
      <div class="bds-modal-footer">
        <button type="button" class="bds-btn-outlined" onclick={closeExportAllModal}>{t('cancel')}</button>
        <button type="button" class="bds-btn" disabled={isExporting} onclick={doExportAll}>
          {isExporting ? t('exporting') : t('drawer.download')}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showSaveSnippetModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="bds-modal-overlay" role="dialog" onclick={() => showSaveSnippetModal = false} style="z-index: 10002;">
    <div class="bds-modal" role="document" onclick={(e) => e.stopPropagation()} style="max-width: 320px;">
      <div class="bds-modal-header">
        <span>{t('settings.saveAsSnippet')}</span>
        <button class="bds-modal-close" onclick={() => showSaveSnippetModal = false}>×</button>
      </div>
      <div class="bds-modal-body" style="padding-top: 12px; padding-bottom: 12px;">
        <div class="bds-field">
          <label class="bds-label" for="bds-snippet-name-input" style="margin-bottom: 4px;">{t('settings.nameLabel')}</label>
          <input
            id="bds-snippet-name-input"
            type="text"
            class="bds-input"
            bind:value={newSnippetName}
            placeholder={t('settings.namePlaceholder')}
            autofocus
            onkeydown={(e) => e.key === 'Enter' && submitSaveSnippet()}
          />
          {#if saveSnippetError}
            <span class="bds-modal-error" style="margin-top: 4px;">{saveSnippetError}</span>
          {/if}
        </div>
      </div>
      <div class="bds-modal-footer">
        <button type="button" class="bds-btn-outlined" onclick={() => showSaveSnippetModal = false}>{t('cancel')}</button>
        <button type="button" class="bds-btn" onclick={submitSaveSnippet}>{t('settings.savePrompt')}</button>
      </div>
    </div>
  </div>
{/if}

{#if showImportPasswordModal}
  <div class="bds-modal-overlay" role="dialog" onclick={closeImportPasswordModal}>
    <div class="bds-modal" role="document" onclick={(e) => e.stopPropagation()}>
      <div class="bds-modal-header">
        <span>{t('drawer.enterPassword')}</span>
        <button class="bds-modal-close" onclick={closeImportPasswordModal}>×</button>
      </div>
      <div class="bds-modal-body">
        <input type="password" class="bds-input" placeholder={t('drawer.importPasswordPlaceholder')} bind:value={importPassword} />
        {#if importPasswordError}
          <span class="bds-modal-error">{importPasswordError}</span>
        {/if}
      </div>
      <div class="bds-modal-footer">
        <button type="button" class="bds-btn-outlined" onclick={closeImportPasswordModal}>{t('cancel')}</button>
        <button type="button" class="bds-btn" disabled={isImporting} onclick={doDecryptAndShow}>
          {isImporting ? t('importing') : t('drawer.decrypt')}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showImportSelectModal}
  <div class="bds-modal-overlay" role="dialog" onclick={closeImportSelectModal}>
    <div class="bds-modal" role="document" onclick={(e) => e.stopPropagation()}>
      <div class="bds-modal-header">
        <span>{t('drawer.selectSections')}</span>
        <button class="bds-modal-close" onclick={closeImportSelectModal}>×</button>
      </div>
      <div class="bds-modal-body">
        {#each EXPORT_SECTIONS as section}
          <label class="bds-modal-check">
            <input type="checkbox" checked={selectedSections.has(section.key)} onchange={() => toggleSection(section.key)} />
            <span>{section.label}</span>
          </label>
        {/each}
      </div>
      <div class="bds-modal-footer">
        <button type="button" class="bds-btn-outlined" onclick={closeImportSelectModal}>{t('cancel')}</button>
        <button type="button" class="bds-btn" disabled={isImporting || selectedSections.size === 0} onclick={doImportAll}>
          {isImporting ? t('importing') : t('drawer.importBtn')}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showMcpEditor}
  <div class="bds-modal-overlay">
    <div class="bds-modal">
      <div class="bds-modal-header">
        <span>{mcpEditorIsNew ? t('mcp.addModalTitle') : t('mcp.editModalTitle')}</span>
        <button class="bds-modal-close" onclick={closeMcpEditor}>×</button>
      </div>
      <div class="bds-modal-body">
        <div class="bds-field">
          <label class="bds-label">{t('mcp.nameLabel')}</label>
          <input type="text" class="bds-input" bind:value={mcpEditorName} placeholder={t('mcp.namePlaceholder')} />
        </div>
        <div class="bds-field">
          <label class="bds-label">{t('mcp.serverUrlLabel')}</label>
          <input type="url" class="bds-input" bind:value={mcpEditorUrl} placeholder={t('mcp.serverUrlPlaceholder')} />
        </div>
        <div class="bds-field">
          <label class="bds-label">{t('mcp.apiKeyLabel')}</label>
          <input type="password" class="bds-input" bind:value={mcpEditorApiKey} placeholder={t('mcp.apiKeyPlaceholder')} />
        </div>
        <div class="bds-toggle-row" style="padding: 0;">
          <span class="bds-toggle-label">{t('mcp.enabledLabel')}</span>
          <label class="bds-switch">
            <input type="checkbox" bind:checked={mcpEditorEnabled} />
            <span class="bds-switch-track"></span>
          </label>
        </div>
      </div>
      <div class="bds-modal-footer">
        <button class="bds-btn-outlined" onclick={closeMcpEditor}>{t('mcp.cancel')}</button>
        <button class="bds-btn" onclick={saveMcpServer} disabled={!mcpEditorName.trim() || !mcpEditorUrl.trim()}>{t('mcp.save')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bds-css-editor {
    border-bottom-left-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
    margin-bottom: 0 !important;
    border-bottom: none !important;
  }

  .bds-css-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    background: var(--bds-bg-elevated);
    border: 1px solid var(--bds-border);
    border-top: none;
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
    transition: border-radius var(--bds-transition);
  }

  .bds-css-toolbar.open {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .bds-css-toggle-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: 1px solid var(--bds-border);
    border-radius: 6px;
    color: var(--bds-text-secondary);
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--bds-transition);
    min-width: 0;
    flex-shrink: 1;
    overflow: hidden;
  }

  .bds-css-toggle-btn span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bds-css-toggle-btn:hover, .bds-css-toggle-btn.active {
    background: var(--bds-bg-hover);
    border-color: var(--bds-accent);
    color: var(--bds-text-primary);
  }

  .bds-snippets-icon {
    color: var(--bds-accent);
  }

  .bds-snippets-badge {
    background: var(--bds-accent);
    color: #ffffff;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: bold;
    line-height: 1.2;
  }

  .bds-chevron {
    transition: transform var(--bds-transition);
    opacity: 0.6;
  }

  .bds-chevron-rotated {
    transform: rotate(180deg);
  }

  .bds-save-snippet-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px !important;
    padding: 4px 8px !important;
    cursor: pointer;
  }

  .bds-lang-btn-group {
    display: flex;
    gap: 8px;
    width: 100%;
    flex-wrap: wrap;
    box-sizing: border-box;
  }

  .bds-lang-btn {
    flex: 1 1 120px;
    min-width: 0;
    font-size: 11px;
    padding: 6px 8px;
    text-align: center;
    white-space: normal;
    word-break: break-word;
    box-sizing: border-box;
  }

  .bds-lang-reset-btn {
    border-color: rgba(239, 68, 68, 0.3);
    color: rgba(239, 68, 68, 0.8);
  }

  .bds-token-field {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    box-sizing: border-box;
    min-width: 0;
  }

  .bds-token-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    flex-wrap: wrap;
    min-width: 0;
  }

  .bds-token-btn {
    min-width: 0;
    padding-inline: 8px;
  }

  .bds-token-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .bds-token-text[readonly] {
    cursor: default;
  }

  .bds-token-help {
    margin: 0;
    font-size: 10px;
    opacity: 0.6;
    line-height: 1.45;
  }

  .bds-prompt-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .bds-prompt-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    width: 100%;
  }

  .bds-prompt-status {
    font-size: 11px;
    color: var(--bds-text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    width: 100%;
  }

  .bds-prompt-actions {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }

  .bds-add-prompt-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    background: transparent;
    border: 1px dashed var(--bds-border);
    border-radius: 10px;
    color: var(--bds-text-secondary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--bds-transition);
    margin-top: 4px;
  }

  .bds-add-prompt-btn:hover {
    border-color: var(--bds-accent);
    color: var(--bds-accent);
    background: var(--bds-accent-glow);
  }

  /* Modal Overrides for DeepSeek Aesthetics */
  .bds-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    padding: 20px;
  }

  .bds-modal {
    background: var(--bds-bg-panel);
    border: 1px solid var(--bds-border);
    border-radius: 16px;
    width: 100%;
    max-width: 540px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--bds-shadow);
  }

  .bds-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--bds-border);
  }

  .bds-modal-close {
    background: transparent;
    border: none;
    color: var(--bds-text-tertiary);
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .bds-modal-close:hover {
    color: var(--bds-text-primary);
  }

  .bds-modal-body {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .bds-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .bds-modal-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--bds-border);
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .bds-css-editor {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
    font-size: 12px !important;
    line-height: 1.5 !important;
    min-height: 200px !important;
    tab-size: 2 !important;
    resize: vertical !important;
    background: var(--bds-bg-input) !important;
    color: var(--bds-text-primary) !important;
    border: 1px solid var(--bds-border) !important;
    border-radius: 8px !important;
    padding: 12px !important;
    white-space: pre !important;
    overflow: auto !important;
  }

  @media (max-width: 560px) {
    .bds-token-field {
      flex-direction: column;
      align-items: stretch;
    }

    .bds-token-actions {
      justify-content: flex-end;
    }
  }

  .bds-export-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }

  .bds-export-section > span {
    font-size: 12px;
    font-weight: 600;
    opacity: 0.7;
  }

  .bds-export-buttons {
    display: flex;
    gap: 6px;
  }

  .bds-export-buttons button {
    flex: 1;
    font-size: 11px;
    padding: 6px 12px;
  }

  .bds-modal-check {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    font-size: 13px;
  }

  .bds-modal-check input[type="checkbox"] {
    margin: 0;
  }

  .bds-modal-error {
    color: #e74c3c;
    font-size: 11px;
  }

  .bds-editing-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--bds-accent-glow);
    border: 1px solid var(--bds-accent);
    color: var(--bds-text-primary);
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
  }

  .bds-exit-edit-btn {
    background: none;
    border: none;
    padding: 0;
    color: var(--bds-accent);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    transition: opacity var(--bds-transition);
  }

  .bds-exit-edit-btn:hover {
    opacity: 0.8;
  }

  .bds-slider-group {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    max-width: 140px;
  }

  .bds-slider {
    flex: 1;
    height: 4px;
    appearance: none;
    background: var(--bds-border);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .bds-slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--bds-accent);
    border: 2px solid var(--bds-bg-panel);
    cursor: pointer;
    transition: transform 0.1s ease;
  }

  .bds-slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }

  .bds-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--bds-accent);
    border: 2px solid var(--bds-bg-panel);
    cursor: pointer;
  }

  .bds-slider-value {
    font-size: 13px;
    font-weight: 600;
    min-width: 40px;
    text-align: right;
    color: var(--bds-text-primary);
    font-variant-numeric: tabular-nums;
  }

  .bds-search-provider-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    box-sizing: border-box;
  }

  .bds-search-provider-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 6px;
    border-radius: 6px;
    background: var(--bds-bg-hover, rgba(128, 128, 128, 0.08));
  }

  .bds-search-provider-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--bds-text-primary);
    cursor: pointer;
    min-width: 0;
  }

  .bds-search-provider-label input {
    margin: 0;
    accent-color: var(--bds-accent);
  }

  .bds-search-provider-controls {
    display: flex;
    gap: 4px;
  }

  .bds-search-provider-move {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--bds-border, rgba(128, 128, 128, 0.25));
    border-radius: 5px;
    background: transparent;
    color: var(--bds-text-primary);
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
  }

  .bds-search-provider-move:hover:not(:disabled) {
    background: var(--bds-accent);
    color: #fff;
    border-color: var(--bds-accent);
  }

  .bds-search-provider-move:disabled {
    opacity: 0.35;
    cursor: default;
  }

  /* ── Enhanced MCP Styles ── */
  .bds-mcp-intro-box {
    background: var(--bds-bg-hover, rgba(128, 128, 128, 0.08));
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 10px;
    border: 1px solid var(--bds-border, rgba(128, 128, 128, 0.15));
  }

  .bds-mcp-presets-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 12px 0 8px;
  }

  .bds-mcp-presets-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary);
  }

  .bds-mcp-presets-hint {
    font-size: 11px;
    color: var(--bds-text-secondary);
  }

  .bds-mcp-presets-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;
  }

  .bds-mcp-preset-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 12px;
    background: var(--bds-bg-input, #242428);
    border: 1px solid var(--bds-border, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .bds-mcp-preset-card:hover {
    background: var(--bds-bg-hover, #2c2c32);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .bds-mcp-preset-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .bds-mcp-preset-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bds-mcp-preset-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary);
  }

  .bds-mcp-key-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(245, 158, 11, 0.18);
    color: #f59e0b;
  }

  .bds-mcp-free-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(16, 185, 129, 0.18);
    color: #10b981;
  }

  .bds-mcp-preset-desc {
    font-size: 11px;
    color: var(--bds-text-secondary);
    line-height: 1.3;
  }

  .bds-mcp-preset-add-btn {
    padding: 5px 10px;
    background: var(--bds-accent, #4d6bfe);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.15s ease;
  }

  .bds-mcp-preset-add-btn:hover {
    opacity: 0.9;
  }

  .bds-mcp-preset-add-btn.bds-mcp-preset-active {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.3);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .bds-mcp-empty-notice {
    padding: 16px;
    text-align: center;
    border: 1px dashed var(--bds-border, rgba(128, 128, 128, 0.25));
    border-radius: 8px;
    margin-bottom: 10px;
  }

  .bds-mcp-server-card {
    background: var(--bds-bg-hover, rgba(128, 128, 128, 0.06));
    border: 1px solid var(--bds-border, rgba(128, 128, 128, 0.2));
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: border-color 0.15s ease;
  }

  .bds-mcp-server-card:hover {
    border-color: var(--bds-accent);
  }

  .bds-mcp-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .bds-mcp-status-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .bds-mcp-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #9ca3af;
    flex-shrink: 0;
  }

  .bds-mcp-status-dot.connected {
    background: #10b981;
    box-shadow: 0 0 6px #10b981;
  }

  .bds-mcp-status-dot.disabled {
    background: #ef4444;
  }

  .bds-mcp-server-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary);
  }

  .bds-mcp-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(128, 128, 128, 0.2);
    color: var(--bds-text-secondary);
  }

  .bds-mcp-badge.has-tools {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    font-weight: 600;
  }

  .bds-mcp-url-display {
    font-size: 11px;
    color: var(--bds-text-tertiary);
    word-break: break-all;
  }

  .bds-mcp-url-display code {
    font-size: 11px;
    background: transparent;
    padding: 0;
  }

  .bds-mcp-tools-details {
    margin-top: 6px;
    border-top: 1px solid var(--bds-border, rgba(128, 128, 128, 0.15));
    padding-top: 6px;
  }

  .bds-mcp-tools-summary {
    font-size: 11px;
    color: var(--bds-accent);
    cursor: pointer;
    font-weight: 500;
  }

  .bds-mcp-tools-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
    max-height: 160px;
    overflow-y: auto;
  }

  .bds-mcp-tool-pill {
    font-size: 11px;
    background: var(--bds-bg-panel, rgba(0, 0, 0, 0.2));
    border-radius: 6px;
    padding: 4px 8px;
    border: 1px solid var(--bds-border, rgba(128, 128, 128, 0.1));
  }

  .bds-mcp-tool-desc {
    display: block;
    font-size: 10px;
    opacity: 0.7;
    margin-top: 2px;
  }

  /* Modern Category Pills Navigation */
  .bds-category-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 2px 2px 12px;
    margin-bottom: 8px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .bds-category-nav::-webkit-scrollbar {
    display: none;
  }
  .bds-category-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 500;
    color: var(--bds-text-secondary);
    background: var(--bds-bg-hover, rgba(128, 128, 128, 0.08));
    border: 1px solid var(--bds-border, rgba(128, 128, 128, 0.15));
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
    user-select: none;
  }
  .bds-category-pill:hover {
    background: var(--bds-bg-elevated);
    color: var(--bds-text-primary);
    border-color: var(--bds-border-hover, rgba(128, 128, 128, 0.3));
  }
  .bds-category-pill.active {
    background: var(--bds-accent, #4d6bfe);
    color: #ffffff;
    border-color: var(--bds-accent, #4d6bfe);
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(77, 107, 254, 0.25);
  }
  .bds-pill-icon {
    font-size: 13px;
    line-height: 1;
  }

  /* Section Cards */
  .bds-card {
    background: var(--bds-bg-elevated, #ffffff);
    border: 1px solid var(--bds-border, rgba(128, 128, 128, 0.15));
    border-radius: 14px;
    margin-bottom: 12px;
    overflow: hidden;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .bds-card:hover {
    border-color: var(--bds-border-hover, rgba(128, 128, 128, 0.25));
  }
  .bds-card.open {
    border-color: var(--bds-border-hover, rgba(128, 128, 128, 0.25));
  }
  .bds-card-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    box-sizing: border-box;
    transition: background-color 0.15s ease;
  }
  .bds-card-header:hover {
    background-color: var(--bds-bg-hover, rgba(128, 128, 128, 0.05));
  }
  .bds-card-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }
  .bds-card-icon-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    font-size: 16px;
    flex-shrink: 0;
    background: var(--bds-bg-hover, rgba(128, 128, 128, 0.1));
  }
  .bds-icon--purple { background: rgba(147, 51, 234, 0.12); }
  .bds-icon--blue { background: rgba(59, 130, 246, 0.12); }
  .bds-icon--green { background: rgba(16, 185, 129, 0.12); }
  .bds-icon--teal { background: rgba(20, 184, 166, 0.12); }
  .bds-icon--amber { background: rgba(245, 158, 11, 0.12); }
  .bds-icon--indigo { background: rgba(99, 102, 241, 0.12); }
  .bds-icon--rose { background: rgba(244, 63, 94, 0.12); }
  .bds-icon--slate { background: rgba(100, 116, 139, 0.12); }
  .bds-icon--pink { background: rgba(236, 72, 153, 0.12); }
  .bds-icon--cyan { background: rgba(6, 182, 212, 0.12); }
  .bds-icon--violet { background: rgba(139, 92, 246, 0.12); }

  .bds-card-title-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .bds-card-title {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--bds-text-primary);
    line-height: 1.3;
  }
  .bds-card-subtitle {
    font-size: 11.5px;
    color: var(--bds-text-secondary);
    line-height: 1.35;
    opacity: 0.9;
  }
  .bds-card-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    margin-left: 10px;
  }
  .bds-card-body {
    padding: 0 14px 14px;
    border-top: 1px solid var(--bds-border, rgba(128, 128, 128, 0.1));
  }

  /* Save Bar */
  .bds-save-bar {
    position: static;
    margin-top: 20px;
    padding: 12px 16px;
    background: var(--bds-bg-card, #1c1c1f);
    border: 1px solid var(--bds-border, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: none;
  }
  .bds-save-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--bds-text-secondary);
  }
  .bds-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .bds-status-dot.saved {
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
  }
  .bds-status-dot.unsaved {
    background: #f59e0b;
    box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);
    animation: bds-pulse 1.8s infinite;
  }
  @keyframes bds-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .bds-btn-save-primary {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: var(--bds-accent, #4d6bfe) !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 10px !important;
    padding: 8px 20px !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
    box-shadow: 0 2px 8px rgba(77, 107, 254, 0.3) !important;
  }
  .bds-btn-save-primary:hover {
    opacity: 0.92 !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 12px rgba(77, 107, 254, 0.4) !important;
  }
  .bds-btn-save-primary:active {
    transform: translateY(0) !important;
  }

</style>
