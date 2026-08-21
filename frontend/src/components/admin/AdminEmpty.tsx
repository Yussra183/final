/**
 * AdminEmptyState — pretty empty placeholder used by list pages when
 * the search/filter returns nothing.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../../constants/colors";
import { AdminIcon, AdminIconName } from "./Icon";

interface Props {
  icon?: AdminIconName;
  title?: string;
  message?: string;
}

export function AdminEmptyState({
  icon = "documents",
  title = "No records found",
  message = "Try adjusting your search or filters to see results here.",
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <AdminIcon name={icon} size={36} color={Colors.textSecondary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: Spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  iconText: { fontSize: 36 },
  title: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  message: {
    marginTop: 4,
    color: Colors.textSecondary,
    textAlign: "center",
    fontWeight: "600",
    paddingHorizontal: Spacing.xl,
  },
});