# 📱 DeepSeek Mobile — Standalone Android Edition

<p align="center">
  <img src="https://raw.githubusercontent.com/themuhammad-personal/Deepseek-/main/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png" alt="DeepSeek Mobile Logo" width="108" height="108" style="border-radius: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);" />
</p>

<p align="center">
  <b>A modern, standalone Android client for DeepSeek AI featuring Claude & ChatGPT-style fluid mobile interfaces, Model Context Protocol (MCP) tools, Deep Research, and persistent agentic memory.</b>
</p>

<p align="center">
  <a href="https://github.com/themuhammad-personal/Deepseek-/releases/latest"><img src="https://img.shields.io/badge/Download-Latest_APK-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Download APK" /></a>
  <a href="https://github.com/themuhammad-personal/Deepseek-/actions/workflows/build-and-release-apk.yml"><img src="https://img.shields.io/github/actions/workflow/status/themuhammad-personal/Deepseek-/build-and-release-apk.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI%2FCD%20Build" alt="Build Status" /></a>
  <a href="https://github.com/themuhammad-personal/Deepseek-/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/Android-8.0%2B%20(API%2026%2B)-brightgreen?style=for-the-badge&logo=android" alt="Android 8.0+" />
  <img src="https://img.shields.io/badge/Language-Bangla%20%26%20English-orange?style=for-the-badge" alt="Multi-Language" />
</p>

---

## 🌟 Overview & Highlights

**DeepSeek Mobile** transforms the DeepSeek experience into a first-class, standalone native Android application. It combines DeepSeek's frontier reasoning models with an ergonomic, distraction-free mobile user interface inspired by the best mobile apps like **ChatGPT** and **Claude**.

Unlike generic web wrappers, **DeepSeek Mobile** features a native Kotlin runtime layer with **OkHttp**, bidirectional JavaScript bridges, hardware-accelerated file pickers, local camera integration, custom **Model Context Protocol (MCP)** tool execution, and an adaptive overlay built with modern **Svelte 5**.

---

## ✨ Key Features

### 1. 🎨 Claude & ChatGPT Mobile Design
- **Single Rounded Action Capsule**: Replaces cluttered web buttons with a clean, unified composer.
  - **Left Cluster**: Native DeepSeek toggles for **DeepThink** (Atom icon) and **Web Search** (Globe icon) sit side by side without overlapping.
  - **Right Cluster**: Minimalist circular **Plus (+)** button and **Send** button with micro-interactions.
- **Ergonomic Bottom Sheet**: Tapping the Plus (+) button opens a smooth slide-up bottom sheet featuring SVG line icons (zero emoji clutter), safe-area padding, and dark-mode backdrop blur.
- **Pure Localized Typography**: Clean native sans-serif typography (`-apple-system, Roboto, sans-serif`) with full, institutional Bengali (`bn`) and English (`en`) support — eliminating mixed-language gibberish.
- **Clean Grouped Settings**: Sub-screens arranged in iOS-style rounded cards (`16px border-radius`) with smooth animated switch toggles (`#10b981` emerald active state) and organized categories.
- **Ad & Banner Removal**: Automatically hides promotional web artifacts like *"অ্যাপ পান"* (Get App) headers and duplicate drawer download links across all screen sizes.

### 2. 🔌 Model Context Protocol (MCP) Tools on Android
- **Native OkHttp Network Engine**: Built-in native Android HTTP bridge supporting standard **JSON-RPC 2.0** and **Server-Sent Events (SSE)** streaming.
- **Local & LAN Connectivity**: Configured `network_security_config.xml` allows connections to local development environments:
  - Emulator host: `http://10.0.2.2:<port>`
  - Local device loopback: `http://127.0.0.1:<port>`
  - Local WiFi LAN: `http://192.168.x.x:<port>`
- **Live Tool Discovery**: AI automatically queries available tools from registered MCP servers and executes them in-flight with real-time argument streaming and structured results.
- **Authentication**: Supports Bearer tokens, custom headers (`X-API-Key`), and query parameters.

### 3. 🧠 Deep Research & Agentic Intelligence
- **Deep Research**: Automated multi-step web research with configurable search breadth, deep fetch recursions, and smart source deduplication.
- **Context Guard**: Real-time token consumption tracking and context window guards to prevent prompt overflow.
- **Persistent Cross-Session Memory**: Store user preferences, facts, and rules that persist across chats and devices.
- **Custom System Prompts & Personas**: Create and toggle specialized system instructions, coding personas, and domain knowledge rules.

