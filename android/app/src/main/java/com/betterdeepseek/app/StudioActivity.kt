package com.betterdeepseek.app

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.PopupMenu
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File
import java.io.OutputStream
import org.json.JSONObject

/**
 * Linux Studio: the user's window into the sandbox.
 *
 *  - Terminal  a shell in the sandbox; the agent's commands and their output
 *              are mirrored here live, so the user can watch it work.
 *  - Files     browse /root/workspace, open, save to the phone, import, delete.
 *  - Preview   web apps served from the sandbox (http://127.0.0.1:<port>).
 *
 * Built in code (no layouts), following the chat's light/dark theme.
 */
class StudioActivity : ComponentActivity(), Sandbox.Listener {

    companion object {
        const val EXTRA_PREVIEW_URL = "preview_url"
        private const val MAX_TERMINAL_CHARS = 200_000

        fun start(context: Context, previewUrl: String? = null) {
            val i = Intent(context, StudioActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            if (previewUrl != null) i.putExtra(EXTRA_PREVIEW_URL, previewUrl)
            if (context !is android.app.Activity) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }

        /** True while a Studio window is visible (the preview tool reports it). */
        @Volatile var visible = false
            private set
    }

    private val sandbox by lazy { Sandbox.get(this) }
    private val main = Handler(Looper.getMainLooper())
    private val prefs by lazy { getSharedPreferences(WebViewBridge.PREFS_NAME, MODE_PRIVATE) }

    // Theme
    private var dark = true
    private var cBg = 0; private var cSurface = 0; private var cText = 0; private var cMuted = 0
    private var cAccent = 0; private var cLine = 0; private var cAgent = 0; private var cError = 0

    private lateinit var subtitle: TextView
    private lateinit var tabs: List<TextView>
    private lateinit var pages: List<View>
    private var currentTab = 0

    // Terminal
    private lateinit var termScroll: ScrollView
    private lateinit var termText: TextView
    private lateinit var termInput: EditText
    private val termBuffer = SpannableStringBuilder()
    private var shell: Process? = null
    private val history = ArrayList<String>()
    private var historyIndex = 0

    // Files
    private lateinit var filesPath: TextView
    private lateinit var filesList: ListView
    private lateinit var filesEmpty: TextView
    private var cwd = Sandbox.WORKSPACE
    private var entries: List<File> = emptyList()

    // Preview
    private lateinit var previewUrl: EditText
    private lateinit var previewWeb: WebView

    private val importLauncher = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (!uris.isNullOrEmpty()) importFiles(uris)
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        resolveColors()
        WindowCompat.setDecorFitsSystemWindows(window, false)
        @Suppress("DEPRECATION")
        run {
            window.statusBarColor = cBg
            window.navigationBarColor = cBg
        }
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
        setContentView(buildUi())
        sandbox.addListener(this)
        refreshStatus()
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        visible = true
        if (currentTab == 1) loadDir(cwd)
    }

    override fun onPause() {
        visible = false
        super.onPause()
    }

    override fun onDestroy() {
        sandbox.removeListener(this)
        shell?.let { p -> Thread { runCatching { p.destroy() } }.start() }
        shell = null
        runCatching { previewWeb.destroy() }
        super.onDestroy()
    }

    private fun handleIntent(intent: Intent?) {
        val url = intent?.getStringExtra(EXTRA_PREVIEW_URL) ?: return
        intent.removeExtra(EXTRA_PREVIEW_URL)
        selectTab(2)
        openPreview(url)
    }

    // ── Theme ────────────────────────────────────────────────────────────────

