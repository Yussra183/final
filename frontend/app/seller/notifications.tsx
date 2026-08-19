/**
 * Seller → Notifications
 *
 * Lists every notification for the signed-in seller grouped into
 * four categories: New Customer Orders, Inventory Alerts,
 * Permit Notifications, Delivery Updates.
 *
 * Each unread notification shows a colored badge, and tapping the
 * notification marks it as read through `markNotificationRead()`.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import { SellerHeader } from "../../src/components/SellerHeader";
import { Card } from "../../src/components/Card";
import { Badge } from "../../src/components/Badge";
import { EmptyState } from "../../src/components/EmptyState";
import { useStore } from "../../src/store/StoreContext";
import { formatDateTime } from "../../src/utils/format";
import { NotificationItem } from "../../constants/types";

type CategoryKey = "all" | "order" | "stock" | "permit" | "delivery";

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
    key: "stock",
    label: "Inventory",
    icon: "alert-circle-outline",
    tint: Colors.warning,
  },
  {
    key: "permit",
    label: "Permits",
    icon: "document-text-outline",
    tint: Colors.accent,
  },
  {
    key: "delivery",
    label: "Delivery",
    icon: "car-outline",
    tint: Colors.info,
  },
];

/** Notification card with colored unread badge. */
function NotificationCard({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress: () => void;
}) {
  const tint =
    item.type === "order"
      ? Colors.primary
      : item.type === "delivery"
        ? Colors.info
        : item.type === "stock"
          ? Colors.warning
          : item.type === "permit"
            ? Colors.accent
            : Colors.textSecondary;

  const iconName: keyof typeof Ionicons.glyphMap =
    item.type === "order"
      ? "bag-add-outline"
      : item.type === "delivery"
        ? "car-outline"
        : item.type === "stock"
          ? "alert-circle-outline"
          : item.type === "permit"
            ? "document-text-outline"
            : "information-circle-outline";

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
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

export default function SellerNotifications() {
  const router = useRouter();
  const {
    session,
    getNotificationsForUser,
    markNotificationRead,
    markAllNotificationsRead,
    refresh,
  } = useStore();
  const [activeCat, setActiveCat] = useState<CategoryKey>("all");
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Real pull-to-refresh — re-hydrates the shared notifications list from
   * the backend. Previously this ScrollView passed a no-op handler so the
   * gesture was a UX lie; notifications is the most server-state-driven
   * screen on the seller side and the gesture was already muscle memory.
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
   * As soon as the Seller opens this screen, flip every unread
   * notification for the signed-in seller to read. The local state is
   * updated optimistically (the helper does the local flip before the
   * network request) so the dashboard chrome — which subscribes to
   * the same store notifications list — drops the red badge dot
   * immediately, without waiting for a refresh or screen re-mount.
   *
   * Scoped to the seller: the helper only touches notifications whose
   * `userId` matches the signed-in user, and the backend endpoint
   * `POST /api/notifications/read-all` is itself scoped to the
   * authenticated actor's user_id, so customer / rider / supplier /
   * admin notifications are never touched by this code path.
   */
  useEffect(() => {
    if (!user) return;
    markAllNotificationsRead(user.id);
    // Intentionally empty deps: we only want to fire this once per
    // mount of the Seller Notifications screen. Re-running on every
    // render would clobber any new "unread" badge that arrives while
    // the screen is open — which is correct UX (the user is looking
    // at the feed, so a brand-new notification arriving mid-screen is
    // still considered "seen" the moment it lands).
  }, [user, markAllNotificationsRead]);

  // Counts per category — drives the badge in the header.
  const counts = useMemo(() => {
    const out: Record<CategoryKey, { total: number; unread: number }> = {
      all: { total: 0, unread: 0 },
      order: { total: 0, unread: 0 },
      stock: { total: 0, unread: 0 },
      permit: { total: 0, unread: 0 },
      delivery: { total: 0, unread: 0 },
    };
    for (const n of items) {
      out.all.total++;
      if (!n.read) out.all.unread++;
      // `n.type` is the broader union "order"|"delivery"|"permit"|"stock"|"system";
      // we only surface the four seller-relevant buckets, so narrow explicitly.
      if (n.type === "order" || n.type === "stock" || n.type === "permit" || n.type === "delivery") {
        const cat: CategoryKey = n.type;
        out[cat].total++;
        if (!n.read) out[cat].unread++;
      }
    }
    return out;
  }, [items]);

  const grouped = useMemo(() => {
    const filterFn = (n: NotificationItem) =>
      activeCat === "all" ? true : n.type === activeCat;
    const filtered = items.filter(filterFn);
    const sections: { key: CategoryKey; list: NotificationItem[] }[] = [];
    if (activeCat === "all") {
      for (const c of CATEGORIES.slice(1)) {
        sections.push({
          key: c.key,
          list: filtered.filter((n) => n.type === c.key),
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
          supplyOrderId?: string;
        };
        // Customer order → seller orders list, deep-linked to that order.
        if (n.type === "order" && parsed.orderId) {
          router.push({
            pathname: "/seller/orders",
            params: { orderId: parsed.orderId },
          } as any);
          return;
        }
        // Supply (restock) → seller restock screen, which already
        // shows the matching row in one of its sections (In flight /
        // Awaiting your receipt / History) with the appropriate
        // action button. The full supply-order details screen exists
        // on the supplier side; here the seller can act on the row
        // from the same screen, so deep-linking straight to the
        // section is enough.
        if (n.type === "supply" && parsed.supplyOrderId) {
          router.push("/seller/restock" as any);
        }
      } catch {
        // Ignore malformed metadata — marking the notification read
        // is still valid.
      }
    },
    [markNotificationRead, router],
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <SellerHeader title="Notifications" />

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
          const c_unread = counts[c.key].unread;
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
              {c_unread > 0 ? (
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
                    {c_unread}
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

  // Banner
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.primary,
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
    color: Colors.primarySoft,
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
