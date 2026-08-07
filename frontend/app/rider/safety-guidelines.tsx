import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { LogoutButton } from "../../src/components/LogoutButton";

interface Guideline {
  icon: string;
  title: string;
  body: string;
}

const GUIDELINES: Guideline[] = [
  {
    icon: "🪖",
    title: "Helmet & gear",
    body: "Always wear a certified helmet and reflective vest, even for short trips.",
  },
  {
    icon: "🛵",
    title: "Vehicle check",
    body: "Inspect brakes, tyres, lights and mirrors before starting your shift.",
  },
  {
    icon: "🔥",
    title: "Handle cylinders with care",
    body: "Keep gas cylinders upright, valves sealed, and never expose them to heat or open flame.",
  },
  {
    icon: "🌧️",
    title: "Weather awareness",
    body: "Slow down on wet roads and never transport cylinders during lightning storms.",
  },
  {
    icon: "🤝",
    title: "Customer privacy",
    body: "Photograph delivery proof only — never share customer details or location on social media.",
  },
  {
    icon: "🚨",
    title: "Emergency contacts",
    body: "Call 114 (police) or 115 (ambulance) for emergencies. Report incidents in-app immediately.",
  },
];

export default function SafetyGuidelines() {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScreenHeader
        title="Safety Guidelines"
        subtitle="Reviewed before every shift"
        left={<DrawerMenuButton />}
        right={<LogoutButton />}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        <View style={{ paddingHorizontal: Spacing.lg }}>
          {GUIDELINES.map((g) => (
            <Card key={g.title} style={{ marginBottom: Spacing.sm }}>
              <View style={styles.row}>
                <Text style={styles.icon}>{g.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{g.title}</Text>
                  <Text style={styles.body}>{g.body}</Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start" },
  icon: { fontSize: 28, marginRight: Spacing.md, marginTop: 2 },
  title: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  body: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
});