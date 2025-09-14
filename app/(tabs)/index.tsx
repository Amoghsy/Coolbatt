import { useState, useEffect, useContext } from "react";
import messaging from '@react-native-firebase/messaging';
import {
  PermissionsAndroid,
  Platform,
  Dimensions,
  PixelRatio,
  NativeEventEmitter,
  NativeModules,
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import DeviceInfo from "react-native-device-info";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import BatteryCharging from "@/components/BatteryCharging";
import { VERCELSERVER_URL } from '../config/server';
import { ThemeContext } from "../ThemeContext";
import * as IntentLauncher from "expo-intent-launcher";
const { BatteryModule } = NativeModules;
const BATTERY_TASK = "BATTERY_TASK";

const SERVER_URL = VERCELSERVER_URL ;
TaskManager.defineTask(BATTERY_TASK, async () => {
  try {
    const charging = (await DeviceInfo.isBatteryCharging()) ?? false;
    const level = (await DeviceInfo.getBatteryLevel()) ?? 0;

    // 🔥 Use native battery temperature, fallback to approximation
   let temp = 0;

try {
  if (Platform.OS === "android" && BatteryModule?.getBatteryStats) {
    const stats = await BatteryModule.getBatteryStats();
    temp = stats.temperature; // ✅ only temperature
  } else {
    throw new Error("BatteryModule.getBatteryStats unavailable");
  }
} catch (err) {
  console.log("❌ Native battery temperature error (background):", err);
  temp = 25 + (1 - level) * 10;; // fallback default
}

    const todayStr = new Date().toISOString().split("T")[0];
    const lastNotified = await AsyncStorage.getItem("HIGH_TEMP_NOTIFIED");
    const lastCharging = await AsyncStorage.getItem("LAST_CHARGING_STATE");

    // 🔌 Notify on charging state change
    if (lastCharging === null || (lastCharging === "true") !== charging) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: charging ? "🔌 Charger Connected" : "⚡ Charger Disconnected",
          body: charging
            ? `Your device is now charging. ${temp.toFixed(1)}°C`
            : "Your device stopped charging.",
        },
        trigger: null,
      });
    }

    await AsyncStorage.setItem("LAST_CHARGING_STATE", charging.toString());

    // 🌡️ High temp warning (realistic threshold)
    if (charging && temp >= 45 && lastNotified !== todayStr) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "⚠️ High Temperature",
          body: `Device temperature is ${temp.toFixed(1)}°C while charging!`,
        },
        trigger: null,
      });

      await AsyncStorage.setItem("HIGH_TEMP_NOTIFIED", todayStr);

      // Try sending high-temp to server
      try {
        const fcmToken = await messaging().getToken();
        if (fcmToken) {
          await fetch(`${SERVER_URL}/event/high-temp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: fcmToken, temperature: temp }),
          });
        } else {
          console.log("⚠️ No FCM token available in background");
        }
      } catch (err) {
        console.log("❌ Error sending high-temp to server:", err);
      }
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.log("❌ Background task error:", e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export default function Index() {
  const theme = useContext(ThemeContext);

  const [deviceInfo, setDeviceInfo] = useState({
    batteryLevel: 0,
    deviceName: "device_name",
    memoryUsage: 0,
    totalMemory: 0,
    batteryCharging: false,
    cpuUsage: 0,
    uptime: 0,
    temperature: 0,
    storageUsed: 0,
    totalStorage: 0,
    carrier: "",
    ipAddress: "",
  });
  const [batteryTempNative, setBatteryTempNative] = useState<number | null>(null);
  const [showCall, setShowCall] = useState(false);

  const { width, height } = Dimensions.get("window");
  const pixelDensity = PixelRatio.get();
  const resolution = `${Math.round(width * pixelDensity)} x ${Math.round(height * pixelDensity)}`;

  const updateDailyUptime = async () => {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const lastDate = await AsyncStorage.getItem("LAST_UPTIME_DATE");
      const lastTimestampStr = await AsyncStorage.getItem("LAST_UPTIME_TS");
      const accumulatedStr = await AsyncStorage.getItem("ACCUMULATED_UPTIME");
      const now = Date.now();
      let accumulated = accumulatedStr ? parseFloat(accumulatedStr) : 0;

      if (lastDate === todayStr && lastTimestampStr) {
        const lastTimestamp = parseInt(lastTimestampStr, 10);
        const elapsed = (now - lastTimestamp) / 3600_000; // hrs
        accumulated += elapsed;
      } else {
        accumulated = 0;
      }

      setDeviceInfo((prev) => ({ ...prev, uptime: accumulated }));
      await AsyncStorage.setItem("LAST_UPTIME_DATE", todayStr);
      await AsyncStorage.setItem("LAST_UPTIME_TS", now.toString());
      await AsyncStorage.setItem("ACCUMULATED_UPTIME", accumulated.toString());
    } catch (err) {
      console.log("Error updating uptime:", err);
    }
  };

  const fetchDeviceInfo = async () => {
    try {
      const level = (await DeviceInfo.getBatteryLevel()) ?? 0;
      const dvname = (await DeviceInfo.getDeviceName()) ?? "Unknown";
      const totalMem = (await DeviceInfo.getTotalMemory()) ?? 1;
      let usedMem = 0;
      try { usedMem = (await DeviceInfo.getUsedMemory()) ?? 0; } catch {}
      const charging = (await DeviceInfo.isBatteryCharging()) ?? false;
      const freeDisk = (await DeviceInfo.getFreeDiskStorage()) ?? 0;
      const totalDisk = (await DeviceInfo.getTotalDiskCapacity()) ?? 1;
      const carrierName = (await DeviceInfo.getCarrier()) ?? "";

      const cpuLoad = (usedMem / totalMem) * 100;

      // 🔥 Native temp with fallback
     let temp: number | null = null;
try {
  if (Platform.OS === "android" && BatteryModule?.getBatteryStats) {
    const stats = await BatteryModule.getBatteryStats();
    temp = stats?.temperature ?? null; 
    setBatteryTempNative(temp);
  } else {
    throw new Error("BatteryModule.getBatteryStats unavailable");
  }
} catch (err) {
  console.log("❌ Native battery temperature error:", err);
  temp =
    25 +
    (cpuLoad / 100) * 20 +
    (1 - level) * 10 +
    deviceInfo.uptime * 0.5; // fallback
}


      let ip = "DEVICE_IP";
      try {
        const res = await fetch("DEVICE IP");
        const data = await res.json();
        ip = data.ip || "DEVICE_IP";
      } catch {}

      const updatedInfo = {
        batteryLevel: level * 100,
        deviceName: dvname,
        memoryUsage: usedMem / 1024 / 1024,
        totalMemory: totalMem / 1024 / 1024,
        batteryCharging: charging,
        cpuUsage: cpuLoad,
        temperature: temp ?? 0,
        storageUsed: (totalDisk - freeDisk) / 1024 / 1024 / 1024,
        totalStorage: totalDisk / 1024 / 1024 / 1024,
        carrier: carrierName,
        ipAddress: ip,
        uptime: deviceInfo.uptime,
      };

      setDeviceInfo(updatedInfo);

      // Battery history
      try {
        const historyRaw = await AsyncStorage.getItem("BATTERY_STATS_HISTORY");
        let history = historyRaw ? JSON.parse(historyRaw) : [];
        history.push({
          time: new Date().toISOString(),
          battery_percentage: updatedInfo.batteryLevel,
          battery_temperature: updatedInfo.temperature,
        });
        if (history.length > 200) history = history.slice(-200);
        await AsyncStorage.setItem("BATTERY_STATS_HISTORY", JSON.stringify(history));
      } catch (err) {
        console.log("Error saving history:", err);
      }

      await updateDailyUptime();
    } catch (e) {
      console.log("Device info error:", e);
    }
  };

  useEffect(() => {
    fetchDeviceInfo();
    const interval = setInterval(fetchDeviceInfo, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowCall(true), 10000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const eventEmitter = new NativeEventEmitter(NativeModules.DeviceInfo);
    const subscription = eventEmitter.addListener("RNDeviceInfo_powerStateDidChange", async (state) => {
      if (state?.batteryState) {
        const charging = state.batteryState === "charging";
        const lastCharging = await AsyncStorage.getItem("LAST_CHARGING_STATE");
        if (lastCharging !== null) {
          const prev = lastCharging === "true";
          if (prev !== charging) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: charging ? "🔌 Charger Connected" : "⚡ Charger Disconnected",
                body: charging ? "Your device is now charging." : "Your device stopped charging.",
              },
              trigger: null,
            });
          }
        }
        await AsyncStorage.setItem("LAST_CHARGING_STATE", charging.toString());
      }
    });
    return () => subscription.remove();
  }, []);

  // 🔥 FCM + Background Fetch
  useEffect(() => {
    const initNotifications = async () => {
      try {
        if (Platform.OS === "android") {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
        } else {
          const { status } = await Notifications.requestPermissionsAsync();
          if (status !== "granted") return;
        }

        await messaging().registerDeviceForRemoteMessages();
        const fcmToken = await messaging().getToken();
        console.log("FCM Token:", fcmToken);

        const response = await fetch(`${SERVER_URL}/register-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: fcmToken }),
        });
        const data = await response.json();
        console.log("Server response:", data);

        messaging().onMessage(async remoteMessage => {
          console.log("Foreground FCM message:", remoteMessage);
          await Notifications.scheduleNotificationAsync({
            content: {
              title: remoteMessage.notification?.title || "Notification",
              body: remoteMessage.notification?.body || "",
            },
            trigger: null,
          });
        });

      } catch (error) {
        console.log("Error initializing notifications or sending token:", error);
      }
    };

    initNotifications();
  }, []);

  const handleOptimizeBattery = async () => {
    if (Platform.OS === "android") {
      try {
        await IntentLauncher.startActivityAsync("android.intent.action.POWER_USAGE_SUMMARY");
      } catch { console.log("Cannot open battery settings"); }
    }
  };

  return (
    <>
      <ScrollView style={{ backgroundColor: theme.colors.background }}>
        <Text style={{ fontSize: 15, textAlign: "center", margin: 10, color: theme.colors.text }}>
          <FontAwesome name="bolt" /> Welcome,{" "}
          <Text style={{ color: theme.colors.green }}>{deviceInfo.deviceName}</Text>
        </Text>

        {/* Optimize button */}
        <View style={{ alignItems: "center", marginVertical: 10 }}>
          <TouchableOpacity
            style={[styles.optimizeButton, { backgroundColor: theme.colors.green }]}
            onPress={handleOptimizeBattery}
          >
            <FontAwesome name="leaf" size={16} color="white" />
            <Text style={styles.optimizeButtonText}> Optimize Battery </Text>
          </TouchableOpacity>
        </View>

        {/* Battery + RAM */}
        <View style={[styles.info, { backgroundColor: theme.colors.card }]}>
          <Text style={{ color: theme.colors.text }}>
            <FontAwesome name="battery" /> Battery Level:{" "}
            <Text style={{ color: theme.colors.green }}>{deviceInfo.batteryLevel.toPrecision(4)}%</Text>
          </Text>
          <Text style={{ color: theme.colors.text }}>
            <FontAwesome name="microchip" /> RAM Usage:{" "}
            <Text style={{ color: theme.colors.green }}>
              {((deviceInfo.memoryUsage / deviceInfo.totalMemory) * 100).toFixed(2)}% | {deviceInfo.memoryUsage.toFixed(0)}/{deviceInfo.totalMemory.toFixed(0)} MB
            </Text>
          </Text>
        </View>

        {deviceInfo.batteryCharging && <BatteryCharging batteryLevel={deviceInfo.batteryLevel} />}

        {/* System Resources */}
        <View style={[styles.info, { backgroundColor: theme.colors.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.grey }]}>System Resources</Text>
          <Text style={[styles.statItem, { color: theme.colors.text }]}>
            <FontAwesome name="microchip" /> CPU Usage:{" "}
            <Text style={[styles.statValue, { color: theme.colors.green }]}>{deviceInfo.cpuUsage.toFixed(1)}%</Text>
          </Text>
          <Text style={[styles.statItem, { color: theme.colors.text }]}>
            <FontAwesome name="thermometer-half" /> Battery Temperature:{" "}
            <Text style={[styles.statValue, { color: theme.colors.green }]}>{batteryTempNative !== null ? batteryTempNative.toFixed(1) : deviceInfo.temperature.toFixed(1)}°C</Text>
          </Text>
          <Text style={[styles.statItem, { color: theme.colors.text }]}>
            <FontAwesome name="clock-o" /> Uptime:{" "}
            <Text style={[styles.statValue, { color: theme.colors.green }]}>
              {Math.floor(deviceInfo.uptime)} hrs {Math.floor((deviceInfo.uptime % 1) * 60)} min
            </Text>
          </Text>
          <Text style={[styles.statItem, { color: theme.colors.text }]}>
            <FontAwesome name="hdd-o" /> Storage:{" "}
            <Text style={[styles.statValue, { color: theme.colors.green }]}>
              {((deviceInfo.storageUsed / deviceInfo.totalStorage) * 100).toFixed(2)}% | {deviceInfo.storageUsed.toFixed(2)}/{deviceInfo.totalStorage.toFixed(2)} GB
            </Text>
          </Text>
        </View>

        {/* Display Info */}
        <View style={[styles.info, { backgroundColor: theme.colors.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.grey }]}>Display Information</Text>
          <Text style={[styles.statItem, { color: theme.colors.text }]}>
            <FontAwesome name="tv" /> Resolution:{" "}
            <Text style={[styles.statValue, { color: theme.colors.green }]}>{resolution}</Text>
          </Text>
          <Text style={[styles.statItem, { color: theme.colors.text }]}>
            <FontAwesome name="expand" /> Screen Size:{" "}
            <Text style={[styles.statValue, { color: theme.colors.green }]}>{Math.round(width)} x {Math.round(height)} dp</Text>
          </Text>
          <Text style={[styles.statItem, { color: theme.colors.text }]}>
            <FontAwesome name="eye" /> Pixel Density:{" "}
            <Text style={[styles.statValue, { color: theme.colors.green }]}>{pixelDensity}x</Text>
          </Text>
        </View>

        {/* Network Info */}
        <View style={[styles.info, { backgroundColor: theme.colors.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.grey }]}>Network Information</Text>
          <Text style={[styles.statItem, { color: theme.colors.text }]}>
            <FontAwesome name="signal" /> Carrier:{" "}
            <Text style={[styles.statValue, { color: theme.colors.green }]}>{deviceInfo.carrier || "Unknown"}</Text>
          </Text>
          <Text style={[styles.statItem, { color: theme.colors.text }]}>
            <FontAwesome name="wifi" /> IP Address:{" "}
            <Text style={[styles.statValue, { color: theme.colors.green }]}>{deviceInfo.ipAddress || "Not connected"}</Text>
          </Text>
        </View>
      </ScrollView>

      
      
    </>
  );
}

const styles = StyleSheet.create({
  info: {
    borderRadius: 15,
    padding: 10,
    marginHorizontal: 30,
    marginVertical: 15,
  },
  sectionTitle: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  statItem: {
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  statValue: { fontWeight: "500" },
  optimizeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  optimizeButtonText: {
    color: "white",
    fontWeight: "bold",
    marginLeft: 8,
  },
});
