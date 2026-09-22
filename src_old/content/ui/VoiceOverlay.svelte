<script>
  import { onMount, onDestroy } from "svelte";
  import { i18n } from "../../lib/i18n.svelte.js";
  import appState from "../state.js";

  let {
    visible = false,
    onclose = () => {}
  } = $props();

  // Voice Mode States: 'idle' | 'listening' | 'thinking' | 'speaking'
  let voiceState = $state("idle");
  let isMuted = $state(false);
  let liveTranscript = $state("");
  let assistantResponse = $state("");
  let audioLevel = $state(0.2); // 0.0 to 1.0 for visualizer scale
  let selectedLanguage = $state(appState.settings?.voiceLanguage || (typeof navigator !== "undefined" ? navigator.language : "en-US"));

  let canvasEl = $state(null);
  let animationFrameId = null;
  let audioCtx = null;
  let analyser = null;
  let micStream = null;
  let recognition = null;
  let isRecognitionRunning = false;

  function triggerHaptic(type = "CLICK") {
    if (typeof window !== "undefined") {
      if (window.AndroidBridge?.performHaptic) {
        window.AndroidBridge.performHaptic(type);
      } else if (navigator?.vibrate) {
        navigator.vibrate(type === "HEAVY" ? 25 : 12);
      }
    }
  }

  // Watch visibility to start or stop voice mode
  $effect(() => {
    if (visible) {
      startVoiceSession();
    } else {
      stopVoiceSession();
    }
  });

  async function startVoiceSession() {
    triggerHaptic("MEDIUM");
    voiceState = "listening";
    liveTranscript = "";
    assistantResponse = "";

    try {
      await setupAudioVisualizer();
    } catch (err) {
      console.warn("[BDS] AudioContext visualizer fallback:", err);
    }

    startSpeechRecognition();
    startCanvasVisualizer();
  }

  function stopVoiceSession() {
    stopSpeechRecognition();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (audioCtx && audioCtx.state !== "closed") {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    voiceState = "idle";
  }

  async function setupAudioVisualizer() {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        const source = audioCtx.createMediaStreamSource(micStream);
        source.connect(analyser);
      }
    } catch (e) {
      console.log("[BDS] Mic stream not directly available for analyser, using waveform simulation");
    }
  }

  function startSpeechRecognition() {
    if (typeof window === "undefined") return;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      liveTranscript = "Speech recognition is not supported in this environment.";
      return;
    }

    try {
      recognition = new SpeechRec();
      recognition.lang = selectedLanguage;
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onstart = () => {
        isRecognitionRunning = true;
        voiceState = "listening";
      };

      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        liveTranscript = transcript;
        audioLevel = Math.min(1.0, 0.3 + Math.random() * 0.7);
      };

      recognition.onerror = (event) => {
        if (event.error !== "no-speech") {
          console.warn("[BDS Voice] Recognition error:", event.error);
        }
      };

      recognition.onend = () => {
        isRecognitionRunning = false;
        if (visible && voiceState === "listening" && !isMuted) {
          try {
            recognition.start();
          } catch (_) {}
        }
      };

      recognition.start();
    } catch (err) {
      console.warn("[BDS Voice] Could not start recognition:", err);
    }
  }

  function stopSpeechRecognition() {
    if (recognition && isRecognitionRunning) {
      try {
        recognition.stop();
      } catch (_) {}
      isRecognitionRunning = false;
    }
  }

  function toggleMute() {
    triggerHaptic("CLICK");
    isMuted = !isMuted;
    if (isMuted) {
      stopSpeechRecognition();
      voiceState = "idle";
    } else {
      voiceState = "listening";
      startSpeechRecognition();
    }
  }

  function submitCurrentSpeech() {
    if (!liveTranscript.trim()) return;
    triggerHaptic("HEAVY");
    voiceState = "thinking";
    const textToSubmit = liveTranscript;
    liveTranscript = "";

    // Find and submit into DeepSeek composer textarea
    const textarea = document.querySelector('textarea[placeholder*="DeepSeek"], #chat-input, textarea');
    if (textarea) {
      textarea.value = textToSubmit;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));

      // Find send button
      setTimeout(() => {
        const sendBtn = document.querySelector('button[aria-label*="Send"], .ds-icon-send, #send-cluster button');
        if (sendBtn) {
          sendBtn.click();
        }
      }, 150);
    }

    // Monitor for incoming assistant response
    waitForAssistantReply();
  }

  function waitForAssistantReply() {
    let checkCount = 0;
    const interval = setInterval(() => {
      checkCount++;
      const lastMsg = document.querySelector(".ds-message:last-child .ds-markdown, .ds-message-content:last-child");
      if (lastMsg && lastMsg.textContent.trim().length > 10) {
        clearInterval(interval);
        speakResponse(lastMsg.textContent.trim());
      } else if (checkCount > 50) {
        clearInterval(interval);
        voiceState = "listening";
      }
    }, 400);
  }

  function speakResponse(text) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      voiceState = "listening";
      return;
    }

    voiceState = "speaking";
    assistantResponse = text.length > 280 ? text.substring(0, 280) + "..." : text;

    const cleanText = text.replace(/<[^>]*>?/gm, "").substring(0, 500);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = selectedLanguage;

    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang.startsWith(selectedLanguage.split("-")[0]));
    if (match) utterance.voice = match;

    utterance.onend = () => {
      voiceState = "listening";
      assistantResponse = "";
      if (!isMuted) startSpeechRecognition();
    };

    utterance.onerror = () => {
      voiceState = "listening";
    };

    window.speechSynthesis.speak(utterance);
  }

  function interruptSpeech() {
    triggerHaptic("CLICK");
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    assistantResponse = "";
    voiceState = "listening";
    if (!isMuted) startSpeechRecognition();
  }

  function startCanvasVisualizer() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext?.("2d");
    if (!ctx) return;
    let phase = 0;
    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    function draw() {
      if (!visible) return;
      animationFrameId = requestAnimationFrame(draw);

      const width = (canvasEl.width = canvasEl.offsetWidth * (window.devicePixelRatio || 1));
      const height = (canvasEl.height = canvasEl.offsetHeight * (window.devicePixelRatio || 1));

      ctx.clearRect(0, 0, width, height);

      let energy = 0.15;
      if (analyser && dataArray && voiceState === "listening" && !isMuted) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        energy = Math.max(0.15, (sum / dataArray.length) / 128);
      } else if (voiceState === "speaking") {
        energy = 0.4 + Math.sin(phase * 4) * 0.25;
      } else if (voiceState === "thinking") {
        energy = 0.25 + Math.sin(phase * 2) * 0.1;
      }

      phase += 0.04;

      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) * 0.22;

      // Draw multi-layered glowing fluid orb
      const layers = [
        { scale: 1.0, color: "rgba(77, 107, 254, 0.45)", blur: 30 },
        { scale: 1.15 + energy * 0.2, color: "rgba(99, 102, 241, 0.3)", blur: 40 },
        { scale: 0.85 + energy * 0.15, color: "rgba(56, 189, 248, 0.5)", blur: 20 },
      ];

      for (const layer of layers) {
        ctx.save();
        ctx.beginPath();
        const r = baseRadius * layer.scale;

        const gradient = ctx.createRadialGradient(
          centerX + Math.sin(phase) * 15,
          centerY + Math.cos(phase) * 15,
          r * 0.1,
          centerX,
          centerY,
          r * 1.4
        );

        if (voiceState === "thinking") {
          gradient.addColorStop(0, "rgba(236, 72, 153, 0.65)");
          gradient.addColorStop(0.5, "rgba(147, 51, 234, 0.4)");
          gradient.addColorStop(1, "rgba(59, 130, 246, 0.0)");
        } else if (voiceState === "speaking") {
          gradient.addColorStop(0, "rgba(16, 185, 129, 0.7)");
          gradient.addColorStop(0.5, "rgba(59, 130, 246, 0.4)");
          gradient.addColorStop(1, "rgba(99, 102, 241, 0.0)");
        } else {
          gradient.addColorStop(0, layer.color);
          gradient.addColorStop(0.6, "rgba(77, 107, 254, 0.2)");
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        }

        ctx.fillStyle = gradient;
        ctx.arc(centerX, centerY, r * (1 + energy * 0.35), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    draw();
  }

  function handleClose() {
    triggerHaptic("CLICK");
    stopVoiceSession();
    onclose();
  }

  onDestroy(() => {
    stopVoiceSession();
  });
</script>

{#if visible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="bds-voice-overlay" role="dialog" aria-modal="true" aria-label="Voice Mode">
    <!-- Top Bar -->
    <header class="bds-voice-header">
      <div class="bds-voice-badge">
        <span class="bds-voice-dot" class:listening={voiceState === 'listening'} class:speaking={voiceState === 'speaking'} class:thinking={voiceState === 'thinking'}></span>
        <span class="bds-voice-status-text">
          {#if voiceState === "listening"}Listening...{:else if voiceState === "thinking"}Thinking...{:else if voiceState === "speaking"}DeepSeek Speaking{:else}Paused{/if}
        </span>
      </div>

      <div class="bds-voice-header-actions">
        <!-- Language Selector -->
        <select class="bds-voice-lang-select" bind:value={selectedLanguage} onchange={() => {
          if (recognition) {
            recognition.lang = selectedLanguage;
          }
        }}>
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="bn-BD">বাংলা (Bengali)</option>
          <option value="zh-CN">中文 (Chinese)</option>
          <option value="es-ES">Español</option>
          <option value="fr-FR">Français</option>
          <option value="de-DE">Deutsch</option>
          <option value="ja-JP">日本語</option>
        </select>

        <!-- Exit Button -->
        <button type="button" class="bds-voice-close-btn" onclick={handleClose} title="Exit Voice Mode" aria-label="Exit Voice Mode">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </header>

    <!-- Center Stage with Visualizer Canvas & Dynamic Orb -->
    <div class="bds-voice-stage">
      <canvas bind:this={canvasEl} class="bds-voice-canvas"></canvas>

      <!-- Live Transcript & Speech Display -->
      <div class="bds-voice-transcript-card">
        {#if assistantResponse}
          <div class="bds-voice-bubble assistant">
            <span class="bds-voice-speaker">DeepSeek</span>
            <p>{assistantResponse}</p>
          </div>
        {:else if liveTranscript}
          <div class="bds-voice-bubble user">
            <span class="bds-voice-speaker">You</span>
            <p>{liveTranscript}</p>
          </div>
        {:else}
          <div class="bds-voice-hint">
            {#if voiceState === "listening"}
              Tap and speak naturally, or say anything...
            {:else if voiceState === "thinking"}
              Processing your question...
            {:else}
              Voice is muted. Tap the microphone to unmute.
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Bottom Controls Deck -->
    <footer class="bds-voice-deck">
      <!-- Mute / Unmute Button -->
      <button
        type="button"
        class="bds-voice-deck-btn"
        class:active={!isMuted}
        class:muted={isMuted}
        onclick={toggleMute}
        title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
        aria-label={isMuted ? "Unmute Microphone" : "Mute Microphone"}
      >
        {#if isMuted}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        {:else}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        {/if}
      </button>

      <!-- Submit / Done Speaking Button -->
      {#if liveTranscript.trim().length > 0}
        <button
          type="button"
          class="bds-voice-deck-btn bds-voice-submit-btn"
          onclick={submitCurrentSpeech}
          title="Send message"
          aria-label="Send message"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      {/if}

      <!-- Interrupt Button when Speaking -->
      {#if voiceState === "speaking"}
        <button
          type="button"
          class="bds-voice-deck-btn bds-voice-interrupt-btn"
          onclick={interruptSpeech}
          title="Interrupt DeepSeek"
          aria-label="Interrupt DeepSeek"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"></rect>
          </svg>
        </button>
      {/if}

      <!-- Exit Button -->
      <button
        type="button"
        class="bds-voice-deck-btn bds-voice-exit-btn"
        onclick={handleClose}
        title="End Voice Mode"
        aria-label="End Voice Mode"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </footer>
  </div>
{/if}

<style>
  .bds-voice-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100vw;
    height: 100vh;
    background: #000000;
    z-index: 100000;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    animation: bdsVoiceFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    touch-action: none;
    overflow: hidden;
  }

  @keyframes bdsVoiceFadeIn {
    from { opacity: 0; transform: scale(0.97); }
    to { opacity: 1; transform: scale(1); }
  }

  .bds-voice-header {
    width: 100%;
    max-width: 600px;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    z-index: 2;
  }

  .bds-voice-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 20px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .bds-voice-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6b7280;
    transition: all 0.2s ease;
  }

  .bds-voice-dot.listening {
    background: #4d6bfe;
    box-shadow: 0 0 10px #4d6bfe;
  }

  .bds-voice-dot.thinking {
    background: #ec4899;
    box-shadow: 0 0 10px #ec4899;
  }

  .bds-voice-dot.speaking {
    background: #10b981;
    box-shadow: 0 0 10px #10b981;
  }

  .bds-voice-status-text {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.2px;
  }

  .bds-voice-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .bds-voice-lang-select {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    color: #e5e7eb;
    font-size: 12px;
    padding: 5px 10px;
    outline: none;
    cursor: pointer;
  }

  .bds-voice-close-btn {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .bds-voice-close-btn:active {
    background: rgba(255, 255, 255, 0.2);
  }

  .bds-voice-stage {
    position: relative;
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .bds-voice-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .bds-voice-transcript-card {
    position: relative;
    z-index: 2;
    max-width: 85%;
    width: 500px;
    text-align: center;
    padding: 0 20px;
  }

  .bds-voice-bubble {
    background: rgba(24, 25, 28, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 18px;
    padding: 14px 20px;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }

  .bds-voice-speaker {
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    opacity: 0.6;
  }

  .bds-voice-bubble p {
    margin: 0;
    font-size: 15px;
    line-height: 1.5;
    color: #f3f4f6;
  }

  .bds-voice-hint {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.45);
    font-weight: 400;
  }

  .bds-voice-deck {
    width: 100%;
    max-width: 450px;
    padding: 24px 20px 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    z-index: 2;
    box-sizing: border-box;
  }

  .bds-voice-deck-btn {
    width: 58px;
    height: 58px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .bds-voice-deck-btn:active {
    transform: scale(0.92);
  }

  .bds-voice-deck-btn.active {
    background: #4d6bfe;
    box-shadow: 0 4px 18px rgba(77, 107, 254, 0.4);
  }

  .bds-voice-deck-btn.muted {
    background: #ef4444;
  }

  .bds-voice-submit-btn {
    background: #10b981;
    box-shadow: 0 4px 18px rgba(16, 185, 129, 0.4);
  }

  .bds-voice-interrupt-btn {
    background: #f59e0b;
  }

  .bds-voice-exit-btn {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
