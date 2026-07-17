/**
 * src/components/RiderRow.tsx
 *
 * Compact row for the Riders screen. Shows name, phone, license, and
 * an active toggle.
 */
import React from "react";
import { Linking, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Rider } from "../../constants/types";
import { Card } from "./Card";
import { Avatar } from "./Avatar";

interface Props {
  rider: Rider;
  onToggle?: (active: boolean) => void;
}

export function RiderRow({ rider, onToggle }: Props) {
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Avatar name={rider.fullName} size={44} color={Colors.supplier} />
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <Text style={styles.name}>{rider.fullName}</Text>
          <Text style={styles.meta}>License: {rider.licenseNo}</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${rider.phone}`)}
            style={styles.phoneRow}
          >
            <Ionicons name="call-outline" size={12} color={Colors.supplier} />
            <Text style={styles.phone}>{rider.phone}</Text>
          </TouchableOpacity>
        </View>
        <Switch
          value={rider.active}
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
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  phone: {
    fontSize: FontSize.xs,
    color: Colors.supplier,
    marginLeft: 4,
    fontWeight: "700",
  },
});
