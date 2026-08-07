import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { PulseDot } from "../../src/components/MicroAnimations";
import { formatDateTime } from "../../src/utils/format";
import { NotificationItem } from "../../constants/types";

/**
 * Pick the right Ionicons name + colour for a notification type so
 * the feed reads as one consistent visual system. We resolve the icon
 * here, in the component layer, so any new notification kind only
 * needs to be added in one place.
 */
const TYPE_META: Record<
  NotificationItem["type"],
  { icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string }
> = {
  order: { icon: "cube-outline", bg: "#CCFBF1", fg: Colors.primary },
  delivery: { icon: "bicycle-outline", bg: "#FEF3C7", fg: "#B45309" },
  permit: { icon: "document-text-outline", bg: "#DBEAFE", fg: "#1D4ED8" },
  stock: { icon: "warning-outline", bg: "#FEE2E2", fg: "#B91C1C" },
  system: { icon: "notifications-outline", bg: Colors.surfaceMuted, fg: Colors.textSecondary },
  near_arrival: {
    icon: "location-outline",
    bg: "#FEF3C7",
    fg: "#B45309",
  },
  trip_started: { icon: "play-circle-outline", bg: "#DCFCE7", fg: "#047857" },
  trip_completed: {
    icon: "checkmark-done-outline",
    bg: "#DCFCE7",
    fg: "#047857",
  },
};

export default function NotificationsScreen() {
  const { session, getNotificationsForUser, markNotificationRead } = useStore();
  const user = session?.user!;
  const list = getNotificationsForUser(user.id);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Notifications",
          headerStyle: { backgroundColor: Colors.surface },
          headerTitleStyle: { color: Colors.text },
          headerTintColor: Colors.primary,
        }}
      />
      <FlatList
        data={list}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: Spacing.lg }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <EmptyState
            icon="🔕"
            title="No notifications"
            message="You're all caught up!"
          />
        }
        renderItem={({ item }) => <NotificationRow item={item} onPress={() => markNotificationRead(item.id)} />}
      />
    </View>
  );
}

interface RowProps {
  item: NotificationItem;
  onPress: () => void;
}

/**
 * Single notification row — extracted so we can use local animation
 * refs without re-mounting the full list.
 */
function NotificationRow({ item, onPress }: RowProps) {
  const meta = TYPE_META[item.type] ?? TYPE_META.system;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide]);

  return (
    <Animated.View
      style={{
        opacity: slide,
        transform: [
          {
            translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
          },
        ],
      }}
    >
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        <Card
          style={[
            {
              borderLeftWidth: 4,
              borderLeftColor: item.read ? Colors.border : Colors.primary,
            },
          ]}
        >
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
              <Ionicons name={meta.icon} size={20} color={meta.fg} />
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{item.title}</Text>
                {!item.read ? <PulseDot size={9} color={Colors.primary} /> : null}
              </View>
              <Text style={styles.message}>{item.message}</Text>
              <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start" },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.md,
    flex: 1,
  },
  message: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  time: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 6,
  },
});
