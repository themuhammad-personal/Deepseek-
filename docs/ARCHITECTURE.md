# Architecture

Super DeepSeek is a native Android shell around the **official** DeepSeek web chat.
Instead of re-implementing DeepSeek's private API, it loads `chat.deepseek.com` in a
WebView and injects the Super DeepSeek engine, which adds every feature on top of the
real page. The protocol, sign-in, anti-bot checks and model behaviour stay exactly
what DeepSeek ships.

```
┌──────────────────────────── MainActivity ───────────────────────────┐
│ system splash ─▶ native boot overlay (icon + wordmark animation)    │
│                                                                     │
│ officialWebView ──▶ https://chat.deepseek.com/                      │
│   onPageFinished ─▶ injectBdsScripts():                             │
│        1. injected.js   network hooks (prompt injection, tool tags) │
│        2. content.css   engine styles  (style#bds-css)              │
│        3. content.js    engine UI + logic (Svelte)                  │
│        4. UiPolish      hides out-of-scope features, signals ready  │
│   shouldInterceptRequest ─▶ https://bds-asset.local/bds/* from APK  │
│                                                                     │
│ AndroidBridge (WebViewBridge) — JS ⇄ native                         │
│   storage · file/camera picker · downloads · haptics · MCP fetch    │
│   locale/theme · update checks (UpdateChecker)                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Layers

| Layer | Where | Responsibility |
|---|---|---|
| Native shell | `android/app/src/main/java/com/betterdeepseek/app/` | WebView setup, splash/boot overlay, insets, back handling, file chooser, external links |
| Bridge | `WebViewBridge.kt` | `window.AndroidBridge`: persistent storage, native pickers, blob downloads, haptics, CORS-free fetch for MCP/web tools |
| Engine | `android/app/src/main/bds-assets/bds/` | `content.js` (UI + features), `content.css`, `injected.js` (network layer), `sandbox.*` (isolated code runners) |
| Polish | `UiPolish.kt` | Small, unit-tested DOM sweep: hides voice / Deep Code entries and repairs raw labels |
| Updates | `UpdateChecker.kt` | Polls this repository's GitHub Releases (stable or beta channel) and installs the signed APK |

The package name `com.betterdeepseek.app` is historical and intentionally unchanged:
it is the Android application id, and changing it would break updates for every
installed copy.

## The engine bundle

The engine is a patched, pre-built bundle committed to the repo. It began as the
open-source [better-deepseek](https://github.com/EdgeTypE/better-deepseek) extension and
now carries this project's own UI, mobile layouts, Bengali translations and fixes, so
**never overwrite it with an upstream build**. `scripts/bds-sync.sh` can diff it against
upstream in dry-run mode.

Things inside the bundle that deliberately keep their original names:

- the hidden `<BetterDeepSeek>…</BetterDeepSeek>` tag the engine wraps around injected
  context — it is stored in every existing conversation, so renaming it would break
  how old chats render;
- storage keys (`bds_*`) and CSS classes (`bds-*`), so user data survives updates;
- the third-party DeepSeek Harness *Better DeepSeek Bridge* plugin and its endpoints.

## Slash commands

Typing `/` in the composer opens the command popup.

- Choosing an item only **fills the composer** (`/help `, `/export `…); nothing runs yet.
- A command runs when it is **sent** — Enter on a keyboard, or the send button, which
  is intercepted in the capture phase before DeepSeek's own handler.
- Unknown `/text` is sent to the AI unchanged.
- `/new` and `/compress` switch chats through DeepSeek's own new-chat control, so the
  page is never reloaded (a reload would briefly show the un-enhanced official page).

## Page lifecycle

The engine is injected on every `onPageFinished` of `chat.deepseek.com`. In-app
navigation (DeepSeek is a single-page app) keeps the engine alive; a full reload
re-injects it. The native boot overlay stays up until `AndroidBridge.onUiPolished()`
fires, with a page-finished fallback and a 9 s failsafe.

## Back button

`MainActivity` asks the engine first: it evaluates `window.__sdHandleBack()` (defined at
the end of `content.js`). The helper closes the topmost engine surface — command popup,
dialog, help sheet, or steps a drawer subpage back to the overview — and returns `true`.
Only when it returns `false` does the WebView navigate back (or the app move to the
background on the first page).

## Tests

- Kotlin unit tests: `android/app/src/test/…` (`./gradlew testDebugUnitTest`), run in CI.
- Web workspace checks: `npm run typecheck && npm run test:app`, run in CI.
- CI (`.github/workflows/build-and-release-apk.yml`) builds and verifies a signed release
  APK; failing unit-test reports are uploaded as a workflow artifact.

## Legacy code

`src/` contains the earlier React SPA. It is still built into the APK assets by
`npm run build:android`, but is no longer shown: the official site is the chat surface.
`MainActivity` keeps an idle `reactWebView` for it that never loads a page.
