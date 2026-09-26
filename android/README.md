# Super DeepSeek for Android

The native shell of Super DeepSeek. It opens `https://chat.deepseek.com` in a WebView,
injects the Super DeepSeek engine on every page load and exposes a small native bridge:
storage, file pickers, downloads, haptics and updates. The overall design is described
in [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

## Build

From the repository root:

```bash
npm ci
npm run build:android            # Vite writes android/app/src/main/assets/ (and empties it first)
rm -rf android/app/src/main/assets/bds
cp -r android/app/src/main/bds-assets/bds android/app/src/main/assets/bds   # stage the engine
cd android
./gradlew testDebugUnitTest      # JVM unit tests
./gradlew assembleDebug          # → app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease        # → signed with app/superdeepseek-release.jks
```

Always stage the engine **after** `build:android`, because the Vite build clears the
assets folder.

## Signing and updates

Every release is signed with the same keystore (`app/superdeepseek-release.jks`). The
`BDS_KEYSTORE_PASSWORD`, `BDS_KEY_ALIAS` and `BDS_KEY_PASSWORD` environment variables
override the defaults. Keep the keystore, `applicationId` (`com.betterdeepseek.app`)
and signing config unchanged. They are what let a new APK install as an update over
an existing one. `versionCode` is `1000 + build id` and always increases in CI.

## Source map

| File | Responsibility |
|---|---|
| `MainActivity.kt` | WebView setup, engine injection (`onPageFinished`), boot overlay, file pickers, Back handling |
| `WebViewBridge.kt` | The `AndroidBridge` JavaScript interface (storage, fetch, downloads, haptics, theme, login) |
| `UiPolish.kt` | Mobile layout polish script injected after the engine |
| `UpdateChecker.kt` | GitHub Releases update check, stable and beta channels |
| `src/main/bds-assets/bds/` | The engine bundle: `injected.js`, `content.js`, `content.css`, sandbox pages |
| `src/test/` | Unit tests: bridge, pickers, navigation and link routing, keyboard insets, user agent, polish script, updates |

The Kotlin package is still `com.betterdeepseek.app` on purpose (see above). The
app name, theme (`Theme.SuperDeepSeek`) and all user-facing text say Super DeepSeek.
