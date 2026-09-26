package com.betterdeepseek.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Keeps the app alive while the Linux sandbox is working (a long build, an
 * install, a dev server) so Android does not freeze or kill it the moment
 * the user switches apps. It starts with the first sandbox command and stops
 * itself two minutes after the last one ends. The notification has a Stop
 * action that ends every sandbox process and the agent loop.
 */
class SandboxService : Service() {

    companion object {
        private const val TAG = "SdSandboxService"
        private const val CHANNEL = "sandbox"
        private const val NOTIFICATION_ID = 7301
        private const val IDLE_STOP_MS = 2 * 60 * 1000L
        const val ACTION_STOP = "com.betterdeepseek.app.action.SANDBOX_STOP"
        private const val ACTION_UPDATE = "com.betterdeepseek.app.action.SANDBOX_UPDATE"
        private const val EXTRA_ACTIVE = "active"

        private val main = Handler(Looper.getMainLooper())
        @Volatile private var started = false
        private var pendingStop: Runnable? = null

        /** Called from any thread by [Sandbox] whenever the number of live processes changes. */
        fun onActiveCountChanged(context: Context, active: Int) {
            val app = context.applicationContext
            main.post {
                pendingStop?.let { main.removeCallbacks(it) }
                pendingStop = null
                if (active > 0) {
                    send(app, ACTION_UPDATE, active)
                } else if (started) {
                    send(app, ACTION_UPDATE, 0)
                    val r = Runnable { if (Sandbox.get(app).activeCount == 0) app.stopService(Intent(app, SandboxService::class.java)) }
                    pendingStop = r
                    main.postDelayed(r, IDLE_STOP_MS)
                }
            }
        }

        private fun send(app: Context, action: String, active: Int) {
            try {
                val i = Intent(app, SandboxService::class.java).setAction(action).putExtra(EXTRA_ACTIVE, active)
                if (started) app.startService(i) else ContextCompat.startForegroundService(app, i)
            } catch (t: Throwable) {
                // Background start restrictions (Android 12+): the sandbox still
                // works, it just is not protected while the app is in the background.
                Log.w(TAG, "could not start the sandbox service", t)
            }
        }

        /** Set by the activity: stops the agent loop in the page. */
        @Volatile var onStopRequested: (() -> Unit)? = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Sandbox.get(this).killAll()
            main.post { runCatching { onStopRequested?.invoke() } }
        }
        val active = intent?.getIntExtra(EXTRA_ACTIVE, Sandbox.get(this).activeCount) ?: 0
        try {
            val n = buildNotification(active)
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            } else {
                startForeground(NOTIFICATION_ID, n)
            }
            started = true
        } catch (t: Throwable) {
            Log.w(TAG, "startForeground failed", t)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        started = false
        super.onDestroy()
    }

    private fun buildNotification(active: Int): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.sandbox_channel), NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
            })
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val open = PendingIntent.getActivity(this, 0,
                Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT), flags)
        val stop = PendingIntent.getService(this, 1, Intent(this, SandboxService::class.java).setAction(ACTION_STOP), flags)
        val text = if (active > 0) resources.getQuantityString(R.plurals.sandbox_running, active, active)
        else getString(R.string.sandbox_idle)
        return NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_sandbox)
                .setContentTitle(getString(R.string.sandbox_title))
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setContentIntent(open)
                .apply { if (active > 0) addAction(0, getString(R.string.sandbox_stop), stop) }
                .build()
    }
}
