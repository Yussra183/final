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
import React, { useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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
  const { session, getNotificationsForUser, markNotificationRead } = useStore();
  const [activeCat, setActiveCat] = useState<CategoryKey>("all");

  const user = session?.user;
  const items = useMemo(
    () => (user ? getNotificationsForUser(user.id) : []),
    [user, getNotificationsForUser],
  );

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

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <SellerHeader title="Notifications" />

      {/* Banner */}
      <View style={styles.banner}>
        <View style={styles.bannerIcon}>
          <Ionicons name="notifications" size={22} color="#FFF" />
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
                color={active ? "#FFF" : c.tint}
              />
              <Text
                style={[
                  styles.chipText,
                  active && { color: "#FFF" },
                ]}
              >
                {c.label}
              </Text>
              {c_unread > 0 ? (
                <View
                  style={[
                    styles.chipBadge,
                    active
                      ? { backgroundColor: "#FFF" }
                      : { backgroundColor: c.tint },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipBadgeText,
                      active ? { color: c.tint } : { color: "#FFF" },
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
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} />}
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
                    onPress={() => {
                      if (!n.read) markNotificationRead(n.id);
                    }}
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
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: {
    color: "#FFF",
    fontSize: FontSize.md,
    fontWeight: "800",
  },
  bannerSub: {
    color: "#CCFBF1",
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