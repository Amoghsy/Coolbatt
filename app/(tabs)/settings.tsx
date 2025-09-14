import { useContext, useEffect, useState } from "react";
import { View, Text, Switch, StyleSheet } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ThemeContext } from "../ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Settings() {
  const theme = useContext(ThemeContext);

  const [batteryAlerts, setBatteryAlerts] = useState(false);
  const [memoryMonitor, setMemoryMonitor] = useState(true);
  const [sendDiagnosticsEnabled, setSendDiagnosticsEnabled] = useState(false);

  // Load saved preferences on mount
  useEffect(() => {
    const loadPrefs = async () => {
      const diagPref = await AsyncStorage.getItem("SEND_DIAGNOSTICS");
      const batteryPref = await AsyncStorage.getItem("BATTERY_ALERTS");

      if (diagPref !== null) setSendDiagnosticsEnabled(diagPref === "true");
      if (batteryPref !== null) setBatteryAlerts(batteryPref === "true");
    };
    loadPrefs();
  }, []);

  // Toggle App Diagnostics
  const toggleDiagnostics = async (value: boolean) => {
    setSendDiagnosticsEnabled(value);
    await AsyncStorage.setItem("SEND_DIAGNOSTICS", value.toString());
    console.log(value ? "📡 Diagnostics enabled" : "🛑 Diagnostics disabled");
  };

  // Toggle Battery Alerts
  const toggleBatteryAlerts = async (value: boolean) => {
    setBatteryAlerts(value);
    await AsyncStorage.setItem("BATTERY_ALERTS", value.toString());
    console.log(value ? "🔔 Battery Alerts enabled" : "🔕 Battery Alerts disabled");
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.header, { color: theme.colors.text }]}>Settings</Text>

      {/* Dark Mode */}
      <View style={[styles.settingRow, { backgroundColor: theme.colors.card }]}>
        <Text style={[styles.settingText, { color: theme.colors.text }]}>
          <FontAwesome name="moon-o" /> Dark Mode
        </Text>
        <Switch
          value={theme.darkMode}
          onValueChange={theme.toggleTheme}
          thumbColor={theme.darkMode ? theme.colors.toggleActive : theme.colors.toggleInactive}
        />
      </View>

      {/* Battery Alerts */}
      <View style={[styles.settingRow, { backgroundColor: theme.colors.card }]}>
        <Text style={[styles.settingText, { color: theme.colors.text }]}>
          <FontAwesome name="battery" /> Battery Alerts
        </Text>
        <Switch
          value={batteryAlerts}
          onValueChange={toggleBatteryAlerts}
          thumbColor={batteryAlerts ? "#4CAF50" : "#ccc"}
        />
      </View>

        {/* App Diagnostics */}
      <View style={[styles.settingRow, { backgroundColor: theme.colors.card }]}>
        <Text style={[styles.settingText, { color: theme.colors.text }]}>
          <FontAwesome name="stethoscope" /> App Diagnostics
        </Text>
        <Switch
          value={sendDiagnosticsEnabled}
          onValueChange={toggleDiagnostics}
          thumbColor={sendDiagnosticsEnabled ? "#4CAF50" : "#ccc"}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    fontSize: 20,
    textAlign: "center",
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    borderRadius: 15,
    marginBottom: 15,
  },
  settingText: {
    fontSize: 16,
  },
});
