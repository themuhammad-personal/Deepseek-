# Super DeepSeek — Android

A native-feeling Android client for [DeepSeek](https://chat.deepseek.com) that runs the
proven **better-deepseek** engine on top of the official site, wrapped in our own design
frame. Chat, multi-turn memory, MCP tools, skills, memory library and artifacts all work
exactly as in the reference extension — because they *are* the reference code.

> Voice and DeepCode are intentionally excluded. Everything else is ported.

---

## How it works

```
┌────────────────────────────────────────────┐
│  Android WebView  →  https://chat.deepseek.com
│    └─ onPageStarted  → branded boot splash (no white flash)
│    └─ onPageFinished → injects the engine:
│         1. injected.js   (network/bridge patch)
│         2. content.css   (engine UI)  + our-skin.css (our brand)
│         3. content.js    (mounts sidebar / drawer / MCP / memory UI)
│    └─ shouldInterceptRequest → serves bundled assets at bds-asset.local
└────────────────────────────────────────────┘
```

- **Engine, not re-implementation.** The official site is the chat surface; the engine
  bundle (committed under `android/app/src/main/bds-assets/bds/`) provides the features.
- **Our frame.** `our-skin.css` overrides the engine's `--bds-*` CSS variables and polishes
  the drawer, settings, buttons, switches, modals and scrollbars to match our brand
  (accent `#4d6bfe`, 14px radius, OLED-friendly dark palette).
- **Native shell.** Kotlin `MainActivity`/`WebViewBridge` handle file picking, camera,
  downloads, keyboard insets, storage and the asset loader.

## Features

- DeepSeek sign-in (email / phone) with session restore
- Multi-turn context that actually remembers (parent-chain protocol)
- DeepThink (R1), live web search, Deep Research
- MCP presets + custom servers, tools, skills, memory library
- File / image / folder upload, camera capture, export
- Branded boot splash, themed dark UI, animated loading indicator
- Signed release APK built & published by GitHub Actions

## Build

```bash
npm ci
npm run typecheck && npm run test:app   # web app checks
npm run build:android                   # SPA → android/app/src/main/assets
```

The engine bundle is staged into `assets/bds` by CI after the vite build (vite empties the
assets dir). Then:

```bash
cd android && ./gradlew assembleRelease
```

## Releases

Push to `main` for a continuous build, or tag `v*` for a versioned public release.
`.github/workflows/build-and-release-apk.yml` runs typecheck + unit tests, builds a signed
release APK and publishes it to GitHub Releases.

## Versioning

`package.json`, `android/app/build.gradle.kts` (`versionName`) and the release tag stay in
sync. `versionCode` is derived from the CI run number so every build is upgradable.

## License

See [LICENSE](LICENSE).
