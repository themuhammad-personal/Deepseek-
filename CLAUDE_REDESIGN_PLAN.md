# Super DeepSeek → Claude-Level Professional APK - Next Level Crazy UI Plan

## Vision Statement (Bengali)
> "DeepSeek এর ব্রেইন, Claude এর আত্মা, আর iOS 26 Liquid Glass এর শরীর"

আমরা WebView wrapper থেকে বেরিয়ে **True Native-Feel Hybrid Chat App** বানাবো। DeepSeek এর API কে hijack করে নিজস্ব Claude-style renderer দিয়ে চ্যাট দেখাবো। User মনে করবে এটি DeepSeek এর official native app, কিন্তু আসলে এটি তার চেয়েও ভালো।

---

## Phase 0: Security & Foundation Reset (Week 1)

### 0.1 Critical Fixes
- [ ] Keystore rotate, remove from repo, GitHub Secrets এ move
- [ ] `server.js` secure: only serve `dist-android`, add helmet, rate limit
- [ ] WebViewBridge origin validation + method allowlist
- [ ] Revoke exposed PAT

### 0.2 Tooling Modernization
- [ ] Migrate to TypeScript: `svelte-check`, `tsconfig.json`
- [ ] Standardize package manager: `bun` (since bun.lock exists) -> `bun install`
- [ ] Add ESLint + Prettier + `lint-staged`
- [ ] Add `design-tokens.css` single source of truth

```css
/* New Tokens - Claude Warm + DeepSeek Tech */
:root {
  --claude-paper: #FAF9F5;
  --claude-paper-dark: #191919;
  --claude-ink: #0D0D0D;
  --claude-ink-dark: #E8E8E6;
  --claude-accent: #D97757; /* Claude's terracotta */
  --claude-accent-2: #4D6BFE; /* Keep DeepSeek blue as secondary */
  --claude-border: #E8E3DC;
  --claude-border-dark: #2A2A2A;
  --claude-radius-xl: 24px;
  --claude-radius-lg: 16px;
  --claude-radius-pill: 999px;
  --claude-shadow-soft: 0 8px 32px rgba(0,0,0,0.08);
  --claude-shadow-medium: 0 16px 48px rgba(0,0,0,0.12);
  --claude-blur: 24px;
}
```

---

## Phase 1: The Claude Design System (Week 2-3)

### 1.1 Component Library - `src/lib/claude-ui/`

**Build these as standalone Svelte 5 components:**

