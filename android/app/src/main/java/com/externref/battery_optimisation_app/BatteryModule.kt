package com.externref.battery_optimisation_app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.util.Log
import com.facebook.react.bridge.*

class BatteryModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        var latestTemp: Float = -1f     // °C
        var latestLevel: Int = -1       // % (0–100)
    }

    override fun getName(): String {
        return "BatteryModule"
    }

    @ReactMethod
    fun getBatteryStats(promise: Promise) {
        try {
            val intentFilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)

            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    try {
                        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
                        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
                        val batteryPct = if (level >= 0 && scale > 0) {
                            (level * 100 / scale.toFloat()).toInt()
                        } else -1

                        val rawTemp = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
                        val tempC = if (rawTemp >= 0) rawTemp / 10.0f else -1f

                        // store for OverlayService
                        latestLevel = batteryPct
                        latestTemp = tempC

                        Log.d("BatteryModule", "Battery: $batteryPct%, Temp: $tempC°C")

                        val map = Arguments.createMap()
                        map.putInt("level", batteryPct)
                        map.putDouble("temperature", tempC.toDouble())
                        promise.resolve(map)
                    } catch (e: Exception) {
                        promise.reject("ERROR", e.message)
                    } finally {
                        reactContext.unregisterReceiver(this)
                    }
                }
            }

            reactContext.registerReceiver(receiver, intentFilter)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}
