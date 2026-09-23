package com.betterdeepseek.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.UserAgentMetadata
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature

// Helper functions for unit tests
internal fun applyRootWindowInsets(view: View, windowInsets: WindowInsetsCompat): WindowInsetsCompat {
    val systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
    val imeInsets = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
    val bottomInset = maxOf(systemBars.bottom, imeInsets.bottom)
    view.setPadding(systemBars.left, systemBars.top, systemBars.right, bottomInset)
    view.translationY = 0f
    return WindowInsetsCompat.CONSUMED
}

internal fun shouldOpenExternally(url: Uri, assetHost: String = "bds-asset.local"): Boolean {
    val scheme = url.scheme?.lowercase() ?: return false
    if (scheme != "http" && scheme != "https") return false
    val host = url.host?.lowercase() ?: return false
    if (host == assetHost.lowercase()) return false
    if (host == "appassets.androidplatform.net") return false
    if (host == "deepseek.com" || host.endsWith(".deepseek.com")) return false
    if (host == "hcaptcha.com" || host.endsWith(".hcaptcha.com")) return false
    if (isGoogleAuthHost(host)) return false
    return true
}

internal fun isGoogleAuthHost(host: String): Boolean {
    val h = host.lowercase()
    return h == "google.com" || h.endsWith(".google.com") || h == "accounts.youtube.com" || h == "googleusercontent.com" || h.endsWith(".googleusercontent.com")
}

internal fun shouldCapturePopupInApp(url: Uri, assetHost: String = "bds-asset.local"): Boolean {
    return !shouldOpenExternally(url, assetHost)
}

internal fun shouldOpenRequestExternally(request: WebResourceRequest, assetHost: String = "bds-asset.local"): Boolean {
    if (!request.isForMainFrame) return false
    val url = request.url ?: return false
    if (!shouldOpenExternally(url, assetHost)) return false
    return request.hasGesture()
}

internal fun deriveWebViewUserAgent(defaultUserAgent: String): String {
    return defaultUserAgent.replace(Regex(""";\s*wv(?=\))"""), "").replace(Regex("""\bVersion/\d+(?:\.\d+)*\s*"""), "").replace(Regex("""\s+"""), " ").trim()
}

internal fun parseChromeMajorVersion(ua: String): String? {
    return CHROME_VERSION_REGEX.find(ua)?.groupValues?.get(1)?.substringBefore('.')
}

internal fun parseAndroidPlatformVersion(ua: String): String? {
    return Regex("""Android\s+(\d+(?:\.\d+)*)""").find(ua)?.groupValues?.get(1)
}

internal fun parseDeviceModel(ua: String): String? {
    val inner = Regex("""Android\s+[\d.]+;\s*([^;)]+)""").find(ua)?.groupValues?.get(1)?.trim() ?: return null
    return inner.substringBefore(" Build/").trim().ifBlank { null }
}

