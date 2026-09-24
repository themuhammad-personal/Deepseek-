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

## Native launch (no white flash)

The launch pipeline is a single unbroken brand surface:

```
tap icon → system splash (warm charcoal, app icon)
         → window (same charcoal — android:windowBackground)
         → WebView paints → branded boot overlay (icon + wordmark + spinner)
         → engine mounts → overlay fades to the app
```

`MainActivity` holds the system splash on screen until the WebView's **first paint**
(`splashScreen.setKeepOnScreenCondition`) with a 4 s failsafe, so the old
"white screen → raw page → UI" three-stage load is gone. All launch colors live in
`res/values/colors.xml` (`#262624` warm charcoal) and every boot surface shares them.

## Design policy (learned from live testing)

The engine fork's own design — branded drawer, sheets, settings, controls — IS the
app's design. A custom CSS skin layered on top of it caused patchwork (dark body in
light mode, mis-tinted official bars, a drawer that no longer fit phone screens), so
`our-skin.css` is retired (empty). Functional shaping only:

- `UiPolish.kt` hides out-of-scope entries (voice, Deep Code), trims the redundant
  DeepThink / Web Search rows from the "+" sheet, removes both settings search bars,
  the upstream GitHub footer, the tip strip, and repairs raw i18n keys — all
  unit-tested (`UiPolishTest`).
- Colors are never overridden: the official page keeps its own light/dark palette.

## Engine bundle provenance

The committed bundle (`android/app/src/main/bds-assets/bds/`) is a **patched superset**
of public upstream (EdgeTypE/better-deepseek v0.1.14): it carries this app's branding,
android-target hardening and layout fixes, so upstream lags behind it. Do not blind-copy
an upstream build over it. To check upstream drift:

```bash
scripts/bds-sync.sh            # build upstream, diff vs committed bundle (dry run)
scripts/bds-sync.sh --replace  # actually refresh the committed bundle
```

`injected.js` / `sandbox.js` being byte-identical to upstream means the network core is
in sync; only `content.js` / `content.css` should ever differ (our patches).

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

