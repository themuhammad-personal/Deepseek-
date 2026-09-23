package com.betterdeepseek.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UiPolishTest {

    // ── Hidden text rules ────────────────────────────────────────────────

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
    }

    // ── Injected script contract ─────────────────────────────────────────

    @Test
    fun `script embeds every hidden selector and is idempotent`() {
        val script = UiPolish.buildScript()
        assertTrue(script.contains("__bdsUiPolished"))
        assertTrue(script.contains("MutationObserver"))
        UiPolish.HIDDEN_SELECTORS.forEach { assertTrue(script.contains(it.removePrefix("[data-testid=\"").split("\"")[0])) }
        assertTrue(script.contains(".bds-tip-bar"))
        assertTrue(script.contains(".bds-github-link"))
        assertTrue(script.contains(".bds-deep-code-mount"))
    }

    @Test
    fun `script escapes regex patterns as json strings`() {
        val script = UiPolish.buildScript()
        // Bangla patterns must survive as quoted JS strings
        assertTrue(script.contains("ভয়েস মোড"))
        assertTrue(script.contains("ডিপ কোড"))
        // Ignore-case flag is present because some rules are case-insensitive
        assertTrue(script.contains("new RegExp(p,\"i\")"))
    }

    // ── Composer control classification ──────────────────────────────────

    @Test
    fun `engine composer controls are recognised`() {
        assertTrue(UiPolish.isEngineComposerControl("bds-plus-btn", ""))
        assertTrue(UiPolish.isEngineComposerControl("bds-attach-menu-mount svelte-x", ""))
        assertTrue(UiPolish.isEngineComposerControl("bds-deep-research-toggle", ""))
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
            ),
            UiPolish.HIDDEN_SELECTORS,
        )
        // Every selector stays inside the engine's namespace.
        UiPolish.HIDDEN_SELECTORS.forEach { selector ->
            val insideEngineNs = selector.startsWith(".bds-") ||
                selector.startsWith("[data-testid=\"attach-")
            assertTrue("selector must stay inside the engine namespace: $selector", insideEngineNs)
        }
    }
}
