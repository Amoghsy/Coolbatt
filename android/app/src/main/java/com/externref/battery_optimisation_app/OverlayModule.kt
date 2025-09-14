package com.externref.battery_optimisation_app

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OverlayModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "OverlayModule"

    @ReactMethod
    fun requestOverlayPermission() {
        val context = reactApplicationContext
        if (!Settings.canDrawOverlays(context)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}")
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }

    /**
     * Show overlay with call state + optional battery info.
     * Example string: "OFFHOOK - ✅ Suitable to take calls (Temp: 36.5°C)"
     */
    @ReactMethod
    fun showOverlay(message: String) {
        val context = reactApplicationContext
        if (!Settings.canDrawOverlays(context)) return

        val intent = Intent(context, OverlayService::class.java).apply {
            putExtra("MESSAGE", message)
        }
        context.startService(intent)
    }

    @ReactMethod
    fun hideOverlay() {
        val context = reactApplicationContext
        val intent = Intent(context, OverlayService::class.java)
        context.stopService(intent)
    }
}
