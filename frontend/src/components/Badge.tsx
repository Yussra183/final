import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

interface Props {
  count: number;
  style?: ViewStyle;
}

export function Badge({ count, style }: Props) {
  if (!count) return null;
  return (
    <View style={[styles.box, style]}>
      <Text style={styles.text}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minWidth: 18,
    height: 18,
    borderRadius: Radius.pill,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  text: {
    color: "#FFF",
    fontSize: FontSize.xs,
    fontWeight: "800",
  },
});
