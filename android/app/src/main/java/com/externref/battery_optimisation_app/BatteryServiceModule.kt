package com.externref.battery_optimisation_app

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BatteryServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "BatteryServiceModule"

    @ReactMethod
    fun startService() {
        val context = reactApplicationContext
        val intent = Intent(context, BatteryMonitorService::class.java)

        try {
            if (!isServiceRunning(BatteryMonitorService::class.java, context)) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    // Start as foreground service on API 26+
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                println("✅ BatteryMonitorService started")
            } else {
                println("⚠️ BatteryMonitorService is already running")
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @ReactMethod
    fun stopService() {
        val context = reactApplicationContext
        val intent = Intent(context, BatteryMonitorService::class.java)
        try {
            context.stopService(intent)
            println("🛑 BatteryMonitorService stopped")
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun isServiceRunning(serviceClass: Class<*>, context: Context): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        for (service in manager.getRunningServices(Int.MAX_VALUE)) {
            if (serviceClass.name == service.service.className) {
                return true
            }
        }
        return false
    }
}
