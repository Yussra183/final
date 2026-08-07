/**
 * AdminAvatar — colored circle avatar showing initials. Used in tables
 * wherever a user/contact name needs to be visualized. Color is derived
 * from the initials so different roles look distinct.
 */
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

interface Props {
  name: string;
  size?: number;
  style?: ViewStyle | ViewStyle[];
}

function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) % 360;
  }
  return h;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function AdminAvatar({ name, size = 36, style }: Props) {
  const hue = hashHue(name);
  const bg = `hsl(${hue}, 65%, 92%)`;
  const fg = `hsl(${hue}, 55%, 28%)`;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text
        style={{
          color: fg,
          fontWeight: "800",
          fontSize: size * 0.38,
        }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}