### 4. 🎙️ Voice & Media Capabilities
- **Speech-to-Text (STT)**: Direct voice input with real-time audio transcription and optional auto-submit.
- **Text-to-Speech (TTS)**: Automatic or on-demand natural voice playback of model responses.
- **Native Media Picker**: Direct access to camera capture, photo library, document files, and multi-file directory workspaces.

---

## 🏗️ Architecture & Technology Stack

```
DeepSeek Mobile (Standalone Android)
├── Android Layer (Kotlin)
│   ├── MainActivity.kt           — Hardware-accelerated WebView, lifecycle, permissions
│   ├── WebViewBridge.kt          — Fast JavaScript-to-Kotlin bridge (File I/O, MCP, Haptics)
│   ├── UpdateChecker.kt          — GitHub Release continuous update check & digest verification
│   └── NetworkSecurityConfig     — Permissive LAN & cleartext traffic for local MCP servers
│
├── Web Application Layer (Svelte 5 + Vite)
│   ├── src/content/ui/
│   │   ├── Drawer.svelte         — Claude-style slide-up bottom sheet settings & tools
│   │   ├── AttachMenu.svelte     — Clean plus (+) attachment sheet with SVG vector icons
│   │   └── SettingsPanel.svelte  — Grouped rounded cards with iOS switches
│   ├── src/android/
│   │   ├── hide-get-app.js       — Multi-lingual promotional banner eliminator
│   │   └── hide-drawer-app-item.js
│   ├── src/locales/
│   │   ├── bn.json               — Full Bengali localization (58 comprehensive sections)
│   │   └── en.json               — Canonical English localization
│   └── src/styles/
│       └── content.css           — Mobile-first dark mode tokens & layout rules
│
└── Automation & CI/CD
    ├── .github/workflows/        — Automated APK build, sign, and release pipeline
    └── vitest.config.js          — 105 test suites with 1,556 unit and integration tests
```

---

## 📥 Installation

### Download Ready-to-Use APK
1. Go to the [Releases Page](https://github.com/themuhammad-personal/Deepseek-/releases/latest).
2. Download the latest `better-deepseek-latest.apk` or versioned release.
3. Open the APK file on your Android device (Android 8.0 or newer).
4. If prompted, allow installation from unknown sources.
5. Launch **DeepSeek Mobile** and log in to your account.

---

## 🛠️ Development & Building from Source

### Prerequisites
- **Node.js**: v20 or v22 (LTS recommended)
- **JDK**: Java 17 (Eclipse Temurin or OpenJDK)
- **Android SDK**: API Level 34 (Android 14) with Build-Tools `34.0.0`

### 1. Clone Repository
```bash
git clone https://github.com/themuhammad-personal/Deepseek-.git
cd Deepseek-
```

### 2. Install Dependencies
```bash
npm ci
```

### 3. Run Test Suite
```bash
npm run test:unit
```
*Runs all 105 test files (1,556 unit and integration tests) using Vitest in JSDOM.*

### 4. Build Web Assets
```bash
npm run build:android
```
*Compiles Svelte 5 and JavaScript bundles with Vite and automatically stages them to `android/app/src/main/assets/bds`.*

### 5. Build Android APK
```bash
# Debug APK
npm run android:assemble:debug

# Release APK
npm run android:assemble:release
```
*Generated APK will be located in `android/app/build/outputs/apk/release/`.*

---

## 🔄 Automated CI/CD Workflow

Every commit pushed to the `main` branch or release tag triggers GitHub Actions:
- Compiles the web assets (`npm run build:android`).
- Runs complete test suites (`npm test`).
- Compiles Android native code with Gradle (`./gradlew assembleRelease`).
- Signs the APK with release keystores.
- Validates the APK signature with `apksigner`.
- Computes SHA256 checksums and automatically publishes the APK to GitHub Releases.

---

## 📄 License & Disclaimer

This project is open-source software licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

*Disclaimer: DeepSeek Mobile is an independent, community-driven project created to improve user experience on mobile devices. It is not affiliated with, endorsed by, or sponsored by DeepSeek AI.*
