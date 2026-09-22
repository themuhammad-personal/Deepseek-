<script>
  import { appState, showToast } from '../lib/stores/app.svelte.js';

  const options = [
    { id: 'photos', icon: 'image', title: 'Photos', desc: 'Choose images from the gallery', color: '#7dd3e0' },
    { id: 'camera', icon: 'camera', title: 'Camera', desc: 'Capture a photo to attach', color: '#7dd3e0' },
    { id: 'documents', icon: 'file', title: 'Documents', desc: 'PDF, Office, code, and text up to 50 MB', color: '#7dd3e0' },
    { id: 'folder', icon: 'folder', title: 'Index folder', desc: 'Deep Code — index a project for RAG', color: '#7dd3e0' },
    { id: 'github', icon: 'github', title: 'GitHub repo', desc: 'Read README and repository context', color: '#7dd3e0' },
    { id: 'web', icon: 'globe', title: 'Web page', desc: 'Extract readable text from a URL', color: '#7dd3e0' },
    { id: 'commands', icon: 'command', title: 'Commands', desc: 'Slash shortcuts and saved prompts', color: '#7dd3e0' }
  ];

  function handleSelect(option) {
    showToast(`${option.title} selected`);
    appState.attachOpen = false;
    
    if (window.AndroidBridge?.pickFiles) {
      try {
        const mode = option.id === 'photos' ? 'images' : 'all';
        window.AndroidBridge.pickFiles(mode, Date.now().toString());
      } catch {}
    }
  }
</script>

{#if appState.attachOpen}
  <div class="backdrop" onclick={() => appState.attachOpen = false}></div>
{/if}

<div class="sheet" class:open={appState.attachOpen}>
  <div class="handle"></div>
  <div class="header">
    <h2>Attach</h2>
  </div>
  <div class="grid">
    {#each options as option}
      <button class="card" onclick={() => handleSelect(option)}>
        <div class="icon" style="color: {option.color}">
          {#if option.icon === 'image'}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          {:else if option.icon === 'camera'}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
          {:else if option.icon === 'file'}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          {:else if option.icon === 'folder'}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          {:else if option.icon === 'github'}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
          {:else if option.icon === 'globe'}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
          {:else}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3L6 15a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3l12-3z"></path></svg>
          {/if}
        </div>
        <div class="title">{option.title}</div>
        <div class="desc">{option.desc}</div>
      </button>
    {/each}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 60;
    animation: fadeIn 0.2s ease;
  }

  .sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 80vh;
    background: #151517;
    border-radius: 24px 24px 0 0;
    border-top: 1px solid rgba(255,255,255,0.08);
    z-index: 70;
    transform: translateY(100%);
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    display: flex;
    flex-direction: column;
  }

  .sheet.open {
    transform: translateY(0);
  }

  .handle {
    width: 40px;
    height: 4px;
    background: rgba(255,255,255,0.2);
    border-radius: 2px;
    margin: 12px auto 8px;
  }

  .header {
    padding: 0 20px 16px;
  }

  .header h2 {
    font-size: 18px;
    font-weight: 700;
    color: white;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 0 16px 24px;
    overflow-y: auto;
  }

  .card {
    background: #1f1f21;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    padding: 16px;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card:hover {
    background: #2a2a2e;
    transform: translateY(-1px);
    border-color: rgba(255,255,255,0.1);
  }

  .card:active {
    transform: scale(0.98);
  }

  .icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: flex-start;
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    color: white;
    margin-top: 4px;
  }

  .desc {
    font-size: 12px;
    color: #6a6a6e;
    line-height: 1.4;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
