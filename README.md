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

## Design system (our-skin.css)

`our-skin.css` is the entire design frame, expressed as `--bds-*` token overrides plus
component polish:

- **Palette** — Claude-style warm neutrals: oat (`#faf9f5`/`#f0eee5`) in light,
  warm charcoal (`#262624`/`#31302d`) in dark; DeepSeek blue as the single accent.
- **Type** — serif display (Georgia/Noto Serif) for brand + section + sheet titles,
  system sans everywhere else.
- **Drawer** — brand roundel + version chip, pill search bar, hairline-divided rows.
- **Settings** — rows grouped into bordered cards, tinted icon tiles, 52 px touch rows,
  iOS-grade switches forced to the accent color (the engine defaults to green).
- **"+" attach sheet** — on phones it is re-anchored into a full-width bottom sheet
  (drag handle, serif header, 56 px rows, icon tiles, safe-area padding); on desktop it
  stays a compact popover.
- **Dead entries removed** — voice, Deep Code, the upstream GitHub footer and the tip
  bar are hidden by `UiPolish` (unit-tested: `UiPolishTest`) and by CSS fallbacks.

The engine injects its Svelte styles at runtime (after this stylesheet), so rules that
fight those styles carry `!important` deliberately — it is a skin layer.

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

