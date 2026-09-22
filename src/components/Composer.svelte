<script>
  import { appState, setInput, addMessage, toggleAttach, showToast } from '../lib/stores/app.svelte.js';

  let textareaRef = $state(null);
  let inputText = $state('');

  $effect(() => {
    inputText = appState.chatState.currentInput;
  });

  function handleInput(e) {
    const el = e.target;
    inputText = el.value;
    setInput(inputText);
    // Auto resize
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function sendMessage() {
    if (!inputText.trim() || appState.chatState.isGenerating) return;
    
    addMessage('user', inputText.trim());
    inputText = '';
    setInput('');
    if (textareaRef) {
      textareaRef.style.height = 'auto';
      textareaRef.focus();
    }

    if (appState.settings.hapticFeedback && window.AndroidBridge?.performHaptic) {
      try { window.AndroidBridge.performHaptic('message_sent'); } catch {}
    }
  }

  function toggleDeepThink() {
    appState.chatState.deepThinkEnabled = !appState.chatState.deepThinkEnabled;
    showToast(appState.chatState.deepThinkEnabled ? 'DeepThink enabled' : 'DeepThink disabled');
  }

  function toggleSearch() {
    appState.chatState.searchEnabled = !appState.chatState.searchEnabled;
    showToast(appState.chatState.searchEnabled ? 'Search enabled' : 'Search disabled');
  }

  function toggleResearch() {
    appState.chatState.researchEnabled = !appState.chatState.researchEnabled;
    showToast(appState.chatState.researchEnabled ? 'Research enabled' : 'Research disabled');
  }
</script>

<div class="composer-wrapper">
  <div class="composer">
    <textarea
      bind:this={textareaRef}
      class="input"
      placeholder="Message Super DeepSeek"
      rows="1"
      value={inputText}
      oninput={handleInput}
      onkeydown={handleKeydown}
    ></textarea>
    
    <div class="actions">
      <button class="icon-btn" onclick={toggleAttach} aria-label="Attach">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
      
      <button class="pill-btn" class:active={appState.chatState.deepThinkEnabled} onclick={toggleDeepThink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"></circle><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"></path></svg>
        DeepThink
      </button>
      
      <button class="pill-btn" class:active={appState.chatState.searchEnabled} onclick={toggleSearch}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        Search
      </button>
      
      <button class="pill-btn" class:active={appState.chatState.researchEnabled} onclick={toggleResearch}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
        Research
      </button>

      <button class="send-btn" class:disabled={!inputText.trim() || appState.chatState.isGenerating} onclick={sendMessage} aria-label="Send">
        {#if appState.chatState.isGenerating}
          <span class="spinner-small"></span>
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .composer-wrapper {
    padding: 12px 16px 16px;
    background: linear-gradient(to top, #000 20%, transparent);
    position: sticky;
    bottom: 0;
  }

  .composer {
    background: #1a1a1d;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 24px;
    padding: 12px 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    transition: border-color 0.2s;
  }

  .composer:focus-within {
    border-color: rgba(125, 211, 224, 0.2);
  }

  .input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: white;
    font-size: 16px;
    font-family: inherit;
    line-height: 1.5;
    resize: none;
    min-height: 24px;
    max-height: 160px;
    padding: 4px 8px;
  }

  .input::placeholder {
    color: #6a6a6e;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .actions::-webkit-scrollbar { display: none; }

  .icon-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: transparent;
    border: none;
    color: #9aa;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .icon-btn:hover {
    background: rgba(255,255,255,0.08);
    color: white;
  }

  .pill-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 999px;
    color: #9aa;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .pill-btn:hover {
    border-color: rgba(255,255,255,0.15);
    color: white;
  }

  .pill-btn.active {
    background: #2a2a2e;
    border-color: rgba(125, 211, 224, 0.3);
    color: #7dd3e0;
  }

  .send-btn {
    margin-left: auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #1e3a3a;
    border: none;
    color: #7dd3e0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s;
  }

  .send-btn:hover {
    background: #2a4a4a;
    transform: scale(1.05);
  }

  .send-btn:active {
    transform: scale(0.95);
  }

  .send-btn.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .spinner-small {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(125, 211, 224, 0.2);
    border-top-color: #7dd3e0;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
