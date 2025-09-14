package com.externref.battery_optimisation_app

import android.app.*
import android.content.*
import android.graphics.PixelFormat
import android.os.*
import android.view.*
import android.widget.ImageView
import android.widget.TextView
import androidx.core.app.NotificationCompat

class OverlayService : Service() {

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null

    private var titleText: TextView? = null
    private var batteryText: TextView? = null
    private var tempText: TextView? = null
    private var suitabilityText: TextView? = null
    private var footerText: TextView? = null
    private var closeBtn: ImageView? = null
    private var callIcon: ImageView? = null

    private val handler = Handler(Looper.getMainLooper())
    private val updateInterval = 30_000L

    private val updateRunnable = object : Runnable {
        override fun run() {
            updateBatteryStats()
            handler.postDelayed(this, updateInterval)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForegroundServiceNotification()
    }

    private fun startForegroundServiceNotification() {
        val channelId = "overlay_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Overlay Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Overlay running")
            .setContentText("Call overlay is active")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .build()

        startForeground(1, notification)
    }

    private fun isPhoneLocked(): Boolean {
        val km = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
        return km.isKeyguardLocked || km.isKeyguardSecure
    }

    private fun setupOverlay(callState: String) {
        if (overlayView != null) return

        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        overlayView = LayoutInflater.from(this).inflate(R.layout.overlay_view, null)

        titleText = overlayView?.findViewById(R.id.overlay_title)
        batteryText = overlayView?.findViewById(R.id.overlay_battery)
        tempText = overlayView?.findViewById(R.id.overlay_temp)
        suitabilityText = overlayView?.findViewById(R.id.overlay_suitability)
        footerText = overlayView?.findViewById(R.id.overlay_footer)
        closeBtn = overlayView?.findViewById(R.id.overlay_close)
        callIcon = overlayView?.findViewById(R.id.overlay_call_icon)

        footerText?.text = "Powered by Coolbatt"

        val layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        )

        layoutParams.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
        layoutParams.y = 200

        closeBtn?.setOnClickListener { stopSelf() }

        windowManager?.addView(overlayView, layoutParams)

        overlayView?.setOnTouchListener(object : View.OnTouchListener {
            private var initialX = 0
            private var initialY = 0
            private var touchX = 0f
            private var touchY = 0f

            override fun onTouch(v: View?, event: MotionEvent): Boolean {
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = layoutParams.x
                        initialY = layoutParams.y
                        touchX = event.rawX
                        touchY = event.rawY
                        return true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        layoutParams.x = initialX + (event.rawX - touchX).toInt()
                        layoutParams.y = initialY + (event.rawY - touchY).toInt()
                        windowManager?.updateViewLayout(overlayView, layoutParams)
                        return true
                    }
                }
                return false
            }
        })

        updateUI(callState)
    }

    private fun updateUI(callState: String) {
        titleText?.text = when (callState) {
            "RINGING" -> "📞 Incoming Call"
            "OFFHOOK" -> "📶 Call in Progress"
            else -> "📞 Call Active"
        }

        callIcon?.setImageResource(
            when (callState) {
                "RINGING" -> android.R.drawable.sym_call_incoming
                "OFFHOOK" -> android.R.drawable.sym_call_outgoing
                else -> android.R.drawable.ic_menu_call
            }
        )

        updateBatteryStats()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val callState = intent?.getStringExtra("STATE") ?: "Active"

        // Always show overlay as floating window (works on lock & unlocked)
        setupOverlay(callState)
        handler.post(updateRunnable)

        return START_STICKY
    }

    private fun updateBatteryStats() {
        val intent = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val batteryPct = if (level >= 0 && scale > 0) (level * 100 / scale.toFloat()).toInt() else -1
        val rawTemp = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
        val tempC = if (rawTemp >= 0) rawTemp / 10.0f else -1f

        batteryText?.text = if (batteryPct >= 0) "Battery Level: $batteryPct%" else "--%"
        tempText?.text = if (tempC >= 0) "Phone Temperature: ${tempC}°C" else "--°C"
        suitabilityText?.text = if (tempC in 0f..39f) "✅ Suitable to Take Call" else "⚠️ System Overheat"
    }

    override fun onDestroy() {
        super.onDestroy()
        overlayView?.let {
            try {
                if (it.parent != null) windowManager?.removeView(it)
            } catch (_: Exception) {}
        }
        overlayView = null
        handler.removeCallbacks(updateRunnable)
    }
}
