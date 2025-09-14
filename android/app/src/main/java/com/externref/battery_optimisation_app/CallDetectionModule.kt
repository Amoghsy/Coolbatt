package com.externref.battery_optimisation_app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.annotation.RequiresApi
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class CallDetectionModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val telephonyManager =
        reactContext.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

    private var phoneStateListener: PhoneStateListener? = null
    private var telephonyCallback: TelephonyCallback? = null
    private val handler = Handler(Looper.getMainLooper())

    override fun getName() = "RNCallDetection"

    @ReactMethod
    fun startListening(promise: Promise) {
        if (!hasPermission()) {
            promise.reject("NO_PERMISSION", "READ_PHONE_STATE permission not granted")
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            registerTelephonyCallback()
        } else {
            registerPhoneStateListener()
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            telephonyCallback?.let { telephonyManager.unregisterTelephonyCallback(it) }
            telephonyCallback = null
        } else {
            phoneStateListener?.let { telephonyManager.listen(it, PhoneStateListener.LISTEN_NONE) }
            phoneStateListener = null
        }
        promise.resolve(true)
    }

    private fun emitState(state: String) {
        handler.post {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("callDetection:stateChanged", state)
        }
    }

    private fun hasPermission(): Boolean {
        return ActivityCompat.checkSelfPermission(
            reactContext, Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun registerPhoneStateListener() {
        if (phoneStateListener != null) return

        phoneStateListener = object : PhoneStateListener() {
            override fun onCallStateChanged(state: Int, number: String?) {
                when (state) {
                    TelephonyManager.CALL_STATE_IDLE -> emitState("IDLE")
                    TelephonyManager.CALL_STATE_RINGING -> emitState("RINGING")
                    TelephonyManager.CALL_STATE_OFFHOOK -> emitState("OFFHOOK")
                }
            }
        }
        telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun registerTelephonyCallback() {
        if (telephonyCallback != null) return

        val callback = @RequiresApi(Build.VERSION_CODES.S)
        object : TelephonyCallback(), TelephonyCallback.CallStateListener {
            override fun onCallStateChanged(state: Int) {
                when (state) {
                    TelephonyManager.CALL_STATE_IDLE -> emitState("IDLE")
                    TelephonyManager.CALL_STATE_RINGING -> emitState("RINGING")
                    TelephonyManager.CALL_STATE_OFFHOOK -> emitState("OFFHOOK")
                }
            }
        }
        telephonyCallback = callback
        telephonyManager.registerTelephonyCallback(
            { r -> handler.post(r) }, callback
        )
    }
}

