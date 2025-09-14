import { useState, useEffect, useContext, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";
import firestore from "@react-native-firebase/firestore";
import messaging from "@react-native-firebase/messaging";
import { ThemeContext } from "../ThemeContext";

interface StatEntry {
  time: Date;
  battery_percentage: number;
  battery_temperature: number;
}

interface BarProps {
  item: StatEntry;
  theme: any;
}

// ------------------ Animated Battery Bar ------------------
const BatteryBar: React.FC<BarProps> = ({ item, theme }) => {
  const height = useSharedValue(0);

  useEffect(() => {
    height.value = withTiming(Math.min(item.battery_percentage * 1.5, 200), {
      duration: 800,
      easing: Easing.out(Easing.exp),
    });
  }, [item.battery_percentage]);

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));

  const barColor =
    item.battery_percentage < 20
      ? styles.criticalBattery
      : item.battery_percentage < 50
      ? styles.warningBattery
      : styles.goodBattery;

  return (
    <View style={styles.barContainer}>
      <Animated.View style={[styles.bar, animatedStyle, barColor]} />
      <Text style={[styles.barLabel, { color: theme.colors.grey }]}>
        {`${item.time.getHours()}:${item.time.getMinutes().toString().padStart(2, "0")}`}
      </Text>
    <Text style={[styles.barValue, { color: theme.colors.text }]}>{Math.round(item.battery_percentage)}%</Text>

    </View>
  );
};

// ------------------ Animated Temperature Bar ------------------
const TempBar: React.FC<BarProps> = ({ item, theme }) => {
  const height = useSharedValue(0);

  useEffect(() => {
    height.value = withTiming((item.battery_temperature - 20) * 10, {
      duration: 800,
      easing: Easing.out(Easing.exp),
    });
  }, [item.battery_temperature]);

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));

  const barColor =
    item.battery_temperature >= 35
      ? styles.hotBattery
      : item.battery_temperature >= 30
      ? styles.warmBattery
      : styles.coolBattery;

  return (
    <View style={styles.barContainer}>
      <Animated.View style={[styles.bar, animatedStyle, barColor]} />
      <Text style={[styles.barLabel, { color: theme.colors.grey }]}>
        {`${item.time.getHours()}:${item.time.getMinutes().toString().padStart(2, "0")}`}
      </Text>
      <Text style={[styles.barValue, { color: theme.colors.text }]}>{Math.round(item.battery_temperature)}°C</Text>
    </View>
  );
};

