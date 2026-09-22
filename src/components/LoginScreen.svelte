<script>
  import { appState, login, showToast } from '../lib/stores/app.svelte.js';
  
  let email = $state('');
  let password = $state('');
  let loginMode = $state('email'); // email | phone
  let lang = $state('en');
  let isLoading = $state(false);

  function handleLogin() {
    if (!email || !password) {
      showToast('Please enter email and password');
      return;
    }
    isLoading = true;
    setTimeout(() => {
      login(email, password);
      isLoading = false;
      showToast('Welcome to Super DeepSeek!');
    }, 800);
  }

  function handleExplore() {
    login('preview@example.com', 'preview');
  }
</script>

<div class="login-screen">
  <!-- Language Toggle Top Right -->
  <div class="lang-toggle">
    <button class="lang-btn" class:active={lang === 'en'} onclick={() => lang = 'en'}>EN</button>
    <button class="lang-btn" class:active={lang === 'bn'} onclick={() => lang = 'bn'}>বাংলা</button>
  </div>

  <!-- Logo Section -->
  <div class="logo-section">
    <div class="app-icon">
      <div class="icon-glow"></div>
      <div class="icon-inner">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <path d="M12 32C12 32 14 24 24 20C34 16 38 12 38 12C38 12 36 20 28 24C20 28 12 32 12 32Z" fill="#60A5FA" stroke="#3B82F6" stroke-width="2" stroke-linejoin="round"/>
          <path d="M20 18C20 18 22 12 28 10C34 8 38 12 38 12C38 12 36 18 30 20C24 22 20 18 20 18Z" fill="#93C5FD" opacity="0.8"/>
          <circle cx="28" cy="16" r="3" fill="#1E3A8A"/>
          <path d="M24 26C24 26 26 28 28 28C30 28 32 26 32 26" stroke="#1E40AF" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
    </div>
    <h1 class="app-title">Super DeepSeek</h1>
    <p class="app-subtitle">Sign in with your DeepSeek account</p>
  </div>

  <!-- Auth Mode Toggle -->
  <div class="auth-toggle">
    <button class="auth-btn" class:active={loginMode === 'email'} onclick={() => loginMode = 'email'}>Email</button>
    <button class="auth-btn" class:active={loginMode === 'phone'} onclick={() => loginMode = 'phone'}>Phone</button>
  </div>

  <!-- Form -->
  <div class="form">
    <div class="field">
      <label class="field-label">Email</label>
      <div class="input-wrapper">
        <input 
          type="email" 
          class="input" 
          placeholder="you@example.com"
          bind:value={email}
        />
      </div>
    </div>

    <div class="field">
      <label class="field-label">Password</label>
      <div class="input-wrapper">
        <input 
          type="password" 
          class="input" 
          bind:value={password}
        />
      </div>
    </div>

    <button class="primary-btn" onclick={handleLogin} disabled={isLoading}>
      {#if isLoading}
        <span class="spinner"></span>
        Signing in...
      {:else}
        Continue with DeepSeek
      {/if}
    </button>

    <button class="secondary-btn" onclick={() => showToast('Opening official DeepSeek sign-in...')}>
      Open official DeepSeek sign-in
    </button>

    <button class="link-btn" onclick={handleExplore}>
      Explore the app
    </button>

    <button class="link-btn small" onclick={() => showToast('Paste token feature coming soon')}>
      Paste a DeepSeek session token
    </button>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>
      Uses your official DeepSeek account. On Android the app opens chat.deepseek.com inside a native WebView so Google, Apple, email, and the security check all complete on your device.
    </p>
  </div>
</div>

<style>
  .login-screen {
    min-height: 100vh;
    background: #000000;
    color: white;
    padding: 20px;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .lang-toggle {
    position: absolute;
    top: 16px;
    right: 16px;
    background: #1a1a1d;
    border-radius: 12px;
    padding: 4px;
    display: flex;
    gap: 4px;
  }

  .lang-btn {
    padding: 8px 16px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: #9aa;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .lang-btn.active {
    background: #2a2a2e;
    color: white;
  }

  .logo-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 80px;
    margin-bottom: 32px;
  }

  .app-icon {
    position: relative;
    width: 80px;
    height: 80px;
    margin-bottom: 20px;
  }

  .icon-glow {
    position: absolute;
    inset: -20px;
    background: radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, rgba(59, 130, 246, 0) 70%);
    border-radius: 50%;
    filter: blur(12px);
  }

  .icon-inner {
    position: relative;
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(59, 130, 246, 0.3);
    box-shadow: 0 0 30px rgba(59, 130, 246, 0.2), inset 0 1px 0 rgba(255,255,255,0.1);
  }

  .app-title {
    font-family: 'Sora', sans-serif;
    font-size: 28px;
    font-weight: 700;
    color: white;
    margin-bottom: 8px;
    letter-spacing: -0.5px;
  }

  .app-subtitle {
    font-size: 15px;
    color: #9aa;
    text-align: center;
  }

  .auth-toggle {
    background: #1a1a1d;
    border-radius: 16px;
    padding: 4px;
    display: flex;
    gap: 4px;
    margin-bottom: 24px;
    max-width: 400px;
    width: 100%;
    align-self: center;
  }

  .auth-btn {
    flex: 1;
    padding: 12px;
    border-radius: 12px;
    border: none;
    background: transparent;
    color: #9aa;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .auth-btn.active {
    background: #2a2a2e;
    color: white;
  }

  .form {
    max-width: 400px;
    width: 100%;
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-label {
    font-size: 14px;
    color: #9aa;
    font-weight: 400;
    padding-left: 4px;
  }

  .input-wrapper {
    background: #1a1a1d;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.06);
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .input-wrapper:focus-within {
    border-color: rgba(125, 211, 224, 0.3);
  }

  .input {
    width: 100%;
    padding: 16px;
    background: transparent;
    border: none;
    outline: none;
    color: white;
    font-size: 15px;
    font-family: inherit;
  }

  .input::placeholder {
    color: #5a5a5e;
  }

  .primary-btn {
    margin-top: 8px;
    padding: 16px;
    background: #7dd3e0;
    color: #000;
    border: none;
    border-radius: 16px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .primary-btn:hover {
    background: #8ee0ec;
    transform: translateY(-1px);
  }

  .primary-btn:active {
    transform: scale(0.98);
  }

  .primary-btn:disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  .secondary-btn {
    padding: 16px;
    background: #1a1a1d;
    color: white;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .secondary-btn:hover {
    background: #2a2a2e;
  }

  .link-btn {
    background: transparent;
    border: none;
    color: #9aa;
    font-size: 15px;
    font-weight: 400;
    cursor: pointer;
    padding: 8px;
    transition: color 0.2s;
  }

  .link-btn:hover {
    color: white;
  }

  .link-btn.small {
    font-size: 13px;
    color: #6a6a6e;
  }

  .footer {
    margin-top: auto;
    padding-top: 32px;
    max-width: 400px;
    width: 100%;
    align-self: center;
  }

  .footer p {
    font-size: 12px;
    line-height: 1.6;
    color: #5a5a5e;
    text-align: center;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(0,0,0,0.2);
    border-top-color: #000;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
