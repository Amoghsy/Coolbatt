package com.externref.battery_optimisation_app

import android.app.*
import android.content.*
import android.os.*
import android.os.BatteryManager
import androidx.core.app.NotificationCompat
import android.content.pm.ServiceInfo

class BatteryMonitorService : Service() {

    private lateinit var batteryReceiver: BroadcastReceiver
    private var lastKnownTemp: String = "Temperature unavailable"

    override fun onCreate() {
        super.onCreate()
        startForegroundServiceNotification()

        // Register battery events listener
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_BATTERY_CHANGED)
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
        }

        batteryReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent == null) return
                when (intent.action) {
                    Intent.ACTION_POWER_CONNECTED -> {
                        sendBatteryNotification(
                            "⚡ Charging Started",
                            getBatteryTemperature() // always query fresh
                        )
                    }
                    Intent.ACTION_POWER_DISCONNECTED -> {
                        sendBatteryNotification(
                            "🔌 Charging Stopped",
                            getBatteryTemperature()
                        )
                    }
                    Intent.ACTION_BATTERY_CHANGED -> {
                        updateTemp(intent) // keep last known value fresh
                        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                        if (status == BatteryManager.BATTERY_STATUS_CHARGING) {
                            sendBatteryNotification(
                                "⚡ Charging...",
                                lastKnownTemp
                            )
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

    // Foreground persistent notification
    private fun startForegroundServiceNotification() {
        val channelId = "battery_monitor_channel"
        val channelName = "Battery Monitor"

        val notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                channelName,
                NotificationManager.IMPORTANCE_LOW
            )
            notificationManager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, channelId)
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

    // Send event notifications
    private fun sendBatteryNotification(title: String, temp: String) {
        val channelId = "battery_alerts_channel"
        val notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Battery Alerts",
                NotificationManager.IMPORTANCE_HIGH
            )
            notificationManager.createNotificationChannel(channel)
        }

        val notif = NotificationCompat.Builder(this, channelId)
            .setContentTitle(title)
            .setContentText(temp)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notif)
    }

    // Update cached temperature from ACTION_BATTERY_CHANGED
    private fun updateTemp(intent: Intent) {
        val temp = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) / 10.0
        if (temp > 0) {
            lastKnownTemp = "Battery temperature: $temp °C"
        }
    }

    // Always fetch latest battery temperature from system
    private fun getBatteryTemperature(): String {
        val intent = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val temp = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
        return if (temp > 0) {
            "Battery temperature: ${temp / 10.0} °C"
        } else {
            lastKnownTemp // fallback to last known
        }
    }
}
