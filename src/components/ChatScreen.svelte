<script>
  import { appState, toggleSidebar, clearChat } from '../lib/stores/app.svelte.js';
  import Composer from './Composer.svelte';

  let messagesContainer = $state(null);

  $effect(() => {
    // Auto scroll when messages change
    const msgs = appState.chatState.messages;
    if (messagesContainer && msgs.length > 0) {
      requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      });
    }
  });

  const suggestions = [
    "Research the latest advances in on-device AI",
    "Build a small HTML dashboard with live charts",
    "Explain how RAG retrieval actually works",
    "Draft a coding-mentor system prompt I can reuse"
  ];

  function handleSuggestion(text) {
    appState.chatState.currentInput = text;
    // Focus composer
    document.querySelector('.composer .input')?.focus();
  }
</script>

<div class="chat-screen">
  <header class="topbar">
    <button class="icon-btn" onclick={toggleSidebar}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    </button>
    <span class="title">New chat</span>
    <button class="icon-btn" onclick={clearChat}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    </button>
  </header>

  <div class="messages" bind:this={messagesContainer}>
    {#if appState.chatState.messages.length === 0}
      <div class="empty">
        <div class="empty-icon">
          <div class="icon-glow"></div>
          <div class="icon-inner">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M12 32C12 32 14 24 24 20C34 16 38 12 38 12C38 12 36 20 28 24C20 28 12 32 12 32Z" fill="#60A5FA" stroke="#3B82F6" stroke-width="2"/>
              <circle cx="28" cy="16" r="3" fill="#1E3A8A"/>
            </svg>
          </div>
        </div>
        <h1 class="empty-title">How can I help you think?</h1>
        <p class="empty-subtitle">Reasoning, research, code, and live artifacts — in a native-grade workspace.</p>

        <div class="suggestions">
          {#each suggestions as suggestion}
            <button class="suggestion" onclick={() => handleSuggestion(suggestion)}>
              {suggestion}
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="message-list">
        {#each appState.chatState.messages as message (message.id)}
          <div class="message" class:user={message.role === 'user'} class:assistant={message.role === 'assistant'}>
            {#if message.role === 'user'}
              <div class="bubble user-bubble">
                {message.content}
              </div>
            {:else}
              <div class="assistant-header">
                <div class="ai-avatar">DS</div>
                <span class="ai-name">DeepSeek</span>
                {#if appState.chatState.deepThinkEnabled}
                  <span class="thinking-badge">DeepThink</span>
                {/if}
              </div>
              <div class="bubble assistant-bubble">
                {message.content}
              </div>
            {/if}
            <div class="timestamp">
              {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </div>
          </div>
        {/each}
        
        {#if appState.chatState.isGenerating}
          <div class="message assistant">
            <div class="assistant-header">
              <div class="ai-avatar">DS</div>
              <span class="ai-name">DeepSeek</span>
              <div class="typing-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <Composer />
</div>

<style>
  .chat-screen {
    height: 100vh;
    background: #000000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .topbar {
    height: 56px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
    background: #000;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: transparent;
    border: none;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .title {
    font-weight: 500;
    color: white;
    font-size: 15px;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }

  .empty {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px 100px;
    text-align: center;
  }

  .empty-icon {
    position: relative;
    width: 80px;
    height: 80px;
    margin-bottom: 24px;
  }

  .icon-glow {
    position: absolute;
    inset: -20px;
    background: radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%);
    border-radius: 50%;
    filter: blur(12px);
  }

  .icon-inner {
    position: relative;
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, #1e3a5f, #0f172a);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(59,130,246,0.3);
    box-shadow: 0 0 30px rgba(59,130,246,0.2);
  }

  .empty-title {
    font-family: 'Sora', sans-serif;
    font-size: 28px;
    font-weight: 700;
    color: white;
    margin-bottom: 12px;
    line-height: 1.2;
    max-width: 320px;
  }

  .empty-subtitle {
    font-size: 14px;
    color: #6a6a6e;
    line-height: 1.5;
    max-width: 320px;
    margin-bottom: 32px;
  }

  .suggestions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 400px;
  }

  .suggestion {
    padding: 14px 18px;
    background: #1a1a1d;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    color: white;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
    line-height: 1.4;
  }

  .suggestion:hover {
    background: #2a2a2e;
    border-color: rgba(255,255,255,0.1);
    transform: translateY(-1px);
  }

  .suggestion:active {
    transform: scale(0.98);
  }

  .message-list {
    padding: 20px 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
  }

  .message {
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: fadeIn 0.3s ease;
  }

  .message.user {
    align-items: flex-end;
  }

  .bubble {
    max-width: 85%;
    padding: 14px 18px;
    border-radius: 20px;
    font-size: 15px;
    line-height: 1.6;
    word-break: break-word;
  }

  .user-bubble {
    background: #1a1a1d;
    border: 1px solid rgba(255,255,255,0.06);
    border-bottom-right-radius: 6px;
    color: white;
  }

  .assistant-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .ai-avatar {
    width: 24px;
    height: 24px;
    background: #1a1a1d;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: #7dd3e0;
  }

  .ai-name {
    font-size: 13px;
    font-weight: 600;
    color: white;
  }

  .thinking-badge {
    font-size: 10px;
    padding: 2px 8px;
    background: rgba(125,211,224,0.15);
    color: #7dd3e0;
    border-radius: 999px;
    border: 1px solid rgba(125,211,224,0.2);
  }

  .assistant-bubble {
    background: transparent;
    color: white;
    padding: 0;
    max-width: 100%;
    white-space: pre-wrap;
  }

  .timestamp {
    font-size: 11px;
    color: #5a5a5e;
    padding: 0 4px;
  }

  .user .timestamp {
    text-align: right;
  }

  .typing-dots {
    display: flex;
    gap: 3px;
    margin-left: 8px;
  }

  .typing-dots span {
    width: 4px;
    height: 4px;
    background: #6a6a6e;
    border-radius: 50%;
    animation: bounce 1.4s infinite;
  }

  .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
    40% { transform: scale(1.2); opacity: 1; }
  }
</style>
