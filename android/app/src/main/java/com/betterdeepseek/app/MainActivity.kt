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
import androidx.activity.result.PickVisualMediaRequest
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

/** Which Android picker serves an engine `AndroidBridge.pickFiles(mode)` request. */
internal enum class NativePickKind { CAMERA, PHOTOS, FOLDER, FILES }

/** Most photos the gallery picker hands back in one go. */
internal const val MAX_GALLERY_PICK = 10

/**
 * Maps the engine's pick modes onto pickers. "files+images" is still the
 * generic file picker — the suffix only means picked images are accepted.
 * Unknown modes fall back to the generic file picker.
 */
internal fun nativePickKind(mode: String): NativePickKind = when {
    mode == "camera" -> NativePickKind.CAMERA
    mode == "images" -> NativePickKind.PHOTOS
    mode.startsWith("folder") -> NativePickKind.FOLDER
    else -> NativePickKind.FILES
}

/** Whether picked images should be delivered (as images) for this mode. */
internal fun nativePickAcceptsImages(mode: String): Boolean =
    mode == "camera" || mode.contains("images")

/** ACTION_IMAGE_CAPTURE writing the full-size photo to [output] (a FileProvider URI). */
internal fun buildCameraIntent(output: Uri): Intent =
    Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
        putExtra(MediaStore.EXTRA_OUTPUT, output)
        addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

/**
 * Gallery picker for devices without the system Photo Picker: ACTION_PICK on
 * MediaStore images opens a gallery app, not the Files/Documents browser.
 */
internal fun buildGalleryFallbackIntent(): Intent =
    Intent(Intent.ACTION_PICK).apply {
        setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*")
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
    }

