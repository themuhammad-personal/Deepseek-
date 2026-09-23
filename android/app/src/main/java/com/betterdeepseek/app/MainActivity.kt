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
        splashScreen.setKeepOnScreenCondition { false }

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
            setBackgroundColor(Color.parseColor("#14161a"))
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
            setBackgroundColor(Color.BLACK)
        }

        cookieManager.setAcceptThirdPartyCookies(officialWebView, true)
        cookieManager.setAcceptThirdPartyCookies(reactWebView, true)

        bridge.officialWebView = officialWebView
        bridge.reactWebView = reactWebView
        bridge.mainWebView = reactWebView
        bridge.hiddenWebView = officialWebView
        bridge.evaluateJs = { script -> reactWebView.post { reactWebView.evaluateJavascript(script, null) } }
        bridge.evaluateHiddenJs = { script -> officialWebView.post { officialWebView.evaluateJavascript(script, null) } }
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
            setBackgroundColor(Color.BLACK)
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
        }
    }

    /** Branded dark splash that hides the white flash + unstyled official page. */
    private fun injectBootOverlay(webView: WebView) {
        val js = """
            (function(){
              try{
                document.documentElement.style.background='#14161a';
                if(document.body)document.body.style.background='#14161a';
                if(document.getElementById('bds-boot'))return;
                var st=document.createElement('style');
                st.textContent='@keyframes bdsboot{to{transform:rotate(360deg)}}';
                (document.head||document.documentElement).appendChild(st);
                var o=document.createElement('div');o.id='bds-boot';
                o.style.cssText='position:fixed;inset:0;background:#14161a;z-index:2147483647;display:flex;align-items:center;justify-content:center;';
                o.innerHTML='<div style="width:46px;height:46px;border:3px solid rgba(77,107,254,.25);border-top-color:#4d6bfe;border-radius:50%;animation:bdsboot .9s linear infinite"></div>';
                (document.body||document.documentElement).appendChild(o);
              }catch(e){}
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    /** Polls for the mounted engine then removes the boot overlay (force after ~3s). */
    private fun removeBootOverlay(webView: WebView) {
        val js = """
            (function(){
              var tries=0;
              function rm(){
                var o=document.getElementById('bds-boot');
                var ready=document.querySelector('[id^="bds-"]:not(#bds-boot)')||document.querySelector('[class*="bds"]');
                if(o&&(ready||tries>20)){o.style.opacity='0';o.style.transition='opacity .25s';setTimeout(function(){o.remove();},260);}
                else{tries++;setTimeout(rm,150);}
              }
              rm();
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
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
