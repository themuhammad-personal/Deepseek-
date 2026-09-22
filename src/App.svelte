<script>
  import { onMount } from 'svelte';
  import { appState, loadSettings, checkLogin } from './lib/stores/app.svelte.js';
  import LoginScreen from './components/LoginScreen.svelte';
  import ChatScreen from './components/ChatScreen.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import SettingsSheet from './components/SettingsSheet.svelte';
  import AttachSheet from './components/AttachSheet.svelte';

  onMount(() => {
    loadSettings();
    checkLogin();
    
    // Prevent pull-to-refresh and overscroll
    document.body.addEventListener('touchmove', (e) => {
      if (e.target.closest('.messages, .content, .grid')) return;
      e.preventDefault();
    }, { passive: false });

    // Handle Android back button
    window.addEventListener('bds:back', () => {
      if (appState.settingsOpen || appState.attachOpen || appState.sidebarOpen) {
        appState.settingsOpen = false;
        appState.attachOpen = false;
        appState.sidebarOpen = false;
      }
    });
  });

  let isLoggedIn = $derived(appState.isLoggedIn);
  let toast = $derived(appState.toast);
</script>

<div class="app">
  {#if !isLoggedIn}
    <LoginScreen />
  {:else}
    <ChatScreen />
    <Sidebar />
    <SettingsSheet />
    <AttachSheet />
  {/if}

  {#if toast}
    <div class="toast">
      {toast}
    </div>
  {/if}
</div>

<style>
  .app {
    height: 100vh;
    background: #000;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .toast {
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: #1f1f21;
    color: white;
    padding: 12px 20px;
    border-radius: 999px;
    font-size: 13px;
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    z-index: 100;
    animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    white-space: nowrap;
  }

  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
