import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors, FontSize, Spacing } from "../../constants/colors";

interface Props {
  title: string;
  subtitle?: string;
  /** Optional node rendered on the left (e.g. a drawer hamburger button). */
  left?: React.ReactNode;
  /** Optional node rendered on the right (e.g. an avatar or action). */
  right?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, left, right }: Props) {
  return (
    <View style={styles.wrap}>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.text,
  },
  sub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
