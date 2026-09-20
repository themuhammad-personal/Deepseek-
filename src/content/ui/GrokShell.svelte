<script>
  import { onMount } from "svelte";
  import appState from "../state.js";

  let isAndroid = $state(false);
  let mobileOpen = $state(false);
  let search = $state("");
  let chats = $state([]);
  let activeTitle = $state("New chat");
  let activePath = $state("");
  let modelName = $state("DeepSeek");
  let online = $state(true);
  let timer = null;
  let observer = null;

  const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();

  function syncNativeUi() {
    if (!isAndroid) return;

    const links = Array.from(document.querySelectorAll('a[href*="/chat/s/"]'));
    const seen = new Set();
    const next = [];

    for (const el of links) {
      const href = el.getAttribute("href") || "";
      const title = clean(el.textContent || el.getAttribute("aria-label") || "");
      if (!href || !title || seen.has(href)) continue;
      seen.add(href);
      next.push({ href, title });
      if (next.length >= 24) break;
    }

    chats = next;
    activePath = location.pathname;

    const active = next.find((x) => location.pathname === x.href || location.pathname.endsWith(x.href));
    const header = clean(document.querySelector("._7436101")?.textContent);
    if (header) activeTitle = header;
    else if (active) activeTitle = active.title;

    const badge = clean(document.querySelector("._46a12ab")?.textContent);
    modelName = badge || clean(appState.pricing?.modelName) || "DeepSeek";
  }

  function clickNative(selectorList) {
    for (const selector of selectorList) {
      const node = document.querySelector(selector);
      if (node && (node.offsetParent !== null || node.getBoundingClientRect().width > 0)) {
        node.click();
        return true;
      }
    }
    return false;
  }

  function newChat() {
    const ok = clickNative([
      'a[href="/"]',
      '.ds-icon-button[title*="New"]',
      '.ds-icon-button[aria-label*="New"]',
      '[role="button"][aria-label*="New chat"]'
    ]);
    if (!ok) window.location.href = "https://chat.deepseek.com/";
    mobileOpen = false;
    setTimeout(syncNativeUi, 200);
  }

  function selectChat(href) {
    const node = Array.from(document.querySelectorAll('a[href*="/chat/s/"]'))
      .find((x) => x.getAttribute("href") === href);
    if (node) node.click();
    else window.location.href = href;
    mobileOpen = false;
    setTimeout(syncNativeUi, 180);
  }

  function openDrawer() {
    window.dispatchEvent(new CustomEvent("bds:open-drawer"));
    mobileOpen = false;
  }

  function openVoice() {
    window.dispatchEvent(new CustomEvent("bds:open-voice-mode"));
    mobileOpen = false;
  }

  function haptic(type = "light") {
    try { window.AndroidBridge?.performHaptic?.(type); } catch (_) {}
  }

  function logo() {
    return `<svg viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="sds-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#6ec9d4"/><stop offset="1" stop-color="#3f86ff"/>
      </linearGradient></defs>
      <path fill="url(#sds-g)" d="M16 38c2 9 11 14 21 12 8-1 15-6 18-14-4 2-8 3-12 2-1-10-8-17-16-18-6 0-11 2-15 6 4-1 7 0 9 3-3 1-5 5-5 9Z"/>
      <path fill="#7ce6d7" d="M27 16c2-6 8-9 14-7 4 1 7 4 8 8-6-2-11-2-16 1Z"/>
      <circle cx="37" cy="29" r="3.5" fill="#061014"/>
    </svg>`;
  }

  onMount(() => {
    isAndroid = Boolean(window.AndroidBridge);
    if (!isAndroid) return;

    online = navigator.onLine;
    document.body.classList.add("bds-grok-shell-active");
    document.documentElement.classList.add("bds-grok-shell-active");

    const onlineOn = () => online = true;
    const onlineOff = () => online = false;
    const urlChanged = () => setTimeout(syncNativeUi, 100);

    window.addEventListener("online", onlineOn);
    window.addEventListener("offline", onlineOff);
    window.addEventListener("bds:urlChanged", urlChanged);

    observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(syncNativeUi, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    syncNativeUi();
    const poll = setInterval(syncNativeUi, 1400);

    return () => {
      clearInterval(poll);
      clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("online", onlineOn);
      window.removeEventListener("offline", onlineOff);
      window.removeEventListener("bds:urlChanged", urlChanged);
      document.body.classList.remove("bds-grok-shell-active");
      document.documentElement.classList.remove("bds-grok-shell-active");
    };
  });
</script>

{#if isAndroid}
  <div class="grok-stage">
    <aside class:open={mobileOpen} class="grok-sidebar">
      <div class="grok-brand">
        <div class="grok-logo">{@html logo()}</div>
        <div class="grok-brand-copy">
          <strong>Super DeepSeek</strong>
          <span>Frontier reasoning, native feel</span>
        </div>
      </div>

      <button class="grok-new-chat" type="button" onclick={() => { haptic("open"); newChat(); }}>
        <span class="plus">＋</span><span>New chat</span>
      </button>

      <label class="grok-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input bind:value={search} placeholder="Search chats" aria-label="Search chats" />
      </label>

      <nav class="grok-chats">
        <div class="grok-section-label">Recent</div>
        {#each chats.filter((x) => !search.trim() || x.title.toLowerCase().includes(search.toLowerCase())) as chat}
          <button type="button" class:active={activePath === chat.href} class="grok-chat" onclick={() => { haptic("select"); selectChat(chat.href); }}>
            <span class="dot"></span><span>{chat.title}</span>
          </button>
        {/each}
        {#if chats.length === 0}<div class="grok-empty">No recent chats</div>{/if}
      </nav>

      <div class="grok-footer">
        <div class="grok-engine"><span class:offline={!online}></span><div><small>ENGINE</small><b>{online ? "DeepSeek" : "Offline queue"}</b></div></div>
        <button type="button" onclick={() => { haptic("open"); openDrawer(); }}>Library & settings <span>›</span></button>
        <button type="button" onclick={() => { haptic("open"); openVoice(); }}>Voice mode <span>›</span></button>
      </div>
    </aside>

    {#if mobileOpen}
      <button type="button" class="grok-backdrop" aria-label="Close menu" onclick={() => mobileOpen = false}></button>
    {/if}

    <header class="grok-header">
      <button class="grok-head-btn mobile" type="button" aria-label="Open menu" onclick={() => mobileOpen = true}>
        <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <div class="grok-head-title">
        <strong>{activeTitle}</strong>
        <span><i class:offline={!online}></i>{online ? "Online" : "Offline"} · {modelName}</span>
      </div>
      <div class="grok-head-actions">
        <button class="grok-head-btn" type="button" aria-label="Voice mode" onclick={() => { haptic("open"); openVoice(); }}>
          <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>
        </button>
        <button class="grok-head-btn" type="button" aria-label="New chat" onclick={() => { haptic("open"); newChat(); }}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
    </header>

    <div class="grok-sheen"></div>
  </div>
{/if}

<style>
  :global(html.bds-grok-shell-active), :global(body.bds-grok-shell-active) {
    background:#000 !important; color:#f2f3f5 !important;
    --sds-bg:#000; --sds-surface:#0c0c0e; --sds-elevated:#141418;
    --sds-fg:#f2f3f5; --sds-muted:#8b8d94; --sds-faint:#5c5e66;
    --sds-line:rgba(255,255,255,.08); --sds-accent:#6ec9d4;
  }
  :global(body.bds-grok-shell-active .dc04ec1d),
  :global(body.bds-grok-shell-active .ds-chat-sidebar),
  :global(body.bds-grok-shell-active [class*="chat-sidebar"]) { display:none !important; }
  :global(body.bds-grok-shell-active .ds-chat-header),
  :global(body.bds-grok-shell-active [class*="ds-chat-header"]) {
    background:rgba(0,0,0,.66) !important; border-color:rgba(255,255,255,.05) !important;
    backdrop-filter:blur(20px) !important; -webkit-backdrop-filter:blur(20px) !important;
  }
  :global(body.bds-grok-shell-active ._75e1990:has(#chat-input)),
  :global(body.bds-grok-shell-active ._6f68655:has(#chat-input)),
  :global(body.bds-grok-shell-active ._77cefa5:has(#chat-input)),
  :global(body.bds-grok-shell-active ._24fad49:has(#chat-input)),
  :global(body.bds-grok-shell-active .ds-textarea:has(#chat-input)) {
    background:rgba(12,12,14,.94) !important; border:1px solid rgba(255,255,255,.10) !important;
    border-radius:28px !important; box-shadow:0 0 0 1px rgba(255,255,255,.025),0 18px 50px rgba(0,0,0,.40) !important;
    backdrop-filter:blur(22px) !important; -webkit-backdrop-filter:blur(22px) !important;
  }
  :global(body.bds-grok-shell-active #chat-input),
  :global(body.bds-grok-shell-active .ds-textarea textarea),
  :global(body.bds-grok-shell-active textarea[placeholder]) { color:#f2f3f5 !important; caret-color:#6ec9d4 !important; }
  :global(body.bds-grok-shell-active #chat-input::placeholder),
  :global(body.bds-grok-shell-active .ds-textarea textarea::placeholder) { color:#5c5e66 !important; }
  :global(body.bds-grok-shell-active .ds-message:has([class*="d29f3d7d"])),
  :global(body.bds-grok-shell-active .ds-message:has([class*="_9663006"])) {
    max-width:min(82%,720px) !important; margin-left:auto !important; margin-right:24px !important;
    padding:14px 16px !important; border-radius:20px 20px 7px 20px !important;
    background:#1a1a20 !important; box-shadow:0 0 0 1px rgba(255,255,255,.06) !important;
  }
  :global(body.bds-grok-shell-active .ds-markdown),
  :global(body.bds-grok-shell-active .ds-message-content) { color:#f2f3f5 !important; }

  .grok-stage { position:fixed; inset:0; z-index:2147483000; pointer-events:none; font-family:"Sora",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#f2f3f5; }
  .grok-sidebar,.grok-header,.grok-backdrop { pointer-events:auto; }
  .grok-sidebar {
    position:fixed; inset:0 auto 0 0; width:280px; display:flex; flex-direction:column;
    background:rgba(12,12,14,.96); border-right:1px solid rgba(255,255,255,.07);
    box-shadow:18px 0 50px rgba(0,0,0,.24); backdrop-filter:blur(22px); -webkit-backdrop-filter:blur(22px);
  }
  .grok-brand { display:flex; gap:11px; align-items:center; padding:18px 16px 14px; }
  .grok-logo { width:40px; height:40px; border-radius:13px; display:grid; place-items:center; overflow:hidden;
    background:radial-gradient(circle at 32% 25%,rgba(110,201,212,.92),transparent 46%),linear-gradient(145deg,#07131a,#06151c 52%,#071018);
    border:1px solid rgba(110,201,212,.25); box-shadow:0 8px 28px rgba(110,201,212,.16),inset 0 0 24px rgba(110,201,212,.07); }
  .grok-logo :global(svg){width:30px;height:30px}.grok-brand-copy{min-width:0;display:flex;flex-direction:column}.grok-brand-copy strong{font-size:14px;letter-spacing:-.02em}.grok-brand-copy span{margin-top:2px;font-size:10.5px;color:#74767e;white-space:nowrap}
  .grok-new-chat{margin:0 12px;height:44px;border:0;border-radius:14px;background:#6ec9d4;color:#041014;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;font-weight:700}
  .grok-new-chat:active{transform:scale(.97)}.grok-new-chat .plus{font-size:20px;line-height:1;font-weight:400}
  .grok-search{margin:12px 12px 10px;height:40px;display:flex;align-items:center;gap:9px;padding:0 12px;border-radius:11px;background:#141418;border:1px solid rgba(255,255,255,.07)}
  .grok-search svg{width:15px;height:15px;fill:none;stroke:#5c5e66;stroke-width:1.8}.grok-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#f2f3f5;font-size:12px}.grok-search input::placeholder{color:#5c5e66}
  .grok-chats{min-height:0;flex:1;overflow:auto;padding:2px 9px 10px}.grok-chats::-webkit-scrollbar{width:4px}.grok-chats::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:99px}
  .grok-section-label{padding:8px 9px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.10em;color:#5c5e66}
  .grok-chat{width:100%;display:flex;align-items:center;gap:8px;padding:9px 10px;border:0;border-radius:10px;background:transparent;color:#8b8d94;text-align:left;font-size:12px}.grok-chat:hover,.grok-chat.active{background:#141418;color:#f2f3f5}.grok-chat .dot{width:5px;height:5px;border-radius:99px;background:rgba(110,201,212,.55);box-shadow:0 0 8px rgba(110,201,212,.24);flex:0 0 auto}.grok-empty{padding:28px 12px;text-align:center;color:#5c5e66;font-size:12px}
  .grok-footer{padding:10px 10px max(12px,env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.07)}.grok-engine{display:flex;gap:8px;align-items:center;padding:8px 9px 9px}.grok-engine>span{width:7px;height:7px;border-radius:50%;background:#7dbe98;box-shadow:0 0 0 0 rgba(125,190,152,.35);animation:pulse 1.8s ease-out infinite}.grok-engine>span.offline{background:#d2b47a;box-shadow:none;animation:none}.grok-engine div{display:flex;flex-direction:column}.grok-engine small{font-size:9px;color:#5c5e66;letter-spacing:.1em}.grok-engine b{font-size:12px;color:#cfd1d6;font-weight:500}.grok-footer button{width:100%;height:38px;border:0;border-radius:9px;background:transparent;color:#8b8d94;display:flex;justify-content:space-between;align-items:center;padding:0 10px;font-size:12px;text-align:left}.grok-footer button:hover{background:#141418;color:#f2f3f5}.grok-footer button span{color:#5c5e66;font-size:17px}
  .grok-header{position:fixed;left:280px;right:0;top:0;height:62px;display:flex;align-items:center;gap:12px;padding:0 16px;background:rgba(0,0,0,.60);border-bottom:1px solid rgba(255,255,255,.05);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px)}
  .grok-head-title{flex:1;min-width:0;display:flex;flex-direction:column}.grok-head-title strong{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.grok-head-title span{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:10px;color:#5c5e66}.grok-head-title i{width:5px;height:5px;border-radius:50%;background:#7dbe98;box-shadow:0 0 7px rgba(125,190,152,.42)}.grok-head-title i.offline{background:#d2b47a;box-shadow:none}
  .grok-head-actions{display:flex;gap:4px}.grok-head-btn{width:38px;height:38px;border:0;border-radius:11px;background:transparent;color:#8b8d94;display:grid;place-items:center}.grok-head-btn:hover{background:#141418;color:#f2f3f5}.grok-head-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.grok-head-btn.mobile{display:none}
  .grok-sheen{position:fixed;left:280px;right:0;top:61px;height:1px;background:linear-gradient(90deg,rgba(110,201,212,.30),transparent);opacity:.8}
  .grok-backdrop{display:none}
  @keyframes pulse{70%{box-shadow:0 0 0 7px rgba(125,190,152,0)}100%{box-shadow:0 0 0 0 rgba(125,190,152,0)}}
  @media(max-width:768px){
    .grok-sidebar{width:min(84vw,310px);transform:translateX(-102%);transition:transform .28s cubic-bezier(.22,1,.36,1);z-index:2147483002;box-shadow:18px 0 60px rgba(0,0,0,.48)}.grok-sidebar.open{transform:translateX(0)}
    .grok-header{left:0;height:58px;padding-left:max(8px,env(safe-area-inset-left));padding-right:max(8px,env(safe-area-inset-right))}.grok-sheen{left:0;top:57px}.grok-head-btn.mobile{display:grid}.grok-backdrop{display:block;position:fixed;inset:0;border:0;background:rgba(0,0,0,.56);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:2147483001}
  }
  @media(prefers-reduced-motion:reduce){.grok-engine>span{animation:none}}
</style>