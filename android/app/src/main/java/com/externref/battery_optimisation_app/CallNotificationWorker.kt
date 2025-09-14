package com.externref.battery_optimisation_app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import kotlinx.coroutines.delay

class CallNotificationWorker(appContext: Context, params: WorkerParameters) :
    CoroutineWorker(appContext, params) {

    companion object {
        private const val CHANNEL_ID = "call_state_channel"
        private const val CHANNEL_NAME = "Call State"
        private const val NOTIFICATION_ID = 2001

        fun cancelOngoingNotification(context: Context) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.cancel(NOTIFICATION_ID)
        }

        private fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                val existing = nm.getNotificationChannel(CHANNEL_ID)
                if (existing == null) {
                    val ch = NotificationChannel(
                        CHANNEL_ID,
                        CHANNEL_NAME,
                        NotificationManager.IMPORTANCE_HIGH
                    )
                    nm.createNotificationChannel(ch)
                }
            }
        }

        private fun buildNotification(context: Context, title: String, body: String): Notification {
            ensureChannel(context)
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body)) // ✅ allow multiline
                .setSmallIcon(android.R.drawable.sym_call_incoming)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build()
        }
    }

    override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences("call_prefs", Context.MODE_PRIVATE)

        val (title, body) = currentTexts(prefs.getString("CALL_STATE", "IDLE"))
        setForeground(createForegroundInfo(title, body))

        var elapsedMs = 0L
        val maxMs = 2 * 60 * 60 * 1000L // 2 hours

        while (elapsedMs < maxMs) {
            val state = prefs.getString("CALL_STATE", "IDLE")
            if (state == "IDLE") {
                cancelOngoingNotification(applicationContext)
                return Result.success()
            }

            val (t, b) = currentTexts(state)
            val nm = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIFICATION_ID, buildNotification(applicationContext, t, b))

            delay(5_000)
            elapsedMs += 5_000
        }

        cancelOngoingNotification(applicationContext)
        return Result.success()
    }

    private fun createForegroundInfo(title: String, body: String): ForegroundInfo {
        val notification = buildNotification(applicationContext, title, body)
        return ForegroundInfo(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        )
    }

    private fun currentTexts(state: String?): Pair<String, String> {
        val temp = getBatteryTemp(applicationContext)
        val suitability =
            if (temp > 0f) {
                if (temp < 40f) "✅ Suitable to take calls" else "⚠️ Not suitable to take calls"
            } else {
                "Battery temp unavailable"
            }

        val tempText = if (temp > 0f) "Battery Temp: ${"%.1f".format(temp)} °C" else "Battery Temp: -- °C"
        val body = "$tempText\n$suitability"

        return when (state) {
            "RINGING" -> "📞 Incoming Call" to body
            "OFFHOOK" -> "📶 Call in Progress" to body
            else      -> "Call" to body
        }
    }

    private fun getBatteryTemp(context: Context): Float {
        val intent = context.registerReceiver(
            null,
            android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED)
        )
        val temp = intent?.getIntExtra(android.os.BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
        return if (temp != -1) temp / 10f else 0f
    }
}
