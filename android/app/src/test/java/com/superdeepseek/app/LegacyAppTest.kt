package com.superdeepseek.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LegacyAppTest {
    @Test
    fun `offers removal only while the old app is installed and not dismissed`() {
        assertTrue(shouldOfferLegacyRemoval("com.superdeepseek.app", dismissed = false, legacyInstalled = true))
        assertFalse(shouldOfferLegacyRemoval("com.superdeepseek.app", dismissed = true, legacyInstalled = true))
        assertFalse(shouldOfferLegacyRemoval("com.superdeepseek.app", dismissed = false, legacyInstalled = false))
    }

    @Test
    fun `never offers to uninstall itself`() {
        assertFalse(shouldOfferLegacyRemoval(LEGACY_APPLICATION_ID, dismissed = false, legacyInstalled = true))
    }

    @Test
    fun `the new id is not the old one`() {
        assertEquals("com.betterdeepseek.app", LEGACY_APPLICATION_ID)
        assertEquals("com.superdeepseek.app", BuildConfig.APPLICATION_ID)
    }
}
