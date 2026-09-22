<script>
  import { appState, toggleSidebar, showToast } from '../lib/stores/app.svelte.js';
  
  let search = $state('');

  function handleNewChat() {
    showToast('New chat started');
    toggleSidebar();
  }
</script>

{#if appState.sidebarOpen}
  <div class="backdrop" onclick={toggleSidebar}></div>
{/if}

<aside class="sidebar" class:open={appState.sidebarOpen}>
  <div class="header">
    <div class="brand">
      <div class="brand-icon">
        <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
          <path d="M12 32C12 32 14 24 24 20C34 16 38 12 38 12C38 12 36 20 28 24C20 28 12 32 12 32Z" fill="#60A5FA" stroke="#3B82F6" stroke-width="2"/>
          <circle cx="28" cy="16" r="3" fill="#1E3A8A"/>
        </svg>
      </div>
      <div class="brand-text">
        <div class="brand-title">Super DeepSeek</div>
        <div class="brand-subtitle">Frontier reasoning, native feel</div>
      </div>
    </div>
    <button class="icon-btn" onclick={toggleSidebar}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    </button>
  </div>

  <div class="content">
    <button class="new-chat-btn" onclick={handleNewChat}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      New chat
    </button>

    <div class="search-wrapper">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <input type="text" placeholder="Search chats" class="search-input" bind:value={search} />
    </div>

    <div class="empty-state">
      <p>No conversations yet</p>
    </div>
  </div>

  <div class="footer">
    <div class="signed-in-label">SIGNED IN</div>
    <div class="user-name">{appState.user.name}</div>
    <div class="preview-engine">Preview engine</div>

    <div class="menu">
      <button class="menu-item" onclick={() => showToast('Library coming soon')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
        Library
      </button>
      <button class="menu-item" onclick={() => showToast('Plugins coming soon')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"></path><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path></svg>
        Plugins & Servers
      </button>
      <button class="menu-item" onclick={() => { toggleSidebar(); appState.settingsOpen = true; }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        Settings
      </button>
      <button class="menu-item" onclick={() => { appState.isLoggedIn = false; toggleSidebar(); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        Sign out
      </button>
    </div>
  </div>
</aside>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 40;
    animation: fadeIn 0.2s ease;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 320px;
    background: #0f0f0f;
    border-right: 1px solid rgba(255,255,255,0.06);
    z-index: 50;
    display: flex;
    flex-direction: column;
    transform: translateX(-100%);
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .header {
    height: 64px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-icon {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #1e3a5f, #0f172a);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(59,130,246,0.2);
  }

  .brand-title {
    font-weight: 700;
    font-size: 15px;
    color: white;
  }

  .brand-subtitle {
    font-size: 12px;
    color: #6a6a6e;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: transparent;
    border: none;
    color: #9aa;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .content {
    flex: 1;
    padding: 16px;
    overflow-y: auto;
  }

  .new-chat-btn {
    width: 100%;
    padding: 14px;
    background: #7dd3e0;
    color: #000;
    border: none;
    border-radius: 12px;
    font-weight: 600;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .new-chat-btn:hover {
    background: #8ee0ec;
  }

  .search-wrapper {
    margin-top: 12px;
    position: relative;
    background: #1a1a1d;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.06);
    display: flex;
    align-items: center;
    padding: 0 12px;
  }

  .search-icon {
    color: #6a6a6e;
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    padding: 12px 8px;
    background: transparent;
    border: none;
    outline: none;
    color: white;
    font-size: 14px;
  }

  .search-input::placeholder {
    color: #5a5a5e;
  }

  .empty-state {
    margin-top: 40px;
    text-align: center;
    color: #6a6a6e;
    font-size: 14px;
  }

  .footer {
    border-top: 1px solid rgba(255,255,255,0.06);
    padding: 16px;
  }

  .signed-in-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.8px;
    color: #6a6a6e;
    margin-bottom: 4px;
  }

  .user-name {
    font-weight: 600;
    color: white;
    font-size: 14px;
  }

  .preview-engine {
    font-size: 12px;
    color: #7dd3e0;
    margin-bottom: 20px;
  }

  .menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 8px;
    background: transparent;
    border: none;
    color: #9aa;
    font-size: 14px;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .menu-item:hover {
    background: rgba(255,255,255,0.06);
    color: white;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
