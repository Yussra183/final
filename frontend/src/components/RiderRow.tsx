/**
 * src/components/RiderRow.tsx
 *
 * Compact row for the Riders screen. Shows name, phone, license, and
 * an active toggle.
 *
 * V19 — when the parent supplies `assigned` + `onAssignToggle`, the
 * row renders a second "Assign to my company" pill so the supplier
 * can pick which riders are eligible for Add Route / Edit Route /
 * Start Delivery. The supplier↔rider linkage is what the backend's
 * `requireOwnRider` enforces server-side, so a rider in the global
 * `riders` list but NOT in the supplier's roster cannot be saved as
 * the route's rider.
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
  /** Whether this rider is in the signed-in supplier's roster. */
  assigned?: boolean;
  /** Toggle the supplier↔rider assignment. */
  onAssignToggle?: (assigned: boolean) => void;
}

export function RiderRow({ rider, onToggle, assigned, onAssignToggle }: Props) {
  const showAssign = onAssignToggle != null;
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
          {showAssign ? (
            <TouchableOpacity
              onPress={() => onAssignToggle?.(!assigned)}
              style={[
                styles.assignPill,
                assigned ? styles.assignPillOn : null,
              ]}
              activeOpacity={0.85}
            >
              <Ionicons
                name={assigned ? "checkmark-circle" : "add-circle-outline"}
                size={12}
                color={assigned ? Colors.success : Colors.supplier}
              />
              <Text
                style={[
                  styles.assignText,
                  assigned ? styles.assignTextOn : null,
                ]}
              >
                {assigned ? "Assigned to my company" : "Assign to my company"}
              </Text>
            </TouchableOpacity>
          ) : null}
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
  // V19 — supplier↔rider assign pill. Distinct from the active
  // Switch: an inactive rider cannot be assigned until reactivated,
  // but an assigned rider stays assigned when toggled inactive. This
  // mirrors `seller_riders` row semantics — the link survives the
  // rider's activation flag.
  assignPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  assignPillOn: {
    backgroundColor: Colors.successSoft ?? Colors.surfaceMuted,
    borderColor: Colors.success,
  },
  assignText: {
    fontSize: FontSize.xs,
    color: Colors.supplier,
    fontWeight: "700",
  },
  assignTextOn: {
    color: Colors.success,
  },
});