/** Every URI a picker returned (multi-select clipData and/or single data), de-duplicated. */
internal fun parsePickedUris(data: Intent?): List<Uri> {
    val uris = linkedSetOf<Uri>()
    data?.clipData?.let { clip ->
        for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { uris.add(it) }
    }
    data?.data?.let { uris.add(it) }
    return uris.toList()
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
            buildCameraIntent(uri)
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

    /** Where the camera writes the photo for a native "camera" pick (FileProvider URI). */
    private var nativeCameraUri: Uri? = null

    /**
     * The engine (injected into the official DeepSeek page) asks the native
     * side to pick files (`AndroidBridge.pickFiles(mode, requestId)`) and waits
     * for CustomEvents delivered back INTO THE SAME WebView: status "opened"
     * once the picker is up, status "reading" while files are read, then the
     * chunked result. The engine rejects any other status phase as a malformed
     * payload, so these exact phases matter.
     *
     * Files are read off the main thread — a large pick must not freeze the UI.
     */
    private val nativePickLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val request = nativePickRequest
            nativePickRequest = null
            val cameraUri = nativeCameraUri
            nativeCameraUri = null
            if (request == null) return@registerForActivityResult
            val (requestId, mode) = request
            if (result.resultCode != Activity.RESULT_OK) {
                bridge.deliverPickError(requestId, "cancelled")
                return@registerForActivityResult
            }
            val kind = nativePickKind(mode)
            val data = result.data
            val folder = if (kind == NativePickKind.FOLDER) data?.data else null
            // ACTION_IMAGE_CAPTURE returns no data intent: the photo is at EXTRA_OUTPUT.
            val uris = if (kind == NativePickKind.CAMERA) listOfNotNull(cameraUri) else parsePickedUris(data)
            if (folder == null && uris.isEmpty()) {
                bridge.deliverPickError(requestId, "cancelled")
                return@registerForActivityResult
            }
            if (folder != null) {
                runCatching {
                    contentResolver.takePersistableUriPermission(folder, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }
            bridge.deliverPickStatus(requestId, "reading")
            val acceptImages = nativePickAcceptsImages(mode)
            Thread {
                try {
                    if (folder != null) {
                        val read = bridge.readPickedFolderTree(folder, acceptImages)
                        bridge.deliverPickedFiles(requestId, read.files, read.skipped, read.folderName)
                        return@Thread
                    }
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
                } catch (t: Throwable) {
                    Log.e("SuperDeepSeek", "Native pick handling failed", t)
                    bridge.deliverPickError(requestId, "read-failed")
                }
            }.start()
        }

    /**
     * Builds the picker for one engine pick mode (see [nativePickKind]):
     *  - camera → the camera app directly (photo lands in our cache via FileProvider);
     *  - images → the gallery: the system Photo Picker where available, otherwise
     *    ACTION_PICK on MediaStore images (a gallery app, never the Files browser);
     *  - folder → the document-tree picker;
     *  - files  → the generic "any file" document picker.
     */
    private fun buildNativePickIntent(mode: String): Intent = when (nativePickKind(mode)) {
        NativePickKind.CAMERA -> {
            val file = File(cacheDir, "capture-${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
            nativeCameraUri = uri
            buildCameraIntent(uri)
        }
        NativePickKind.PHOTOS -> {
            if (ActivityResultContracts.PickVisualMedia.isPhotoPickerAvailable(this)) {
                ActivityResultContracts.PickMultipleVisualMedia(MAX_GALLERY_PICK).createIntent(
                    this,
                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                )
            } else {
                buildGalleryFallbackIntent()
            }
        }
        NativePickKind.FOLDER -> Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        NativePickKind.FILES -> buildFileChooserIntent(null, true)
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
                    // First paint releases the system splash; from here the NATIVE
                    // boot overlay (Activity view, see showNativeBootOverlay) owns
                    // the screen until the engine UI is ready.
                    if (url?.contains("chat.deepseek.com") == true) {
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
                        // Fallback boot-release if the polish signal never arrives.
                        handler.postDelayed({ markEngineUiReady() }, BOOT_PAGE_FALLBACK_MS)
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
                    nativePickRequest = requestId to mode
                    nativePickLauncher.launch(buildNativePickIntent(mode))
                    // "opened" is the phase the engine expects once a picker is up.
                    bridge.deliverPickStatus(requestId, "opened")
                } catch (t: Throwable) {
                    Log.e("SuperDeepSeek", "Native pick launch failed", t)
                    nativePickRequest = null
                    nativeCameraUri = null
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

        // Native boot overlay: shows immediately after the system splash hands
        // off, plays the phone-power-on animation, and releases only when the
        // engine UI signals readiness (AndroidBridge.onUiPolished → bridge hook).
        bridge.onUiPolishedCallback = { runOnUiThread { markEngineUiReady() } }
        showNativeBootOverlay()

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

            // Hide out-of-scope features (voice) and apply small UI polish.
            // The polish pass also signals AndroidBridge.onUiPolished() — that
            // signal releases the NATIVE boot overlay (see showNativeBootOverlay).
            injectUiPolish(webView)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NATIVE boot sequence (phone power-on style). A real View overlay owned by
    // the Activity — it does not depend on WebView timing, so it ALWAYS plays:
    //
    //   [system splash: same launcher icon]  (process start → first paint)
    //   ① icon holds, then pops              (~0.9s in)
    //   ② wordmark builds letter-by-letter   (rise / pop / flip / glow variants)
    //   ③ subtitle fades up
    //   ④ overlay releases ONLY when the engine UI is actually ready
    //     (AndroidBridge.onUiPolished, with onPageFinished + failsafe fallbacks)
    //     — the reveal therefore never flashes the raw official interface.
    // ─────────────────────────────────────────────────────────────────────────

    private var bootOverlay: android.view.ViewGroup? = null
    private var bootMinElapsed = false
    private var bootDismissed = false
    private val engineUiReady = java.util.concurrent.atomic.AtomicBoolean(false)

    private companion object {
        /** Icon phase: how long the icon owns the screen before the wordmark starts. */
        const val BOOT_ICON_HOLD_MS = 900L
        /** First letter begins right as the icon starts morphing away. */
        const val BOOT_LETTER_START_MS = 950L
        const val BOOT_LETTER_STAGGER_MS = 55L
        const val BOOT_LETTER_DUR_MS = 390L
        /** Absolute failsafe — the user is never trapped on the boot screen. */
        const val BOOT_FORCE_DISMISS_MS = 9000L
        /** Fallback ready signal after the page reports it finished loading. */
        const val BOOT_PAGE_FALLBACK_MS = 1600L
    }

    /** Builds and shows the boot overlay, then plays the phased animation. */
    private fun showNativeBootOverlay() {
        if (bootOverlay != null) return
        val d = resources.displayMetrics.density
        fun dp(v: Int) = (v * d).toInt()

        val overlay = android.widget.FrameLayout(this).apply {
            setBackgroundColor(0xFF1E1F23.toInt()) // engine panel dark — seamless with the system splash
            isClickable = true
            isFocusable = true
        }

        // Soft radial accent glow behind the wordmark
        val glow = android.view.View(this).apply {
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                gradientType = android.graphics.drawable.GradientDrawable.RADIAL_GRADIENT
                colors = intArrayOf(0x594D6BFE, 0x004D6BFE)
                setGradientRadius(dp(150).toFloat())
            }
            alpha = 0f
        }
        overlay.addView(
            glow,
            android.widget.FrameLayout.LayoutParams(dp(300), dp(300), android.view.Gravity.CENTER),
        )

        val column = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
        }
        overlay.addView(
            column,
            android.widget.FrameLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        // ① Icon — the SAME launcher icon the system splash shows, so the
        //    splash → overlay hand-off is one continuous icon.
        val icon = android.widget.ImageView(this).apply {
            setImageResource(R.mipmap.ic_launcher)
            alpha = 0f
            scaleX = 1.18f
            scaleY = 1.18f
        }
        column.addView(
            icon,
            android.widget.LinearLayout.LayoutParams(dp(96), dp(96)).apply {
                gravity = android.view.Gravity.CENTER_HORIZONTAL
            },
        )

        // ② Wordmark — one glyph per TextView, one row per word. Four entrance
        //    variants cycle across the letters, like an Android boot wordmark.
        val words = getString(R.string.bds_boot_title).split(" ")
        val serif = android.graphics.Typeface.create("serif", android.graphics.Typeface.BOLD)
        val letters = mutableListOf<android.widget.TextView>()
        words.forEachIndexed { wi, word ->
            val row = android.widget.LinearLayout(this).apply {
                orientation = android.widget.LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
            }
            word.forEach { ch ->
                val t = android.widget.TextView(this).apply {
                    text = ch.toString()
                    textSize = 40f
                    setTypeface(serif, android.graphics.Typeface.BOLD)
                    setTextColor(0xFFECECEC.toInt())
                    letterSpacing = 0.02f
                    includeFontPadding = false
                    alpha = 0f
                    when (letters.size % 4) {
                        0 -> translationY = dp(46).toFloat() // rise
                        1 -> { scaleX = 0.2f; scaleY = 0.2f } // pop
                        2 -> rotationY = 90f // flip
                        // 3: glow — starts in place, shadow animates in
                    }
                }
                row.addView(t)
                letters.add(t)
            }
            column.addView(
                row,
                android.widget.LinearLayout.LayoutParams(
                    android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
                    android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { gravity = android.view.Gravity.CENTER_HORIZONTAL; topMargin = if (wi == 0) dp(30) else dp(4) },
            )
        }

        // ③ Subtitle
        val subtitle = android.widget.TextView(this).apply {
            text = getString(R.string.bds_boot_subtitle)
            textSize = 14f
            setTextColor(0xFF8E8EA0.toInt())
            alpha = 0f
            translationY = dp(12).toFloat()
        }
        column.addView(
            subtitle,
            android.widget.LinearLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { gravity = android.view.Gravity.CENTER_HORIZONTAL; topMargin = dp(18) },
        )

        bootOverlay = overlay
        (findViewById<ViewGroup>(android.R.id.content)).addView(
            overlay,
            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
        )

        // ── Timeline ──
        handler.postDelayed({
            icon.animate().scaleX(1f).scaleY(1f).alpha(1f)
                .setDuration(380L)
                .setInterpolator(android.view.animation.OvershootInterpolator(1.4f))
                .start()
        }, 60L)

        handler.postDelayed({
            glow.animate().alpha(1f).setDuration(500L).start()
            icon.animate().scaleX(0.5f).scaleY(0.5f).alpha(0f).translationY(-dp(90).toFloat())
                .setDuration(430L)
                .setInterpolator(android.view.animation.AccelerateInterpolator())
                .start()
        }, BOOT_ICON_HOLD_MS)

        letters.forEachIndexed { i, t ->
            val variant = i % 4
            handler.postDelayed({
                t.animate().alpha(1f).translationY(0f).scaleX(1f).scaleY(1f).rotationY(0f)
                    .setDuration(BOOT_LETTER_DUR_MS)
                    .setInterpolator(
                        android.view.animation.OvershootInterpolator(if (variant == 1) 2.2f else 1.1f),
                    )
                    .start()
                if (variant == 3) {
                    android.animation.ValueAnimator.ofFloat(0f, 26f, 8f).apply {
                        duration = 700L
                        addUpdateListener { a ->
                            t.setShadowLayer(a.animatedValue as Float, 0f, 0f, 0x995B7BFF.toInt())
                        }
                        start()
                    }
                }
            }, BOOT_LETTER_START_MS + i * BOOT_LETTER_STAGGER_MS)
        }

        val subtitleAt = BOOT_LETTER_START_MS + letters.size * BOOT_LETTER_STAGGER_MS + 160L
        handler.postDelayed({
            subtitle.animate().alpha(1f).translationY(0f).setDuration(360L)
                .setInterpolator(android.view.animation.DecelerateInterpolator())
                .start()
        }, subtitleAt)

        // Gentle glow breathing while we may still be waiting for the engine.
        android.animation.ValueAnimator.ofFloat(0.55f, 1f).apply {
            duration = 1500L
            repeatCount = android.animation.ValueAnimator.INFINITE
            repeatMode = android.animation.ValueAnimator.REVERSE
            addUpdateListener { glow.alpha = it.animatedValue as Float }
            start()
        }

        val minTotal = subtitleAt + 700L
        handler.postDelayed({
            bootMinElapsed = true
            tryDismissBoot()
        }, minTotal)
        handler.postDelayed({ forceDismissBoot() }, BOOT_FORCE_DISMISS_MS)
        Log.d("SuperDeepSeek", "Native boot overlay shown (${letters.size} letters)")
    }

    /** Engine UI is confirmed ready (polish pass ran). */
    private fun markEngineUiReady() {
        if (engineUiReady.compareAndSet(false, true)) {
            Log.d("SuperDeepSeek", "Engine UI ready — releasing boot overlay shortly")
            handler.postDelayed({ tryDismissBoot() }, 650L) // let hydration settle
        }
    }

    private fun tryDismissBoot() {
        if (bootMinElapsed && engineUiReady.get() && !bootDismissed) dismissBoot()
    }

    private fun forceDismissBoot() {
        if (!bootDismissed) {
            Log.w("SuperDeepSeek", "Boot failsafe fired — forcing overlay dismiss")
            dismissBoot()
        }
    }

    private fun dismissBoot() {
        bootDismissed = true
        val o = bootOverlay ?: return
        o.animate().alpha(0f).setDuration(340L)
            .setInterpolator(android.view.animation.DecelerateInterpolator())
            .withEndAction {
                (o.parent as? android.view.ViewGroup)?.removeView(o)
                bootOverlay = null
            }
            .start()
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
