package com.externref.battery_optimisation_app

import android.app.Activity
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView

class OverlayActivity : Activity() {

    private var batteryText: TextView? = null
    private var tempText: TextView? = null
    private var suitabilityText: TextView? = null
    private var footerText: TextView? = null

    private val handler = Handler(Looper.getMainLooper())
    private val updateInterval = 30_000L

    private val updateRunnable = object : Runnable {
        override fun run() {
            updateBatteryStats()
            handler.postDelayed(this, updateInterval)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Make overlay show above lock screen with transparent background
        window.setFlags(
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
        )

        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )

        setContentView(R.layout.overlay_view)

        val state = intent.getStringExtra("STATE") ?: "Active"

        val titleText = findViewById<TextView>(R.id.overlay_title)
        val callIcon = findViewById<ImageView>(R.id.overlay_call_icon)

        // Set title & icon based on call state
        titleText.text = when (state) {
            "RINGING" -> "📞 Incoming Call"
            "OFFHOOK" -> "📶 Call in Progress"
            else -> "📞 Call Active"
        }

        callIcon.setImageResource(
            when (state) {
                "RINGING" -> android.R.drawable.sym_call_incoming
                "OFFHOOK" -> android.R.drawable.sym_call_outgoing
                else -> android.R.drawable.ic_menu_call
            }
        )

        // Reference UI elements
        batteryText = findViewById(R.id.overlay_battery)
        tempText = findViewById(R.id.overlay_temp)
        suitabilityText = findViewById(R.id.overlay_suitability)
        footerText = findViewById(R.id.overlay_footer)
        footerText?.text = "Powered by Coolbatt"

        // Close button
        findViewById<ImageView>(R.id.overlay_close).setOnClickListener {
            finish()
            overridePendingTransition(0, 0)
        }

        // Initial battery update
        updateBatteryStats()
    }

    override fun onResume() {
        super.onResume()
        handler.post(updateRunnable)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(updateRunnable)
    }

    private fun updateBatteryStats() {
        val intent = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        if (intent != null) {
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            val batteryPct = if (level >= 0 && scale > 0) (level * 100 / scale.toFloat()).toInt() else -1

            val rawTemp = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1)
            val tempC = if (rawTemp >= 0) rawTemp / 10.0f else -1f

            batteryText?.text = if (batteryPct >= 0) "Battery Level: $batteryPct%" else "--%"
            tempText?.text = if (tempC >= 0) "Phone Temperature: ${tempC}°C" else "--°C"
            suitabilityText?.text = if (tempC in 0f..39f) "✅ Suitable to Take Call" else "⚠️ System Overheat"
        } else {
            batteryText?.text = "--%"
            tempText?.text = "--°C"
            suitabilityText?.text = "⚠️ Cannot read battery info"
        }
    }
}
