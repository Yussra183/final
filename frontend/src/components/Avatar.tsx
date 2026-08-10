import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { FontSize } from "../../constants/colors";
import { identityColor } from "../lib/identityColor";

interface Props {
  name: string;
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export function Avatar({ name, size = 40, color, style }: Props) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const bg = color ?? identityColor(name);
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.4 }]}>
        {initials || "?"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: FontSize.md,
  },
});
