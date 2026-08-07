/**
 * AdminCard — surface container with consistent padding, rounded
 * corners and shadow. Used for panels, sections and table wrappers
 * throughout the admin dashboard.
 */
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../../constants/colors";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  padded?: boolean;
}

export function AdminCard({ children, style, padded = true }: Props) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>
      {children}
    </View>
  );
}

interface SectionProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export function AdminCardSection({
  title,
  subtitle,
  action,
  children,
  style,
}: SectionProps) {
  return (
    <AdminCard style={style}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      <View style={{ marginTop: Spacing.md }}>{children}</View>
    </AdminCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  padded: {
    padding: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  sectionSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});