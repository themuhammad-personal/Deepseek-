package com.betterdeepseek.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.MimeTypeMap
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import android.widget.FrameLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.FileProvider
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.UserAgentMetadata
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import java.io.File

// ... keep helper functions same as original ...
internal fun applyRootWindowInsets(view: View, windowInsets: WindowInsetsCompat): WindowInsetsCompat {
    val systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
    val ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
    val bottomInset = maxOf(systemBars.bottom, ime.bottom)
    view.setPadding(systemBars.left, systemBars.top, systemBars.right, bottomInset)
    view.translationY = 0f
    return windowInsets
}
internal fun shouldOpenExternally(url: Uri, assetHost: String = "bds-asset.local"): Boolean {
    val scheme = url.scheme?.lowercase() ?: return false
    if (scheme != "http" && scheme != "https") return false
    val host = url.host?.lowercase() ?: return false
    if (host == assetHost.lowercase()) return false
    if (host == "deepseek.com" || host.endsWith(".deepseek.com")) return false
    if (host == "hcaptcha.com" || host.endsWith(".hcaptcha.com")) return false
    if (isGoogleAuthHost(host)) return false
    if (isAppleAuthHost(host)) return false
    if (isSecurityChallengeHost(host)) return false
    return true
}
internal fun isAppleAuthHost(host: String): Boolean {
    val h = host.lowercase()
    return h == "apple.com" || h.endsWith(".apple.com") || h == "icloud.com" || h.endsWith(".icloud.com")
}
internal fun isSecurityChallengeHost(host: String): Boolean {
    val h = host.lowercase()
    return h == "awswaf.com" || h.endsWith(".awswaf.com") || h == "cloudflare.com" || h.endsWith(".cloudflare.com") || h == "recaptcha.net" || h.endsWith(".recaptcha.net")
}
internal fun isGoogleAuthHost(host: String): Boolean {
    val h = host.lowercase()
    return h == "google.com" || h.endsWith(".google.com") || h == "accounts.youtube.com" || h == "googleusercontent.com" || h.endsWith(".googleusercontent.com")
}
internal fun shouldCapturePopupInApp(url: Uri, assetHost: String = "bds-asset.local"): Boolean { return !shouldOpenExternally(url, assetHost) }
internal fun shouldOpenRequestExternally(request: WebResourceRequest, assetHost: String = "bds-asset.local"): Boolean {
    if (!request.isForMainFrame) return false
    val url = request.url ?: return false
    if (!shouldOpenExternally(url, assetHost)) return false
    return request.hasGesture()
}
internal fun deriveWebViewUserAgent(defaultUserAgent: String): String {
    return defaultUserAgent.replace(Regex(""";\s*wv(?=\))"""), "").replace(Regex("""\bVersion/\d+(?:\.\d+)*\s*"""), "").replace(Regex("""\s+"""), " ").trim()
}
internal fun parseChromeMajorVersion(ua: String): String? { return Regex("""\bChrome/(\d+(?:\.\d+)*)""").find(ua)?.groupValues?.get(1)?.substringBefore('.') }
internal fun parseAndroidPlatformVersion(ua: String): String? { return Regex("""Android\s+(\d+(?:\.\d+)*)""").find(ua)?.groupValues?.get(1) }
internal fun parseDeviceModel(ua: String): String? {
    val inner = Regex("""Android\s+[\d.]+;\s*([^;)]+)""").find(ua)?.groupValues?.get(1)?.trim() ?: return null
    return inner.substringBefore(" Build/").trim().ifBlank { null }
}
internal fun buildUserAgentMetadata(derivedUa: String): UserAgentMetadata {
    val builder = UserAgentMetadata.Builder().setPlatform("Android").setMobile(true)
    val chromeVersion = Regex("""\bChrome/(\d+(?:\.\d+)*)""").find(derivedUa)?.groupValues?.get(1)
    if (chromeVersion != null) {
        val majorVersion = chromeVersion.substringBefore('.')
        val brandVersions = listOf(
            UserAgentMetadata.BrandVersion.Builder().setBrand("Not/A)Brand").setMajorVersion("8").setFullVersion("8.0.0.0").build(),
            UserAgentMetadata.BrandVersion.Builder().setBrand("Chromium").setMajorVersion(majorVersion).setFullVersion(chromeVersion).build(),
            UserAgentMetadata.BrandVersion.Builder().setBrand("Google Chrome").setMajorVersion(majorVersion).setFullVersion(chromeVersion).build(),
        )
        builder.setFullVersion(chromeVersion).setBrandVersionList(brandVersions)
    }
    builder.setArchitecture("").setBitness(UserAgentMetadata.BITNESS_DEFAULT)
    parseAndroidPlatformVersion(derivedUa)?.let { builder.setPlatformVersion(it) }
    parseDeviceModel(derivedUa)?.let { builder.setModel(it) }
    return builder.build()
}
internal fun buildFileChooserIntent(acceptTypes: Array<String>?, allowMultiple: Boolean): Intent {
    return Intent(Intent.ACTION_GET_CONTENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        if (allowMultiple) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        val mimeTypes = mapAcceptTypes(acceptTypes)
        if (mimeTypes.isNotEmpty()) putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toTypedArray())
    }
}
internal fun parseFileChooserResult(resultCode: Int, data: Intent?): Array<Uri>? {
    if (resultCode != Activity.RESULT_OK) return null
    val uris = linkedSetOf<Uri>()
    val clipData = data?.clipData
    if (clipData != null) { for (i in 0 until clipData.itemCount) { clipData.getItemAt(i).uri?.let { uris.add(it) } } }
    else { data?.data?.let { uris.add(it) } }
    if (uris.isNotEmpty()) return uris.toTypedArray()
    return runCatching { WebChromeClient.FileChooserParams.parseResult(resultCode, data) }.getOrNull()?.takeIf { it.isNotEmpty() }
}
private fun mapAcceptTypes(acceptTypes: Array<String>?): List<String> {
    val tokens = acceptTypes?.flatMap { it.split(',') }?.map { it.trim() }?.filter { it.isNotEmpty() }.orEmpty()
    if (tokens.isEmpty()) return emptyList()
    val mapped = linkedSetOf<String>()
    for (token in tokens) {
        val mimeType = when {
            "/" in token -> token
            token.startsWith(".") -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(token.removePrefix(".").lowercase())
            else -> null
        }
        if (mimeType.isNullOrBlank()) return emptyList()
        mapped.add(mimeType)
    }
    return mapped.toList()
}
private val CHROME_VERSION_REGEX = Regex("""\bChrome/(\d+(?:\.\d+)*)""")

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var rootLayout: FrameLayout
    private lateinit var assetLoader: WebViewAssetLoader
    private lateinit var bridge: WebViewBridge
    private lateinit var cookieManager: CookieManager
    private lateinit var derivedUserAgent: String

    private var popupContainer: FrameLayout? = null
    private var popupWebView: WebView? = null

    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null
    private val fileChooserLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = pendingFileChooser
            pendingFileChooser = null
            callback?.onReceiveValue(parseFileChooserResult(result.resultCode, result.data))
        }

    @Volatile private var pendingPickFilesRequestId: String? = null
    @Volatile private var pendingPickFilesMode: String? = null
    private var isPageReady: Boolean = false
    private var hasInjected: Boolean = false
    private val mainHandler = Handler(Looper.getMainLooper())

    private val multiFileLauncher: ActivityResultLauncher<Array<String>> =
        registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            val requestId = pendingPickFilesRequestId ?: return@registerForActivityResult
            val acceptImages = pendingPickFilesMode == "images" || pendingPickFilesMode?.endsWith("+images") == true
            pendingPickFilesRequestId = null
            pendingPickFilesMode = null
            if (uris.isEmpty()) { bridge.deliverPickError(requestId, "cancelled"); return@registerForActivityResult }
            bridge.deliverPickStatus(requestId, "reading")
            Thread {
                try {
                    val files = mutableListOf<PickedFile>()
                    val skipped = mutableListOf<SkippedFile>()
                    for (uri in uris) {
                        when (val result = bridge.readPickedContentUri(uri, acceptImages)) {
                            is PickedItemResult.Ok -> files.add(result.file)
                            is PickedItemResult.Skipped -> skipped.add(SkippedFile(result.name, result.reason))
                        }
                    }
                    bridge.deliverPickedFiles(requestId, files, skipped, null)
                } catch (t: Throwable) {
                    Log.e(TAG, "Native file pick read failed", t)
                    bridge.deliverPickError(requestId, "read-failed")
                }
            }.start()
        }

    private val folderPickerLauncher: ActivityResultLauncher<Uri?> =
        registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { treeUri ->
            val requestId = pendingPickFilesRequestId ?: return@registerForActivityResult
            val acceptImages = pendingPickFilesMode == "images" || pendingPickFilesMode?.endsWith("+images") == true
            pendingPickFilesRequestId = null
            pendingPickFilesMode = null
            if (treeUri == null) { bridge.deliverPickError(requestId, "cancelled"); return@registerForActivityResult }
            bridge.deliverPickStatus(requestId, "reading")
            Thread {
                try {
                    val result = bridge.readPickedFolderTree(treeUri, acceptImages)
                    bridge.deliverPickedFiles(requestId, result.files, result.skipped, result.folderName)
                } catch (t: Throwable) {
                    Log.e(TAG, "Native folder pick read failed", t)
                    bridge.deliverPickError(requestId, "read-failed")
                }
            }.start()
        }

    private lateinit var updateChecker: UpdateChecker
    private var updateProgressDialog: AlertDialog? = null
    private var pendingInstallFile: File? = null

    private val unknownSourcesLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            val apk = pendingInstallFile ?: return@registerForActivityResult
            if (packageManager.canRequestPackageInstalls()) launchInstaller(apk) else pendingInstallFile = null
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)
        // CRITICAL FIX: Always dismiss splash after max 8 seconds, even if page fails
        splashScreen.setKeepOnScreenCondition { !isPageReady }
        mainHandler.postDelayed({
            if (!isPageReady) {
                Log.w(TAG, "Force dismiss splash after timeout - page not ready")
                isPageReady = true
                forceRemoveMask()
            }
        }, 8000)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        bridge = WebViewBridge(applicationContext)
        cookieManager = CookieManager.getInstance()
        pendingPickFilesRequestId = savedInstanceState?.getString(STATE_PENDING_PICK_REQUEST_ID)
        pendingPickFilesMode = savedInstanceState?.getString(STATE_PENDING_PICK_MODE)
        pendingInstallFile = savedInstanceState?.getString(STATE_PENDING_INSTALL_PATH)?.let { path -> File(path).takeIf { it.isFile } }

        bridge.onPickFiles = { mode, requestId ->
            runOnUiThread {
                try {
                    pendingPickFilesRequestId = requestId
                    pendingPickFilesMode = mode
                    when (mode) {
                        "folder", "folder+images" -> folderPickerLauncher.launch(null)
                        "images" -> multiFileLauncher.launch(arrayOf("image/*"))
                        else -> multiFileLauncher.launch(arrayOf("*/*"))
                    }
                    bridge.deliverPickStatus(requestId, "opened")
                } catch (t: Throwable) {
                    Log.e(TAG, "Native file picker launch failed", t)
                    pendingPickFilesRequestId = null
                    pendingPickFilesMode = null
                    bridge.deliverPickError(requestId, "picker-launch-failed")
                }
            }
        }

        assetLoader = WebViewAssetLoader.Builder()
            .setDomain(getString(R.string.bds_asset_authority))
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        val isSystemDark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val isPageDark = bridge.getLastKnownIsDark(default = isSystemDark)
        derivedUserAgent = deriveWebViewUserAgent(WebSettings.getDefaultUserAgent(this@MainActivity))

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            applyBdsWebSettings(this, derivedUserAgent)
            addJavascriptInterface(bridge, BRIDGE_NAME)
            webViewClient = bdsWebViewClient()
            webChromeClient = bdsWebChromeClient()
            bridge.evaluateJs = { script -> evaluateJavascript(script, null) }
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
            setBackgroundColor(if (isPageDark) PAGE_BG_DARK else PAGE_BG_LIGHT)
        }

        applySystemLocaleCookie()

        rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            setBackgroundColor(if (isPageDark) PAGE_BG_DARK else PAGE_BG_LIGHT)
            addView(webView)
        }

        ViewCompat.setOnApplyWindowInsetsListener(rootLayout, ::applyRootWindowInsets)

        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = !isPageDark
            isAppearanceLightNavigationBars = !isPageDark
        }

        bridge.onNativeBlurRequested = { _, _ -> }
        bridge.onThemeChanged = { isDark ->
            runOnUiThread {
                val bg = if (isDark) PAGE_BG_DARK else PAGE_BG_LIGHT
                rootLayout.setBackgroundColor(bg)
                webView.setBackgroundColor(bg)
                WindowInsetsControllerCompat(window, window.decorView).apply {
                    isAppearanceLightStatusBars = !isDark
                    isAppearanceLightNavigationBars = !isDark
                }
            }
        }

        setContentView(rootLayout)
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        webView.loadUrl(getString(R.string.bds_target_url))

        updateChecker = UpdateChecker(applicationContext)
        maybeCheckForUpdates()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val popup = popupWebView
                if (popup != null) { closePopup(popup); return }
                webView.evaluateJavascript(
                    "(function(){ var closeBtn = document.querySelector('#bds-close, .bds-sheet-close, .bds-modal-close, .bds-image-close-btn, .bds-dr-revision-close, .bds-cmd-help-close, .bds-github-close, #bds-startup-mask'); if (closeBtn && closeBtn.offsetParent !== null) { closeBtn.click(); return true; } var mask = document.getElementById('bds-startup-mask'); if (mask) { mask.remove(); return true; } return false; })()"
                ) { result ->
                    if (result == "true" || result == "\"true\"") return@evaluateJavascript
                    if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
                }
            }
        })
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun applyBdsWebSettings(webView: WebView, derivedUa: String) {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            useWideViewPort = true
            loadWithOverviewMode = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = derivedUa
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
        }
        configureWebViewCookiePolicy(webView)
        configureWebViewFingerprint(webView, derivedUa)
    }

    private fun configureWebViewCookiePolicy(webView: WebView) {
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)
        cookieManager.flush()
    }

    private fun configureWebViewFingerprint(webView: WebView, derivedUa: String) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
            WebSettingsCompat.setRequestedWithHeaderOriginAllowList(webView.settings, emptySet<String>())
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) {
            WebSettingsCompat.setUserAgentMetadata(webView.settings, buildUserAgentMetadata(derivedUa))
        }
    }

    private fun applySystemLocaleCookie() {
        val localeTag = bridge.getSystemLocale().replace('_', '-').filter { it.isLetterOrDigit() || it == '-' }
        if (localeTag.isBlank()) return
        cookieManager.setCookie(getString(R.string.bds_target_url), "NEXT_LOCALE=$localeTag; Path=/; SameSite=Lax")
        cookieManager.flush()
    }

    override fun onResume() { super.onResume(); if (::cookieManager.isInitialized) cookieManager.flush() }
    override fun onPause() { super.onPause(); if (::cookieManager.isInitialized) cookieManager.flush() }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        pendingPickFilesRequestId?.let { outState.putString(STATE_PENDING_PICK_REQUEST_ID, it) }
        pendingPickFilesMode?.let { outState.putString(STATE_PENDING_PICK_MODE, it) }
        pendingInstallFile?.let { outState.putString(STATE_PENDING_INSTALL_PATH, it.absolutePath) }
    }

    override fun onDestroy() {
        popupWebView?.let { closePopup(it) }
        updateProgressDialog?.dismiss()
        updateProgressDialog = null
        bridge.onThemeChanged = null
        bridge.evaluateJs = null
        bridge.onPickFiles = null
        webView.removeJavascriptInterface(BRIDGE_NAME)
        if (::cookieManager.isInitialized) cookieManager.flush()
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val data = intent.data
        val url = data?.toString()
        if (url != null && url.startsWith("https://chat.deepseek.com")) webView.loadUrl(url)
        handleIncomingIntent(intent)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return
        val action = intent.action
        val shortcut = intent.getStringExtra("bds_action")
        if (!shortcut.isNullOrBlank()) {
            val script = "(function(){ try { window.dispatchEvent(new CustomEvent('bds:shortcut-action', { detail: { action: '$shortcut' } })); } catch(e){} })();"
            webView.evaluateJavascript(script, null)
            return
        }
        if (action == Intent.ACTION_SEND) {
            val text = intent.getStringExtra(Intent.EXTRA_TEXT)
            @Suppress("DEPRECATION") val stream = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            if (!text.isNullOrBlank()) {
                val escaped = jsStringLiteral(text)
                val script = "(function(){ try { window.dispatchEvent(new CustomEvent('bds:incoming-share', { detail: { text: $escaped } })); } catch(e){} })();"
                webView.evaluateJavascript(script, null)
            } else if (stream != null) handleIncomingStreamShare(listOf(stream))
        } else if (action == Intent.ACTION_SEND_MULTIPLE) {
            @Suppress("DEPRECATION") val streams = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            if (!streams.isNullOrEmpty()) handleIncomingStreamShare(streams)
        }
    }

    private fun handleIncomingStreamShare(uris: List<Uri>) {
        Thread {
            val filesArray = org.json.JSONArray()
            for (uri in uris) {
                try {
                    val name = getDisplayName(uri) ?: "shared_image.png"
                    val mime = contentResolver.getType(uri) ?: "image/png"
                    contentResolver.openInputStream(uri)?.use { stream ->
                        val bytes = stream.readBytes()
                        val base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                        val fileObj = org.json.JSONObject().apply {
                            put("name", name); put("mime", mime); put("encoding", "base64"); put("content", base64)
                        }
                        filesArray.put(fileObj)
                    }
                } catch (t: Throwable) { Log.w(TAG, "Failed reading shared uri: $uri", t) }
            }
            if (filesArray.length() > 0) {
                runOnUiThread {
                    val payloadLiteral = jsStringLiteral(filesArray.toString())
                    val script = "(function(){ try { window.dispatchEvent(new CustomEvent('bds:incoming-share', { detail: { files: JSON.parse($payloadLiteral) } })); } catch(e){} })();"
                    webView.evaluateJavascript(script, null)
                }
            }
        }.start()
    }

    private fun getDisplayName(uri: Uri): String? =
        contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (!cursor.moveToFirst() || index < 0) null else cursor.getString(index)
        }

    private fun bdsWebViewClient() = object : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            assetLoader.shouldInterceptRequest(request.url)?.let { return it }
            return null
        }
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url ?: return false
            if (!shouldOpenRequestExternally(request, getString(R.string.bds_asset_authority))) return false
            return openExternalUrl(url)
        }
        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            super.onPageStarted(view, url, favicon)
            hasInjected = false
            injectEarlySuppressCss(view)
        }
        override fun onPageCommitVisible(view: WebView, url: String?) {
            super.onPageCommitVisible(view, url)
            if (url?.startsWith("https://chat.deepseek.com") == true && !hasInjected) {
                injectBdsScriptsFixed(view)
            }
        }
        override fun onPageFinished(view: WebView, url: String?) {
            super.onPageFinished(view, url)
            // CRITICAL FIX: Always mark page ready after 1 sec, even if not deepseek URL
            mainHandler.postDelayed({
                if (!isPageReady) {
                    isPageReady = true
                    Log.i(TAG, "Page ready forced - url: $url")
                }
            }, 1000)
            if (url.isNullOrEmpty()) return
            if (url.startsWith("https://chat.deepseek.com")) {
                if (!hasInjected) injectBdsScriptsFixed(view)
                handleIncomingIntent(intent)
                // Force remove mask after injection
                mainHandler.postDelayed({ forceRemoveMask() }, 2000)
            } else {
                // Non-deepseek page (error, etc) - force ready
                isPageReady = true
            }
        }
        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            super.onReceivedError(view, request, error)
            if (request.isForMainFrame) {
                Log.e(TAG, "WebView error: ${error.description} for ${request.url}")
                // CRITICAL: Don't stay stuck on splash if page fails
                mainHandler.postDelayed({
                    isPageReady = true
                    forceRemoveMask()
                    // Show retry UI via JS
                    view.evaluateJavascript("""
                        (function(){
                            var mask = document.getElementById('bds-startup-mask');
                            if (mask) {
                                mask.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:24px;text-align:center;"><div style="font-size:48px;">📡</div><div style="color:white;font-size:18px;font-weight:600;">Connection Failed</div><div style="color:#9CA3AF;font-size:14px;max-width:280px;">${error.description} - Please check internet and tap retry</div><button onclick="location.reload()" style="margin-top:16px;padding:12px 24px;background:#4D6BFE;color:white;border:none;border-radius:12px;font-weight:600;cursor:pointer;">Retry</button></div>';
                            }
                        })();
                    """.trimIndent(), null)
                }, 500)
            }
        }
    }

    private fun bdsWebChromeClient() = object : WebChromeClient() {
        override fun onProgressChanged(view: WebView?, newProgress: Int) {
            super.onProgressChanged(view, newProgress)
            if (view != null) {
                if (newProgress in 15..80) injectEarlySuppressCss(view)
                if (newProgress >= 50 && view.url?.startsWith("https://chat.deepseek.com") == true && !hasInjected) {
                    injectBdsScriptsFixed(view)
                }
                if (newProgress == 100) {
                    if (!isPageReady) {
                        mainHandler.postDelayed({ isPageReady = true }, 500)
                    }
                }
            }
        }
        override fun onShowFileChooser(webView: WebView?, filePathCallback: ValueCallback<Array<Uri>>?, fileChooserParams: FileChooserParams?): Boolean {
            pendingFileChooser?.onReceiveValue(null)
            val callback = filePathCallback ?: return true
            pendingFileChooser = callback
            val allowMultiple = fileChooserParams?.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
            return try {
                fileChooserLauncher.launch(buildFileChooserIntent(fileChooserParams?.acceptTypes, allowMultiple))
                true
            } catch (t: Throwable) {
                Log.e(TAG, "File chooser launch failed", t)
                pendingFileChooser = null
                callback.onReceiveValue(null)
                true
            }
        }
        override fun onCreateWindow(view: WebView?, isDialog: Boolean, isUserGesture: Boolean, resultMsg: android.os.Message?): Boolean {
            val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false
            val popup = WebView(this@MainActivity).apply {
                applyBdsWebSettings(this, derivedUserAgent)
                webViewClient = popupWebViewClient(this)
                webChromeClient = popupWebChromeClient(this)
                setBackgroundColor(Color.WHITE)
            }
            attachPopup(popup)
            transport.webView = popup
            resultMsg.sendToTarget()
            return true
        }
    }

    private fun popupWebViewClient(popup: WebView) = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url ?: return false
            if (!shouldOpenRequestExternally(request, getString(R.string.bds_asset_authority))) return false
            openExternalUrl(url)
            closePopup(popup)
            return true
        }
    }
    private fun popupWebChromeClient(popup: WebView) = object : WebChromeClient() {
        override fun onCloseWindow(window: WebView?) { closePopup(popup) }
        override fun onCreateWindow(view: WebView?, isDialog: Boolean, isUserGesture: Boolean, resultMsg: android.os.Message?): Boolean { return false }
    }

    private fun attachPopup(popup: WebView) {
        popupWebView?.let { closePopup(it) }
        val container = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            addView(popup, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        popupContainer = container
        popupWebView = popup
        rootLayout.addView(container)
    }
    private fun closePopup(popup: WebView) {
        if (popupWebView !== popup) return
        popupWebView = null
        popupContainer?.let { container -> container.removeView(popup); rootLayout.removeView(container) }
        popupContainer = null
        popup.destroy()
    }

    private fun openExternalUrl(url: Uri): Boolean {
        return runCatching {
            val intent = Intent(Intent.ACTION_VIEW, url).apply { addCategory(Intent.CATEGORY_BROWSABLE) }
            startActivity(intent)
        }.onFailure { Log.w(TAG, "Failed to open external URL: $url", it) }.isSuccess
    }

    private fun maybeCheckForUpdates() {
        if (!updateChecker.isAutoCheckDue()) return
        Thread {
            val result = updateChecker.check(installedApp())
            updateChecker.markChecked()
            if (result is UpdateCheckResult.Available) runOnUiThread { showUpdateDialog(result.info) }
        }.start()
    }
    private fun installedApp(): InstalledApp =
        try {
            val info = packageManager.getPackageInfo(packageName, 0)
            InstalledApp(info.versionName, info.lastUpdateTime, BuildConfig.BUILD_ID)
        } catch (t: Throwable) {
            Log.w(TAG, "Could not read the installed package info", t)
            InstalledApp(null, 0L, 0L)
        }
    private fun showUpdateDialog(info: UpdateInfo) {
        if (isFinishing || isDestroyed) return
        val installedVersion = installedApp().versionName.orEmpty()
        val message = if (parseVersion(info.versionName) != null) getString(R.string.bds_update_message, info.versionName, installedVersion) else getString(R.string.bds_update_message_beta, installedVersion)
        MaterialAlertDialogBuilder(this).setTitle(R.string.bds_update_title).setMessage(message)
            .setPositiveButton(R.string.bds_update_download) { _, _ -> startUpdateDownload(info) }
            .setNegativeButton(R.string.bds_update_later) { _, _ -> updateChecker.rememberDeclined(info.digest) }
            .setNeutralButton(R.string.bds_update_channel) { _, _ -> showChannelDialog() }.show()
    }
    private fun showChannelDialog() {
        val channels = UpdateChannel.values()
        val labels = channels.map { channelLabel(it) }.toTypedArray()
        val selected = channels.indexOf(updateChecker.getChannel())
        MaterialAlertDialogBuilder(this).setTitle(R.string.bds_update_channel_title).setSingleChoiceItems(labels, selected) { dialog, which ->
            updateChecker.setChannel(channels[which]); dialog.dismiss()
        }.setNegativeButton(R.string.bds_update_later, null).show()
    }
    private fun channelLabel(channel: UpdateChannel): String = getString(when (channel) { UpdateChannel.RELEASE -> R.string.bds_update_channel_release; UpdateChannel.BETA -> R.string.bds_update_channel_beta })
    private fun startUpdateDownload(info: UpdateInfo) {
        if (isFinishing || isDestroyed) return
        updateProgressDialog = MaterialAlertDialogBuilder(this).setTitle(R.string.bds_update_title).setMessage(R.string.bds_update_downloading).setCancelable(false).show()
        val target = File(cacheDir, UPDATE_APK_NAME)
        Thread {
            val failure = updateChecker.downloadApk(info, target)
            runOnUiThread {
                updateProgressDialog?.dismiss(); updateProgressDialog = null
                if (isFinishing || isDestroyed) return@runOnUiThread
                if (failure != null) {
                    Log.w(TAG, "Update download failed: $failure")
                    Toast.makeText(this, getString(R.string.bds_update_download_failed, failure), Toast.LENGTH_LONG).show()
                    return@runOnUiThread
                }
                requestInstall(target)
            }
        }.start()
    }
    private fun requestInstall(apk: File) {
        if (packageManager.canRequestPackageInstalls()) { launchInstaller(apk); return }
        pendingInstallFile = apk
        Toast.makeText(this, R.string.bds_update_need_permission, Toast.LENGTH_LONG).show()
        try { unknownSourcesLauncher.launch(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))) }
        catch (t: Throwable) { Log.w(TAG, "Could not open the unknown-sources settings screen", t); pendingInstallFile = null }
    }
    private fun launchInstaller(apk: File) {
        pendingInstallFile = null
        try {
            val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", apk)
            startActivity(Intent(Intent.ACTION_VIEW).apply { setDataAndType(uri, APK_MIME_TYPE); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
        } catch (t: Throwable) { Log.e(TAG, "Could not launch the package installer", t); Toast.makeText(this, R.string.bds_update_install_failed, Toast.LENGTH_LONG).show() }
    }

    // ── FIXED INJECTION - No more 3.3MB evaluateJavascript ──

    private fun injectEarlySuppressCss(view: WebView) {
        // FIXED: Add permanent removal flag to prevent recreation loop
        val script = """
            (function() {
                if (window.__bdsMaskRemovedPermanently) return;
                var id = 'bds-early-banner-suppress';
                if (!document.getElementById(id)) {
                    var style = document.createElement('style');
                    style.id = id;
                    style.textContent = `
                        [class*="mobile-banner"], [class*="app-banner"], [class*="download-banner"], [class*="get-app"], [class*="download-app"], [class*="client-banner"], [class*="install-banner"], [class*="open-in-app"], [class*="header-banner"], header [class*="banner"], div:has(> a[href*="download"]), div:has(> a[href*="/app"]) {
                            display: none !important; height: 0 !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; visibility: hidden !important; pointer-events: none !important;
                        }
                    `;
                    var target = document.head || document.documentElement;
                    if (target) target.appendChild(style);
                }
                function hideBanners() {
                    if (window.__bdsMaskRemovedPermanently) return;
                    var els = document.querySelectorAll('div, header, section');
                    for (var i = 0; i < Math.min(els.length, 40); i++) {
                        var el = els[i];
                        if (el && el.textContent && (el.textContent.includes('Get App') || el.textContent.includes('Download App'))) {
                            var rect = el.getBoundingClientRect();
                            if (rect.top <= 140 && rect.height > 0 && rect.height < 200) {
                                el.style.setProperty('display', 'none', 'important');
                            }
                        }
                    }
                }
                hideBanners();
                if (!window.__bdsBannerObserver && document.documentElement) {
                    window.__bdsBannerObserver = new MutationObserver(hideBanners);
                    window.__bdsBannerObserver.observe(document.documentElement, { childList: true, subtree: true });
                }
                // FIXED: Startup mask with permanent removal flag and shorter timeout
                if (!document.getElementById('bds-startup-mask') && document.body && !window.__bdsMaskRemovedPermanently) {
                    var mask = document.createElement('div');
                    mask.id = 'bds-startup-mask';
                    mask.style.cssText = 'position:fixed;inset:0;background:#000000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity 0.3s ease;pointer-events:all;';
                    mask.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:16px;"><svg width="60" height="60" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="42" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-dasharray="180" stroke-dashoffset="45"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="1.2s" repeatCount="indefinite"/></circle><path d="M35 52C35 44 42 38 50 38C58 38 65 44 65 52C65 60 58 66 50 66C45 66 41 64 38 60L32 63" stroke="#3b82f6" stroke-width="4" stroke-linecap="round"/></svg><span style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:18px;font-weight:600;letter-spacing:0.5px;">Super DeepSeek</span><span style="color:#6B7280;font-size:12px;margin-top:8px;">Loading...</span></div>';
                    document.body.appendChild(mask);
                    // Auto remove after 4 sec max
                    setTimeout(function() {
                        var m = document.getElementById('bds-startup-mask');
                        if (m && m.parentNode) {
                            m.style.opacity = '0';
                            setTimeout(function() { 
                                var mm = document.getElementById('bds-startup-mask');
                                if (mm && mm.parentNode) mm.parentNode.removeChild(mm);
                                window.__bdsMaskRemovedPermanently = true;
                            }, 300);
                        }
                    }, 4000);
                }
            })();
        """.trimIndent()
        view.evaluateJavascript(script, null)
    }

    private fun forceRemoveMask() {
        val script = """
            (function(){
                try {
                    window.__bdsMaskRemovedPermanently = true;
                    var mask = document.getElementById('bds-startup-mask');
                    if (mask) {
                        mask.style.opacity = '0';
                        setTimeout(function(){ 
                            var m = document.getElementById('bds-startup-mask');
                            if (m && m.parentNode) m.parentNode.removeChild(m);
                        }, 200);
                    }
                    if (window.__bdsBannerObserver) {
                        try { window.__bdsBannerObserver.disconnect(); } catch(e){}
                        window.__bdsBannerObserver = null;
                    }
                } catch(e){}
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    /**
     * FIXED: Use asset loader URLs instead of 3.3MB evaluateJavascript string
     * This avoids Binder transaction limit (1MB) that caused stuck splash
     */
    private fun injectBdsScriptsFixed(view: WebView) {
        if (hasInjected) return
        hasInjected = true
        Log.i(TAG, "Injecting BDS scripts via asset loader URLs")

        val assetHost = getString(R.string.bds_asset_authority)
        val cssUrl = "https://$assetHost/bds/content.css"
        val injectedUrl = "https://$assetHost/bds/injected.js"
        val contentUrl = "https://$assetHost/bds/content.js"

        val bootstrap = """
            (function() {
                if (window.__bdsAndroidBootstrapped) {
                    console.log('[BDS] Already bootstrapped, skipping');
                    return;
                }
                window.__bdsAndroidBootstrapped = true;
                console.log('[BDS] Starting bootstrap via asset loader');

                function loadCss(url) {
                    return new Promise(function(resolve, reject) {
                        var link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = url;
                        link.onload = resolve;
                        link.onerror = function() { console.warn('[BDS] CSS load failed', url); resolve(); };
                        document.head.appendChild(link);
                    });
                }
                function loadScript(url) {
                    return new Promise(function(resolve, reject) {
                        var script = document.createElement('script');
                        script.src = url;
                        script.onload = function() { console.log('[BDS] Loaded', url); resolve(); };
                        script.onerror = function(e) { console.error('[BDS] Failed', url, e); resolve(); };
                        document.head.appendChild(script);
                    });
                }

                function removeMask() {
                    try {
                        window.__bdsMaskRemovedPermanently = true;
                        var mask = document.getElementById('bds-startup-mask');
                        if (mask) {
                            mask.style.opacity = '0';
                            setTimeout(function(){ 
                                var m = document.getElementById('bds-startup-mask');
                                if (m && m.parentNode) m.parentNode.removeChild(m);
                            }, 250);
                        }
                    } catch(e){ console.error('[BDS] mask remove failed', e); }
                }

                // Load in order: CSS -> injected.js -> content.js
                loadCss('$cssUrl').then(function() {
                    return loadScript('$injectedUrl');
                }).then(function() {
                    return loadScript('$contentUrl');
                }).then(function() {
                    console.log('[BDS] All scripts loaded, removing mask');
                    setTimeout(removeMask, 500);
                }).catch(function(e) {
                    console.error('[BDS] Bootstrap failed', e);
                    removeMask();
                });

                // Material You accent
                try {
                    var accent = '${getMaterialYouAccentHex() ?: ""}';
                    if (accent) document.documentElement.style.setProperty('--bds-material-accent', accent);
                } catch(e){}

                // Fallback: force remove mask after 5 sec even if scripts fail
                setTimeout(removeMask, 5000);
            })();
        """.trimIndent()

        view.evaluateJavascript(bootstrap, null)
    }

    private fun getMaterialYouAccentHex(): String? {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            return try {
                val color = resources.getColor(android.R.color.system_accent1_500, theme)
                String.format("#%06X", (0xFFFFFF and color))
            } catch (_: Throwable) { null }
        }
        return null
    }

    private fun jsStringLiteral(source: String): String {
        val builder = StringBuilder(source.length + 2)
        builder.append('"')
        for (c in source) {
            when (c) {
                '\\' -> builder.append("\\\\")
                '"' -> builder.append("\\\"")
                '\n' -> builder.append("\\n")
                '\r' -> builder.append("\\r")
                '\t' -> builder.append("\\t")
                '\u2028' -> builder.append("\\u2028")
                '\u2029' -> builder.append("\\u2029")
                else -> if (c.code < 0x20) builder.append("\\u%04x".format(c.code)) else builder.append(c)
            }
        }
        builder.append('"')
        return builder.toString()
    }

    companion object {
        private const val BRIDGE_NAME = "AndroidBridge"
        private const val TAG = "BdsMainActivity"
        private const val STATE_PENDING_PICK_REQUEST_ID = "bds_pending_pick_request_id"
        private const val STATE_PENDING_PICK_MODE = "bds_pending_pick_mode"
        private const val STATE_PENDING_INSTALL_PATH = "bds_pending_install_path"
        private const val UPDATE_APK_NAME = "bds-update.apk"
        private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
        private val PAGE_BG_DARK = Color.BLACK
        private val PAGE_BG_LIGHT = Color.WHITE
    }
}
