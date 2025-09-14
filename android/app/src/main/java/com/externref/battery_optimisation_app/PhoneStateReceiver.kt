package com.externref.battery_optimisation_app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager

class PhoneStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return

        // Normalize to RINGING / OFFHOOK / IDLE used by your JS
        val normalized = when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> "RINGING"
            TelephonyManager.EXTRA_STATE_OFFHOOK -> "OFFHOOK"
            TelephonyManager.EXTRA_STATE_IDLE    -> "IDLE"
            else -> "IDLE"
        }

        // Persist state so the Worker can read it
        val prefs = context.getSharedPreferences("call_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("CALL_STATE", normalized).apply()

        when (normalized) {
            "RINGING", "OFFHOOK" -> {
                val req = OneTimeWorkRequestBuilder<CallNotificationWorker>()
                    .addTag("call-notification")
                    .build()
                WorkManager.getInstance(context).enqueueUniqueWork(
                    "call-notification",
                    ExistingWorkPolicy.REPLACE,
                    req
                )
            }
            "IDLE" -> {
                WorkManager.getInstance(context).cancelUniqueWork("call-notification")
                CallNotificationWorker.cancelOngoingNotification(context)
            }
        }
    }
}
