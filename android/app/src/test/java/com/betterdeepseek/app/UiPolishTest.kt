package com.betterdeepseek.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UiPolishTest {

    // ── Settings text rules ──────────────────────────────────────────────

    @Test
    fun `voice feature rows are hidden in english and bangla`() {
        assertTrue(UiPolish.shouldHideText("Voice Mode"))
        assertTrue(UiPolish.shouldHideText("voice mode"))
        assertTrue(UiPolish.shouldHideText("Auto-read responses"))
        assertTrue(UiPolish.shouldHideText("Voice & Audio"))
        assertTrue(UiPolish.shouldHideText("ভয়েস মোড"))
        assertTrue(UiPolish.shouldHideText("অটো-রিড রেসপন্স"))
        assertTrue(UiPolish.shouldHideText("ভয়েস ও অডিও"))
    }

    @Test
    fun `deep code rows are hidden in english and bangla`() {
        assertTrue(UiPolish.shouldHideText("Deep Code"))
        assertTrue(UiPolish.shouldHideText("Enable deep code"))
        assertTrue(UiPolish.shouldHideText("ডিপ কোড"))
    }

    @Test
    fun `legitimate settings rows stay visible`() {
        assertFalse(UiPolish.shouldHideText("Multi-turn context"))
        assertFalse(UiPolish.shouldHideText("Search providers"))
        assertFalse(UiPolish.shouldHideText("GitHub Token"))
        assertFalse(UiPolish.shouldHideText("Export all data"))
        assertFalse(UiPolish.shouldHideText("Custom CSS"))
        assertFalse(UiPolish.shouldHideText("মেমোরি লাইব্রেরি"))
        assertFalse(UiPolish.shouldHideText("Deep Research"))
        assertFalse(UiPolish.shouldHideText("Show timestamps"))
        // Web Search keeps its SETTINGS section — the sheet row is what goes.
        assertFalse(UiPolish.shouldHideText("Web Search"))
    }

    // ── Attach sheet rules (scoped!) ─────────────────────────────────────

    @Test
    fun `attach sheet rows for deepthink and web search are hidden`() {
        // Exact titles as the engine's Tools & Actions sheet renders them.
        assertTrue(UiPolish.shouldHideAttachItem("DeepThink (R1)"))
        assertTrue(UiPolish.shouldHideAttachItem("Web Search Mode"))
        assertTrue(UiPolish.shouldHideAttachItem("DeepThink"))
        assertTrue(UiPolish.shouldHideAttachItem("Deep Think"))
        assertTrue(UiPolish.shouldHideAttachItem("Web Search"))
        assertTrue(UiPolish.shouldHideAttachItem("ডিপথিঙ্ক"))
        assertTrue(UiPolish.shouldHideAttachItem("ওয়েব সার্চ মোড"))
    }

    @Test
    fun `attach sheet keeps upload and fetch rows`() {
        assertFalse(UiPolish.shouldHideAttachItem("Upload File"))
        assertFalse(UiPolish.shouldHideAttachItem("Upload Folder"))
        assertFalse(UiPolish.shouldHideAttachItem("GitHub Repo"))
        assertFalse(UiPolish.shouldHideAttachItem("Fetch Web Page"))
        assertFalse(UiPolish.shouldHideAttachItem("ওয়েব পেজ ফেচ"))
        assertFalse(UiPolish.shouldHideAttachItem("Camera"))
    }

    @Test
    fun `attach rule is scoped to the sheet selector only`() {
        assertEquals(
            ".bds-attach-dropdown .bds-attach-item",
            UiPolish.ATTACH_ITEM_SELECTOR,
        )
    }

    // ── Label repairs ────────────────────────────────────────────────────

    @Test
    fun `raw i18n keys have localized replacements`() {
        val about = UiPolish.LABEL_FIXES["SETTINGS.ABOUT"]
        assertEquals("About", about?.first)
        assertEquals("সম্পর্কে", about?.second)
        val tools = UiPolish.LABEL_FIXES["mcp.tools"]
        assertEquals("MCP Tools", tools?.first)
    }

    // ── Injected script contract ─────────────────────────────────────────

    @Test
    fun `script embeds every hidden selector and is idempotent`() {
        val script = UiPolish.buildScript()
        assertTrue(script.contains("__bdsUiPolished"))
        assertTrue(script.contains("MutationObserver"))
        UiPolish.HIDDEN_SELECTORS.forEach { selector ->
            val bare = selector
                .removePrefix("[data-testid=\"").removeSuffix("\"]")
                .removePrefix(".")
            assertTrue("script must embed selector: $selector", script.contains(bare))
        }
    }

    @Test
    fun `script never hides an ancestor group`() {
        // Regression guard for the wiped-advanced-settings bug: the sweep must
        // not climb to `.bds-settings-group` (or use closest at all).
        val script = UiPolish.buildScript()
        assertFalse(script.contains("closest("))
        assertFalse(script.contains("bds-settings-group\"") && script.contains("closest"))
    }

    @Test
    fun `script sweeps only dedicated row selectors`() {
        val script = UiPolish.buildScript()
        UiPolish.TEXT_SWEEP_SELECTORS.forEach { assertTrue(script.contains(it)) }
    }

    @Test
    fun `script scopes attach hiding to the sheet`() {
        val script = UiPolish.buildScript()
        assertTrue(script.contains(UiPolish.ATTACH_ITEM_SELECTOR))
    }

    @Test
    fun `script escapes regex patterns as json strings`() {
        val script = UiPolish.buildScript()
        assertTrue(script.contains("ভয়েস মোড"))
        assertTrue(script.contains("ডিপ কোড"))
        // \s inside a pattern survives as \\s in the JSON-escaped JS string
        assertTrue(script.contains("Deep\\\\s*Think"))
        // Ignore-case flag is present because some rules are case-insensitive
        assertTrue(script.contains("new RegExp(p,\"i\")"))
    }

    // ── Composer control classification ──────────────────────────────────

    @Test
    fun `engine composer controls are recognised`() {
        assertTrue(UiPolish.isEngineComposerControl("bds-plus-btn", ""))
        assertTrue(UiPolish.isEngineComposerControl("bds-attach-menu-mount svelte-x", ""))
        assertTrue(UiPolish.isEngineComposerControl("bds-deep-research-toggle", ""))
        assertTrue(UiPolish.isEngineComposerControl("bds-deep-research-mount", ""))
        assertTrue(UiPolish.isEngineComposerControl("", "bds-root"))
    }

    @Test
    fun `official page controls are not classified as engine controls`() {
        assertFalse(UiPolish.isEngineComposerControl("ds-icon-button", ""))
        assertFalse(UiPolish.isEngineComposerControl("chat-input-user-input", ""))
        assertFalse(UiPolish.isEngineComposerControl("", "send-message-button"))
    }

    // ── Selector list hygiene ────────────────────────────────────────────

    @Test
    fun `hidden selector list is exactly the agreed dead set`() {
        assertEquals(
            listOf(
                ".bds-tip-bar",
                ".bds-github-link",
                ".bds-deep-code-mount",
                "[data-testid=\"attach-menu-deep-code\"]",
                ".bds-category-nav",
                ".bds-drawer-search-bar",
                ".bds-advanced-search-wrapper",
            ),
            UiPolish.HIDDEN_SELECTORS,
        )
        UiPolish.HIDDEN_SELECTORS.forEach { selector ->
            val insideEngineNs = selector.startsWith(".bds-") ||
                selector.startsWith("[data-testid=\"attach-")
            assertTrue("selector must stay inside the engine namespace: $selector", insideEngineNs)
        }
    }
}
