# Applied Bug Fixes (Demonstration)

This file lists fixes applied in this workspace audit. To apply to your repo:

## 1. .gitignore - Add JKS protection

```gitignore
# Keystore - NEVER commit
*.jks
*.keystore
android/app/superdeepseek-release.jks
android/ci-release.jks
android/app/release.jks

# Secrets
.env
.env.*
!.env.example
```

## 2. server.js - Secure Version

Fixed: Removed `express.static(__dirname)` which exposed entire repo including keystore.

```js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet"; // npm i helmet

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://chat.deepseek.com", "https://api.deepseek.com"]
    }
  }
}));
app.use(express.json({ limit: "50mb" }));

// Only serve safe dirs
app.use("/static", express.static(path.join(__dirname, "static"), { maxAge: "1y" }));
app.use("/docs", express.static(path.join(__dirname, "docs")));

// Serve built assets if exists
const distPath = path.join(__dirname, "dist-android");
app.use("/dist-android", express.static(distPath, { maxAge: "1h" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "Super DeepSeek", version: "1.0.0", secure: true });
});

// SPA fallback only for known routes, not wildcard exposing files
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`⚡ Secure Super DeepSeek server on http://0.0.0.0:${PORT}`);
});
```

## 3. WebViewBridge.kt - Origin Check

Add to every @JavascriptInterface method:

```kotlin
private fun checkOrigin(): Boolean {
    val currentUrl = webView?.url ?: return false
    return currentUrl.startsWith("https://chat.deepseek.com") || 
           currentUrl.startsWith("https://bds-asset.local") ||
           currentUrl.startsWith("https://www.deepseek.com")
}

@JavascriptInterface
fun getStorage(key: String?): String? {
    if (!checkOrigin()) {
        Log.w(TAG, "Blocked getStorage from untrusted origin: ${webView?.url}")
        return null
    }
    // ... existing logic
}
```

## 4. build.js - Code Splitting

Add manualChunks:

```js
rollupOptions: {
  output: {
    manualChunks: {
      'core': ['src/content/state.js', 'src/content/scanner.js'],
      'mcp': ['src/content/mcp-discovery-cache.js'],
      'files': ['src/content/files/github-reader.js'],
      'ui': ['src/content/ui/Drawer.svelte']
    }
  }
}
```

## 5. Theme Watcher Debounce

```js
let themeDebounce = 0;
function apply(isDark) {
  clearTimeout(themeDebounce);
  themeDebounce = setTimeout(() => {
    if (isDark !== lastIsDark) {
      chrome.storage.local.set({ [STORAGE_KEYS.pageIsDark]: isDark });
      lastIsDark = isDark;
    }
  }, 500);
}
```

All these fixes are detailed in AUDIT_REPORT.md