1. **Composer - The Heart** (Like Claude's capsule)
   - Auto-growing textarea (min 44px, max 160px) with spring animation
   - Left: `+` button -> Bottom Sheet with 6 actions (Camera, Gallery, Files, GitHub, Deep Research, Deep Code) - each with Claude-style line icons, not emoji
   - Right: Model picker pill (DeepSeek-V3 / R1) + Send button that morphs to Stop when generating
   - Middle: File preview carousel (horizontal scroll, with remove X)
   - Features:
     - Slash command autocomplete (`/`) with icon + description + fuzzy search
     - @ mention for projects/files
     - Voice input with waveform (use existing `vad-processor.js` but add canvas visualizer)
     - Haptic feedback on send (light), file attach (medium)

2. **Message Renderer - Custom (Don't rely on DeepSeek DOM)**
   - Hide DeepSeek's `.ds-message` via CSS `display:none` and render our own in `#bds-claude-chat`
   - Message types:
     - User: pill bubble, right aligned, `#2A2A2B` background, 18px radius, 4px bottom-right
     - Assistant: full width, Claude typography (Inter 15px, line-height 1.7), no bubble
     - Thinking: collapsible disclosure with `reasoning` icon, animated dots, time taken
     - Artifacts: inline card with preview + "Open in Canvas" button
     - Code: with header (language + copy + open in canvas), Prism theme like Claude
   - Actions bar under each assistant message: Copy, Retry, Branch, Share, Good/Bad

3. **Sidebar - ChatGPT + Claude Hybrid**
   - Persistent on tablet, drawer on phone
   - Top: New Chat (pill with sparkle icon) + Search (cmd+K)
   - Sections:
     - Today, Yesterday, Previous 7 Days, Previous 30 Days (auto grouped)
     - Projects (with folder icons, file count badge)
     - Starred / Pinned
   - Each item: swipe to delete/archive, long press to rename
   - Bottom: Profile card with plan, settings gear

4. **Bottom Sheets - Native Feel**
   - Use `vaul-svelte` library (Drawer with spring physics)
   - Backdrop: native blur via `AndroidBridge.setNativeBlur(true, 20f)` - already implemented!
   - Handle: 40px wide, 5px height, with drag affordance
   - Content: grouped cards with 18px radius, 1px border

5. **Canvas / Artifacts - Split View**
   - Like Claude Artifacts: right panel (on tablet) or full screen (phone)
   - Supports: Code (Monaco editor), HTML Preview (iframe), Vega Charts, Markdown, Mermaid
   - Header: Title + Version + Share + Close
   - Footer: "Add to Project" + "Download"

6. **Empty State / Onboarding - Crazy Polish**
   - Center: Animated logo (Lottie) with gradient
   - Title: "Where should we start?" (Claude style)
   - 4 prompt starters in 2x2 grid, each with icon + title + subtle hover
   - Recent chats carousel below
   - Footer: "DeepSeek V3 • R1 • 128K Context"

### 1.2 Motion System
- Add `motion` library (framer-motion for Svelte)
- Animations:
  - Message appear: `opacity 0->1, y 6->0, duration 0.22, ease [0.16,1,0.3,1]`
  - Composer focus: border glow + scale 1.01
  - Sheet open: spring `stiffness 400, damping 30`
  - Typing indicator: 3 dots with stagger 0.15s

### 1.3 Typography
- Headings: `Sora` or `Geist` (modern, Claude-like)
- Body: `Inter` 15px, `Geist Mono` for code
- Load via Google Fonts with `font-display: swap`

---

## Phase 2: Architecture Rewrite - From Overlay to Owner (Week 4-5)

### Current: Overlay
```
DeepSeek Web UI (visible) + BDS Overlay (small)
```

### Target: Owner
```
BDS Claude UI (100% visible) + DeepSeek Web UI (hidden, only for API)
+ Custom Chat Renderer (#bds-claude-chat)
```

**Implementation Steps:**

1. **Hide DeepSeek UI Completely**
   ```css
   /* content.css */
   main, [class*="chat-container"], .ds-message { display: none !important; }
   #bds-claude-root { display: flex !important; }
   ```

2. **Intercept API**
   - Keep `injected/fetch-patch.js` but instead of just mutating, also **capture** responses
   - When DeepSeek streams response, parse and render in our custom renderer
   - Store in `state.chatMessagesBySession` (already exists!)

3. **Custom Chat Container**
   ```svelte
   <!-- ClaudeChat.svelte -->
   <div id="bds-claude-chat" class="claude-chat">
     <VirtualList items={messages} let:item>
       <MessageBubble {item} />
     </VirtualList>
     <Composer />
   </div>
   ```

4. **Virtualized List**
   - Use `svelte-virtual` for 2000+ messages, only render visible
   - Keeps memory low, 60fps scroll

5. **Bridge to Native**
   - Keep `WebViewBridge.kt` but add new methods:
     - `getClaudeTheme()` -> returns Material You dynamic color
     - `shareArtifact(title, code)` -> native share sheet
     - `openCanvasInExternalEditor(code)` -> open in Acode/QuickEdit

### 2.1 File Handling Upgrade

**Current:** Base64 chunked, memory heavy
**Next:** Streaming + Native

```kotlin
// New in WebViewBridge.kt
@JavascriptInterface
fun pickFilesWithPreview(): String {
  // Returns JSON with file metadata + thumbnail base64 for images
  // Uses SAF, not legacy file picker
}

@JavascriptInterface
fun saveArtifactToDownloads(code: String, filename: String, language: String): Boolean {
  // Direct save without Base64 roundtrip, uses MediaStore
}
```

---

## Phase 3: Crazy Next-Level Features (Week 6-8) - The "Wow" Factor

### 3.1 Liquid Glass Composer (iOS 26 Style)
- Background: `backdrop-filter: blur(24px) saturate(180%)`
- Border: `1px solid rgba(255,255,255,0.12)` with inner glow
- Shadow: layered soft shadows
- On focus: subtle gradient border animation

### 3.2 Generative UI Chips
- After user sends message, AI suggests 3 follow-up chips above composer (like Claude)
- Example: "Explain like I'm 5", "Show code example", "Compare with..."
- Implemented via `ComposerChips.svelte` already exists, just need to wire to DeepSeek response

### 3.3 Voice Mode 2.0
- Existing `vad-processor.js` -> enhance
- Fullscreen voice overlay with:
  - Waveform canvas (real-time AnalyserNode)
  - Transcript live
  - Hold to talk, release to send
  - Haptic tick on voice start

### 3.4 Canvas with Live Execution
- Monaco editor + Pyodide (Python in browser) + JS sandbox
- User can run code directly in artifact panel
- For charts: Vega + live data binding

### 3.5 Command Palette (Cmd+K)
- Like Claude Desktop: `Ctrl+K` opens palette
- Search: chats, projects, commands, settings, MCP tools
- Actions: New chat, Toggle R1, Deep Research, etc
- Implement with `cmdk-svelte`

### 3.6 Timeline Scrubber
- For long conversations, vertical scrollbar shows mini map of conversation
- Dots for user/assistant, thicker for code/artifacts
- Drag to jump

### 3.7 Multi-Model Switcher (Crazy)
- Pill in header: `DeepSeek V3 | R1 | R1-Distill | Custom`
- Each model has icon + color
- When switching, composer border color changes with animation

### 3.8 Projects v2 - Like Claude Projects
- Each project has:
  - Custom instructions (system prompt)
  - Knowledge (files)
  - Chats inside project
  - Artifacts gallery
- UI: Folder view with cover image, file count

### 3.9 Offline & Sync
- IndexedDB for chat history (already `chatMessagesBySession` Map, persist to IDB)
- Work offline, sync when online
- Export as .md, .pdf with custom template

---

## Phase 4: Native Android Polish - Material You 3 + Edge-to-Edge (Week 9)

### 4.1 MainActivity.kt Rewrite

```kotlin
// Edge-to-edge, Material You
WindowCompat.setDecorFitsSystemWindows(window, false)
enableEdgeToEdge(
  statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
  navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT)
)

// Dynamic color from wallpaper
val dynamicColor = DynamicColors.wrapContextIfAvailable(this)

// Predictive back
onBackPressedDispatcher.addCallback {
  if (isClaudeSheetOpen) closeSheet() else if (isCanvasOpen) closeCanvas() else finish()
}

// Keyboard handling - already have applyRootWindowInsets, improve with WindowInsetsAnimation
```

### 4.2 WebView Optimizations

```kotlin
webView.settings.apply {
  cacheMode = WebSettings.LOAD_DEFAULT
  domStorageEnabled = true
  databaseEnabled = true
  mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
  // Enable hardware acceleration
  setLayerType(View.LAYER_TYPE_HARDWARE, null)
}

// Preload
webView.preloadUrl("https://chat.deepseek.com")

// Add WebViewAssetLoader for bds assets - already done, keep
```

### 4.3 Native Components (Compose interop)

- Add Compose for parts: Settings screen, Project manager (better than Svelte in WebView)
- Use `ComposeView` inside `FrameLayout`
- Share ViewModel between Compose and WebView via Bridge

### 4.4 Performance Targets

- Cold start: <1.5s (currently ~3.8s)
- TTI: <2s
- 60fps scroll on 1000 messages
- APK size: <20MB (currently ~15MB, will increase with Monaco but okay)
- Memory: <250MB peak

---

## Phase 5: Build & Release Pipeline (Week 10)

### 5.1 CI/CD Improvements

```yaml
# .github/workflows/build-and-release-apk.yml upgraded
- Add lint, type-check, unit tests
- Add bundle size check (fail if content.js > 1MB)
- Add screenshot tests (Playwright)
- Sign with GitHub Secrets, not committed jks
- Upload to Play Store Internal Track via fastlane
- Generate release notes from commits
```

### 5.2 Testing

- Unit: Vitest for parsers, utils
- Integration: Svelte component tests with `testing-library`
- E2E: Playwright for WebView + Compose
- Manual: Test on 5 devices (low-end to flagship)

---

## Phase 6: Monetization & Growth (Optional, Future)

- Free with DeepSeek API (user's own account)
- Pro: Custom themes, unlimited projects, cloud sync
- No ads, no tracking - privacy focused like Claude

---

## UI Prototype Structure (New File Tree)

```
src/
  claude/
    components/
      Composer/
        Composer.svelte (main capsule)
        ComposerPlusSheet.svelte (bottom sheet)
        FileCarousel.svelte
        SlashAutocomplete.svelte
        VoiceWaveform.svelte
      Messages/
        MessageList.svelte (virtualized)
        UserBubble.svelte
        AssistantMessage.svelte
        ThinkingDisclosure.svelte
        CodeBlock.svelte (with canvas button)
        ArtifactCard.svelte
      Sidebar/
        Sidebar.svelte
        ChatGroup.svelte (Today, Yesterday...)
        ProjectCard.svelte
      Canvas/
        CanvasPanel.svelte
        MonacoEditor.svelte
        PreviewFrame.svelte
      Sheets/
        SettingsSheet.svelte
        ProjectsSheet.svelte
      Empty/
        WelcomeScreen.svelte
        PromptStarters.svelte
    lib/
      design-tokens.css
      motion.ts (spring configs)
      virtual-list.ts
    AppClaude.svelte (root that replaces App.svelte)
```

---

## Immediate Next Steps for You

1. **Fix P0 bugs today** (keystore, server.js)
2. **Create `src/claude/` folder and build Composer first** - it's the most visible
3. **Hide DeepSeek UI and render custom chat** - biggest wow
4. **Add liquid glass + motion** - makes it feel premium
5. **Test on real device, record video for README**

---

## Inspiration References

- **Claude Mobile App:** Warm paper background, terracotta accent, generous whitespace, no harsh borders
- **ChatGPT Mobile:** Pill composer, bottom sheets, haptics
- **Linear App:** Fast, keyboard-first, command palette
- **iOS 26 Liquid Glass:** Blur, translucency, depth

---

## Success Metrics

- User says "এটা কি DeepSeek এর official app?" -> Success
- 60fps on low-end, <2s cold start
- Play Store rating 4.8+
- GitHub stars 1k+

**Estimated Timeline:** 10 weeks for full Claude-level, 2 weeks for MVP crazy UI.

**Team:** 1 senior Svelte + 1 Android Kotlin dev can do it.

---

**Final Note:** Don't try to be better than Claude by adding more features. Be better by being **simpler, faster, warmer**. Claude's magic is not features, it's **feel**.
