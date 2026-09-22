package com.betterdeepseek.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import android.widget.FrameLayout
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Super DeepSeek - React standalone + hidden DeepSeek WebView for official login
 * 
 * Architecture:
 * - mainWebView: loads local React SPA from https://appassets.androidplatform.net/android-spa.html
 *   All UI, features, settings are here. It tries to login via native bridge first.
 * - hiddenWebView: invisible, loads https://chat.deepseek.com to obtain WAF cookies and 
 *   CloudFront challenge tokens. This solves "Failed to fetch" because DeepSeek API is behind
 *   AWS WAF that requires browser cookies. The hidden WebView's cookies are shared via
 *   CookieManager and used by OkHttp in WebViewBridge for official API calls.
 * 
 * Login flow:
 * 1. User enters email/password in React SPA
 * 2. React calls window.AndroidBridge.dsLoginNative(payload, callbackId)
 * 3. WebViewBridge uses OkHttp with CookieManager cookies to POST to /api/v0/users/login
 *    with proper headers (Origin, Referer, X-Client-*, User-Agent)
 * 4. If WAF challenge blocks (202), it waits for hiddenWebView to solve it, retries
 * 5. Returns token to React via JS callback, React stores account and proceeds to real chat
 */
class MainActivity : ComponentActivity() {

    private lateinit var mainWebView: WebView
    private lateinit var hiddenWebView: WebView
    private lateinit var rootLayout: FrameLayout
    private lateinit var assetLoader: WebViewAssetLoader
    private lateinit var bridge: WebViewBridge
    private lateinit var cookieManager: CookieManager

    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null
    private val fileChooserLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = pendingFileChooser
            pendingFileChooser = null
            callback?.onReceiveValue(
                if (result.resultCode == Activity.RESULT_OK) {
                    result.data?.let { intent ->
                        val clip = intent.clipData
                        if (clip != null) {
                            Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
                        } else {
                            intent.data?.let { arrayOf(it) }
                        }
                    }
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
        cookieManager.setAcceptThirdPartyCookies(cookieManager, true)

        bridge = WebViewBridge(applicationContext)
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this, "www"))
            .build()

        // Main WebView - React SPA
        mainWebView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
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
                userAgentString = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
            }
            addJavascriptInterface(bridge, "AndroidBridge")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                }
                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)
                    view.evaluateJavascript("""
                        window.isAndroidApp = true;
                        window.isOfficialDeepSeekLoginEnabled = true;
                        console.log('[SuperDeepSeek] React app loaded, native bridge ready, hidden DeepSeek WebView solving WAF...');
                    """.trimIndent(), null)
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView,
                    filePathCallback: ValueCallback<Array<Uri>>,
                    fileChooserParams: FileChooserParams
                ): Boolean {
                    pendingFileChooser?.onReceiveValue(null)
                    pendingFileChooser = filePathCallback
                    try {
                        val intent = fileChooserParams.createIntent()
                        fileChooserLauncher.launch(intent)
                    } catch (e: Exception) {
                        pendingFileChooser = null
                        filePathCallback.onReceiveValue(null)
                        return false
                    }
                    return true
                }
            }
            setBackgroundColor(Color.BLACK)
        }

        // Hidden WebView - loads official DeepSeek to get WAF cookies
        hiddenWebView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(1, 1).apply {
                leftMargin = -10
                topMargin = -10
            }
            visibility = View.INVISIBLE
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                userAgentString = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
            }
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String?) {
                    super.onPageFinished(view, url)
                    Log.d("SuperDeepSeek", "Hidden DeepSeek WebView loaded: $url")
                    view.evaluateJavascript("""
                        console.log('[Hidden] DeepSeek page loaded, cookies: ' + document.cookie.length);
                        window._dsWafReady = true;
                    """.trimIndent(), null)
                    cookieManager.flush()
                }
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val host = request.url.host ?: return false
                    if (host.contains("deepseek.com") || host.contains("hcaptcha.com")) {
                        return false
                    }
                    return true
                }
            }
            webChromeClient = WebChromeClient()
            setBackgroundColor(Color.TRANSPARENT)
        }

        // Link bridge to WebViews
        bridge.mainWebView = mainWebView
        bridge.hiddenWebView = hiddenWebView
        bridge.evaluateJs = { script -> mainWebView.post { mainWebView.evaluateJavascript(script, null) } }
        bridge.evaluateHiddenJs = { script -> hiddenWebView.post { hiddenWebView.evaluateJavascript(script, null) } }

        rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.BLACK)
            addView(mainWebView)
            addView(hiddenWebView)
        }

        ViewCompat.setOnApplyWindowInsetsListener(rootLayout) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val bottom = maxOf(systemBars.bottom, ime.bottom)
            view.setPadding(systemBars.left, systemBars.top, systemBars.right, bottom)
            WindowInsetsCompat.CONSUMED
        }

        setContentView(rootLayout)

        hiddenWebView.loadUrl("https://chat.deepseek.com/")
        
        mainWebView.postDelayed({
            mainWebView.loadUrl("https://appassets.androidplatform.net/android-spa.html")
        }, 500)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (mainWebView.canGoBack()) mainWebView.goBack() else moveTaskToBack(true)
                }
            }
        )
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
        try {
            mainWebView.removeJavascriptInterface("AndroidBridge")
            mainWebView.destroy()
        } catch (_: Exception) {}
        try {
            hiddenWebView.destroy()
        } catch (_: Exception) {}
        super.onDestroy()
    }
}
