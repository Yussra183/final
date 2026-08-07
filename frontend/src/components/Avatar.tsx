import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Colors, FontSize } from "../../constants/colors";

interface Props {
  name: string;
  size?: number;
  color?: string;
  style?: ViewStyle;
}

function hashColor(name: string) {
  const colors = [
    "#0F766E",
    "#F97316",
    "#6366F1",
    "#10B981",
    "#3B82F6",
    "#EC4899",
    "#8B5CF6",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

export function Avatar({ name, size = 40, color, style }: Props) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const bg = color ?? hashColor(name);
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
