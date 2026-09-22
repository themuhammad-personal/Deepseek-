# Super DeepSeek

Claude-class standalone client for DeepSeek. OLED black, ice accent, native-feeling chat — with the full Super DeepSeek feature set (minus live voice, which DeepSeek does not support).

## What you get

- DeepSeek email / phone sign-in (or explore the workspace as a guest)
- Instant, DeepThink (R1), live web search, Deep Research
- Capsule composer, plus sheet (camera, 50 MB docs, folder RAG, GitHub, web fetch, commands)
- Library: system prompts, memories, skills, characters, projects
- MCP presets + custom servers
- Settings: appearance, language (EN / বাংলা), chat, prompt injection, RAG, Deep Research, GitHub token, export/import
- Offline queue, artifacts, haptic feedback
- Android APK via GitHub Actions

## Run the web app

```bash
npm ci
npm run dev
```

```bash
npm run typecheck
npm run test:app
```

## Android APK (GitHub Actions)

Push to `main` or tag `v*`. The workflow in `.github/workflows/build-and-release-apk.yml` runs typecheck + unit tests, then builds a signed release APK and publishes a GitHub Release.

Local:

```bash
cd android
./gradlew assembleRelease
```

APK: `android/app/build/outputs/apk/release/app-release.apk`

## License

MIT. Independent client — not affiliated with DeepSeek AI.
