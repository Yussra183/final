/**
 * src/components/VehicleRow.tsx
 *
 * Compact row for the Vehicles screen. Shows plate, model, capacity, and
 * an active toggle.
 */
import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Vehicle } from "../../constants/types";
import { Card } from "./Card";

interface Props {
  vehicle: Vehicle;
  onToggle?: (active: boolean) => void;
}

export function VehicleRow({ vehicle, onToggle }: Props) {
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconBox}>
          <Ionicons name="bus-outline" size={20} color={Colors.supplier} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.plate}>{vehicle.plate}</Text>
          <Text style={styles.meta}>
            {vehicle.model} • {vehicle.capacityKg} kg
          </Text>
        </View>
        <Switch
          value={vehicle.active}
          onValueChange={onToggle}
          trackColor={{ true: Colors.supplier, false: Colors.border }}
        />
      </View>
    </Card>
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
  plate: {
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
});