internal fun buildUserAgentMetadata(derivedUa: String): UserAgentMetadata {
    val builder = UserAgentMetadata.Builder().setPlatform("Android").setMobile(true)
    val chromeVersion = CHROME_VERSION_REGEX.find(derivedUa)?.groupValues?.get(1)
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
    if (clipData != null) {
        for (i in 0 until clipData.itemCount) clipData.getItemAt(i).uri?.let { uris.add(it) }
    } else {
        data?.data?.let { uris.add(it) }
    }
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

/**
 * Super DeepSeek - Official DeepSeek login via visible WebView + custom React UI overlay
 * 
 * As per user request: Directly load https://chat.deepseek.com official login page,
 * let user login officially, extract token from localStorage.userToken, then show
 * custom React SPA UI (exact copy from demo) with that token.
 * 
 * Architecture:
 * - officialWebView: visible, loads https://chat.deepseek.com official site for 100% official login
 *   After login, token is extracted from localStorage: JSON.parse(localStorage.getItem("userToken")).value
 * - reactWebView: invisible initially, loads custom React SPA from local assets (OLED black UI)
 *   After official login token obtained, it becomes visible and receives token via JS bridge
 * 
 * This solves WAF/CORS completely because login happens on official domain with official cookies.
 */
class MainActivity : ComponentActivity() {

    /** Host the asset loader owns — chosen so API calls from the SPA are same-origin. */
    private val DS_HOST = "chat.deepseek.com"

    /** Bundled React SPA, served out of assets by [assetLoader]. */
    private val SPA_URL = "https://chat.deepseek.com/android-spa.html"

    private lateinit var officialWebView: WebView
    private lateinit var reactWebView: WebView
    private lateinit var rootLayout: FrameLayout
    private lateinit var assetLoader: WebViewAssetLoader

    /** Serves the engine bundle (assets/bds) at the bds-asset.local authority. */
    private lateinit var bdsAssetLoader: WebViewAssetLoader
    private lateinit var bridge: WebViewBridge
    private lateinit var cookieManager: CookieManager
    private var isReactVisible = false
    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null
    private var cameraPhotoUri: Uri? = null

    /**
     * `<input capture>` must launch a real camera intent; the document picker
     * that FileChooserParams.createIntent() builds rarely offers one, which is
     * why "Camera" appeared dead. The photo lands in our cache via FileProvider
     * and is handed back through [fileChooserLauncher].
     */
    private fun buildCameraCaptureIntent(): Intent? {
        return try {
            val file = File(cacheDir, "capture-${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
            cameraPhotoUri = uri
            Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri)
        } catch (t: Throwable) {
            Log.e("SuperDeepSeek", "Camera intent failed", t)
            cameraPhotoUri = null
            null
        }
    }
    private var spaRetries = 0
    private val handler = Handler(Looper.getMainLooper())
    private var tokenPollingRunnable: Runnable? = null

    /** Flipped once the engine page paints; releases the system splash. */
    @Volatile private var firstPaintReady = false

    /** Cap on splash hold so a stalled network can never trap the launch. */
    private val SPLASH_FAILSAFE_MS = 4000L

    /** Engine native-pick request waiting for [nativePickLauncher]: id to mode. */
    private var nativePickRequest: Pair<String, String>? = null

    /**
     * The engine (injected into the official DeepSeek page) asks the native
     * side to pick files (`AndroidBridge.pickFiles(mode, requestId)`) and waits
     * for a CustomEvent delivered back INTO THE SAME WebView. Without this
     * launcher every native pick died with "picker-launch-failed", which is why
     * camera/file/folder uploads looked broken.
     */
    private val nativePickLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val request = nativePickRequest
            nativePickRequest = null
            if (request == null) return@registerForActivityResult
            val (requestId, mode) = request
            if (result.resultCode != Activity.RESULT_OK || result.data == null) {
                bridge.deliverPickError(requestId, "cancelled")
                return@registerForActivityResult
            }
            try {
                val data = result.data
                if (mode.startsWith("folder")) {
                    val tree = data?.data
                    if (tree == null) {
                        bridge.deliverPickError(requestId, "cancelled")
                        return@registerForActivityResult
                    }
                    runCatching {
                        contentResolver.takePersistableUriPermission(
                            tree, Intent.FLAG_GRANT_READ_URI_PERMISSION,
                        )
                    }
                    val read = bridge.readPickedFolderTree(tree, mode.contains("images"))
                    bridge.deliverPickedFiles(requestId, read.files, read.skipped, read.folderName)
                } else {
                    val uris = linkedSetOf<Uri>()
                    data?.clipData?.let { clip ->
                        for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { uris.add(it) }
                    }
                    data?.data?.let { uris.add(it) }
                    if (uris.isEmpty()) {
                        bridge.deliverPickError(requestId, "cancelled")
                        return@registerForActivityResult
                    }
                    val acceptImages = mode.contains("images")
                    val files = ArrayList<PickedFile>()
                    val skipped = ArrayList<SkippedFile>()
                    for (uri in uris) {
                        when (val picked = bridge.readPickedContentUri(uri, acceptImages)) {
                            is PickedItemResult.Ok -> files.add(picked.file)
                            is PickedItemResult.Skipped -> skipped.add(SkippedFile(picked.name, picked.reason))
                        }
                    }
                    if (files.isEmpty()) bridge.deliverPickError(requestId, "no-readable-files")
                    else bridge.deliverPickedFiles(requestId, files, skipped, null)
                }
            } catch (t: Throwable) {
                Log.e("SuperDeepSeek", "Native pick handling failed", t)
                bridge.deliverPickError(requestId, "read-failed")
            }
        }

    private val fileChooserLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = pendingFileChooser
            pendingFileChooser = null
            val captureUri = cameraPhotoUri
            cameraPhotoUri = null
            callback?.onReceiveValue(
                if (result.resultCode == Activity.RESULT_OK) {
                    result.data?.let { intent ->
                        val clip = intent.clipData
                        if (clip != null) Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
                        else intent.data?.let { arrayOf(it) }
                    }
                        // Camera capture returns no data intent; the photo is at EXTRA_OUTPUT.
                        ?: captureUri?.let { arrayOf(it) }
                } else null
            )
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)

        // The system splash stays up until the WebView has actually painted
        // something (first page start = branded boot overlay injected). This is
        // what removes the "white screen → official page → our UI" three-stage
        // launch: splash (branded) → boot overlay (branded) → app. The failsafe
        // timer keeps a cold network from pinning the user on the splash.
        splashScreen.setKeepOnScreenCondition { !firstPaintReady }
        handler.postDelayed({ firstPaintReady = true }, SPLASH_FAILSAFE_MS)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)

        bridge = WebViewBridge(applicationContext)
        // Serve the bundled SPA from chat.deepseek.com itself.
        //
        // That makes every /api/v0/... fetch from the SPA same-origin, which is
        // the whole point: DeepSeek answers an OPTIONS preflight with 403 and
        // sends no Access-Control-Allow-Origin, so a cross-origin fetch carrying
        // an Authorization header is blocked by the browser. Same-origin requests
        // never preflight, carry the real cookies, and look exactly like the
        // official web app's traffic.
        //
        // Paths the asset loader does not own (i.e. /api/*) fall through to the
        // network, which is precisely what the API calls need.
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain(DS_HOST)
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        // Engine bundle lives at assets/bds and is requested as
        // https://bds-asset.local/bds/... by WebViewBridge.getAssetUrl().
        bdsAssetLoader = WebViewAssetLoader.Builder()
            .setDomain(getString(R.string.bds_asset_authority))
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        // Official DeepSeek WebView - visible for official login
        officialWebView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                useWideViewPort = true
                loadWithOverviewMode = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                cacheMode = WebSettings.LOAD_DEFAULT
                userAgentString = deriveWebViewUserAgent(WebSettings.getDefaultUserAgent(this@MainActivity))
                setSupportMultipleWindows(true)
                javaScriptCanOpenWindowsAutomatically = true
            }
            addJavascriptInterface(bridge, "AndroidBridge")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    // Serve the engine's bundled assets (fish loading SVGs, icons, sandbox)
                    // from assets/bds via the bds-asset.local authority. Real site traffic
                    // (login/WAF) passes through untouched.
                    val url = request.url
                    if (url.host == getString(R.string.bds_asset_authority)) {
                        return bdsAssetLoader.shouldInterceptRequest(url)
                    }
                    return null
                }
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (!shouldOpenRequestExternally(request, "appassets.androidplatform.net")) return false
                    // Open external links in browser
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    } catch (_: Exception) {}
                    return true
                }
                override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                    // Cover the raw official page while it loads so the user sees our
                    // branded dark boot screen instead of a white flash / unstyled site.
                    if (url?.contains("chat.deepseek.com") == true) {
                        injectBootOverlay(view)
                        // The very first paint releases the system splash — from here
                        // on the user is inside our branded shell, never a white frame.
                        firstPaintReady = true
                    }
                }
                override fun onPageFinished(view: WebView, url: String?) {
                    super.onPageFinished(view, url)
                    Log.d("SuperDeepSeek", "Official WebView loaded: $url")
                    if (url?.contains("chat.deepseek.com") == true) {
                        // Inject token polling (legacy) + the proven engine bundle.
                        injectTokenPolling(view)
                        injectBdsScripts(view)
                    }
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(webView: WebView?, filePathCallback: ValueCallback<Array<Uri>>?, fileChooserParams: FileChooserParams?): Boolean {
                    pendingFileChooser?.onReceiveValue(null)
                    val callback = filePathCallback ?: return true
                    pendingFileChooser = callback
                    return try {
                        val capture = fileChooserParams?.isCaptureEnabled == true
                        val intent = if (capture) {
                            buildCameraCaptureIntent()
                                ?: buildFileChooserIntent(fileChooserParams?.acceptTypes, false)
                        } else {
                            buildFileChooserIntent(
                                fileChooserParams?.acceptTypes,
                                fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE,
                            )
                        }
                        fileChooserLauncher.launch(intent)
                        true
                    } catch (t: Throwable) {
                        Log.e("SuperDeepSeek", "File chooser failed", t)
                        pendingFileChooser = null
                        callback.onReceiveValue(null)
                        true
                    }
                }
            }
            // Dark background so there is no white flash while the page/engine loads.
            setBackgroundColor(Color.parseColor("#1e1f23")) // engine panel dark — matches the official page
        }

        // React SPA WebView - custom UI, hidden initially
        reactWebView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            visibility = View.GONE
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                allowFileAccessFromFileURLs = true
                allowUniversalAccessFromFileURLs = true
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                cacheMode = WebSettings.LOAD_DEFAULT
                // Same UA as the login WebView: DeepSeek sees one consistent
                // fingerprint for both the token and the API calls made with it.
                userAgentString = deriveWebViewUserAgent(WebSettings.getDefaultUserAgent(this@MainActivity))
            }
            addJavascriptInterface(bridge, "AndroidBridge")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    val url = request.url
                    // API traffic must reach the real server, never the asset loader.
                    if (url?.path?.startsWith("/api/") == true) return null
                    return assetLoader.shouldInterceptRequest(url)
                }
                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError,
                ) {
                    super.onReceivedError(view, request, error)
                    if (request.isForMainFrame && request.url?.toString() == SPA_URL && spaRetries < 3) {
                        spaRetries++
                        Log.e("SuperDeepSeek", "SPA load failed (${error.description}); retry $spaRetries/3")
                        view.postDelayed({ view.loadUrl(SPA_URL) }, 400)
                    }
                }
                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)
                    view.evaluateJavascript("""
                        window.isAndroidApp = true;
                        window.isOfficialDeepSeekLoginEnabled = true;
                        console.log('[SuperDeepSeek] React app loaded');
                    """.trimIndent(), null)
                    // If we already have token, inject it
                    bridge.lastToken?.let { token ->
                        injectTokenToReact(token)
                    }
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(webView: WebView?, filePathCallback: ValueCallback<Array<Uri>>?, fileChooserParams: FileChooserParams?): Boolean {
                    pendingFileChooser?.onReceiveValue(null)
                    val callback = filePathCallback ?: return true
                    pendingFileChooser = callback
                    return try {
                        val capture = fileChooserParams?.isCaptureEnabled == true
                        val intent = if (capture) {
                            buildCameraCaptureIntent() ?: fileChooserParams!!.createIntent()
                        } else {
                            buildFileChooserIntent(
                                fileChooserParams?.acceptTypes,
                                fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE,
                            )
                        }
                        fileChooserLauncher.launch(intent)
                        true
                    } catch (e: Exception) {
                        pendingFileChooser = null
                        cameraPhotoUri = null
                        callback.onReceiveValue(null)
                        false
                    }
                }
            }
            setBackgroundColor(Color.parseColor("#1e1f23"))
        }

        cookieManager.setAcceptThirdPartyCookies(officialWebView, true)
        cookieManager.setAcceptThirdPartyCookies(reactWebView, true)

        bridge.officialWebView = officialWebView
        bridge.reactWebView = reactWebView
        // Legacy login-path handles: the hidden-WebView login flow and the
        // dsLoginNative callbacks all run against the official page now.
        bridge.mainWebView = officialWebView
        bridge.hiddenWebView = officialWebView
        // The engine bundle runs INSIDE the official WebView, so every script
        // the bridge posts (native pick results, MCP replies, theme events…)
        // must be evaluated there. Pointing these at the hidden React WebView
        // silently dropped them — the "file picker did not return a result"
        // class of bugs.
        bridge.scriptPoster = { script ->
            officialWebView.post { officialWebView.evaluateJavascript(script, null) }
        }
        bridge.evaluateJs = { script ->
            officialWebView.post { officialWebView.evaluateJavascript(script, null) }
        }
        bridge.evaluateHiddenJs = { script -> officialWebView.post { officialWebView.evaluateJavascript(script, null) } }
        bridge.onPickFiles = { mode, requestId ->
            handler.post {
                try {
                    val intent: Intent = when {
                        mode.startsWith("folder") -> Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        mode.contains("images") -> Intent(Intent.ACTION_GET_CONTENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = "image/*"
                            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                        }
                        else -> buildFileChooserIntent(null, true)
                    }
                    nativePickRequest = requestId to mode
                    nativePickLauncher.launch(intent)
                    bridge.deliverPickStatus(requestId, "launched")
                } catch (t: Throwable) {
                    Log.e("SuperDeepSeek", "Native pick launch failed", t)
                    nativePickRequest = null
                    bridge.deliverPickError(requestId, "picker-launch-failed")
                }
            }
        }
        bridge.onOfficialLogin = { token -> 
            handler.post {
                onOfficialTokenFound(token)
            }
        }
        bridge.onSwitchToOfficial = {
            handler.post {
                showOfficialUI()
            }
        }

        rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            setBackgroundColor(Color.parseColor("#1e1f23"))
            addView(officialWebView)
            addView(reactWebView)
        }

        ViewCompat.setOnApplyWindowInsetsListener(rootLayout) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val bottom = maxOf(systemBars.bottom, ime.bottom)
            view.setPadding(systemBars.left, systemBars.top, systemBars.right, bottom)
            WindowInsetsCompat.CONSUMED
        }

        setContentView(rootLayout)

        // New architecture: the official DeepSeek site IS the chat surface. The
        // better-deepseek engine (assets/bds) is injected on page load to provide
        // multi-turn memory, MCP, tools, memory/skills and the skinned frame —
        // it is proven against the live protocol, unlike a hand-rolled API client.
        // The React SPA is no longer the chat surface, so we never flip to it.
        officialWebView.loadUrl("https://chat.deepseek.com/")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (isReactVisible) {
                    reactWebView.evaluateJavascript("(function(){ var btn=document.querySelector('#bds-close, .bds-sheet-close'); if(btn&&btn.offsetParent!==null){btn.click(); return true;} return false;})()") { result ->
                        if (result != "true" && result != "\"true\"") {
                            if (reactWebView.canGoBack()) reactWebView.goBack()
                            else {
                                // Go back to official login
                                showOfficialUI()
                            }
                        }
                    }
                } else {
                    if (officialWebView.canGoBack()) officialWebView.goBack()
                    else moveTaskToBack(true)
                }
            }
        })
    }

    private fun injectTokenPolling(webView: WebView) {
        // Cancel previous polling
        tokenPollingRunnable?.let { handler.removeCallbacks(it) }
        
        val pollScript = """
            (function(){
              if (window._dsTokenPolling) return;
              window._dsTokenPolling = true;
              console.log('[Official] Starting token polling...');
              let attempts = 0;
              const maxAttempts = 60;
              const poll = () => {
                attempts++;
                try {
                  const raw = localStorage.getItem('userToken');
                  if (raw) {
                    const parsed = JSON.parse(raw);
                    const token = parsed.value || parsed.token || '';
                    if (token && token.length > 20) {
                      console.log('[Official] Token found! Length:', token.length);
                      if (window.AndroidBridge && window.AndroidBridge.onOfficialToken) {
                        window.AndroidBridge.onOfficialToken(token);
                        window._dsTokenPolling = false;
                        return;
                      }
                    }
                  }
                  // Also check for user info
                  const userInfo = localStorage.getItem('user_info') || sessionStorage.getItem('userToken');
                  if (userInfo && attempts % 5 === 0) {
                    console.log('[Official] Checking alternative storage...');
                  }
                } catch(e) {
                  console.log('[Official] Poll error', e);
                }
                if (attempts < maxAttempts) {
                  setTimeout(poll, 1500);
                } else {
                  console.log('[Official] Token polling stopped after max attempts');
                  window._dsTokenPolling = false;
                }
              };
              setTimeout(poll, 2000);
            })();
        """.trimIndent()
        
        webView.evaluateJavascript(pollScript, null)
        
        // Also schedule periodic re-injection in case of navigation
        tokenPollingRunnable = Runnable {
            if (!isReactVisible) {
                webView.evaluateJavascript(pollScript, null)
                handler.postDelayed(tokenPollingRunnable!!, 5000)
            }
        }
        handler.postDelayed(tokenPollingRunnable!!, 5000)
    }

    private fun onOfficialTokenFound(token: String) {
        // The engine (official site) is now the chat surface; we just persist the
        // token for session restore instead of flipping to the removed React SPA.
        Log.d("SuperDeepSeek", "Official token found! Length: ${token.length}")
        bridge.setStorage("ds_official_token", token)
        bridge.lastToken = token
    }

    private fun readAsset(name: String): String? = try {
        assets.open("bds/$name").bufferedReader().use { it.readText() }
    } catch (e: Exception) { null }

    /**
     * Inject the better-deepseek engine into the live official chat page.
     * Order matters: injected.js must be in the page context before content.js runs.
     * content.css is inserted as a <style> (not a link) so it applies immediately.
     */
    private fun injectBdsScripts(webView: WebView) {
        runOnUiThread {
            readAsset("injected.js")?.let { code ->
                webView.evaluateJavascript(code) { Log.d("BDS", "injected.js done") }
            }

            val css = buildString {
                readAsset("content.css")?.let { append(it).append("\n") }
                // Our design frame on top of the engine's UI.
                readAsset("our-skin.css")?.let { append(it) }
            }
            if (css.isNotBlank()) {
                val cssJs = """
                    (function(){
                      var old = document.getElementById('bds-css');
                      if (old) old.remove();
                      var s = document.createElement('style');
                      s.id = 'bds-css';
                      s.textContent = ${org.json.JSONObject.quote(css)};
                      document.head.appendChild(s);
                    })();
                """.trimIndent()
                webView.evaluateJavascript(cssJs) { Log.d("BDS", "content.css done") }
            }

            readAsset("content.js")?.let { code ->
                webView.evaluateJavascript(code) { Log.d("BDS", "content.js done") }
            }

            // Once the engine is in, drop the boot overlay so the real UI shows.
            removeBootOverlay(webView)

            // Hide out-of-scope features (voice) and apply small UI polish.
            injectUiPolish(webView)
        }
    }

    /**
     * Branded boot screen that hides the white flash + unstyled official page.
     *
     * Plays like a phone power-on: the icon pops in first, then the app name
     * builds up LETTER BY LETTER (each glyph with its own entrance — rise,
     * pop, flip, glow — like the Android boot wordmark), then the subtitle.
     */
    private fun injectBootOverlay(webView: WebView) {
        val title = org.json.JSONObject.quote(getString(R.string.bds_boot_title))
        val subtitle = org.json.JSONObject.quote(getString(R.string.bds_boot_subtitle))
        val js = """
            (function(){
              try{
                var BG='#1e1f23';
                document.documentElement.style.background=BG;
                if(document.body)document.body.style.background=BG;
                if(document.getElementById('bds-boot'))return;
                window.__bdsBootAt=Date.now();
                var st=document.createElement('style');
                st.textContent=[
                  '@keyframes bdsIconIn{0%{transform:scale(.35);opacity:0}55%{transform:scale(1.12);opacity:1}100%{transform:scale(1);opacity:1}}',
                  '@keyframes bdsSpin{to{transform:rotate(360deg)}}',
                  '@keyframes bdsLtrRise{0%{opacity:0;transform:translateY(.55em);filter:blur(7px)}60%{opacity:1;filter:blur(0)}100%{opacity:1;transform:translateY(0);filter:blur(0)}}',
                  '@keyframes bdsLtrPop{0%{opacity:0;transform:scale(.2)}62%{opacity:1;transform:scale(1.22)}100%{opacity:1;transform:scale(1)}}',
                  '@keyframes bdsLtrFlip{0%{opacity:0;transform:rotateX(95deg) translateY(.25em)}100%{opacity:1;transform:rotateX(0) translateY(0)}}',
                  '@keyframes bdsLtrGlow{0%{opacity:0;text-shadow:none}45%{opacity:1;text-shadow:0 0 22px rgba(91,123,255,.95),0 0 48px rgba(77,107,254,.5)}100%{opacity:1;text-shadow:0 0 0 rgba(91,123,255,0)}}',
                  '@keyframes bdsFadeUp{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}',
                  '#bds-boot{position:fixed;inset:0;background:'+BG+';z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}',
                  '#bds-boot .bds-boot-icon{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#4d6bfe,#5b7bff);display:flex;align-items:center;justify-content:center;box-shadow:0 12px 44px rgba(77,107,254,.45);animation:bdsIconIn .55s cubic-bezier(.2,.9,.3,1.35) .1s both}',
                  '#bds-boot .bds-boot-word{margin-top:28px;font-family:Georgia,Noto Serif,serif;font-size:clamp(30px,9.5vw,44px);font-weight:800;letter-spacing:.5px;color:#f2f3f7;display:flex;align-items:baseline;white-space:nowrap;perspective:600px}',
                  '#bds-boot .bds-boot-word span{display:inline-block;animation-duration:.55s;animation-fill-mode:both;animation-timing-function:cubic-bezier(.2,.8,.25,1);will-change:transform,opacity,filter}',
                  '#bds-boot .bds-boot-word .sp{width:.34em}',
                  '#bds-boot .bds-boot-sub{margin-top:13px;font-family:system-ui,Roboto,sans-serif;font-size:12.5px;letter-spacing:.4px;color:#8e8ea0;animation:bdsFadeUp .5s ease both}',
                  '#bds-boot .bds-boot-spin{margin-top:30px;width:24px;height:24px;border:3px solid rgba(91,123,255,.18);border-top-color:#5b7bff;border-radius:50%;animation:bdsSpin .8s linear infinite, bdsFadeUp .4s ease .45s both}'
                ].join('');
                (document.head||document.documentElement).appendChild(st);
                var TITLE=$title, SUB=$subtitle;
                var word=document.createElement('div');word.className='bds-boot-word';
                var anims=['bdsLtrRise','bdsLtrPop','bdsLtrFlip','bdsLtrGlow'];
                var li=0,vi=0;
                for(var i=0;i<TITLE.length;i++){
                  var ch=TITLE.charAt(i);
                  if(ch===' '){var sp=document.createElement('span');sp.className='sp';word.appendChild(sp);continue;}
                  var s2=document.createElement('span');s2.textContent=ch;
                  s2.style.animationName=anims[vi%anims.length];
                  s2.style.animationDelay=(0.9+li*0.07)+'s';
                  word.appendChild(s2);li++;vi++;
                }
                var sub=document.createElement('div');sub.className='bds-boot-sub';sub.textContent=SUB;
                sub.style.animationDelay=(0.95+li*0.07)+'s';
                var icon=document.createElement('div');icon.className='bds-boot-icon';
                icon.innerHTML='<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
                var spin=document.createElement('div');spin.className='bds-boot-spin';
                var o=document.createElement('div');o.id='bds-boot';
                o.appendChild(icon);o.appendChild(word);o.appendChild(sub);o.appendChild(spin);
                (document.body||document.documentElement).appendChild(o);
              }catch(e){}
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    /**
     * Polls for the mounted engine, then removes the boot overlay — but never
     * before the boot wordmark has finished playing (min 2.7s), and never
     * later than a ~9s failsafe.
     */
    private fun removeBootOverlay(webView: WebView) {
        val js = """
            (function(){
              var tries=0, MIN=2700;
              function rm(){
                var o=document.getElementById('bds-boot');
                if(!o)return;
                var ready=document.querySelector('[id^="bds-"]:not(#bds-boot)')||document.querySelector('[class*="bds"]');
                var age=Date.now()-(window.__bdsBootAt||0);
                if(ready&&(age>=MIN||tries>60)){
                  o.style.opacity='0';o.style.transition='opacity .3s ease';
                  setTimeout(function(){o.remove();},320);
                }else{tries++;setTimeout(rm,150);}
              }
              rm();
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    /**
     * Hides entries that are dead in this app (excluded features, upstream
     * chrome, clutter) and keeps them hidden as the engine lazily re-renders.
     * The rules live in [UiPolish] so they are unit-testable.
     */
    private fun injectUiPolish(webView: WebView) {
        webView.evaluateJavascript(UiPolish.buildScript(), null)
    }

    private fun showReactUI(token: String) {
        if (isReactVisible) return
        isReactVisible = true
        tokenPollingRunnable?.let { handler.removeCallbacks(it) }
        
        // Inject token to React WebView
        injectTokenToReact(token)
        
        // Switch visibility
        officialWebView.visibility = View.GONE
        reactWebView.visibility = View.VISIBLE
        
        // Also save email if available
        officialWebView.evaluateJavascript("""
            (function(){
              try {
                const raw = localStorage.getItem('userToken');
                if (raw) {
                  const parsed = JSON.parse(raw);
                  return JSON.stringify({email: parsed.email || '', mobile: parsed.mobile || ''});
                }
              } catch(e) {}
              return JSON.stringify({});
            })();
        """.trimIndent()) { result ->
            try {
                val clean = result.trim().removeSurrounding("\"").replace("\\\"", "\"").replace("\\\\", "\\")
                Log.d("SuperDeepSeek", "User info: $clean")
            } catch (_: Exception) {}
        }
    }

    private fun showOfficialUI() {
        isReactVisible = false
        reactWebView.visibility = View.GONE
        officialWebView.visibility = View.VISIBLE
        injectTokenPolling(officialWebView)
    }

    private fun injectTokenToReact(token: String) {
        val escaped = token.replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\"").replace("\n", "\\n")
        val script = """
            (function(){
              try {
                const token = "$escaped";
                console.log('[React] Injecting official token, length:', token.length);
                // Store in our app's expected storage
                localStorage.setItem('ds_token', token);
                // Try to set account via store if available
                if (window.useAppStore && window.useAppStore.getState) {
                  const state = window.useAppStore.getState();
                  if (state.setAccount) {
                    state.setAccount({token: token, email: '', mobile: ''});
                    console.log('[React] setAccount called');
                  }
                }
                // Also dispatch event for app to pick up
                window.dispatchEvent(new CustomEvent('sds:official-token', {detail: {token: token}}));
                // Directly call setAccount if K is available (zustand)
                if (typeof K !== 'undefined' && K.getState) {
                  K.getState().setAccount({token: token, email: '', mobile: ''});
                }
              } catch(e) {
                console.error('[React] Token inject failed', e);
              }
            })();
        """.trimIndent()
        reactWebView.post {
            reactWebView.evaluateJavascript(script, null)
        }
        bridge.evaluateJs?.invoke(script)
    }

    override fun onResume() {
        super.onResume()
        cookieManager.flush()
    }

    override fun onPause() {
        super.onPause()
        cookieManager.flush()
    }

    override fun onDestroy() {
        tokenPollingRunnable?.let { handler.removeCallbacks(it) }
        try {
            officialWebView.removeJavascriptInterface("AndroidBridge")
            officialWebView.destroy()
        } catch (_: Exception) {}
        try {
            reactWebView.removeJavascriptInterface("AndroidBridge")
            reactWebView.destroy()
        } catch (_: Exception) {}
        super.onDestroy()
    }
}
