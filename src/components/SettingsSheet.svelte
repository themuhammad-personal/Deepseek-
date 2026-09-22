<script>
  import { appState, updateSetting, toggleSetting } from '../lib/stores/app.svelte.js';

  let search = $state('');

  const themes = [
    { id: 'oled', label: 'OLED Black' },
    { id: 'light', label: 'Light' },
    { id: 'system', label: 'System' }
  ];

  const accents = [
    { id: 'ice', label: 'Ice' },
    { id: 'ocean', label: 'Ocean' },
    { id: 'sage', label: 'Sage' },
    { id: 'ink', label: 'Ink' }
  ];

  const sections = [
    'Settings', 'Chats', 'System prompts', 'Memories', 'Skills', 'Characters', 'Projects', 'MCP servers', 'CSS snippets', 'Commands'
  ];

  function filteredSections() {
    if (!search) return sections;
    return sections.filter(s => s.toLowerCase().includes(search.toLowerCase()));
  }
</script>

{#if appState.settingsOpen}
  <div class="backdrop" onclick={() => appState.settingsOpen = false}></div>
{/if}

<div class="sheet" class:open={appState.settingsOpen}>
  <div class="handle"></div>
  
  <div class="header">
    <h2>Settings</h2>
  </div>

  <div class="content">
    <div class="search-wrapper">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <input type="text" placeholder="Search settings" bind:value={search} />
    </div>

    <!-- Appearance -->
    <div class="card">
      <div class="card-label">APPEARANCE</div>
      
      <div class="row">
        <span class="row-label">Theme</span>
        <div class="segmented">
          {#each themes as theme}
            <button 
              class="seg-btn" 
              class:active={appState.settings.theme === theme.id}
              onclick={() => updateSetting('theme', theme.id)}
            >
              {theme.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="row">
        <span class="row-label">Accent</span>
        <div class="segmented">
          {#each accents as accent}
            <button 
              class="seg-btn" 
              class:active={appState.settings.accent === accent.id}
              onclick={() => updateSetting('accent', accent.id)}
            >
              {accent.label}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Language -->
    <div class="card">
      <div class="card-label">LANGUAGE & REGION</div>
      
      <div class="row">
        <span class="row-label">Language</span>
        <div class="segmented small">
          <button class="seg-btn active">EN</button>
          <button class="seg-btn">বাংলা</button>
        </div>
      </div>

      <div class="row">
        <div class="row-info">
          <span class="row-label">Follow device language</span>
        </div>
        <button class="toggle" class:on={appState.settings.followDeviceLanguage} onclick={() => toggleSetting('followDeviceLanguage')}>
          <div class="toggle-knob"></div>
        </button>
      </div>

      <div class="field">
        <label class="field-label">Preferred response language</label>
        <input type="text" placeholder="e.g. English, বাংলা, French" class="field-input" />
        <span class="field-hint">Leave empty to let the model decide.</span>
      </div>
    </div>

    <!-- Chat -->
    <div class="card">
      <div class="card-label">CHAT</div>
      
      <div class="row">
        <span class="row-label">Show timestamps</span>
        <button class="toggle" class:on={appState.settings.showTimestamps} onclick={() => toggleSetting('showTimestamps')}>
          <div class="toggle-knob"></div>
        </button>
      </div>

      <div class="row">
        <span class="row-label">Haptic feedback</span>
        <button class="toggle" class:on={appState.settings.hapticFeedback} onclick={() => toggleSetting('hapticFeedback')}>
          <div class="toggle-knob"></div>
        </button>
      </div>

      <div class="row">
        <div class="row-info">
          <span class="row-label">Collapse long messages</span>
          <span class="row-desc">Hide very long user messages behind a read-more toggle.</span>
        </div>
        <button class="toggle" class:on={appState.settings.collapseLongMessages} onclick={() => toggleSetting('collapseLongMessages')}>
          <div class="toggle-knob"></div>
        </button>
      </div>
    </div>

    <!-- Advanced -->
    <div class="card">
      <div class="row">
        <div class="row-info">
          <span class="row-label">Auto-download LONG_WORK zip</span>
        </div>
        <button class="toggle" class:on={appState.settings.autoDownloadLongWorkZip} onclick={() => toggleSetting('autoDownloadLongWorkZip')}>
          <div class="toggle-knob"></div>
        </button>
      </div>

      <div class="row">
        <span class="row-label">Disable tip box</span>
        <button class="toggle" class:on={appState.settings.disableTipBox} onclick={() => toggleSetting('disableTipBox')}>
          <div class="toggle-knob"></div>
        </button>
      </div>

      <div class="row">
        <div class="row-info">
          <span class="row-label">MCP inline max characters</span>
          <span class="row-desc">Truncate MCP tool output before injecting it into the prompt.</span>
        </div>
        <input type="number" value={appState.settings.mcpInlineMaxChars} class="number-input" onchange={(e) => updateSetting('mcpInlineMaxChars', parseInt(e.target.value))} />
      </div>

      <div class="row">
        <div class="row-info">
          <span class="row-label">Markdown walker depth</span>
          <span class="row-desc">How deep the HTML-to-markdown walker goes on fetched pages.</span>
        </div>
        <input type="number" value={appState.settings.markdownWalkerDepth} class="number-input" onchange={(e) => updateSetting('markdownWalkerDepth', parseInt(e.target.value))} />
      </div>

      <div class="field">
        <label class="field-label">Choose sections</label>
        <div class="chips">
          {#each filteredSections() as section}
            <button class="chip" class:selected={appState.settings.selectedSections.includes(section.toLowerCase().replace(' ', '_'))}>
              {section}
            </button>
          {/each}
        </div>
      </div>

      <div class="row">
        <span class="row-label">Protect with password</span>
        <button class="toggle" class:on={appState.settings.protectWithPassword} onclick={() => toggleSetting('protectWithPassword')}>
          <div class="toggle-knob"></div>
        </button>
      </div>

      <button class="primary-btn">Export all data</button>

      <div class="field">
        <label class="field-label">Password</label>
        <input type="password" placeholder="Password" class="field-input" />
      </div>

      <button class="secondary-btn">Import all data</button>
    </div>

    <div class="card">
      <div class="card-label">CUSTOM CSS</div>
      <div class="row">
        <span class="row-label">Presets</span>
      </div>
    </div>
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
    max-height: 85vh;
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
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .header h2 {
    font-size: 20px;
    font-weight: 700;
    color: white;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .search-wrapper {
    background: #1a1a1d;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
  }

  .search-wrapper svg {
    color: #6a6a6e;
  }

  .search-wrapper input {
    flex: 1;
    padding: 12px 0;
    background: transparent;
    border: none;
    outline: none;
    color: white;
    font-size: 14px;
  }

  .card {
    background: #1f1f21;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .card-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.8px;
    color: #6a6a6e;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .row-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .row-label {
    font-size: 14px;
    color: white;
    font-weight: 500;
  }

  .row-desc {
    font-size: 12px;
    color: #6a6a6e;
    line-height: 1.4;
  }

  .segmented {
    display: flex;
    background: #0a0a0a;
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
  }

  .segmented.small {
    padding: 2px;
  }

  .seg-btn {
    padding: 8px 14px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: #9aa;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .seg-btn.active {
    background: #2a2a2e;
    color: white;
  }

  .toggle {
    width: 48px;
    height: 28px;
    background: #2a2a2e;
    border-radius: 999px;
    border: none;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
    flex-shrink: 0;
  }

  .toggle.on {
    background: #7dd3e0;
  }

  .toggle-knob {
    width: 24px;
    height: 24px;
    background: white;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }

  .toggle.on .toggle-knob {
    transform: translateX(20px);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-label {
    font-size: 13px;
    color: #9aa;
  }

  .field-input {
    padding: 12px 16px;
    background: #0a0a0a;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    color: white;
    font-size: 14px;
    outline: none;
  }

  .field-input:focus {
    border-color: rgba(125,211,224,0.3);
  }

  .field-hint {
    font-size: 12px;
    color: #6a6a6e;
  }

  .number-input {
    width: 80px;
    padding: 8px 12px;
    background: #0a0a0a;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px;
    color: white;
    font-size: 14px;
    text-align: center;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    padding: 8px 14px;
    background: rgba(125,211,224,0.1);
    border: 1px solid rgba(125,211,224,0.2);
    border-radius: 999px;
    color: #7dd3e0;
    font-size: 13px;
    cursor: pointer;
  }

  .chip.selected {
    background: rgba(125,211,224,0.2);
  }

  .primary-btn {
    padding: 14px;
    background: #7dd3e0;
    color: #000;
    border: none;
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .secondary-btn {
    padding: 14px;
    background: #0a0a0a;
    color: white;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
