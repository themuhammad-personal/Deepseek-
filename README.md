<p align="center">
  <img src="docs/super-deepseek-logo.png" alt="Super DeepSeek Icon" width="140" height="140" style="border-radius: 32px; box-shadow: 0 16px 40px rgba(0, 229, 255, 0.35);" />
</p>

<h1 align="center">⚡ Super DeepSeek (Android Edition)</h1>

<p align="center">
  <b>Next-Generation Standalone Android Client for DeepSeek AI</b><br>
  <i>Featuring Claude & ChatGPT-level fluid mobile UX, 1-Tap Preset Model Context Protocol (MCP) agents, Deep Research, 50MB document uploads, and seamless in-place updates.</i>
</p>

<p align="center">
  <a href="https://github.com/themuhammad-personal/Deepseek-/releases/latest"><img src="https://img.shields.io/badge/Download_APK-Super_DeepSeek_v1.0.0-00E5FF?style=for-the-badge&logo=android&logoColor=black" alt="Download Super DeepSeek APK" /></a>
  <a href="https://github.com/themuhammad-personal/Deepseek-/actions/workflows/build-and-release-apk.yml"><img src="https://img.shields.io/github/actions/workflow/status/themuhammad-personal/Deepseek-/build-and-release-apk.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI%2FCD%20Pipeline" alt="Build Status" /></a>
  <a href="https://github.com/themuhammad-personal/Deepseek-/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="License: MIT" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Android-8.0%2B%20(API%2026%2B)-3DDC84?style=flat-square&logo=android&logoColor=white" alt="Android 8.0+" />
  <img src="https://img.shields.io/badge/Tests-105%20Suites%20%7C%201%2C556%20Passed-brightgreen?style=flat-square&logo=vitest&logoColor=white" alt="Tests 100% Passed" />
  <img src="https://img.shields.io/badge/Upload%20Cap-50MB%20Docs%20%2B%2025MB%20Images-blue?style=flat-square" alt="50MB Upload Cap" />
  <img src="https://img.shields.io/badge/Updates-Permanent%20Keystore%20Signed-indigo?style=flat-square" alt="In-Place Updates" />
  <img src="https://img.shields.io/badge/Language-বাংলা%20%26%20English-orange?style=flat-square" alt="Bilingual" />
</p>

---

## 🌟 Why Super DeepSeek?

DeepSeek has established itself as one of the world's most capable open-weights reasoning and coding models. However, standard browser interfaces on mobile devices often suffer from web clutter, cramped buttons, hardcoded file upload limits, and awkward touch controls.

**Super DeepSeek** bridges this gap by transforming DeepSeek into a **premier, standalone native Android application**. It pairs frontier intelligence (**DeepSeek-V3** & **DeepSeek-R1**) with the ergonomic, distraction-free refinement found in world-class mobile apps like **Claude** and **ChatGPT**.

---

## 📊 Feature Comparison

| Feature | Standard Mobile Web | Generic Wrappers | ⚡ Super DeepSeek |
| :--- | :---: | :---: | :---: |
| **Mobile Interface** | Cluttered web buttons | Static iframe | **Claude & ChatGPT-style rounded capsule & bottom sheets** |
| **Iconography** | Low-res emoji icons | Mixed web icons | **100% Vector Line SVG (Crisp on all DPIs)** |
| **File Upload Limit** | Restricted (2 MB) | Fails on large files | **50 MB Documents + 25 MB Photos** |
| **Document Formats** | Plain text only | Dropped as binary | **PDF, Word (DOCX), Excel (XLSX), PPTX & ZIP** |
| **Mid-Chat Attachments** | Stalls / Freezes | Inconsistent | **Instant camera & multi-file attachment at any turn** |
| **Model Context Protocol (MCP)** | ❌ None | ❌ None | **1-Tap Preset Servers (Brave, Web, Weather, GitHub, Termux)** |
| **App Updates** | Manual reinstall | Signature mismatch error | **Seamless in-place upgrade (No data/chat loss)** |
| **Native Touch Experience** | Web scrollbars visible | Web-like bounce | **Physical Haptic Feedback + Native Back Gesture** |
| **Promotional Clutter** | Annoying "Get App" banners | Web headers visible | **100% Removed automatically in all languages** |
| **Localization** | Broken mixed strings | Incomplete | **Institutional Bengali (বাংলা) & English** |

---

## ✨ Core Highlights & Innovations

### 1. 🎨 Modern Mobile Interface (Claude & ChatGPT Style)
* **Single Action Capsule**: Eradicates scattered floating buttons with a unified, floating message composer.
  * **Left Cluster**: DeepSeek native toggles for **DeepThink R1** (Atom reasoning icon) and **Web Search** (Globe search icon) positioned side-by-side without overlap.
  * **Right Cluster**: Minimalist circular **Plus (+)** sheet trigger and animated **Send** button.
* **Ergonomic Bottom Sheet**: Tapping the Plus (+) button opens a smooth slide-up bottom sheet with dark-mode glassmorphism backdrop blur and clean SVG vector stroke icons.
* **Grouped Settings Cards**: Settings are organized into iOS-style rounded cards with clean category headers, generous tap targets, and smooth switch toggles.
* **No Promotional Clutter**: Multi-lingual scripts automatically eliminate web banners like *"অ্যাপ পান"* (Get App) and duplicate drawer download links.

### 2. 🔄 Seamless In-Place Updates (No Reinstall Required)
* **The Problem Solved**: Previously, CI builds generated ephemeral keystores on every run, resulting in Android rejecting updates with `INSTALL_FAILED_UPDATE_INCOMPATIBLE` and forcing users to delete their app and lose their chats.
* **The Permanent Fix**: **Super DeepSeek** is signed with a permanent cryptographic release keystore (`superdeepseek-release.jks`, valid for 20,000 days).
* **Automatic `versionCode` Progression**: Gradle calculates `versionCode = 1000 + bdsBuildId`, guaranteeing that every release can be installed directly over existing versions with one tap.

