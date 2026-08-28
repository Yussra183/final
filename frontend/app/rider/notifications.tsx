/**
 * Rider → Notifications
 *
 * Lists every notification for the signed-in rider grouped into four
 * rider-relevant categories:
 *   - Orders    — order claims, new delivery requests, cancellations.
 *   - Delivery  — pickup confirmations, in-transit updates, arrival.
 *   - Earnings  — payout events, bonus credits.
 *   - System    — permit / verification status changes.
 *
 * Each unread notification shows a colored badge; tapping marks it
 * read via `markNotificationRead()`. Long-press reveals a Delete
 * dialog funnelled through the store action.
 *
 * Mirrors `app/seller/notifications.tsx` for layout, banner, chips,
 * and section grouping — the only differences are the categories and
 * the deep-link target (this page is reachable from the Rider drawer
 * even when the rider is not yet approved, matching the
 * account-level-routes policy in `app/rider/_layout.tsx`).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { Badge } from "../../src/components/Badge";
import { EmptyState } from "../../src/components/EmptyState";
import { useStore } from "../../src/store/StoreContext";
import { formatDateTime } from "../../src/utils/format";
import { NotificationItem } from "../../constants/types";

type CategoryKey = "all" | "order" | "delivery" | "earnings" | "system";

interface CategoryDef {
  key: CategoryKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}

const CATEGORIES: CategoryDef[] = [
  {
    key: "all",
    label: "All",
    icon: "notifications-outline",
    tint: Colors.primary,
  },
  {
    key: "order",
    label: "Orders",
    icon: "bag-add-outline",
    tint: Colors.primary,
  },
  {
    key: "delivery",
    label: "Delivery",
    icon: "car-outline",
    tint: Colors.info,
  },
  {
    key: "earnings",
    label: "Earnings",
    icon: "cash-outline",
    tint: Colors.success,
  },
  {
    key: "system",
    label: "System",
    icon: "information-circle-outline",
    tint: Colors.accent,
  },
];

/**
 * Map a notification's `type` field to one of the four rider-relevant
 * categories. Notifications whose type doesn't match any of those
 * (e.g. a seller-specific stock alert) still appear under "All" but
 * not under a specific chip.
 */
function categoryFor(item: NotificationItem): CategoryKey | null {
  switch (item.type) {
    case "order":
      return "order";
    case "delivery":
      return "delivery";
    case "system":
      return "system";
    default:
      // `earnings` is currently folded into `system` on the backend —
      // surface it as its own bucket when the payload carries the
      // marker (kept as a future-proofing branch).
      return null;
  }
}

/** Notification card with colored unread badge. */
function NotificationCard({
  item,
  onPress,
  onLongPress,
}: {
  item: NotificationItem;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const tint =
    item.type === "order"
      ? Colors.primary
      : item.type === "delivery"
        ? Colors.info
        : item.type === "system"
          ? Colors.accent
          : Colors.textSecondary;

  const iconName: keyof typeof Ionicons.glyphMap =
    item.type === "order"
      ? "bag-add-outline"
      : item.type === "delivery"
        ? "car-outline"
        : item.type === "system"
          ? "information-circle-outline"
          : "notifications-outline";

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      <Card
        style={[
          styles.card,
          !item.read && { borderLeftWidth: 4, borderLeftColor: tint },
        ]}
      >
        <View style={styles.row}>
          <View style={[styles.iconBox, { backgroundColor: tint + "22" }]}>
            <Ionicons name={iconName} size={20} color={tint} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.title,
                  !item.read && { color: Colors.text },
                ]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              {!item.read ? <Badge count={1} /> : null}
            </View>
            <Text style={styles.body} numberOfLines={2}>
              {item.message}
            </Text>
            <Text style={styles.meta}>{formatDateTime(item.createdAt)}</Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

/** Category header used between sections. */
function CategoryHeader({ category, unread }: { category: CategoryDef; unread: number }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <View style={[styles.sectionIcon, { backgroundColor: category.tint + "22" }]}>
          <Ionicons name={category.icon} size={16} color={category.tint} />
        </View>
        <Text style={styles.sectionTitle}>{category.label}</Text>
      </View>
      {unread > 0 ? <Badge count={unread} /> : null}
    </View>
  );
}

