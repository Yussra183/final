/**
 * Notifications — supplier-side feed. Combines notifications that the
 * logistics module generated (trip started, seller alerted, near your
 * shop, trip completed) with any admin/system alerts.
 *
 * Tapping a notification:
 *   1. Marks it read (so the dashboard chrome drops the red dot).
 *   2. If `type === "supply"` AND the row still belongs to this
 *      supplier, deep-links to the supply-order details screen
 *      (`/(supplier)/restock/[id]`) using `data.supplyOrderId`. This
 *      is the critical path that turns the supplier notification into
 *      an actionable next step — without it the flow stops at the
 *      notification feed and the supplier cannot accept/reject the
 *      order without first hunting for it in the Restock list.
 */
import React, { useCallback } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { EmptyState } from "../../src/components/EmptyState";
import { NotificationItem } from "../../constants/types";

/**
 * Parse a notification's `data` JSON envelope and return the
 * supply-order id, if the notification is actionable on a supply
 * order. Returns `null` for anything else so the caller can fall
 * through to the mark-read-only path.
 */
function parseSupplyOrderId(data?: string | null): number | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as { supplyOrderId?: unknown };
    if (parsed && typeof parsed.supplyOrderId === "string") {
      const n = Number(parsed.supplyOrderId);
      return Number.isFinite(n) ? n : null;
    }
    if (parsed && typeof parsed.supplyOrderId === "number") {
      return parsed.supplyOrderId;
    }
  } catch {
    // Malformed JSON — treat as non-actionable.
  }
  return null;
}

export default function SupplierNotifications() {
  const router = useRouter();
  const { session, getNotificationsForUser, markNotificationRead } = useStore();
  const user = session?.user!;
  const items = getNotificationsForUser(user.id);

  /**
   * Single tap handler — does mark-read + (optionally) navigation.
   * Splitting the two keeps the UX consistent: every tap clears the
   * unread dot, but only actionable notifications navigate away.
   */
  const openNotification = useCallback(
    (n: NotificationItem) => {
      if (!n.read) {
        void markNotificationRead(n.id);
      }
      // "supply" = the Seller↔Supplier restock flow. The whole point of
      // the notification is to drive the supplier to the supply-order
      // details page so they can act on it.
      if (n.type === "supply" && n.data) {
        const id = parseSupplyOrderId(n.data);
        if (id != null) {
          router.push({
            pathname: "/(supplier)/restock/[id]",
            params: { id: String(id) },
          } as any);
        }
      }
    },
    [markNotificationRead, router],
  );

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
            renderItem={({ item }) => (
              <NotificationRow item={item} onPress={() => openNotification(item)} />
            )}
          />
        )}
      </SafeAreaView>
    </SidebarLayout>
  );
}

function NotificationRow({ item, onPress }: { item: NotificationItem; onPress: () => void }) {
  const tone = (() => {
    switch (item.type) {
      case "supply":
        return { color: Colors.supplier, icon: "cloud-download-outline" as const };
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