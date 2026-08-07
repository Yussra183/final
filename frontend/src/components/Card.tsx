import React from "react";
import { StyleSheet, StyleProp, View, ViewProps, ViewStyle } from "react-native";
import { Colors, Radius, Spacing } from "../../constants/colors";

interface Props extends ViewProps {
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ padded = true, style, children, ...rest }: Props) {
  return (
    <View {...rest} style={[styles.card, padded && styles.padded, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    boxShadow: "0 4px 8px rgba(0,0,0,0.08)",
  },
  padded: {
    padding: Spacing.lg,
  },
});