export default function RiderNotifications() {
  const router = useRouter();
  const {
    session,
    getNotificationsForUser,
    markNotificationRead,
    deleteNotification,
    markAllNotificationsRead,
    refresh,
  } = useStore();
  const [activeCat, setActiveCat] = useState<CategoryKey>("all");
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Real pull-to-refresh — re-hydrates the shared notifications list
   * from the backend. Mirrors the seller-side implementation: the
   * gesture was already muscle memory and the backend is the source
   * of truth.
   */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const user = session?.user;
  const items = useMemo(
    () => (user ? getNotificationsForUser(user.id) : []),
    [user, getNotificationsForUser],
  );

  /**
   * Flip every unread notification for the signed-in rider to read as
   * soon as the screen mounts. The local state is updated optimistically
   * (the helper does the local flip before the network request) so the
   * drawer badge dot — which subscribes to the same store notifications
   * list — drops immediately, without a refresh or re-mount.
   *
   * Scoped to the rider: the helper only touches notifications whose
   * `userId` matches the signed-in user, and the backend endpoint
   * `POST /api/notifications/read-all` is itself scoped to the
   * authenticated actor's user_id.
   */
  useEffect(() => {
    if (!user) return;
    markAllNotificationsRead(user.id);
    // Intentionally empty deps — re-running on every render would clobber
    // any new unread badge that arrives while the screen is open (which
    // is correct UX: the rider is looking at the feed).
  }, [user, markAllNotificationsRead]);

  // Counts per category — drive the badge in the chip row.
  const counts = useMemo(() => {
    const out: Record<CategoryKey, { total: number; unread: number }> = {
      all: { total: 0, unread: 0 },
      order: { total: 0, unread: 0 },
      delivery: { total: 0, unread: 0 },
      earnings: { total: 0, unread: 0 },
      system: { total: 0, unread: 0 },
    };
    for (const n of items) {
      out.all.total++;
      if (!n.read) out.all.unread++;
      const cat = categoryFor(n);
      if (cat) {
        out[cat].total++;
        if (!n.read) out[cat].unread++;
      }
    }
    return out;
  }, [items]);

  const grouped = useMemo(() => {
    const filterFn = (n: NotificationItem) => {
      if (activeCat === "all") return true;
      return categoryFor(n) === activeCat;
    };
    const filtered = items.filter(filterFn);
    const sections: { key: CategoryKey; list: NotificationItem[] }[] = [];
    if (activeCat === "all") {
      for (const c of CATEGORIES.slice(1)) {
        sections.push({
          key: c.key,
          list: filtered.filter((n) => categoryFor(n) === c.key),
        });
      }
    } else {
      sections.push({ key: activeCat, list: filtered });
    }
    return sections.filter((s) => s.list.length > 0);
  }, [activeCat, items]);

  const totalUnread = counts.all.unread;

  const openNotification = useCallback(
    (n: NotificationItem) => {
      if (!n.read) {
        void markNotificationRead(n.id);
      }
      if (!n.data) return;
      try {
        const parsed = JSON.parse(n.data) as {
          orderId?: string;
        };
        // Order-related notifications (claim reminders, delivery
        // acceptance, status changes) → rider delivery screen. The
        // server hands us the orderId in the payload; the rider
        // app interprets it through the standard query-string
        // contract the drawer already uses.
        if (parsed.orderId) {
          router.push({
            pathname: "/rider/delivery-requests",
            params: { orderId: parsed.orderId },
          } as any);
        }
      } catch {
        // Ignore malformed metadata — marking the notification read
        // is still valid.
      }
    },
    [markNotificationRead, router],
  );

  /**
   * Long-press a notification to reveal Delete / Cancel. Cancel is a
   * no-op; Delete funnels through the store action so the same
   * ownership-aware server call + optimistic UI flip run for every
   * authenticated rider.
   */
  const promptDelete = useCallback(
    (n: NotificationItem) => {
      Alert.alert(
        "Notification options",
        "Delete this notification? It will be removed from your list.",
        [
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              void deleteNotification(n.id);
            },
          },
          { text: "Cancel", style: "cancel" },
        ],
        { cancelable: true },
      );
    },
    [deleteNotification],
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Banner */}
      <View style={styles.banner}>
        <View style={styles.bannerIcon}>
          <Ionicons name="notifications" size={22} color={Colors.textInverse} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>
            {totalUnread === 0
              ? "You are all caught up"
              : `${totalUnread} unread notification${totalUnread > 1 ? "s" : ""}`}
          </Text>
          <Text style={styles.bannerSub}>
            {totalUnread === 0
              ? "Nothing needs your attention right now."
              : "Tap a notification to mark it as read."}
          </Text>
        </View>
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {CATEGORIES.map((c) => {
          const active = activeCat === c.key;
          const cUnread = counts[c.key].unread;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => setActiveCat(c.key)}
              style={[
                styles.chip,
                active && { backgroundColor: c.tint, borderColor: c.tint },
              ]}
            >
              <Ionicons
                name={c.icon}
                size={14}
                color={active ? Colors.textInverse : c.tint}
              />
              <Text
                style={[
                  styles.chipText,
                  active && { color: Colors.textInverse },
                ]}
              >
                {c.label}
              </Text>
              {cUnread > 0 ? (
                <View
                  style={[
                    styles.chipBadge,
                    active
                      ? { backgroundColor: Colors.textInverse }
                      : { backgroundColor: c.tint },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipBadgeText,
                      active ? { color: c.tint } : { color: Colors.textInverse },
                    ]}
                  >
                    {cUnread}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Notification list */}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {grouped.length === 0 ? (
          <EmptyState
            icon="🔕"
            title="No notifications here"
            message="Updates from this category will appear in this list."
          />
        ) : (
          grouped.map((section) => {
            const cat = CATEGORIES.find((c) => c.key === section.key)!;
            return (
              <View key={section.key} style={styles.section}>
                <CategoryHeader
                  category={cat}
                  unread={counts[section.key].unread}
                />
                {section.list.map((n) => (
                  <NotificationCard
                    key={n.id}
                    item={n}
                    onPress={() => openNotification(n)}
                    onLongPress={() => promptDelete(n)}
                  />
                ))}
              </View>
            );
          })
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },

  // Banner
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.rider,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.textInverse + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: "800",
  },
  bannerSub: {
    color: "#D1FAE5",
    fontSize: FontSize.xs,
    marginTop: 2,
  },

  // Chips
  chipRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.text,
  },
  chipBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  chipBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
  },

  // Section
  section: { marginBottom: Spacing.md },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },

  // Card
  card: { marginBottom: Spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  body: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  meta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 6,
  },
});