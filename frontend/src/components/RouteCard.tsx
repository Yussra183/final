/**
 * src/components/RouteCard.tsx
 *
 * Compact card used on the Delivery Routes list. Shows the route name,
 * its weekly schedule (day + time), stop count, and active toggle.
 */
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { DeliveryRoute } from "../../constants/types";
import { Card } from "./Card";

interface Props {
  route: DeliveryRoute;
  onPress?: () => void;
}

export function RouteCard({ route, onPress }: Props) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconBox}>
            <Ionicons name="map-outline" size={20} color={Colors.supplier} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{route.name} Route</Text>
            <Text style={styles.meta}>
              Every {route.scheduleDay} at {route.scheduleTime}
            </Text>
          </View>
          <View style={styles.right}>
            <View style={[styles.badge, { backgroundColor: route.active ? "#CCFBF1" : "#FEE2E2" }]}>
              <Text style={[styles.badgeText, { color: route.active ? Colors.primary : "#B91C1C" }]}>
                {route.active ? "Active" : "Paused"}
              </Text>
            </View>
            <Text style={styles.stops}>{route.stops.length} stops</Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  meta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: "600",
  },
  right: {
    alignItems: "flex-end",
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  stops: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: "700",
  },
});
