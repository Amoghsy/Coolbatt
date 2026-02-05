package com.externref.battery_optimisation_app

import android.app.*
import android.content.*
import android.os.*
import android.os.BatteryManager
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import android.content.pm.ServiceInfo
import android.util.Log
import androidx.core.content.ContextCompat

class BatteryMonitorService : Service() {

    private lateinit var batteryReceiver: BroadcastReceiver
    private var lastKnownTemp: String = "Temperature unavailable"
    private var isCharging: Boolean? = null // track last charging state
    private val monitorChannelId = "battery_monitor_channel"
    private val alertChannelId = "battery_alerts_channel"

    override fun onCreate() {
        super.onCreate()

        // ✅ Only start foreground if notification permission is granted
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(
                this,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            startForegroundServiceNotification()
        } else {
            Log.w("BatteryMonitorService", "Notification permission not granted yet, skipping startForeground()")
        }

        // Register battery events listener
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_BATTERY_CHANGED)
        }

        batteryReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent == null) return

                if (intent.action == Intent.ACTION_BATTERY_CHANGED) {
                    updateTemp(intent)

                    val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                    val chargingNow = status == BatteryManager.BATTERY_STATUS_CHARGING

                    if (isCharging != chargingNow) {
                        isCharging = chargingNow
                        val title = if (chargingNow) "⚡ Charging Started" else "🔌 Charging Stopped"

                        // ✅ Only show notifications if permission is granted
                        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                            ContextCompat.checkSelfPermission(
                                this@BatteryMonitorService,
                                android.Manifest.permission.POST_NOTIFICATIONS
                            ) == PackageManager.PERMISSION_GRANTED
                        ) {
                            sendBatteryNotification(title, lastKnownTemp)
                        } else {
                            Log.w("BatteryMonitorService", "Skipping alert notification — permission not granted")
                        }
                    }
                }
            }
        }

        registerReceiver(batteryReceiver, filter)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY // ensures service restarts if killed
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(batteryReceiver)
    }

    override fun onBind(intent: Intent?) = null

    /** -------------------------------------------------------------
     *  Foreground persistent notification
     *  ------------------------------------------------------------- */
    private fun startForegroundServiceNotification() {
        val channelName = "Battery Monitor"

        val notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                monitorChannelId,
                channelName,
                NotificationManager.IMPORTANCE_LOW
            )
            notificationManager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, monitorChannelId)
            .setContentTitle("Battery Monitor Running")
            .setContentText("Monitoring charging & temperature in background")
            .setSmallIcon(android.R.drawable.ic_lock_idle_charging)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                1,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(1, notification)
        }
    }

    /** -------------------------------------------------------------
     *  Send alert notifications when charging state changes
     *  ------------------------------------------------------------- */
    private fun sendBatteryNotification(title: String, temp: String) {
        val notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                alertChannelId,
                "Battery Alerts",
                NotificationManager.IMPORTANCE_HIGH
            )
            notificationManager.createNotificationChannel(channel)
        }

        val notif = NotificationCompat.Builder(this, alertChannelId)
            .setContentTitle(title)
            .setContentText(temp)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notif)
    }

    /** -------------------------------------------------------------
     *  Update cached battery temperature
     *  ------------------------------------------------------------- */
    private fun updateTemp(intent: Intent) {
        val temp = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) / 10.0
        if (temp > 0) {
            lastKnownTemp = "Battery temperature: $temp °C"
        }
    }

    /** -------------------------------------------------------------
     *  Helper: fetch latest temperature
     *  ------------------------------------------------------------- */
    private fun getBatteryTemperature(): String {
        val intent = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val temp = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
        return if (temp > 0) {
            "Battery temperature: ${temp / 10.0} °C"
        } else {
            lastKnownTemp
        }
    }
}