    private fun resolveColors() {
        val stored = prefs.getString(WebViewBridge.KEY_LAST_PAGE_DARK, null)
        dark = stored?.let { it == "true" }
                ?: ((resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES)
        if (dark) {
            cBg = 0xFF1E1F23.toInt(); cSurface = 0xFF2A2B31.toInt(); cText = 0xFFECECF1.toInt()
            cMuted = 0xFF9A9BA6.toInt(); cLine = 0x1FFFFFFF; cAgent = 0xFF8AB4FF.toInt(); cError = 0xFFFF8A80.toInt()
        } else {
            cBg = 0xFFFFFFFF.toInt(); cSurface = 0xFFF3F4F6.toInt(); cText = 0xFF1F1F23.toInt()
            cMuted = 0xFF6B6C75.toInt(); cLine = 0x1F000000; cAgent = 0xFF3957E0.toInt(); cError = 0xFFD93025.toInt()
        }
        cAccent = 0xFF4D6BFE.toInt()
    }

    private fun dp(v: Float): Int = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()
    private fun dp(v: Int): Int = dp(v.toFloat())

    private fun rounded(color: Int, radius: Float, stroke: Int = 0): GradientDrawable = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radius).toFloat()
        if (stroke != 0) setStroke(dp(1), stroke)
    }

    private fun iconButton(icon: Int, desc: String, onClick: (View) -> Unit): ImageButton = ImageButton(this).apply {
        setImageResource(icon)
        imageTintList = ColorStateList.valueOf(cText)
        contentDescription = desc
        background = rounded(Color.TRANSPARENT, 20f)
        val v = TypedValue()
        if (theme.resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, v, true)) setBackgroundResource(v.resourceId)
        setPadding(dp(10), dp(10), dp(10), dp(10))
        layoutParams = LinearLayout.LayoutParams(dp(44), dp(44))
        setOnClickListener(onClick)
    }

    private fun label(text: String, size: Float, color: Int, bold: Boolean = false): TextView = TextView(this).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
        setTextColor(color)
        if (bold) typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    private fun bn(): Boolean = resources.configuration.locales[0].language == "bn"
    private fun t(en: String, bnText: String) = if (bn()) bnText else en

    // ── Layout ───────────────────────────────────────────────────────────────

    private fun buildUi(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(cBg)
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        // Top bar
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), dp(4), dp(4), dp(4))
        }
        bar.addView(iconButton(R.drawable.ic_studio_back, t("Back", "ফিরে যান")) { finish() })
        val titles = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(4) }
        }
        titles.addView(label("Linux Studio", 17f, cText, bold = true))
        subtitle = label("", 12f, cMuted)
        titles.addView(subtitle)
        bar.addView(titles)
        bar.addView(iconButton(R.drawable.ic_studio_stop, t("Stop everything", "সব থামান")) { stopAll() })
        bar.addView(iconButton(R.drawable.ic_studio_more, t("More", "আরও")) { showMenu(it) })
        root.addView(bar)

        // Tabs
        val tabRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            background = rounded(cSurface, 12f)
            setPadding(dp(3), dp(3), dp(3), dp(3))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                setMargins(dp(12), dp(2), dp(12), dp(8))
            }
        }
        tabs = listOf(t("Terminal", "টার্মিনাল"), t("Files", "ফাইল"), t("Preview", "প্রিভিউ")).mapIndexed { i, name ->
            label(name, 14f, cMuted, bold = true).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(8), 0, dp(8))
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                setOnClickListener { selectTab(i) }
            }.also { tabRow.addView(it) }
        }
        root.addView(tabRow)

        val content = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        pages = listOf(buildTerminal(), buildFiles(), buildPreview())
        pages.forEach { content.addView(it, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)) }
        root.addView(content)
        selectTab(0)
        return root
    }

    private fun selectTab(i: Int) {
        currentTab = i
        tabs.forEachIndexed { k, tv ->
            tv.setTextColor(if (k == i) cText else cMuted)
            tv.background = if (k == i) rounded(cBg, 10f) else null
        }
        pages.forEachIndexed { k, v -> v.visibility = if (k == i) View.VISIBLE else View.GONE }
        if (i == 1) loadDir(cwd)
    }

    private fun showMenu(anchor: View) {
        val menu = PopupMenu(this, anchor)
        val enabled = prefs.getString(WebViewBridge.KEY_SANDBOX_ENABLED, "1") != "0"
        val ask = prefs.getString(WebViewBridge.KEY_SANDBOX_MODE, "auto") == "ask"
        menu.menu.add(0, 1, 0, t("Sandbox for the AI", "AI-এর জন্য স্যান্ডবক্স")).apply { isCheckable = true; isChecked = enabled }
        menu.menu.add(0, 2, 1, t("Ask before each command", "প্রতিটি কমান্ডের আগে জিজ্ঞেস করুন")).apply { isCheckable = true; isChecked = ask }
        menu.menu.add(0, 3, 2, t("Reset Linux (deletes all files)…", "লিনাক্স রিসেট (সব ফাইল মুছে যাবে)…"))
        menu.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                1 -> prefs.edit().putString(WebViewBridge.KEY_SANDBOX_ENABLED, if (enabled) "0" else "1").apply()
                2 -> prefs.edit().putString(WebViewBridge.KEY_SANDBOX_MODE, if (ask) "auto" else "ask").apply()
                3 -> confirmReset()
            }
            refreshStatus()
            true
        }
        menu.show()
    }

    private fun confirmReset() {
        AlertDialog.Builder(this)
                .setTitle(t("Reset Linux?", "লিনাক্স রিসেট করবেন?"))
                .setMessage(t("This deletes the Linux system, installed packages and everything in the workspace. It is downloaded again on next use.",
                        "এতে লিনাক্স সিস্টেম, ইনস্টল করা প্যাকেজ এবং ওয়ার্কস্পেসের সব ফাইল মুছে যাবে। পরের বার ব্যবহারের সময় আবার ডাউনলোড হবে।"))
                .setNegativeButton(android.R.string.cancel, null)
                .setPositiveButton(t("Reset", "রিসেট")) { _, _ ->
                    shell?.destroy(); shell = null
                    Thread {
                        sandbox.reset()
                        main.post {
                            termBuffer.clear(); termText.text = ""
                            refreshStatus(); loadDir(Sandbox.WORKSPACE)
                        }
                    }.start()
                }
                .show()
    }

    private fun stopAll() {
        Thread { sandbox.killAll() }.start()
        SandboxService.onStopRequested?.invoke()
        restartShellSoon()
        toast(t("Stopped all sandbox processes", "স্যান্ডবক্সের সব প্রসেস থামানো হয়েছে"))
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()

    private fun refreshStatus() {
        val s = runCatching { sandbox.status() }.getOrNull() ?: return
        val enabled = prefs.getString(WebViewBridge.KEY_SANDBOX_ENABLED, "1") != "0"
        subtitle.text = when {
            !s.optBoolean("supported") -> s.optString("reason")
            s.optBoolean("installing") -> t("Setting up Linux… ", "লিনাক্স প্রস্তুত হচ্ছে… ") + "${(s.optDouble("progress") * 100).toInt()}%"
            !s.optBoolean("installed") -> t("Not set up yet — run a command to start", "এখনও প্রস্তুত নয় — শুরু করতে একটি কমান্ড চালান")
            else -> "Alpine ${s.optString("version")} · ${s.optString("abi")}" +
                    (if (s.optInt("active") > 0) " · " + t("${s.optInt("active")} running", "${s.optInt("active")}টি চলছে") else "") +
                    (if (!enabled) " · " + t("AI access off", "AI অ্যাক্সেস বন্ধ") else "")
        }
    }

    // ── Sandbox events ───────────────────────────────────────────────────────

    override fun onSandboxEvent(event: JSONObject) {
        main.post {
            if (isDestroyed) return@post
            when (event.optString("type")) {
                "install" -> refreshStatus()
                "exec" -> when (event.optString("phase")) {
                    "start" -> appendTerm("\n● AI  ${event.optString("cwd")} $ ${event.optString("command")}\n", cAgent)
                    "output" -> appendTerm(Sandbox.stripAnsi(event.optString("text")), cMuted)
                    "end" -> {
                        val code = event.optInt("exitCode")
                        appendTerm(if (event.optBoolean("timedOut")) "[timed out]\n" else "[exit $code]\n", if (code == 0) cAgent else cError)
                        if (currentTab == 1) loadDir(cwd)
                    }
                }
            }
        }
    }

    override fun onActiveCountChanged(active: Int) {
        main.post { if (!isDestroyed) refreshStatus() }
    }

    // ── Terminal ─────────────────────────────────────────────────────────────

    @SuppressLint("SetTextI18n")
    private fun buildTerminal(): View {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        termText = TextView(this).apply {
            typeface = Typeface.MONOSPACE
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
            setTextColor(cText)
            setTextIsSelectable(true)
            setPadding(dp(14), dp(10), dp(14), dp(10))
            setLineSpacing(0f, 1.12f)
        }
        termScroll = ScrollView(this).apply {
            isFillViewport = true
            addView(termText)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        box.addView(termScroll)
        appendTerm(t("Linux sandbox terminal. The AI's commands appear here too.\nType a command below (e.g. ls, python3, apk add nodejs).\n",
                "লিনাক্স স্যান্ডবক্স টার্মিনাল। AI-এর কমান্ডও এখানে দেখা যাবে।\nনিচে কমান্ড লিখুন (যেমন ls, python3, apk add nodejs)।\n"), cMuted)

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = rounded(cSurface, 14f)
            setPadding(dp(12), dp(2), dp(2), dp(2))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                setMargins(dp(10), dp(6), dp(10), dp(10))
            }
        }
        row.addView(label("$", 15f, cAccent, bold = true))
        termInput = EditText(this).apply {
            typeface = Typeface.MONOSPACE
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setTextColor(cText)
            setHintTextColor(cMuted)
            hint = t("command", "কমান্ড")
            background = null
            isSingleLine = true
            imeOptions = EditorInfo.IME_ACTION_SEND
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS or
                    android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(8) }
            setOnEditorActionListener { _, action, ev ->
                if (action == EditorInfo.IME_ACTION_SEND || (ev?.keyCode == KeyEvent.KEYCODE_ENTER && ev.action == KeyEvent.ACTION_DOWN)) {
                    submitCommand(); true
                } else false
            }
            setOnKeyListener { _, code, ev ->
                if (ev.action != KeyEvent.ACTION_DOWN) return@setOnKeyListener false
                when (code) {
                    KeyEvent.KEYCODE_DPAD_UP -> { recall(-1); true }
                    KeyEvent.KEYCODE_DPAD_DOWN -> { recall(1); true }
                    else -> false
                }
            }
        }
        row.addView(termInput)
        row.addView(label("↑", 18f, cMuted).apply {
            setPadding(dp(10), dp(8), dp(10), dp(8))
            contentDescription = t("Previous command", "আগের কমান্ড")
            setOnClickListener { recall(-1) }
        })
        row.addView(label("^C", 14f, cMuted, bold = true).apply {
            setPadding(dp(8), dp(8), dp(8), dp(8))
            contentDescription = t("Interrupt (restart the shell)", "থামান (শেল রিস্টার্ট)")
            setOnClickListener { interruptShell() }
        })
        row.addView(iconButton(R.drawable.ic_studio_send, t("Run", "চালান")) { submitCommand() }.apply {
            imageTintList = ColorStateList.valueOf(cAccent)
        })
        box.addView(row)
        return box
    }

    private fun recall(dir: Int) {
        if (history.isEmpty()) return
        historyIndex = (historyIndex + dir).coerceIn(0, history.size)
        val v = if (historyIndex >= history.size) "" else history[historyIndex]
        termInput.setText(v)
        termInput.setSelection(v.length)
    }

    private fun appendTerm(text: String, color: Int) {
        if (text.isEmpty()) return
        val start = termBuffer.length
        termBuffer.append(text)
        if (color != cText) termBuffer.setSpan(ForegroundColorSpan(color), start, termBuffer.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        if (termBuffer.length > MAX_TERMINAL_CHARS) termBuffer.delete(0, termBuffer.length - MAX_TERMINAL_CHARS * 3 / 4)
        val atBottom = !termScroll.canScrollVertically(1)
        termText.text = termBuffer
        if (atBottom || color == cAgent) termScroll.post { termScroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun submitCommand() {
        val cmd = termInput.text.toString()
        termInput.setText("")
        if (cmd.isNotBlank() && history.lastOrNull() != cmd) history.add(cmd)
        historyIndex = history.size
        when (cmd.trim()) {
            "clear" -> { termBuffer.clear(); termText.text = ""; return }
            "exit" -> { interruptShell(); return }
        }
        appendTerm("$ $cmd\n", cText)
        ensureShell { p ->
            runCatching {
                p.outputStream.write((cmd + "\n").toByteArray())
                p.outputStream.flush()
            }.onFailure {
                main.post { appendTerm("[shell closed — restarting]\n", cError) }
                shell = null
            }
        }
    }

    private fun ensureShell(then: (Process) -> Unit) {
        shell?.takeIf { it.isAliveCompat() }?.let { p -> Thread { then(p) }.start(); return }
        if (!sandbox.isSupported()) {
            appendTerm(sandbox.unsupportedReason() + "\n", cError)
            return
        }
        if (!sandbox.isInstalled()) appendTerm(t("Setting up Linux (one-time download, about 4 MB)…\n", "লিনাক্স প্রস্তুত হচ্ছে (একবারের ডাউনলোড, প্রায় ৪ MB)…\n"), cMuted)
        Thread {
            try {
                val p = sandbox.startShell()
                shell = p
                Thread({
                    val buf = ByteArray(8192)
                    try {
                        p.inputStream.use { input ->
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                val s = Sandbox.stripAnsi(String(buf, 0, n, Charsets.UTF_8))
                                main.post { if (!isDestroyed) appendTerm(s, cText) }
                            }
                        }
                    } catch (_: Exception) {}
                    if (shell === p) shell = null
                }, "studio-shell").start()
                main.post { refreshStatus() }
                then(p)
            } catch (e: Exception) {
                main.post { appendTerm((e.message ?: "Could not start the shell") + "\n", cError); refreshStatus() }
            }
        }.start()
    }

    private fun Process.isAliveCompat(): Boolean = runCatching { exitValue(); false }.getOrDefault(true)

    private fun interruptShell() {
        val p = shell
        shell = null
        if (p != null) {
            Thread { runCatching { p.destroy() } }.start()
            appendTerm("^C\n", cMuted)
        }
    }

    private fun restartShellSoon() {
        if (shell != null) interruptShell()
    }

    // ── Files ────────────────────────────────────────────────────────────────

    private fun buildFiles(): View {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(6), 0, dp(6), 0)
        }
        bar.addView(iconButton(R.drawable.ic_studio_up, t("Up", "উপরে")) {
            if (cwd != "/") loadDir(cwd.substringBeforeLast('/').ifEmpty { "/" })
        })
        filesPath = label(cwd, 13f, cMuted).apply {
            typeface = Typeface.MONOSPACE
            isSingleLine = true
            ellipsize = android.text.TextUtils.TruncateAt.START
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        bar.addView(filesPath)
        bar.addView(iconButton(R.drawable.ic_studio_upload, t("Import files from the phone", "ফোন থেকে ফাইল আনুন")) {
            runCatching { importLauncher.launch(arrayOf("*/*")) }
        })
        bar.addView(iconButton(R.drawable.ic_studio_refresh, t("Refresh", "রিফ্রেশ")) { loadDir(cwd) })
        box.addView(bar)

        val frame = FrameLayout(this).apply { layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f) }
        filesList = ListView(this).apply {
            divider = null
            adapter = filesAdapter
            setOnItemClickListener { _, _, pos, _ -> openEntry(entries[pos]) }
            setOnItemLongClickListener { _, _, pos, _ -> entryMenu(entries[pos]); true }
        }
        filesEmpty = label("", 14f, cMuted).apply {
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }
        frame.addView(filesList)
        frame.addView(filesEmpty, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        box.addView(frame)
        return box
    }

    private val filesAdapter = object : BaseAdapter() {
        override fun getCount() = entries.size
        override fun getItem(position: Int) = entries[position]
        override fun getItemId(position: Int) = position.toLong()
        override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
            val f = entries[position]
            val row = (convertView as? LinearLayout) ?: LinearLayout(this@StudioActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(16), dp(11), dp(16), dp(11))
                addView(label("", 18f, cText).apply { layoutParams = LinearLayout.LayoutParams(dp(34), ViewGroup.LayoutParams.WRAP_CONTENT) })
                addView(label("", 14.5f, cText).apply {
                    isSingleLine = true
                    ellipsize = android.text.TextUtils.TruncateAt.MIDDLE
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                })
                addView(label("", 12f, cMuted))
            }
            val link = runCatching { java.nio.file.Files.isSymbolicLink(f.toPath()) }.getOrDefault(false)
            (row.getChildAt(0) as TextView).text = when { link -> "↪"; f.isDirectory -> "📁"; else -> "📄" }
            (row.getChildAt(1) as TextView).text = f.name
            (row.getChildAt(2) as TextView).text = if (f.isDirectory) "" else humanSize(f.length())
            return row
        }
    }

    private fun humanSize(n: Long): String = when {
        n < 1024 -> "$n B"
        n < 1024 * 1024 -> "${n / 1024} KB"
        else -> "%.1f MB".format(java.util.Locale.US, n / (1024.0 * 1024.0))
    }

    private fun loadDir(path: String) {
        if (!::filesList.isInitialized) return
        if (!sandbox.isInstalled()) {
            entries = emptyList()
            filesAdapter.notifyDataSetChanged()
            filesEmpty.text = t("Linux is not set up yet. Run a command in the Terminal (or let the AI use it) to set it up.",
                    "লিনাক্স এখনও প্রস্তুত নয়। প্রস্তুত করতে টার্মিনালে একটি কমান্ড চালান (বা AI-কে ব্যবহার করতে দিন)।")
            filesEmpty.visibility = View.VISIBLE
            return
        }
        val dir = sandbox.hostFile(path)
        if (dir == null || !dir.isDirectory) {
            toast(t("Can't open $path", "$path খোলা যাচ্ছে না"))
            if (path != Sandbox.WORKSPACE) loadDir(Sandbox.WORKSPACE)
            return
        }
        cwd = path
        filesPath.text = path
        entries = (dir.listFiles()?.toList() ?: emptyList())
                .sortedWith(compareBy<File>({ !it.isDirectory }, { it.name.lowercase() }))
        filesAdapter.notifyDataSetChanged()
        filesEmpty.text = t("Empty folder", "ফাঁকা ফোল্ডার")
        filesEmpty.visibility = if (entries.isEmpty()) View.VISIBLE else View.GONE
    }

    private fun openEntry(f: File) {
        val guest = (if (cwd == "/") "" else cwd) + "/" + f.name
        if (f.isDirectory) { loadDir(guest); return }
        val bytes = runCatching { f.inputStream().use { s -> val b = ByteArray(minOf(f.length(), 256 * 1024L).toInt()); var r = 0; while (r < b.size) { val n = s.read(b, r, b.size - r); if (n < 0) break; r += n }; b.copyOf(r) } }.getOrNull()
        val body: View = if (bytes == null || bytes.take(4096).any { it.toInt() == 0 }) {
            label(t("Binary file · ${humanSize(f.length())}", "বাইনারি ফাইল · ${humanSize(f.length())}"), 14f, cMuted).apply { setPadding(dp(20), dp(16), dp(20), dp(8)) }
        } else {
            val text = String(bytes, Charsets.UTF_8) + if (f.length() > bytes.size) "\n\n[… ${t("truncated", "কাটা হয়েছে")} …]" else ""
            ScrollView(this).apply {
                addView(TextView(this@StudioActivity).apply {
                    this.text = text
                    typeface = Typeface.MONOSPACE
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                    setTextColor(cText)
                    setTextIsSelectable(true)
                    setPadding(dp(16), dp(12), dp(16), dp(12))
                })
            }
        }
        AlertDialog.Builder(this)
                .setTitle(f.name)
                .setView(body)
                .setNegativeButton(t("Close", "বন্ধ"), null)
                .setNeutralButton(t("Share", "শেয়ার")) { _, _ -> shareFile(guest) }
                .setPositiveButton(t("Save to phone", "ফোনে সেভ")) { _, _ -> exportFile(guest) }
                .show()
    }

    private fun entryMenu(f: File) {
        val guest = (if (cwd == "/") "" else cwd) + "/" + f.name
        val items = if (f.isDirectory) arrayOf(t("Delete", "মুছুন")) else arrayOf(t("Save to phone", "ফোনে সেভ"), t("Share", "শেয়ার"), t("Delete", "মুছুন"))
        AlertDialog.Builder(this).setTitle(f.name).setItems(items) { _, which ->
            when (items[which]) {
                t("Save to phone", "ফোনে সেভ") -> exportFile(guest)
                t("Share", "শেয়ার") -> shareFile(guest)
                else -> AlertDialog.Builder(this)
                        .setMessage(t("Delete ${f.name}?", "${f.name} মুছে ফেলবেন?"))
                        .setNegativeButton(android.R.string.cancel, null)
                        .setPositiveButton(t("Delete", "মুছুন")) { _, _ ->
                            if (f.isDirectory && !runCatching { java.nio.file.Files.isSymbolicLink(f.toPath()) }.getOrDefault(false)) deleteTreeNoFollow(f) else f.delete()
                            loadDir(cwd)
                        }.show()
            }
        }.show()
    }

    private fun exportFile(guest: String) {
        Thread {
            val msg = try {
                t("Saved to Downloads: ", "ডাউনলোডসে সেভ হয়েছে: ") + sandbox.exportToDownloads(guest)
            } catch (e: Exception) {
                t("Could not save: ", "সেভ করা যায়নি: ") + (e.message ?: "")
            }
            main.post { toast(msg) }
        }.start()
    }

    private fun shareFile(guest: String) {
        val src = sandbox.hostFile(guest)?.takeIf { it.isFile } ?: return toast(t("Can't share this file", "এই ফাইল শেয়ার করা যাচ্ছে না"))
        Thread {
            try {
                // Share from a cache copy: FileProvider does not expose no-backup storage.
                val dir = File(cacheDir, "studio-share").apply { deleteTreeNoFollow(this); mkdirs() }
                val copy = File(dir, src.name)
                src.copyTo(copy, overwrite = true)
                val uri = androidx.core.content.FileProvider.getUriForFile(this, "$packageName.fileprovider", copy)
                val mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(copy.extension.lowercase()) ?: "application/octet-stream"
                main.post {
                    runCatching {
                        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                            type = mime
                            putExtra(Intent.EXTRA_STREAM, uri)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }, src.name))
                    }.onFailure { toast(it.message ?: "Share failed") }
                }
            } catch (e: Exception) {
                main.post { toast(t("Could not share: ", "শেয়ার করা যায়নি: ") + (e.message ?: "")) }
            }
        }.start()
    }

    private fun importFiles(uris: List<Uri>) {
        val dir = sandbox.hostFile(cwd)?.takeIf { it.isDirectory } ?: return toast(t("Open a folder first", "আগে একটি ফোল্ডার খুলুন"))
        Thread {
            var ok = 0
            for (uri in uris) {
                runCatching {
                    val name = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                        if (c.moveToFirst()) c.getString(0) else null
                    }?.replace('/', '_')?.takeIf { it.isNotBlank() } ?: "file-${System.currentTimeMillis()}"
                    val out = File(dir, name)
                    if (runCatching { java.nio.file.Files.isSymbolicLink(out.toPath()) }.getOrDefault(false)) out.delete()
                    contentResolver.openInputStream(uri)?.use { input -> out.outputStream().use { o: OutputStream -> input.copyTo(o, 64 * 1024) } }
                    ok++
                }
            }
            main.post {
                toast(t("Imported $ok file(s) into $cwd", "$cwd-এ ${ok}টি ফাইল আনা হয়েছে"))
                loadDir(cwd)
            }
        }.start()
    }

    // ── Preview ──────────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildPreview(): View {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = rounded(cSurface, 14f)
            setPadding(dp(12), 0, dp(2), 0)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                setMargins(dp(10), 0, dp(10), dp(8))
            }
        }
        previewUrl = EditText(this).apply {
            setText("http://127.0.0.1:8000/")
            typeface = Typeface.MONOSPACE
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setTextColor(cText)
            background = null
            isSingleLine = true
            imeOptions = EditorInfo.IME_ACTION_GO
            inputType = android.text.InputType.TYPE_TEXT_VARIATION_URI
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setOnEditorActionListener { _, _, _ -> openPreview(text.toString()); true }
        }
        row.addView(previewUrl)
        row.addView(iconButton(R.drawable.ic_studio_refresh, t("Reload", "রিলোড")) { previewWeb.reload() })
        row.addView(iconButton(R.drawable.ic_studio_open, t("Open in browser", "ব্রাউজারে খুলুন")) {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(previewWeb.url ?: previewUrl.text.toString()))) }
        })
        box.addView(row)
        previewWeb = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            settings.builtInZoomControls = true
            settings.displayZoomControls = false
            setBackgroundColor(cBg)
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val host = request.url.host ?: return false
                    if (host == "127.0.0.1" || host == "localhost" || host == "0.0.0.0") return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                    return true
                }

                override fun onPageFinished(view: WebView, url: String) {
                    if (!previewUrl.hasFocus()) previewUrl.setText(url)
                }
            }
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        box.addView(previewWeb)
        return box
    }

    private fun openPreview(raw: String) {
        var url = raw.trim()
        if (url.isEmpty()) return
        if (url.matches(Regex("^\\d{2,5}(/.*)?$"))) url = "http://127.0.0.1:$url"
        if (!url.contains("://")) url = "http://$url"
        url = url.replace("://0.0.0.0", "://127.0.0.1").replace("://localhost", "://127.0.0.1")
        previewUrl.setText(url)
        previewUrl.clearFocus()
        previewWeb.loadUrl(url)
    }
}
