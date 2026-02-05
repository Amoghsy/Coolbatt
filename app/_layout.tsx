import { Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  NativeModules,
  NativeEventEmitter,
  PermissionsAndroid,
  Platform,
} from "react-native";

import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import * as BackgroundFetch from "expo-background-fetch";
import * as Battery from "expo-battery";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { requestNotificationPermissions } from "../utils/permissions";
import { initDatabase } from "../utils/database";
import { recordBatteryLevel } from "../utils/battery";
import { ThemeProvider } from "./ThemeContext";

// ===== Notification handler =====
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ===== Background fetch task for battery stats =====
const BATTERY_MONITORING_TASK = "BATTERY-MONITORING-TASK";
TaskManager.defineTask(BATTERY_MONITORING_TASK, async () => {
  try {
    const percentage = await recordBatteryLevel();
    if (percentage !== null) {
      console.log(`📊 Recorded battery level: ${percentage}%`);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error("⚠️ Error in background battery monitoring task:", error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});
async function registerBatteryMonitoringTask() {
  try {
    await BackgroundFetch.registerTaskAsync(BATTERY_MONITORING_TASK, {
      minimumInterval: 300,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log("✅ Battery monitoring task registered");
  } catch (error) {
    console.error("⚠️ Error registering battery monitoring task:", error);
  }
}

// ===== Native modules =====
const { RNCallDetection, OverlayModule, BatteryModule, BatteryServiceModule } =
  NativeModules;

const callDetectionEmitter = RNCallDetection
  ? new NativeEventEmitter(RNCallDetection)
  : null;

async function ensurePhonePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      {
        title: "Phone Permission",
        message: "This app needs access to phone state to detect calls.",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK",
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.error("⚠️ Permission request failed:", err);
    return false;
  }
}

// ===== Helpers =====
function getSuitabilityText(temp: number | null) {
  if (temp == null) return "Battery temp unavailable";
  return temp < 40
    ? "✅ Suitable to take calls"
    : "⚠️ Not suitable to take calls";
}

async function getNormalizedTemp(): Promise<number | null> {
  try {
    if (BatteryModule?.getBatteryStats) {
      const stats = await BatteryModule.getBatteryStats();
      const normalized =
        stats?.temperature != null && stats.temperature >= 0
          ? stats.temperature
          : null;
      console.log("🔎 getNormalizedTemp:", stats?.temperature, "=>", normalized);
      return normalized;
    }
  } catch (err) {
    console.error("⚠️ Failed to fetch native battery stats:", err);
  }
  return null;
}

export default function RootLayout() {
  const [isCallActive, setIsCallActive] = useState(false);
  const callIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let callSub: any;
    let batterySub: any;
    let notifSub: any;

    const setup = async () => {
      try {
        await initDatabase();
        await registerBatteryMonitoringTask();

        // Ask notification permission (only once after install)
        const promptShown = await AsyncStorage.getItem("ALERT_PROMPT_SHOWN");
        if (!promptShown) {
          console.log("🔔 Requesting notification permissions…");
          await requestNotificationPermissions();
          await AsyncStorage.setItem("ALERT_PROMPT_SHOWN", "true");
        }

        // Request overlay permission (Android)
        if (
          Platform.OS === "android" &&
          OverlayModule?.requestOverlayPermission
        ) {
          console.log("🪟 Requesting overlay permission…");
          OverlayModule.requestOverlayPermission();
        }

        // Start background battery service automatically
        if (Platform.OS === "android" && BatteryServiceModule?.startService) {
          BatteryServiceModule.startService();
          console.log("✅ Battery service started");
        }

        // Foreground call overlay
        if (RNCallDetection && callDetectionEmitter) {
          const ok = await ensurePhonePermissions();
          if (!ok) return;

          await RNCallDetection.startListening();
          callSub = callDetectionEmitter.addListener(
            "callDetection:stateChanged",
            async (state: string) => {
              console.log("📞 Call state:", state);
              await AsyncStorage.setItem("CALL_STATE", state);

              if (state === "RINGING" || state === "OFFHOOK") {
                setIsCallActive(state === "OFFHOOK");

                const latestTemp = await getNormalizedTemp();
                const suitability = getSuitabilityText(latestTemp);

                console.log("📱 Showing overlay:", state, suitability);
                OverlayModule?.showOverlay(`${state} | ${suitability}`);

                if (state === "OFFHOOK" && !callIntervalRef.current) {
                  callIntervalRef.current = setInterval(async () => {
                    const temp = await getNormalizedTemp();
                    console.log("⏱ Interval overlay update:", temp);
                    OverlayModule?.showOverlay(
                      `${state} | ${getSuitabilityText(temp)}`
                    );
                  }, 60_000);
                }
              }

              if (state === "IDLE") {
                setIsCallActive(false);
                if (callIntervalRef.current) {
                  clearInterval(callIntervalRef.current);
                  callIntervalRef.current = null;
                }
                console.log("📱 Hiding overlay (IDLE)");
                OverlayModule?.hideOverlay();
              }
            }
          );
        }

        // Battery charging/unplug notifications
        batterySub = Battery.addBatteryStateListener(async ({ batteryState }) => {
          console.log("🔋 Battery state changed:", batteryState);
          try {
            const alertsPref = await AsyncStorage.getItem("BATTERY_ALERTS");
            const enabled = alertsPref === "true";
            console.log("🔎 BATTERY_ALERTS enabled?", enabled);
            if (!enabled) return;

            const latestTemp = await getNormalizedTemp();
            const suitability = getSuitabilityText(latestTemp);

            if (batteryState === Battery.BatteryState.CHARGING) {
              console.log("⚡ Sending CHARGING notification");
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: "⚡ Device is Charging",
                  body:
                    latestTemp != null
                      ? `Battery Temp: ${latestTemp}°C\n${suitability}`
                      : "Your device is now charging.",
                },
                trigger: null,
              });
            } else if (batteryState === Battery.BatteryState.UNPLUGGED) {
              console.log("🔌 Sending UNPLUGGED notification");
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: "🔌 Charging Stopped",
                  body:
                    latestTemp != null
                      ? `Battery Temp: ${latestTemp}°C\n${suitability}`
                      : "Device is no longer charging.",
                },
                trigger: null,
              });
            }
          } catch (err) {
            console.error("⚠️ Error handling battery notification:", err);
          }
        });

        notifSub = Notifications.addNotificationReceivedListener((n) => {
          console.log("📩 Notification received:", n);
        });
      } catch (e) {
        console.error("⚠️ RootLayout setup error:", e);
      }
    };

    setup();

    return () => {
      callSub?.remove?.();
      if (RNCallDetection?.stopListening) RNCallDetection.stopListening();
      if (callIntervalRef.current) {
        clearInterval(callIntervalRef.current);
        callIntervalRef.current = null;
      }
      OverlayModule?.hideOverlay?.();
      batterySub?.remove?.();
      notifSub?.remove?.();
    };
  }, []);

  return (
    <ThemeProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}