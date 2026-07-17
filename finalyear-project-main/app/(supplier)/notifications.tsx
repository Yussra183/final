/**
 * Notifications — supplier-side feed. Combines notifications that the
 * logistics module generated (trip started, seller alerted, near your
 * shop, trip completed) with any admin/system alerts.
 */
import React from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { EmptyState } from "../../src/components/EmptyState";
import { NotificationItem } from "../../constants/types";

export default function SupplierNotifications() {
  const { session, getNotificationsForUser, markNotificationRead } = useStore();
  const user = session?.user!;
  const items = getNotificationsForUser(user.id);

  return (
    <SidebarLayout>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>
              {items.length} total • {items.filter((i) => !i.read).length} unread
            </Text>
          </View>
        </View>

        {items.length === 0 ? (
          <View style={{ padding: Spacing.lg }}>
            <EmptyState
              icon="🔔"
              title="No notifications yet"
              message="Trip events will appear here as soon as you start a delivery."
            />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
            renderItem={({ item }) => <NotificationRow item={item} onPress={() => markNotificationRead(item.id)} />}
          />
        )}
      </SafeAreaView>
    </SidebarLayout>
  );
}

function NotificationRow({ item, onPress }: { item: NotificationItem; onPress: () => void }) {
  const tone = (() => {
    switch (item.type) {
      case "near_arrival":
        return { color: Colors.accent, icon: "location-outline" as const };
      case "trip_started":
        return { color: Colors.supplier, icon: "play-outline" as const };
      case "trip_completed":
        return { color: Colors.success, icon: "checkmark-circle-outline" as const };
      case "delivery":
        return { color: Colors.info, icon: "car-outline" as const };
      default:
        return { color: Colors.textSecondary, icon: "notifications-outline" as const };
    }
  })();
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Card style={[styles.card, !item.read && styles.unread]}>
        <View style={styles.row}>
          <View style={[styles.iconBox, { backgroundColor: tone.color + "22" }]}>
            <Ionicons name={tone.icon} size={18} color={tone.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text style={[styles.itemTitle, !item.read && { color: Colors.text }]}>
                {item.title}
              </Text>
              {!item.read ? <View style={styles.unreadDot} /> : null}
            </View>
            <Text style={styles.itemMessage}>{item.message}</Text>
            <Text style={styles.itemTime}>{formatTime(item.createdAt)}</Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.text },
  subtitle: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  card: {
    padding: Spacing.md,
  },
  unread: {
    backgroundColor: "#EEF2FF",
  },
  row: { flexDirection: "row", alignItems: "flex-start" },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemTitle: { fontWeight: "800", color: Colors.text, fontSize: FontSize.sm },
  itemMessage: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 4 },
  itemTime: { color: Colors.textMuted, fontSize: 10, marginTop: 4, fontWeight: "700" },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.supplier,
  },
});