package com.superdeepseek.app

import android.content.pm.PackageManager
import android.os.Build

/**
 * Earlier builds were installed as `com.betterdeepseek.app`, the package name of the
 * project it started from. It now has its own (`com.superdeepseek.app`), which Android treats as a
 * different app: this one installs next to the old one instead of over it, and none of the old
 * app's data (login, engine settings, Linux files) can be read from here. MainActivity therefore
 * offers, once the launch screen is gone, to uninstall the old copy and says how to carry the
 * settings over (the engine's own Export → Import).
 */
internal const val LEGACY_APPLICATION_ID = "com.betterdeepseek.app"

/** UI prefs key: the user chose "Don't ask again". */
internal const val KEY_LEGACY_DISMISSED = "legacy_app_prompt_dismissed"

/** Whether [pkg] is installed. Needs a matching `<queries><package/>` entry on Android 11+. */
internal fun isPackageInstalled(pm: PackageManager, pkg: String): Boolean = try {
    if (Build.VERSION.SDK_INT >= 33) {
        pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
    } else {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(pkg, 0)
    }
    true
} catch (_: PackageManager.NameNotFoundException) {
    false
} catch (_: RuntimeException) {
    false
}

/** The prompt is due when the old app is still installed and the user has not opted out. */
internal fun shouldOfferLegacyRemoval(ownPackage: String, dismissed: Boolean, legacyInstalled: Boolean): Boolean =
    ownPackage != LEGACY_APPLICATION_ID && !dismissed && legacyInstalled
