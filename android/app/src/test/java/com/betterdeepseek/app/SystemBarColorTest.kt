package com.betterdeepseek.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The system bars take the page colour sampled by PAGE_BG_PROBE_JS. */
class SystemBarColorTest {

    @Test
    fun `parses the JSON-quoted probe result`() {
        assertEquals(0xFFFFFFFF.toInt(), parseRgb("\"255,255,255\""))
        assertEquals(0xFF292A2D.toInt(), parseRgb("\"41,42,45\""))
        assertEquals(0xFF010203.toInt(), parseRgb("1, 2, 3"))
    }

    @Test
    fun `rejects empty or malformed probe results`() {
        assertNull(parseRgb(null))
        assertNull(parseRgb("\"\""))
        assertNull(parseRgb("null"))
        assertNull(parseRgb("\"12,34\""))
        assertNull(parseRgb("\"300,0,0\""))
        assertNull(parseRgb("\"a,b,c\""))
    }

    @Test
    fun `light pages get dark bar icons, dark pages light icons`() {
        assertTrue(isLightColor(0xFFFFFFFF.toInt()))
        assertTrue(isLightColor(0xFFF7F7F8.toInt()))
        assertFalse(isLightColor(0xFF292A2D.toInt()))
        assertFalse(isLightColor(0xFF070A1C.toInt()))
    }
}