// ------------------ Main Stats Component ------------------
export default function Stats() {
  const theme = useContext(ThemeContext);
  const [stats, setStats] = useState<StatEntry[]>([]);
  const [sendToFirebase, setSendToFirebase] = useState<boolean>(false);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);

  // Load toggle from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem("SEND_DIAGNOSTICS").then((value) => setSendToFirebase(value === "true"));
  }, []);

  // Get FCM token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const token = await messaging().getToken();
        setDeviceToken(token);
      } catch (e) {
        console.error("Error getting FCM token:", e);
      }
    };
    fetchToken();
  }, []);

  // Generate sample data
  const generateSampleData = async () => {
    const sampleData: StatEntry[] = [];
    const now = new Date();
    for (let i = 0; i < 100; i++) {
      const time = new Date(now.getTime() - i * 5 * 60 * 1000);
      const battery_percentage = Math.floor(Math.random() * 80) + 20;
      const battery_temperature = Math.floor(Math.random() * 15) + 25;
      sampleData.push({ time, battery_percentage, battery_temperature });
    }
    setStats(sampleData);
    await AsyncStorage.setItem("BATTERY_STATS_HISTORY", JSON.stringify(sampleData));
  };

  // Load stats from AsyncStorage
  const loadStats = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem("BATTERY_STATS_HISTORY");
      if (raw) {
       let parsed: StatEntry[] = JSON.parse(raw).map((s: any) => ({
  ...s,
  time: new Date(s.time),
  battery_percentage: Math.round(s.battery_percentage), // round battery level
}));

// Sort newest first
parsed = parsed.sort((a, b) => b.time.getTime() - a.time.getTime());

setStats(parsed);

      } else {
        await generateSampleData();
      }
    } catch (e) {
      console.error("Error loading stats:", e);
      await generateSampleData();
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ------------------ Near real-time polling ------------------
  useEffect(() => {
    let isMounted = true;

   const fetchLatestStats = async () => {
  try {
    const raw = await AsyncStorage.getItem("BATTERY_STATS_HISTORY");
    if (raw && isMounted) {
      let parsed: StatEntry[] = JSON.parse(raw).map((s: any) => ({
  ...s,
  time: new Date(s.time),
  battery_percentage: Math.round(s.battery_percentage),
}));

parsed = parsed.sort((a, b) => b.time.getTime() - a.time.getTime());

setStats(parsed);

      setStats(parsed);
    }
  } catch (e) {
    console.error("Error fetching latest stats:", e);
  }
};


    fetchLatestStats();
    const interval = setInterval(fetchLatestStats, 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // ------------------ Firebase sync ------------------
  useEffect(() => {
    const syncFirebase = async () => {
      if (!sendToFirebase || stats.length === 0 || !deviceToken) return;
      try {
        const today = new Date().toDateString();
        const lastSyncDate = await AsyncStorage.getItem("LAST_SYNC_DATE");
        let syncCount = parseInt((await AsyncStorage.getItem("SYNC_COUNT")) || "0", 10);

        if (lastSyncDate !== today) {
          syncCount = 0;
          await AsyncStorage.setItem("LAST_SYNC_DATE", today);
        }

        if (syncCount >= 2) {
          console.log("✅ Already synced 2 times today, skipping Firebase upload");
          return;
        }

        const latestStats = stats.slice(0, 20);
        const batch = firestore().batch();

        latestStats.forEach((entry) => {
          const ref = firestore()
            .collection("battery_stats")
            .doc(deviceToken)
            .collection("entries")
            .doc(entry.time.toISOString());
          batch.set(ref, {
            battery_percentage: entry.battery_percentage,
            battery_temperature: entry.battery_temperature,
            time: entry.time.toISOString(),
          });
        });

        await batch.commit();
        syncCount += 1;
        await AsyncStorage.setItem("SYNC_COUNT", syncCount.toString());
        console.log(`✅ Firebase sync done (${syncCount}/2 today)`);
      } catch (e) {
        console.error("Error sending data to Firebase:", e);
      }
    };
    syncFirebase();
  }, [stats, sendToFirebase, deviceToken]);

  const getTempTextColor = (temp: number) =>
    temp >= 35 ? styles.hotText : temp >= 30 ? styles.warmText : styles.coolText;

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>
        <FontAwesome name="battery" size={18} /> Battery Statistics
      </Text>

      {/* Battery Level Chart */}
      {stats.length > 0 && (
        <View style={[styles.chartContainer, { backgroundColor: theme.colors.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.grey }]}>Recent Battery Levels</Text>
          <View style={styles.customChart}>
            {stats.slice(0, 12).reverse().map((item, index) => (
              <BatteryBar key={index} item={item} theme={theme} />
            ))}
          </View>
        </View>
      )}

      {/* Battery Level History */}
      <View style={[styles.dataContainer, { backgroundColor: theme.colors.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.grey }]}>
          <FontAwesome name="history" size={14} /> Battery Level History
        </Text>
        {stats.slice(0, 20).map((item, index) => (
          <View key={index} style={styles.dataRow}>
            <Text style={[styles.timeText, { color: theme.colors.text }]}>
              <FontAwesome name="clock-o" size={12} /> {item.time.toLocaleTimeString()} - {item.time.toLocaleDateString()}
            </Text>
            <Text
              style={[
                styles.batteryText,
                item.battery_percentage < 20
                  ? styles.criticalText
                  : item.battery_percentage < 50
                  ? styles.warningText
                  : styles.goodText,
              ]}
            >
              {Math.round(item.battery_percentage)}%

            </Text>
          </View>
        ))}
      </View>

      {/* Temperature Chart */}
      {stats.length > 0 && (
        <View style={[styles.chartContainer, { backgroundColor: theme.colors.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.grey }]}>Recent Battery Temperatures</Text>
          <View style={styles.customChart}>
            {stats.slice(0, 12).reverse().map((item, index) => (
              <TempBar key={index} item={item} theme={theme} />
            ))}
          </View>
        </View>
      )}

      {/* Temperature History */}
      <View style={[styles.dataContainer, { backgroundColor: theme.colors.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.grey }]}>
          <FontAwesome name="history" size={14} /> Battery Temperature History
        </Text>
        {stats.slice(0, 20).map((item, index) => (
          <View key={index} style={styles.dataRow}>
            <Text style={[styles.timeText, { color: theme.colors.text }]}>
              <FontAwesome name="clock-o" size={12} /> {item.time.toLocaleTimeString()} - {item.time.toLocaleDateString()}
            </Text>
            <Text style={[styles.batteryText, getTempTextColor(Math.round(item.battery_temperature))]}>
              {Math.round(item.battery_temperature)}°C
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 20, textAlign: "center", marginTop: 10 },
  chartContainer: {
    marginBottom: 20,
    borderRadius: 15,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  sectionTitle: { fontSize: 14, marginBottom: 12, fontWeight: "bold", textTransform: "uppercase" },
  customChart: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 220, marginVertical: 20 },
  barContainer: { alignItems: "center", flex: 1 },
  bar: { width: 15, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  goodBattery: { backgroundColor: "green" },
  warningBattery: { backgroundColor: "#fb8c00" },
  criticalBattery: { backgroundColor: "red" },
  coolBattery: { backgroundColor: "#4fc3f7" },
  warmBattery: { backgroundColor: "#ffb74d" },
  hotBattery: { backgroundColor: "#e57373" },
  barLabel: { fontSize: 10, marginTop: 5, transform: [{ rotate: "-45deg" }] },
  barValue: { position: "absolute", top: -20, fontSize: 10 },
  dataContainer: {
    borderRadius: 15,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    marginBottom: 20,
  },
  dataRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.1)" },
  timeText: { fontSize: 14 },
  batteryText: { fontSize: 14, fontWeight: "600" },
  goodText: { color: "green" },
  warningText: { color: "#fb8c00" },
  criticalText: { color: "red" },
  coolText: { color: "#4fc3f7" },
  warmText: { color: "#ffb74d" },
  hotText: { color: "#e57373" },
});
