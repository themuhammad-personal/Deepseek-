<script>
  import { onMount } from "svelte";
  import { pickFolderAndConcatenate } from "../files/folder-reader.js";
  import { fetchGitHubRepo, parseGitHubUrl } from "../files/github-reader.js";
  import {
    DEFAULT_GITHUB_COMMIT_COUNT,
    fetchGitHubCommits,
    normalizeGitHubCommitCount,
  } from "../files/github-commits.js";
  import { fetchAndConvertWebPage } from "../files/web-reader.js";
  import { projectFilesToFile } from "../files/project-file-builder.js";
  import { openNativeFilePicker } from "../files/native-file-input.js";
  import {
    buildFolderFileFromNative,
    isNativeFilePickerAvailable,
    nativePickFiles,
    PICK_ERRORS,
    pickedEntryToFile,
  } from "../../platform/android-file-picker.js";
  import {
    getFilesForProject,
    setActiveProject,
    clearActiveProject,
    tickFile,
    untickFile,
    clearActiveFiles,
  } from "../project-manager.js";
  import { pushConfigToPage } from "../bridge.js";
  import appState from "../state.js";
  import { BRIDGE_EVENTS } from "../../lib/constants.js";
  import { t, i18n } from "../../lib/i18n.svelte.js";
  import { getFlag, getConfig, REMOTE_CONFIG_EVENT, detectModelType } from "../../lib/remote-config.svelte.js";
  import { VADProcessor } from "../vad-processor.js";
  import { findActiveFileInput } from "../scanner.js";
  import { sendFileWithMessage } from "../auto.js";
  import { setDeepResearchEnabled } from "../deep-research.js";
  import { setDeepCodeEnabled } from "../deep-code.js";
  import { dragToDismiss } from "../../lib/gestures/drag-to-dismiss.js";

  // The native input[type="file"] reference passed from scanner
  let { nativeInput } = $props();

  // Live-resolved native input. DeepSeek can replace its composer's file
  // input node after the first successful upload (device layout re-renders);
  // the original prop reference then points at a detached node. Every use
  // site re-resolves through this instead of reading `nativeInput` directly.
  let inputEl = $state(null);

  function resolveNativeInput() {
    if (inputEl?.isConnected) return inputEl;
    if (nativeInput?.isConnected) {
      inputEl = nativeInput;
      return inputEl;
    }
    const fresh = findActiveFileInput();
    if (fresh) inputEl = fresh;
    return fresh;
  }

  let isOpen = $state(false);
  let menuRef = $state(null);
  let dropdownStyle = $state("");

  $effect(() => {
    if (typeof window !== "undefined" && window.AndroidBridge?.setNativeBlur) {
      try {
        window.AndroidBridge.setNativeBlur(isOpen, isOpen ? 25 : 0);
      } catch {}
    }
  });

  // GitHub dialog state
  let showGithubDialog = $state(false);
  let githubUrl = $state("");
  let githubStatus = $state("");
  let githubLoading = $state(false);
  let githubError = $state("");
  let includeCommits = $state(false);
  let commitCountInput = $state("");

  // Web Import dialog state
  let showWebDialog = $state(false);
  let webUrl = $state("");
  let webStatus = $state("");
  let webLoading = $state(false);
  let webError = $state("");

  let dialogRef = $state(null);

  // Project panel (folder button) state
  let showProjectPanel = $state(false);
  let projectPanelStyle = $state("");
  let projectBtnRef = $state(null);
  let projectPanelRef = $state(null);
  let panelProjects = $state([...appState.projects]);
  let panelActiveProjectId = $state("");
  let panelFiles = $state([]);
  let panelTickedIds = $state([]);

  // Speech Recognition state
  let isRecording = $state(false);
  let recognition = null;

  // VAD state
  let vadProcessor = null;

  // Replaced at build time by Vite's `define` (see build.js sharedDefine).
  // Vite inlines the literal string, e.g. `process.env.BDS_TARGET` → `"android"`,
  // so `"android" || "chrome"` → `"android"`. In Vitest the env var is undefined
  // so the `"chrome"` fallback is hit, which mirrors the default extension target.
  const BDS_TARGET = process.env.BDS_TARGET || "chrome";
  const isAndroidTarget = BDS_TARGET === "android";

  // Folder upload uses window.showDirectoryPicker — unavailable in Android
  // WebView. Voice input is hidden on Android because SpeechRecognition isn't
  // wired up in WebView; the on-screen keyboard mic is always reachable.
  // On non-Android targets we keep the buttons visible and let the existing
  // runtime fallbacks (toast on missing API) handle older Chromium variants.
  // Android native bridge re-enables folder upload when pickFiles exists.
  const supportsFolderUpload = !isAndroidTarget || isNativeFilePickerAvailable();
  const supportsVoiceInput = !isAndroidTarget;

  // ── Remote Config: Model-aware visibility ──

  let currentModelType = $state("instant");

  function detectModelTypeWithPricing() {
    const model = detectModelType();
    if (model) return model;
    const modelName = appState.pricing?.modelName || "";
    const lo = modelName.toLowerCase();
    if (lo.includes("pro") || lo.includes("reasoner") || lo === "expert") return "expert";
    if (lo.includes("deepthink")) return "deepthink";
    return null;
  }

  let shouldShowAttach = $state(true);
  let shouldShowPlus = $state(true);
  let shouldShowUploadFile = $state(true);
  let shouldShowUploadFolder = $state(true);
  let shouldShowGithub = $state(true);
  let shouldShowWeb = $state(true);
  let shouldShowProject = $state(true);
  let shouldShowVoice = $state(true);

  function updateVisibility() {
    try {
      const enabled = getFlag("features.attachMenu.enabled");
      const modelKey = currentModelType === "vision" ? "visionMode" : currentModelType === "expert" ? "expertMode" : currentModelType === "instant" ? "instantMode" : "deepthinkMode";
      shouldShowAttach = !!(enabled && getFlag(`features.attachMenu.${modelKey}.show`));
      const show = shouldShowAttach;
      shouldShowPlus = show && !!getFlag(`features.attachMenu.${modelKey}.showPlus`);
      shouldShowUploadFile = show && !!getFlag(`features.attachMenu.${modelKey}.showUploadFile`);
      shouldShowUploadFolder = show && !!getFlag(`features.attachMenu.${modelKey}.showUploadFolder`);
      shouldShowGithub = show && !!getFlag(`features.attachMenu.${modelKey}.showGithub`);
      shouldShowWeb = show && !!getFlag(`features.attachMenu.${modelKey}.showWeb`);
      shouldShowProject = show && !!getFlag(`features.attachMenu.${modelKey}.showProject`);
      shouldShowVoice = show && !!getFlag(`features.attachMenu.${modelKey}.showVoice`);
    } catch (e) {
      console.warn("[BDS] Failed to evaluate attach menu visibility:", e);
    }
  }

  let modelObserver = $state(null);

  function recheckModelType() {
    const next = detectModelTypeWithPricing();
    if (next && next !== currentModelType) {
      currentModelType = next;
      updateVisibility();
    }
  }

  function startModelWatcher() {
    // Observe document.body rather than the switcher node itself: DeepSeek
    // can replace the whole switcher element (composer re-render, picker
    // roundtrip), which would silently detach an observer scoped to it and
    // freeze detection. A body-wide observer survives node replacement.
    let rafId = 0;
    const scheduleRecheck = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        recheckModelType();
      });
    };
    const obs = new MutationObserver(scheduleRecheck);
    obs.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-checked"],
    });
    modelObserver = obs;
  }

  function hasGithubToken() {
    return Boolean(String(appState.settings.githubToken || "").trim());
  }

  function stopTTS() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  let latestTranscript = "";
  let accumulatedTranscript = "";
  let currentSessionText = "";
  let shouldStop = false;
  let restartAttempts = 0;
  let destroyed = false;
  const MAX_RESTART_ATTEMPTS = 5;

  function toggleSpeechRecognition() {
    if (isRecording) {
      shouldStop = true;
      stopVAD();
      if (recognition) recognition.stop();
      isRecording = false;
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (appState.ui)
        appState.ui.showToast(t('attachMenu.noSpeechRecognition'));
      return;
    }

    stopTTS();
    latestTranscript = "";
    accumulatedTranscript = "";
    currentSessionText = "";
    shouldStop = false;
    restartAttempts = 0;

    recognition = new SpeechRecognition();
    recognition.lang =
      appState.settings.voiceLanguage || navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      isRecording = true;
    };

    recognition.onresult = (event) => {
      currentSessionText = "";
      for (let i = 0; i < event.results.length; i++) {
        currentSessionText += event.results[i][0].transcript;
      }

      latestTranscript = accumulatedTranscript
        ? accumulatedTranscript + " " + currentSessionText
        : currentSessionText;

      injectTextIntoDeepSeek(latestTranscript, false);
    };

    recognition.onerror = (event) => {
      console.error("Speech Recognition Error:", event.error);
      if (event.target !== recognition) return;
      if (event.error === 'no-speech' && vadProcessor && vadProcessor.state === 'speaking') {
        console.warn("[BDS] VAD says speaking, ignoring Chrome no-speech error");
        recognition.stop();
        return;
      }
      shouldStop = true;
      isRecording = false;
      stopVAD();
      accumulatedTranscript = "";
      currentSessionText = "";
      latestTranscript = "";
      if (appState.ui) appState.ui.showToast(t('attachMenu.voiceError', { msg: event.error }));
    };

    recognition.onend = () => {
      isRecording = false;
      if (destroyed) return;

      if (shouldStop) {
        stopVAD();
        if (latestTranscript.trim() && appState.settings.autoSubmitVoice) {
          injectTextIntoDeepSeek(latestTranscript, true);
        }
        accumulatedTranscript = "";
        currentSessionText = "";
        shouldStop = false;
        return;
      }

      if (currentSessionText.trim()) {
        accumulatedTranscript += (accumulatedTranscript ? " " : "") + currentSessionText;
        currentSessionText = "";
        latestTranscript = accumulatedTranscript;
      }

      const isUserActive = vadProcessor && vadProcessor.state === 'speaking';

      if (isUserActive && restartAttempts < MAX_RESTART_ATTEMPTS) {
        restartAttempts++;
        tryRestartRecognition();
        return;
      }

      stopVAD();
      if (accumulatedTranscript.trim() && appState.settings.autoSubmitVoice) {
        injectTextIntoDeepSeek(accumulatedTranscript, true);
      }
      if (restartAttempts >= MAX_RESTART_ATTEMPTS && appState.ui) {
        appState.ui.showToast(t('attachMenu.voiceError', { msg: 'recognition failed' }));
      }
      accumulatedTranscript = "";
      currentSessionText = "";
    };

    recognition.start();
    startVAD();
  }

  function tryRestartRecognition() {
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const newRec = new SR();
      newRec.lang = recognition.lang;
      newRec.interimResults = true;
      newRec.continuous = false;
      newRec.onstart = recognition.onstart;
      newRec.onresult = recognition.onresult;
      newRec.onerror = recognition.onerror;
      newRec.onend = recognition.onend;
      recognition = newRec;
      recognition.start();
    } catch (e) {
      console.warn("[BDS] Failed to restart recognition:", e);
      isRecording = false;
      stopVAD();
      if (accumulatedTranscript.trim() && appState.settings.autoSubmitVoice) {
        injectTextIntoDeepSeek(accumulatedTranscript, true);
      }
      accumulatedTranscript = "";
      currentSessionText = "";
    }
  }

  function startVAD() {
    try {
      const processor = new VADProcessor({
        silenceTimeout: appState.settings.vadSilenceTimeout || 1500,
      });

      processor.onVADStop = () => {
        if (destroyed) return;
        shouldStop = true;
        if (recognition) recognition.stop();
      };

      vadProcessor = processor;
      processor.start().catch((err) => {
        console.warn("[BDS] VAD init failed:", err);
        stopVAD();
      });
    } catch (err) {
      console.warn("[BDS] VAD not supported:", err);
      vadProcessor = null;
    }
  }

  function stopVAD() {
    if (vadProcessor) {
      vadProcessor.stop();
      vadProcessor = null;
    }
  }

  function injectTextIntoDeepSeek(text, isFinal) {
    // DeepSeek uses a <textarea> or a contenteditable div.
    // Usually it's #chat-input in modern DeepSeek.
    const textarea =
      document.querySelector("textarea#chat-input") ||
      document.querySelector(".ds-textarea textarea") ||
      document.querySelector("textarea");

    if (!textarea) {
      if (isFinal && appState.ui)
        appState.ui.showToast(t('attachMenu.noInputField'));
      return;
    }

    // textarea.value = text;
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    if (isFinal && appState.settings.autoSubmitVoice) {
      setTimeout(robustSend, 400);
    }
  }

  function robustSend() {
    // Notify the injected script that this is a voice message
    window.dispatchEvent(new CustomEvent(BRIDGE_EVENTS.markVoiceMessage));

    let attempts = 0;
    const maxAttempts = 50;

    const attempt = () => {
      attempts++;
      const buttons = Array.from(
        document.querySelectorAll('div[role="button"], button'),
      );
      const sendBtn = buttons.find((b) => {
        // Match logic from auto.js
        const isSend =
          b.querySelector('svg path[d*="M8.3125"], .ds-icon-send') ||
          b.querySelector('svg path[d*="M13.12 19.98"]') ||
          b.title === "Send message" ||
          b.ariaLabel === "Send Message";
        const isAttach =
          b.classList.contains("bds-plus-btn") || b.querySelector("svg line");
        return isSend && !isAttach;
      });

      if (sendBtn) {
        const isDisabled =
          sendBtn.getAttribute("aria-disabled") === "true" ||
          sendBtn.classList.contains("ds-icon-button--disabled");

        if (!isDisabled) {
          sendBtn.click();
          return;
        }
      }

      if (attempts < maxAttempts) {
        setTimeout(attempt, 200);
      } else {
        // Fallback: Try Enter key on input
        const textarea =
          document.querySelector("textarea#chat-input") ||
          document.querySelector(".ds-textarea textarea");
        if (textarea) {
          textarea.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              bubbles: true,
              keyCode: 13,
            }),
          );
        }
      }
    };

    attempt();
  }

  function toggleMenu(e) {
    e.stopPropagation();
    if (typeof window !== "undefined" && window.AndroidBridge?.performHaptic) {
      window.AndroidBridge.performHaptic("light");
    }
    if (!isOpen) {
      updatePosition();
      isOpen = true;
    } else {
      isOpen = false;
    }
  }

  function updatePosition() {
    if (!menuRef) return;
    const isMobile = isAndroidTarget || (typeof window !== "undefined" && (Boolean(window.AndroidBridge) || window.innerWidth < 768));
    if (isMobile) {
      dropdownStyle = "";
      return;
    }
    const rect = menuRef.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const menuWidth = 176;
    const menuHeight = estimateDropdownHeight();
    const left = clamp(rect.right - menuWidth, 8, viewportWidth - menuWidth - 8);
    const top = clamp(rect.top - menuHeight - 8, 8, viewportHeight - menuHeight - 8);
    dropdownStyle = `top: ${top}px; left: ${left}px; min-width: ${menuWidth}px;`;
  }

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      },
    };
  }

  function estimateDropdownHeight() {
    let itemCount = 0;
    if (shouldShowUploadFile) itemCount += 1;
    if (shouldShowUploadFolder && supportsFolderUpload) itemCount += 1;
    if (shouldShowGithub) itemCount += 1;
    if (shouldShowWeb) itemCount += 1;
    const dividerHeight = shouldShowGithub || shouldShowWeb ? 9 : 0;
    return 12 + itemCount * 36 + dividerHeight;
  }

  function clamp(value, min, max) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  function closeMenu() {
    isOpen = false;
  }

  onMount(() => {
    panelProjects = [...appState.projects];
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    appState.heroBarRef = { refresh: refreshProjectPanel };

    currentModelType = detectModelTypeWithPricing();
    updateVisibility();
    startModelWatcher();

    const onConfigOrStateUpdate = () => { recheckModelType(); };
    window.addEventListener(REMOTE_CONFIG_EVENT, onConfigOrStateUpdate);

    const onDeepResearchChanged = () => {
      isDeepResearchActive = Boolean(appState.deepResearch?.enabled);
    };
    window.addEventListener("bds:deep-research-config-changed", onDeepResearchChanged);

    const onDeepCodeChanged = (e) => {
      isDeepCodeActive = Boolean(e?.detail?.enabled ?? appState.deepCode?.enabled);
    };
    window.addEventListener("bds:deep-code-toggle-state", onDeepCodeChanged);

    return () => {
      destroyed = true;
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener(REMOTE_CONFIG_EVENT, onConfigOrStateUpdate);
      window.removeEventListener("bds:deep-research-config-changed", onDeepResearchChanged);
      window.removeEventListener("bds:deep-code-toggle-state", onDeepCodeChanged);
      if (appState.heroBarRef?.refresh === refreshProjectPanel) {
        appState.heroBarRef = null;
      }
      if (modelObserver) modelObserver.disconnect();
      recognition?.abort?.();
      stopVAD();
    };
  });

  function handleClickOutside(e) {
    const inMenu = menuRef && menuRef.contains(e.target);
    const inDialog = dialogRef && dialogRef.contains(e.target);
    const inPanel = projectPanelRef && projectPanelRef.contains(e.target);
    if (!inMenu && !inDialog && !inPanel) {
      closeMenu();
      showProjectPanel = false;
    }
  }

  function handleEscape(e) {
    if (e.key === "Escape") {
      if (showGithubDialog && !githubLoading) showGithubDialog = false;
      if (showWebDialog && !webLoading) showWebDialog = false;
      showProjectPanel = false;
      closeMenu();
    }
  }

  function pickErrorMessage(err, fallbackKey) {
    const message = err?.message || "";
    if (message === PICK_ERRORS.TIMEOUT || message === PICK_ERRORS.STALLED) {
      return t("attachMenu.pickTimeout");
    }
    return message || t(fallbackKey);
  }

  function showNativePickSkips(skipped, attachedCount, emptyKey) {
    if (!appState.ui) return;
    if (skipped.some((item) => item.reason === "image-requires-vision")) {
      appState.ui.showToast(t("attachMenu.imagesRequireVision"));
      return;
    }
    if (attachedCount > 0 && skipped.length > 0) {
      appState.ui.showToast(t("attachMenu.someFilesSkipped", {
        skipped: skipped.length,
        total: skipped.length + attachedCount,
      }));
      return;
    }
    if (attachedCount === 0) {
      appState.ui.showToast(t(emptyKey));
    }
  }

  let cameraInputRef = $state(null);

  async function handleCameraClick() {
    closeMenu();
    if (isAndroidTarget && isNativeFilePickerAvailable()) {
      try {
        const result = await nativePickFiles("images");
        if (result?.cancelled) return;
        const files = result?.files || [];
        if (files.length > 0) {
          for (const file of files) {
            injectFile(pickedEntryToFile(file));
          }
          return;
        }
      } catch (err) {
        console.warn("[AttachMenu] nativePickFiles images error:", err);
      }
    }
    // Fallback: click hidden file input or trigger platform picker
    if (cameraInputRef) {
      cameraInputRef.click();
    } else {
      const target = resolveNativeInput();
      if (target) {
        openNativeFilePicker(target, { preferSingle: isAndroidTarget });
      }
    }
  }

  function handleCameraFileChange(e) {
    const files = Array.from(e.target?.files || []);
    for (const file of files) {
      injectFile(file);
    }
    if (e.target) e.target.value = "";
  }

  function toggleNativeWebSearch() {
    closeMenu();
    const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], .ds-toggle-button'));
    const searchBtn = allButtons.find(b => {
      if (b.closest('#bds-root')) return false;
      const txt = (b.textContent || '').toLowerCase();
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const title = (b.getAttribute('title') || '').toLowerCase();
      const hasSvg = b.querySelector('svg path[d*="M12 2a15.3"]') || b.querySelector('circle[cx="11"]');
      return hasSvg || txt.includes('search') || label.includes('search') || title.includes('search') || txt.includes('সার্চ') || label.includes('সার্চ');
    });
    if (searchBtn) {
      searchBtn.click();
    } else {
      handleWebImport();
    }
  }

  function toggleNativeDeepThink() {
    closeMenu();
    const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], .ds-toggle-button'));
    const dtBtn = allButtons.find(b => {
      if (b.closest('#bds-root') || b.closest('.bds-attach-wrapper')) return false;
      const txt = (b.textContent || '').toLowerCase();
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const title = (b.getAttribute('title') || '').toLowerCase();
      const hasSvg = b.querySelector('svg path[d*="M7.0643"]') || b.querySelector('.ds-toggle-button');
      return hasSvg || txt.includes('deepthink') || label.includes('deepthink') || title.includes('deepthink') || txt.includes('think') || txt.includes('থিঙ্ক');
    });
    if (dtBtn) {
      dtBtn.click();
    } else if (appState.ui) {
      appState.ui.showToast('DeepThink (R1) toggled');
    }
  }

  let isDeepResearchActive = $state(Boolean(appState.deepResearch?.enabled));

  function toggleDeepResearch() {
    closeMenu();
    const next = !Boolean(appState.deepResearch?.enabled);
    setDeepResearchEnabled(next);
    isDeepResearchActive = next;
    if (appState.ui) {
      appState.ui.showToast(next ? (t('attachMenu.deepResearchEnabled') || 'Deep Research enabled') : (t('attachMenu.deepResearchDisabled') || 'Deep Research disabled'));
    }
  }

  function handleCustomCommands() {
    closeMenu();
    window.dispatchEvent(new CustomEvent("bds:show-help"));
    const textarea =
      document.querySelector("textarea#chat-input") ||
      document.querySelector(".ds-textarea textarea") ||
      document.querySelector("textarea");
    if (textarea) {
      textarea.focus();
      if (!textarea.value.startsWith("/")) {
        textarea.value = "/" + textarea.value;
      }
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  let isDeepCodeActive = $state(Boolean(appState.deepCode?.enabled));
  let activeDirectoryName = $derived.by(() => {
    const dir = appState.deepCode?.activeDirectory || (appState.deepCode?.manualPath ? appState.deepCode.manualPath.split(/[/\\]/).filter(Boolean).pop() : "");
    return dir || "";
  });

  function handleDeepCode() {
    closeMenu();
    if (window.AndroidBridge?.vibrate) {
      try { window.AndroidBridge.vibrate(10); } catch {}
    }
    if (!isDeepCodeActive) {
      setDeepCodeEnabled(true);
      isDeepCodeActive = true;
      if (appState.ui?.showToast) {
        appState.ui.showToast(t('attachMenu.deepCodeEnabled') || 'Deep Code enabled');
      }
      if (!appState.deepCode?.activeDirectory && !appState.deepCode?.manualPath) {
        window.dispatchEvent(new CustomEvent("bds:open-deep-code-modal"));
      }
    } else {
      window.dispatchEvent(new CustomEvent("bds:open-deep-code-modal"));
    }
  }

  async function handleUploadFile() {
    closeMenu();
    if (isAndroidTarget && isNativeFilePickerAvailable()) {
      try {
        const imagesAllowed = getFlag("features.fileUpload.imagesEnabled") ?? true;
        const wantImages = imagesAllowed && currentModelType !== "textOnly";
        const result = await nativePickFiles(wantImages ? "files+images" : "files");
        if (result.cancelled) return;
        const files = result.files || [];
        const skipped = result.skipped || [];
        if (files.length > 0) {
          for (const file of files) {
            injectFile(pickedEntryToFile(file));
          }
        }
        showNativePickSkips(skipped, files.length, "attachMenu.noFilesPicked");
      } catch (err) {
        if (appState.ui) {
          appState.ui.showToast(pickErrorMessage(err, "attachMenu.filePickFailed"));
        }
      }
      return;
    }

    const target = resolveNativeInput();
    if (target) {
      // Native picker behavior is selected via a file-flow strategy. Android's
      // "Upload File" path prefers the single-file strategy so WebView asks the
      // platform chooser for one file even though DeepSeek's DOM input is `multiple`.
      openNativeFilePicker(target, { preferSingle: isAndroidTarget });
    } else {
      checkExpertModeWarning();
    }
  }

  async function handleUploadFolder() {
    closeMenu();

    if (isAndroidTarget) {
      if (isNativeFilePickerAvailable()) {
        try {
          const wantImages = currentModelType === "vision";
          const result = await nativePickFiles(wantImages ? "folder+images" : "folder");
          if (result.cancelled) return;
          const files = result.files || [];
          const skipped = result.skipped || [];
          const images = files.filter((file) => file.encoding === "base64");
          if (files.length > 0) {
            const fakeFile = buildFolderFileFromNative(
              files,
              result.folderName,
            );
            if (fakeFile) injectFile(fakeFile);
            for (const image of images) {
              injectFile(pickedEntryToFile(image));
            }
          }
          showNativePickSkips(skipped, files.length, "attachMenu.folderNoTextFiles");
        } catch (err) {
          if (appState.ui) {
            appState.ui.showToast(pickErrorMessage(err, "attachMenu.folderPickFailed"));
          }
        }
      } else if (appState.ui) {
        appState.ui.showToast(t('attachMenu.folderRequiresNewer'));
      }
      return;
    }

    try {
      const result = await pickFolderAndConcatenate({
        includeImages: currentModelType === "vision",
      });
      if (result?.workspaceFile) {
        injectFile(result.workspaceFile);
      }
      for (const imageFile of result?.imageFiles || []) {
        injectFile(imageFile);
      }
      if (result?.skippedImages > 0 && appState.ui) {
        appState.ui.showToast(t("attachMenu.someFilesSkipped", {
          skipped: result.skippedImages,
          total: result.skippedImages + (result.imageFiles?.length || 0),
        }));
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        return;
      }

      console.error("[AttachMenu] Folder upload failed:", err);
      if (appState.ui) {
        appState.ui.showToast(t('attachMenu.folderUploadFailed', { msg: err?.message || '' }));
      }
    }
  }

  function handleGithubImport() {
    closeMenu();
    githubUrl = "";
    githubStatus = "";
    githubError = "";
    githubLoading = false;
    includeCommits = false;
    commitCountInput = "";
    showGithubDialog = true;
  }

  function handleCommitCountInput(event) {
    commitCountInput = event.currentTarget.value;
  }

  async function submitGithubUrl() {
    if (!githubUrl.trim() || githubLoading) return;

    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) {
      githubError = t('attachMenu.invalidGithubUrl');
      return;
    }

    githubError = "";
    githubLoading = true;

    try {
      const token = String(appState.settings.githubToken || "").trim();
      const sourceFile = await fetchGitHubRepo(
        githubUrl,
        (status) => {
          githubStatus = status;
        },
        { token },
      );

      if (sourceFile) {
        injectFile(sourceFile);
      }

      if (includeCommits && sourceFile) {
        try {
          const resolvedBranch =
            sourceFile.bdsGitHub?.branch || parsed.branch || "main";
          const requestedCommitCount = normalizeGitHubCommitCount(
            commitCountInput,
            DEFAULT_GITHUB_COMMIT_COUNT,
          );
          const commitFile = await fetchGitHubCommits(
            githubUrl,
            requestedCommitCount,
            (status) => {
              githubStatus = status;
            },
            {
              token,
              branch: resolvedBranch,
            },
          );

          if (commitFile) {
            injectFile(commitFile);
          }
        } catch (error) {
          if (appState.ui) {
            appState.ui.showToast(
              t('attachMenu.commitsFailed', { msg: error?.message || '' }),
            );
          }
        }
      }

      if (sourceFile) {
        showGithubDialog = false;
      }
    } catch (err) {
      githubError = t('attachMenu.repoFailed', { msg: err.message || '' });
    } finally {
      githubLoading = false;
    }
  }

  function handleWebImport() {
    closeMenu();
    webUrl = "";
    webStatus = "";
    webError = "";
    webLoading = false;
    showWebDialog = true;
  }

  async function submitWebUrl() {
    if (!webUrl.trim() || webLoading) return;

    try {
      new URL(webUrl); // Basic validation
    } catch {
      webError = t('attachMenu.invalidWebUrl');
      return;
    }

    webError = "";
    webLoading = true;

    try {
      const file = await fetchAndConvertWebPage(webUrl, (status) => {
        webStatus = status;
      });

      if (file) {
        showWebDialog = false;
        injectFile(file);
      }
    } catch (err) {
      webError = t('attachMenu.webFetchFailed', { msg: err.message || '' });
    } finally {
      webLoading = false;
    }
  }

  function checkExpertModeWarning() {
    if (currentModelType === "expert" || currentModelType === "deepthink") {
      if (appState.ui) {
        appState.ui.showToast(t('attachMenu.expertModeWarning'));
      }
    }
  }

  async function injectFile(file) {
    checkExpertModeWarning();
    const target = resolveNativeInput();
    if (!target) {
      try {
        await sendFileWithMessage(file, "", "AttachMenu file fallback");
      } catch (err) {
        console.error("[AttachMenu] Fallback sendFileWithMessage failed:", err);
        if (appState.ui) appState.ui.showToast(t('attachMenu.filePickFailed'));
      }
      return;
    }
    const dt = new DataTransfer();
    if (target.files) {
      for (let i = 0; i < target.files.length; i++) {
        dt.items.add(target.files[i]);
      }
    }
    dt.items.add(file);
    target.files = dt.files;
    target.dispatchEvent(new Event("change", { bubbles: true }));
    window.dispatchEvent(new CustomEvent("bds:files-changed"));
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function hasMessages() {
    return document.querySelectorAll("div.ds-message").length > 0;
  }

  function openProjectPanel(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (showProjectPanel) {
      showProjectPanel = false;
      return;
    }
    refreshProjectPanel();
    if (projectBtnRef && typeof window !== "undefined" && window.innerWidth >= 768) {
      const rect = projectBtnRef.getBoundingClientRect();
      // Guard against overflow on narrow viewports: if the panel would
      // extend past the right edge, align it to the right instead.
      const panelW = 300;
      const viewportW = window.innerWidth;
      let left = rect.left;
      if (left + panelW > viewportW - 8) {
        left = Math.max(8, viewportW - panelW - 8);
      }
      projectPanelStyle =
        `bottom: calc(100vh - ${rect.top}px + 8px); left: ${left}px; max-width: ${Math.min(panelW, viewportW - 16)}px;`;
    } else {
      projectPanelStyle = "";
    }
    showProjectPanel = true;
  }

  function refreshProjectPanel() {
    panelProjects = [...appState.projects];
    panelActiveProjectId = appState.activeProjectId || "";
    panelFiles = panelActiveProjectId
      ? getFilesForProject(panelActiveProjectId)
      : [];
    panelTickedIds = [...appState.activeFileIds];
  }

  function handlePanelProjectChange(e) {
    applyPanelSwitch(e.target.value || "");
  }

  function applyPanelSwitch(id) {
    if (id) setActiveProject(id);
    else clearActiveProject();
    panelActiveProjectId = appState.activeProjectId || "";
    panelFiles = panelActiveProjectId
      ? getFilesForProject(panelActiveProjectId)
      : [];
    panelTickedIds = [...appState.activeFileIds];
    pushConfigToPage();
    if (appState.ui) appState.ui.refreshProjects();
  }

  function handlePanelFileToggle(fileId, checked) {
    if (checked) tickFile(fileId);
    else untickFile(fileId);
    panelTickedIds = [...appState.activeFileIds];
    pushConfigToPage();
  }

  function attachPanelFiles() {
    if (!panelTickedIds.length) return;
    const activeFiles = panelFiles.filter((f) => panelTickedIds.includes(f.id));
    if (!activeFiles.length) return;
    const activeProject = panelProjects.find(
      (p) => p.id === panelActiveProjectId,
    );
    const file = projectFilesToFile(
      activeFiles,
      activeProject?.name || "Project",
    );
    if (!file) return;
    injectFile(file);
    showProjectPanel = false;
  }

  function toggleSelectAll() {
    if (panelTickedIds.length === panelFiles.length) {
      for (const id of [...panelTickedIds]) untickFile(id);
      panelTickedIds = [];
    } else {
      for (const file of panelFiles) {
        if (!panelTickedIds.includes(file.id)) tickFile(file.id);
      }
      panelTickedIds = [...appState.activeFileIds];
    }
    pushConfigToPage();
  }

  function handleDialogKeydown(e, type) {
    if (e.key === "Enter") {
      if (type === "github" && !githubLoading) submitGithubUrl();
      if (type === "web" && !webLoading) submitWebUrl();
    }
  }
</script>

{#if shouldShowAttach}
<div class="bds-attach-wrapper" bind:this={menuRef}>
  {#if shouldShowPlus}
  <button type="button" class="bds-plus-btn" onclick={toggleMenu} title={t('attachMenu.buttonTitle')}>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  </button>
  {/if}

  {#if shouldShowProject}
  <button
    class="bds-project-btn"
    bind:this={projectBtnRef}
    onclick={openProjectPanel}
    title={t('attachMenu.attachProject')}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      style="opacity:0.65"
    >
      <path
        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
      />
    </svg>
  </button>
  {/if}

  {#if shouldShowVoice && supportsVoiceInput}
    <button
      class="bds-mic-btn {isRecording ? 'bds-recording' : ''}"
      onclick={toggleSpeechRecognition}
      title={isRecording ? t('attachMenu.stopRecording') : t('attachMenu.voicePrompt')}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={isRecording ? "currentColor" : "none"}
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
      {#if isRecording}
        <div class="bds-recording-pulse"></div>
      {/if}
    </button>
  {/if}

  {#if isOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bds-attach-backdrop" use:portal onclick={() => (isOpen = false)}></div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="bds-attach-dropdown"
      style={dropdownStyle}
      use:portal
      use:dragToDismiss={{ onDismiss: () => (isOpen = false), handleSelector: '.bds-sheet-handle, .bds-sheet-header' }}
      onclick={(event) => event.stopPropagation()}
    >
      <div class="bds-sheet-handle" aria-hidden="true"></div>
      <div class="bds-sheet-header">
        <span class="bds-sheet-title">{i18n.locale === "bn" ? "টুলস ও সংযুক্তি" : "Tools & Actions"}</span>
        <button type="button" class="bds-sheet-close" onclick={() => (isOpen = false)} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        bind:this={cameraInputRef}
        onchange={handleCameraFileChange}
        style="display: none;"
      />

      {#if shouldShowUploadFile}
      <button type="button" class="bds-attach-item" onclick={handleUploadFile}>
        <span class="bds-item-icon-box">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="bds-item-icon"
            ><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            ></path><polyline points="14 2 14 8 20 8"></polyline><line
              x1="12"
              y1="18"
              x2="12"
              y2="12"
            ></line><line x1="9" y1="15" x2="15" y2="15"></line></svg
          >
        </span>
        <span class="bds-item-content">
          <span class="bds-item-title">{t('attachMenu.uploadFile')}</span>
          <span class="bds-item-desc">{t('attachMenu.uploadFileDesc') || 'PDF, images, documents & code'}</span>
        </span>
      </button>
      {/if}

      <button type="button" class="bds-attach-item" onclick={handleCameraClick}>
        <span class="bds-item-icon-box">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="bds-item-icon"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
        </span>
        <span class="bds-item-content">
          <span class="bds-item-title">{t('attachMenu.cameraPhoto') || 'Camera & Photos'}</span>
          <span class="bds-item-desc">{t('attachMenu.cameraPhotoDesc') || 'Take photos or upload images'}</span>
        </span>
      </button>

      <button type="button" class="bds-attach-item" onclick={toggleNativeWebSearch}>
        <span class="bds-item-icon-box">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="bds-item-icon"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
        </span>
        <span class="bds-item-content">
          <span class="bds-item-title">{t('attachMenu.webSearchMode') || 'Web Search Mode'}</span>
          <span class="bds-item-desc">{t('attachMenu.webSearchModeDesc') || 'Search the live web for real-time answers'}</span>
        </span>
      </button>

      <button type="button" class="bds-attach-item" onclick={toggleNativeDeepThink}>
        <span class="bds-item-icon-box">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="bds-item-icon"
          >
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
            <circle cx="12" cy="12" r="4"/>
          </svg>
        </span>
        <span class="bds-item-content">
          <span class="bds-item-title">{t('attachMenu.deepThinkR1') || 'DeepThink (R1)'}</span>
          <span class="bds-item-desc">{t('attachMenu.deepThinkR1Desc') || 'Deep reasoning and chain of thought'}</span>
        </span>
      </button>

      <button type="button" class="bds-attach-item" onclick={toggleDeepResearch}>
        <span class="bds-item-icon-box" class:bds-item-icon-accent={isDeepResearchActive}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="bds-item-icon"
          >
            <path d="M2 12h5l3 7 4-14 3 7h5"/>
          </svg>
        </span>
        <span class="bds-item-content">
          <span class="bds-item-title">{t('attachMenu.deepResearch') || 'Deep Research'} {isDeepResearchActive ? '✓' : ''}</span>
          <span class="bds-item-desc">{t('attachMenu.deepResearchDesc') || 'Autonomous multi-step web investigation'}</span>
        </span>
      </button>

      <button type="button" class="bds-attach-item" onclick={handleCustomCommands}>
        <span class="bds-item-icon-box">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="bds-item-icon"
          >
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
        </span>
        <span class="bds-item-content">
          <span class="bds-item-title">{t('attachMenu.customCommands') || 'Commands & Prompts'}</span>
          <span class="bds-item-desc">{t('attachMenu.customCommandsDesc') || 'Quick shortcuts, snippets & tools'}</span>
        </span>
      </button>

      <button type="button" class="bds-attach-item" data-testid="attach-menu-deep-code" onclick={handleDeepCode}>
        <span class="bds-item-icon-box">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="bds-item-icon"
          >
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </span>
        <span class="bds-item-content">
          <span class="bds-item-title">
            {t('attachMenu.deepCode') || 'Deep Code'}
            {#if isDeepCodeActive}
              <span class="bds-active-badge">✓ {activeDirectoryName || 'On'}</span>
            {/if}
          </span>
          <span class="bds-item-desc">{t('attachMenu.deepCodeDesc') || 'Collaborative coding workspace & project dev'}</span>
        </span>
      </button>

      {#if shouldShowUploadFolder && supportsFolderUpload}
        <button type="button" class="bds-attach-item" onclick={handleUploadFolder}>
          <span class="bds-item-icon-box">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="bds-item-icon"
              ><path
                d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
              ></path><line x1="12" y1="11" x2="12" y2="17"></line><line
                x1="9"
                y1="14"
                x2="15"
                y2="14"
              ></line></svg
            >
          </span>
          <span class="bds-item-content">
            <span class="bds-item-title">{t('attachMenu.uploadFolder')}</span>
            <span class="bds-item-desc">{t('attachMenu.uploadFolderDesc') || 'Read directory files via picker'}</span>
          </span>
        </button>
      {/if}

      {#if shouldShowProject}
        <button type="button" class="bds-attach-item" onclick={(e) => { isOpen = false; openProjectPanel(e); }}>
          <span class="bds-item-icon-box">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="bds-item-icon"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </span>
          <span class="bds-item-content">
            <span class="bds-item-title">{t('attachMenu.attachProject')}</span>
            <span class="bds-item-desc">{panelActiveProjectId ? (panelProjects.find(p => p.id === panelActiveProjectId)?.name || "Active Project") : (t('attachMenu.attachProjectDesc') || "Attach project files & context")}</span>
          </span>
        </button>
      {/if}

      {#if shouldShowGithub}
      <button type="button" class="bds-attach-item" onclick={handleGithubImport}>
        <span class="bds-item-icon-box">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="bds-item-icon"
            ><path
              d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
            ></path></svg
          >
        </span>
        <span class="bds-item-content">
          <span class="bds-attach-item-label">
            <span class="bds-item-title">{t('attachMenu.githubRepo')}</span>
            {#if hasGithubToken()}
              <span
                class="bds-github-auth-icon"
                aria-label={t('attachMenu.githubAuthLabel')}
                title={t('attachMenu.githubAuthLabel')}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.15"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="5" y="11" width="14" height="10" rx="2"></rect>
                  <path d="M8 11V8a4 4 0 0 1 8 0v3"></path>
                </svg>
              </span>
            {/if}
          </span>
          <span class="bds-item-desc">{t('attachMenu.githubRepoDesc') || 'Clone and inspect repo files'}</span>
        </span>
      </button>
      {/if}

      {#if shouldShowWeb}
      <button type="button" class="bds-attach-item" onclick={handleWebImport}>
        <span class="bds-item-icon-box">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="bds-item-icon"
            ><circle cx="12" cy="12" r="10"></circle><line
              x1="2"
              y1="12"
              x2="22"
              y2="12"
            ></line><path
              d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
            ></path></svg
          >
        </span>
        <span class="bds-item-content">
          <span class="bds-item-title">{t('attachMenu.fetchWebPage')}</span>
          <span class="bds-item-desc">{t('attachMenu.fetchWebPageDesc') || 'Extract text and content from URL'}</span>
        </span>
      </button>
      {/if}
    </div>
  {/if}
</div>
{/if}

{#if showGithubDialog}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="bds-github-overlay"
    use:portal
    onclick={(event) => {
      if (event.target !== event.currentTarget) return;
      if (!githubLoading) showGithubDialog = false;
    }}
  >
    <div
      class="bds-github-dialog"
      bind:this={dialogRef}
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
      <div class="bds-github-header">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="bds-github-logo"
          ><path
            d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
          ></path></svg
        >
        <span>{t('attachMenu.githubImportTitle')}</span>
        {#if hasGithubToken()}
          <span class="bds-github-auth-pill">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.15"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="5" y="11" width="14" height="10" rx="2"></rect>
              <path d="M8 11V8a4 4 0 0 1 8 0v3"></path>
            </svg>
            {t('attachMenu.authenticated')}
          </span>
        {/if}
        {#if !githubLoading}
          <button
            type="button"
            class="bds-github-close"
            onclick={() => (showGithubDialog = false)}>&times;</button
          >
        {/if}
      </div>

      <div class="bds-github-body">
        <input
          class="bds-github-input"
          type="text"
          placeholder={t('attachMenu.githubPlaceholder')}
          bind:value={githubUrl}
          onkeydown={(e) => handleDialogKeydown(e, "github")}
          disabled={githubLoading}
          autofocus
        />

        <label class="bds-github-checkbox">
          <input
            type="checkbox"
            bind:checked={includeCommits}
            disabled={githubLoading}
          />
          <span>{t('attachMenu.includeCommits')}</span>
        </label>

        {#if includeCommits}
          <label class="bds-github-number">
            <span>{t('attachMenu.commitsLabel')}</span>
            <input
              class="bds-github-number-input"
              type="number"
              step="1"
              inputmode="numeric"
              value={commitCountInput}
              placeholder={String(DEFAULT_GITHUB_COMMIT_COUNT)}
              oninput={handleCommitCountInput}
              onkeydown={(e) => handleDialogKeydown(e, "github")}
              disabled={githubLoading}
            />
          </label>
        {/if}

        {#if githubError}
          <div class="bds-github-error">{githubError}</div>
        {/if}

        {#if githubStatus && githubLoading}
          <div class="bds-github-status">
            <div class="bds-spinner"></div>
            <span>{githubStatus}</span>
          </div>
        {/if}
      </div>

      <div class="bds-github-footer">
        <button
          type="button"
          class="bds-github-btn bds-github-btn-cancel"
          onclick={() => {
            if (!githubLoading) showGithubDialog = false;
          }}
          disabled={githubLoading}
        >
          {t('attachMenu.close')}
        </button>
        <button
          type="button"
          class="bds-github-btn bds-github-btn-import"
          onclick={submitGithubUrl}
          disabled={githubLoading || !githubUrl.trim()}
        >
          {githubLoading ? t('attachMenu.fetching') : t('attachMenu.fetch')}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showProjectPanel}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="bds-attach-backdrop" use:portal onclick={() => (showProjectPanel = false)}></div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="bds-project-panel"
    style={projectPanelStyle}
    use:portal
    use:dragToDismiss={{ onDismiss: () => (showProjectPanel = false), handleSelector: '.bds-sheet-handle, .bds-pp-header' }}
    bind:this={projectPanelRef}
    onclick={(event) => event.stopPropagation()}
  >
    <div class="bds-sheet-handle" aria-hidden="true"></div>
    <div class="bds-pp-header">
      <span class="bds-pp-label">{t('attachMenu.projectLabel')}</span>
      <select
        class="bds-pp-select"
        value={panelActiveProjectId}
        onchange={handlePanelProjectChange}
      >
        <option value="">{t('attachMenu.noProject')}</option>
        {#each panelProjects as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
      <button type="button" class="bds-pp-close" onclick={() => (showProjectPanel = false)} aria-label="Close Project Panel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <p class="bds-pp-hint">
      {t('attachMenu.projectHint')}
    </p>

    {#if panelActiveProjectId && panelFiles.length > 0}
      <div class="bds-pp-files-header">
        <span class="bds-pp-files-count"
          >{panelFiles.length} {panelFiles.length === 1 ? t('attachMenu.file') : t('attachMenu.files')}</span
        >
        <button type="button" class="bds-pp-select-all" onclick={toggleSelectAll}>
          {panelTickedIds.length === panelFiles.length
            ? t('attachMenu.deselectAll')
            : t('attachMenu.selectAll')}
        </button>
      </div>
      <div class="bds-pp-files">
        {#each panelFiles as file (file.id)}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <label
            class="bds-pp-pill{panelTickedIds.includes(file.id)
              ? ' bds-pp-pill--active'
              : ''}"
            title={file.name}
          >
            <input
              type="checkbox"
              class="bds-sr-only"
              checked={panelTickedIds.includes(file.id)}
              onchange={(e) =>
                handlePanelFileToggle(file.id, e.target.checked)}
            />
            <span class="bds-pp-pill-check" aria-hidden="true">
              {#if panelTickedIds.includes(file.id)}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="currentColor"
                  ><path d="M8.5 2L4 7 1.5 4.5l-.7.7L4 8.5 9.2 2.7z" /></svg
                >
              {:else}
                <span class="bds-pp-pill-box"></span>
              {/if}
            </span>
            <span class="bds-pp-pill-name">{file.name.split("/").pop()}</span>
          </label>
        {/each}
      </div>
      {#if panelTickedIds.length > 0}
        <div class="bds-pp-footer">
          <button type="button" class="bds-pp-attach" onclick={attachPanelFiles}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
              />
            </svg>
            {t('attachMenu.attach', { count: panelTickedIds.length })}
          </button>
        </div>
      {/if}
    {:else if panelActiveProjectId}
      <p class="bds-pp-empty">{t('attachMenu.noFiles')}</p>
    {:else}
      <p class="bds-pp-empty">{t('attachMenu.noProjectSelected')}</p>
    {/if}
  </div>
{/if}

{#if showWebDialog}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="bds-github-overlay"
    use:portal
    onclick={(event) => {
      if (event.target !== event.currentTarget) return;
      if (!webLoading) showWebDialog = false;
    }}
  >
    <div
      class="bds-github-dialog"
      bind:this={dialogRef}
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
      <div class="bds-github-header">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><circle cx="12" cy="12" r="10"></circle><line
            x1="2"
            y1="12"
            x2="22"
            y2="12"
          ></line><path
            d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
          ></path></svg
        >
        <span>{t('attachMenu.webImportTitle')}</span>
        {#if !webLoading}
          <button
            type="button"
            class="bds-github-close"
            onclick={() => (showWebDialog = false)}>&times;</button
          >
        {/if}
      </div>

      <div class="bds-github-body">
        <input
          class="bds-github-input"
          type="text"
          placeholder={t('attachMenu.webPlaceholder')}
          bind:value={webUrl}
          onkeydown={(e) => handleDialogKeydown(e, "web")}
          disabled={webLoading}
          autofocus
        />

        {#if webError}
          <div class="bds-github-error">{webError}</div>
        {/if}

        {#if webStatus && webLoading}
          <div class="bds-github-status">
            <div class="bds-spinner"></div>
            <span>{webStatus}</span>
          </div>
        {/if}
      </div>

      <div class="bds-github-footer">
        <button
          type="button"
          class="bds-github-btn bds-github-btn-cancel"
          onclick={() => {
            if (!webLoading) showWebDialog = false;
          }}
          disabled={webLoading}
        >
          {t('attachMenu.close')}
        </button>
        <button
          type="button"
          class="bds-github-btn bds-github-btn-import"
          onclick={submitWebUrl}
          disabled={webLoading || !webUrl.trim()}
        >
          {webLoading ? t('attachMenu.fetching') : t('attachMenu.fetch')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bds-attach-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-right: 6px;
  }

  .bds-plus-btn {
    background: transparent;
    border: none;
    color: var(--bds-accent);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background-color var(--bds-transition, 0.18s ease),
      transform 0.1s ease;
  }

  .bds-plus-btn:hover {
    background-color: var(--bds-accent-glow);
  }

  .bds-plus-btn:active {
    transform: scale(0.95);
  }

  .bds-mic-btn {
    position: relative;
    background: transparent;
    border: none;
    color: var(--bds-accent);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all var(--bds-transition, 0.18s ease);
    margin-right: 2px;
  }

  .bds-mic-btn:hover {
    background-color: var(--bds-accent-glow);
  }

  .bds-mic-btn.bds-recording {
    color: #ef4444;
    background-color: rgba(239, 68, 68, 0.1);
  }

  .bds-recording-pulse {
    position: absolute;
    inset: -2px;
    border: 2px solid #ef4444;
    border-radius: 50%;
    animation: bds-pulse 1.5s infinite;
    opacity: 0;
  }

  @keyframes bds-pulse {
    0% {
      transform: scale(1);
      opacity: 0.6;
    }
    100% {
      transform: scale(1.5);
      opacity: 0;
    }
  }

  .bds-attach-dropdown {
    position: fixed;
    background: var(--bds-bg-panel);
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius, 14px);
    box-shadow: var(--bds-shadow);
    padding: 6px;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    z-index: 999999;
  }

  .bds-attach-item {
    background: none;
    border: none;
    color: var(--bds-text-primary);
    padding: 10px 12px;
    text-align: left;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: background-color var(--bds-transition, 0.18s ease);
    white-space: nowrap;
  }

  .bds-attach-item:hover {
    background: var(--bds-bg-hover);
  }

  .bds-item-icon {
    opacity: 0.8;
    flex-shrink: 0;
  }

  .bds-attach-item-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .bds-github-auth-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    color: var(--bds-accent);
    background: var(--bds-accent-glow);
    border: 1px solid var(--bds-border);
    flex-shrink: 0;
  }

  .bds-attach-divider {
    height: 1px;
    background: var(--bds-border);
    margin: 4px 6px;
  }

  /* ─── GitHub Dialog ─── */

  .bds-github-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999999;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }

  .bds-github-dialog {
    background: var(--bds-bg-panel);
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius, 14px);
    width: 440px;
    max-width: 90vw;
    box-shadow: var(--bds-shadow);
    overflow: hidden;
  }

  .bds-github-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--bds-border);
    font-size: 15px;
    font-weight: 600;
    color: var(--bds-text-primary);
  }

  .bds-github-logo {
    opacity: 0.9;
  }

  .bds-github-close {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--bds-text-tertiary);
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .bds-github-close:hover {
    color: var(--bds-text-primary);
  }

  .bds-github-auth-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid var(--bds-border);
    background: var(--bds-accent-glow);
    color: var(--bds-accent);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
  }

  .bds-github-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bds-github-body > * {
    min-width: 0;
  }

  .bds-github-input {
    display: block;
    box-sizing: border-box;
    max-width: 100%;
    background: var(--bds-bg-input);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 13px;
    color: var(--bds-text-primary);
    outline: none;
    transition:
      border-color var(--bds-transition, 0.18s ease),
      box-shadow var(--bds-transition, 0.18s ease);
    font-family: inherit;
    width: 100%;
  }

  .bds-github-input:focus {
    border-color: var(--bds-accent);
    box-shadow: 0 0 0 3px var(--bds-accent-glow);
  }

  .bds-github-input:disabled {
    opacity: 0.6;
  }

  .bds-github-error {
    color: var(--bds-danger, #f87171);
    font-size: 13px;
    padding: 0 2px;
  }

  .bds-github-checkbox {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--bds-text-primary);
    font-size: 13px;
    cursor: pointer;
    user-select: none;
  }

  .bds-github-checkbox input {
    margin: 0;
    accent-color: var(--bds-accent);
  }

  .bds-github-number {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--bds-text-secondary);
    font-size: 13px;
    flex-wrap: wrap;
  }

  .bds-github-number-input {
    width: 96px;
    min-width: 0;
    background: var(--bds-bg-input);
    border: 1px solid var(--bds-border);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    color: var(--bds-text-primary);
    outline: none;
    transition:
      border-color var(--bds-transition, 0.18s ease),
      box-shadow var(--bds-transition, 0.18s ease);
  }

  .bds-github-number-input:focus {
    border-color: var(--bds-accent);
    box-shadow: 0 0 0 3px var(--bds-accent-glow);
  }

  .bds-github-number-input:disabled {
    opacity: 0.6;
  }

  .bds-github-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--bds-accent);
    padding: 0 2px;
  }

  .bds-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid transparent;
    border-top-color: var(--bds-accent);
    border-radius: 50%;
    animation: bds-spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes bds-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .bds-github-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--bds-border);
  }

  .bds-github-btn {
    padding: 7px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--bds-transition, 0.18s ease);
  }

  .bds-github-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .bds-github-btn-cancel {
    border: 1px solid var(--bds-border);
    background: transparent;
    color: var(--bds-text-primary);
  }

  .bds-github-btn-cancel:hover:not(:disabled) {
    background: var(--bds-bg-elevated);
    border-color: var(--bds-border-hover);
  }

  .bds-github-btn-import {
    border: none;
    background: var(--bds-accent);
    color: #fff;
  }

  .bds-github-btn-import:hover:not(:disabled) {
    opacity: 0.88;
  }

  .bds-attach-item--project {
    color: var(--bds-accent);
  }

  .bds-attach-item--project:hover {
    background: var(--bds-accent-glow);
    color: var(--bds-accent);
  }

  .bds-picker-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 4px;
    border-radius: 5px;
    cursor: pointer;
    border-bottom: 1px solid var(--bds-border);
  }

  .bds-picker-row:last-child {
    border-bottom: none;
  }

  .bds-picker-row:hover {
    background: var(--bds-bg-hover);
  }

  .bds-picker-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .bds-picker-name {
    font-size: 13px;
    color: var(--bds-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bds-picker-size {
    font-size: 10px;
    color: var(--bds-text-tertiary);
    margin-top: 1px;
  }

  /* ─── Project Panel ─── */

  .bds-project-btn {
    background: transparent;
    border: none;
    color: var(--bds-accent);
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color var(--bds-transition, 0.18s ease);
    flex-shrink: 0;
    padding: 0;
  }

  .bds-project-btn:hover {
    background-color: var(--bds-accent-glow);
  }

  .bds-project-btn--active {
    color: var(--bds-accent);
  }

  .bds-project-panel {
    position: fixed;
    background: var(--bds-bg-panel);
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius, 14px);
    box-shadow: var(--bds-shadow);
    min-width: 240px;
    max-width: 300px;
    z-index: 999999;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
  }

  .bds-pp-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--bds-border);
  }

  .bds-pp-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--bds-text-tertiary);
    flex-shrink: 0;
  }

  .bds-pp-select {
    background: var(--bds-bg-input);
    border: 1px solid var(--bds-border);
    border-radius: 6px;
    color: var(--bds-text-primary);
    font-size: 13px;
    padding: 5px 8px;
    cursor: pointer;
    flex: 1;
    outline: none;
    min-width: 0;
    font-family: inherit;
    transition:
      border-color var(--bds-transition, 0.18s ease),
      box-shadow var(--bds-transition, 0.18s ease);
  }

  .bds-pp-select:focus {
    border-color: var(--bds-accent);
    box-shadow: 0 0 0 3px var(--bds-accent-glow);
  }

  .bds-pp-hint {
    font-size: 11px;
    color: var(--bds-text-secondary);
    padding: 6px 12px 8px;
    margin: 0;
    line-height: 1.45;
    border-bottom: 1px solid var(--bds-border);
  }

  .bds-pp-files-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px 2px;
  }

  .bds-pp-files-count {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--bds-text-tertiary);
  }

  .bds-pp-select-all {
    background: none;
    border: none;
    color: var(--bds-accent);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: background var(--bds-transition, 0.18s ease);
    font-family: inherit;
  }

  .bds-pp-select-all:hover {
    background: var(--bds-accent-glow);
  }

  .bds-pp-files {
    display: flex;
    flex-direction: column;
    padding: 6px 8px;
    gap: 1px;
    max-height: 210px;
    overflow-y: auto;
  }

  .bds-pp-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: var(--bds-text-primary);
    transition: background var(--bds-transition, 0.18s ease);
    user-select: none;
  }

  .bds-pp-pill:hover {
    background: var(--bds-bg-hover);
  }

  .bds-pp-pill--active {
    color: var(--bds-accent);
    background: var(--bds-accent-glow);
  }

  .bds-pp-pill--active:hover {
    background: var(--bds-accent-glow);
    filter: brightness(1.15);
  }

  .bds-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .bds-pp-pill-check {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 14px;
    height: 14px;
  }

  .bds-pp-pill-box {
    display: block;
    width: 10px;
    height: 10px;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    opacity: 0.3;
  }

  .bds-pp-pill-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .bds-pp-footer {
    padding: 8px 10px;
    border-top: 1px solid var(--bds-border);
  }

  .bds-pp-attach {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 7px 12px;
    background: var(--bds-accent);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    transition: opacity var(--bds-transition, 0.18s ease);
    font-family: inherit;
  }

  .bds-pp-attach:hover {
    opacity: 0.88;
  }

  .bds-pp-empty {
    font-size: 12px;
    color: var(--bds-text-tertiary);
    font-style: italic;
    padding: 14px 12px;
    margin: 0;
    text-align: center;
  }

  .bds-pp-confirm {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bds-pp-confirm-text {
    font-size: 12px;
    color: var(--bds-text-secondary);
  }

  .bds-pp-confirm-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  /* ─── Backdrop Overlay ─── */
  .bds-attach-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 999998;
    animation: bds-fade-in 0.18s ease;
  }

  .bds-sheet-handle,
  .bds-sheet-header,
  .bds-pp-close,
  .bds-item-arrow,
  .bds-item-desc {
    display: none;
  }

  .bds-item-icon-box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .bds-item-content {
    display: inline-flex;
    align-items: center;
  }

  @media (max-width: 767px) {
    .bds-project-btn {
      display: none !important;
    }

    .bds-sheet-handle {
      display: block;
      width: 40px;
      height: 5px;
      border-radius: 3px;
      background: var(--bds-border-hover, rgba(255, 255, 255, 0.28));
      margin: 2px auto 14px;
      touch-action: none;
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
      transition: background 0.15s ease, transform 0.15s ease;
    }

    .bds-sheet-handle:active {
      cursor: grabbing;
      transform: scale(1.05);
      background: var(--bds-text-tertiary, rgba(255, 255, 255, 0.45));
    }

    .bds-sheet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4px 10px;
      border-bottom: 1px solid var(--bds-border);
      margin-bottom: 8px;
    }

    .bds-sheet-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--bds-text-primary);
    }

    .bds-sheet-close,
    .bds-pp-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: transparent;
      border: none;
      color: var(--bds-text-tertiary);
      font-size: 16px;
      cursor: pointer;
      border-radius: 50%;
    }

    .bds-sheet-close:active,
    .bds-pp-close:active {
      background: var(--bds-bg-hover);
      color: var(--bds-text-primary);
    }

    .bds-attach-dropdown {
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      top: auto !important;
      width: 100vw !important;
      max-width: 100vw !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      max-height: 85vh !important;
      overflow-y: auto !important;
      background: #18181b !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      border-bottom: none !important;
      border-radius: 28px 28px 0 0 !important;
      padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 20px) !important;
      box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.6) !important;
      animation: bds-sheet-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
    }

    .bds-attach-item {
      padding: 12px 14px !important;
      border-radius: 14px !important;
      gap: 14px !important;
      white-space: normal !important;
      background: #242428 !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      margin-bottom: 8px !important;
      text-align: left !important;
      align-items: center !important;
      justify-content: flex-start !important;
      width: 100% !important;
      box-sizing: border-box !important;
      transition: background-color 0.15s ease, border-color 0.15s ease !important;
    }

    .bds-attach-item:hover,
    .bds-attach-item:active {
      background: #2a2a30 !important;
      border-color: rgba(255, 255, 255, 0.18) !important;
    }

    .bds-item-icon-box {
      width: 38px !important;
      height: 38px !important;
      min-width: 38px !important;
      border-radius: 10px !important;
      background: #1c1c1f !important;
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: var(--bds-accent, #4d6bfe) !important;
      flex-shrink: 0 !important;
    }

    .bds-item-icon-accent {
      background: rgba(77, 107, 254, 0.15) !important;
      border-color: var(--bds-accent, #4d6bfe) !important;
    }

    .bds-item-content {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      text-align: left !important;
      gap: 2px !important;
      flex: 1 !important;
      min-width: 0 !important;
    }

    .bds-item-title {
      font-size: 14px !important;
      font-weight: 600 !important;
      color: #f4f4f5 !important;
      text-align: left !important;
      line-height: 1.3 !important;
    }

    .bds-active-badge {
      display: inline-flex !important;
      align-items: center !important;
      font-size: 10px !important;
      font-weight: 600 !important;
      padding: 1px 6px !important;
      border-radius: 10px !important;
      background: rgba(16, 185, 129, 0.15) !important;
      color: #10b981 !important;
      margin-left: 6px !important;
      vertical-align: middle !important;
    }

    .bds-item-desc {
      display: block !important;
      font-size: 11.5px !important;
      font-weight: 400 !important;
      color: #a1a1aa !important;
      text-align: left !important;
      line-height: 1.3 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    .bds-item-arrow {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: #71717a !important;
      margin-left: auto !important;
      flex-shrink: 0 !important;
      opacity: 0.7 !important;
    }

    .bds-project-panel {
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      top: auto !important;
      width: 100% !important;
      max-width: 100% !important;
      max-height: 80vh !important;
      border-radius: 24px 24px 0 0 !important;
      padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 20px) !important;
      box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.5) !important;
      animation: bds-sheet-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
  }

  @keyframes bds-sheet-slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
</style>