### 3. 📂 50MB File Uploads & Native Document Processing
* **Expanded Cap**: File upload capacity increased from 2MB to **50 MB** for documents and **25 MB** for photos.
* **Universal Format Support**: Binary documents (PDF, DOCX, XLSX, PPTX, ZIP) are automatically converted into Base64 chunked streams and dispatched to DeepSeek as native `File` objects.
* **Robust Mid-Conversation Scanning**: Dynamic file inputs are continuously resolved, ensuring photo and document uploads work reliably at any point during an ongoing conversation.

### 4. 🔌 1-Tap Preset Model Context Protocol (MCP) Servers
Model Context Protocol enables DeepSeek to interact with live external tools and APIs. On mobile, typing complex JSON configurations is inconvenient. Super DeepSeek introduces **Ready-to-Use 1-Tap MCP Presets**:
* 🔍 **Brave Web Search**: Real-time live web search and news discovery.
* 🌐 **Web Content Fetcher**: Scrapes and reads full text and markdown from any URL.
* ⛅ **Weather & Time Clock**: Accurate worldwide weather forecasts and timezone clocks.
* 🐙 **GitHub Explorer**: Inspect public repositories, browse files, and read commit logs.
* 💻 **Local Termux Bridge**: Connects directly to local Python, Node, or SQLite servers running inside Android Termux (`http://127.0.0.1:8080/sse`).

### 5. 📱 True Native Android Polish
* **Scrollbars Removed**: Eliminates web-like scrollbars and overscroll halos (`isVerticalScrollBarEnabled = false`, `overScrollMode = OVER_SCROLL_NEVER`).
* **Hardware Haptic Feedback**: Every touch on the Plus button, drawer toggles, and send button triggers a physical tactile vibration pulse via Android's `Vibrator` API.
* **Native Back Gesture Integration**: Swiping back on Android gracefully closes open bottom sheets, dialogs, and settings drawers first before navigating back or exiting.

---

## 🏗️ Architecture & Technical Stack

```
Super DeepSeek (Standalone Android)
├── 📱 Android Native Layer (Kotlin + Android SDK 34)
│   ├── MainActivity.kt           — Single-task WebView, window insets, back dispatcher
│   ├── WebViewBridge.kt          — Bidirectional JS-to-Kotlin bridge (File I/O, MCP, Haptics)
│   ├── UpdateChecker.kt          — In-app update monitor querying GitHub Releases API
│   ├── superdeepseek-release.jks — Permanent cryptographic signing keystore
│   └── NetworkSecurityConfig     — Permissive cleartext LAN rules for local Termux & MCP
│
├── ⚡ Modern Frontend Layer (Svelte 5 + Vite)
│   ├── src/content/ui/
│   │   ├── AttachMenu.svelte     — Claude-style Plus bottom sheet with SVG vector icons
│   │   ├── Drawer.svelte         — Super DeepSeek slide-up navigation drawer
│   │   ├── SettingsPanel.svelte  — Grouped card settings with 1-tap MCP presets
│   │   └── App.svelte            — Primary responsive mount point
│   ├── src/content/files/
│   │   ├── folder-reader.js      — 30MB directory tree concatenator
│   │   └── github-reader.js      — 30MB GitHub repository zip extractor
│   ├── src/platform/
│   │   └── android-file-picker.js— Base64 chunked bridge reader (PDF, DOCX, XLSX, Images)
│   └── src/locales/
│       ├── bn.json               — Institutional Bengali (বাংলা) localization
│       └── en.json               — Canonical English localization
│
└── 🚀 Automation & CI/CD Pipeline
    ├── .github/workflows/        — Automated APK compilation, signing, and GitHub release
    └── vitest.config.js          — 105 test suites with 1,556 unit and integration tests
```

---

## 📥 Installation Guide

### Option 1: Direct APK Download (Recommended)
1. Navigate to the [Releases Page](https://github.com/themuhammad-personal/Deepseek-/releases/latest).
2. Download `super-deepseek-latest.apk`.
3. Open the file on your device (Android 8.0 or newer).
4. If prompted, tap **Settings** and enable **Allow from this source**.
5. Tap **Install** (or **Update** if you already have it installed).

### Option 2: Build From Source
```bash
# 1. Clone repository
git clone https://github.com/themuhammad-personal/Deepseek-.git
cd Deepseek-

# 2. Install dependencies
npm ci

# 3. Run test verification (105 test suites)
npm test

# 4. Compile Android assets
npm run build:android

# 5. Build signed Release APK
cd android
./gradlew assembleRelease
```
The compiled, signed APK will be generated at:
`android/app/build/outputs/apk/release/app-release.apk`

---

## 🧪 Quality Assurance & Test Verification

Super DeepSeek maintains a 100% automated test pass rate across unit and integration suites:

```text
 ✓ tests/integration/auto.test.js (39 tests)
 ✓ tests/integration/ui/SidebarMenuInjector.test.js (17 tests)
 ✓ tests/integration/scanner.test.js (34 tests)
 ✓ tests/integration/ui/AttachMenu.test.js (24 tests)
 ✓ tests/integration/deep-research-state.test.js (28 tests)
 ...
 Test Files  105 passed (105)
      Tests  1556 passed (1556)
```

---

## 📄 License & Open-Source Ethics

Super DeepSeek is open-source software licensed under the **[MIT License](LICENSE)**.

*Disclaimer: Super DeepSeek is an independent open-source client developed to provide an elevated mobile user experience. It is not officially affiliated with, endorsed by, or sponsored by DeepSeek AI.*
