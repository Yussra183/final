import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../constants/colors";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import { AdminIcon, adminIconGlyph } from "../../src/components/admin/Icon";
import { AdminApi } from "../../src/api/endpoints";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import type { AdminNotification } from "../../constants/types";

type Filter = "all" | "unread" | "orders";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "orders", label: "Orders" },
];

export default function AdminNotificationsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  const fetcher = useCallback(async () => {
    const rows = await AdminApi.notifications();
    if (filter === "orders") return rows.filter((r) => r.type === "order");
    if (filter === "unread") return rows.filter((r) => !r.read);
    return rows;
  }, [filter]);

  const { data, loading, error, reload, refreshing } = useAdminResource<
    AdminNotification[]
  >(fetcher, [filter]);

  const notifs = data ?? [];
  const unreadCount = notifs.filter((n) => !n.read).length;

  const handlePressNotif = (n: AdminNotification) => {
    // Deep-link the recognised notification types to their tab; fall
    // through to a no-op so we never route to a missing screen.
    switch (n.type) {
      case "order":
        router.push({
          pathname: "/customers",
          params: { tab: "orders" },
        } as any);
        return;
      case "permit":
        router.push({
          pathname: "/riders",
          params: { tab: "applications" },
        } as any);
        return;
      case "supplier":
        router.push({
          pathname: "/suppliers",
          params: { tab: "applications" },
        } as any);
        return;
      case "seller":
        router.push({
          pathname: "/sellers",
          params: { tab: "applications" },
        } as any);
        return;
      default:
        return;
    }
  };

  const subtitle =
    unreadCount > 0
      ? `${unreadCount} unread • ${notifs.length} total`
      : `${notifs.length} total • all caught up`;

  return (
    <AdminLayout
      title="Notifications"
      subtitle={subtitle}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={reload}
          tintColor={Colors.admin}
        />
      }
    >
      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              activeOpacity={0.85}
              onPress={() => setFilter(f.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Status / list */}
      {loading && notifs.length === 0 ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color={Colors.admin} />
          <Text style={styles.loadingText}>Loading notifications…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <AdminIcon name="reject" color={Colors.danger} size={20} />
          <Text style={styles.errorTitle}>Couldn't load notifications</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={reload}>
            <Ionicons
              name={adminIconGlyph("refresh")}
              size={16}
              color="#FFF"
            />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : notifs.length === 0 ? (
        <View style={styles.emptyCard}>
          <AdminIcon name="notifications" color={Colors.textMuted} size={28} />
          <Text style={styles.emptyTitle}>
            {filter === "unread"
              ? "No unread notifications"
              : "Nothing here yet"}
          </Text>
          <Text style={styles.emptyBody}>
            {filter === "unread"
              ? "You're all caught up — new activity will land here."
              : "Notifications will appear here as system activity is recorded."}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {notifs.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => handlePressNotif(n)}
              style={({ pressed }) => [
                styles.notifCard,
                pressed && { opacity: 0.85 },
                !n.read && styles.notifCardUnread,
              ]}
            >
              <View style={styles.notifIconBubble}>
                <AdminIcon
                  name={
                    n.type === "order"
                      ? "orders"
                      : n.type === "permit"
                      ? "certificate"
                      : n.type === "supplier" || n.type === "seller"
                      ? "documents"
                      : "notifications"
                  }
                  size={18}
                  color={Colors.admin}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.notifHeadRow}>
                  <Text style={styles.notifTitle} numberOfLines={2}>
                    {n.title}
                  </Text>
                  {!n.read ? <View style={styles.unreadDot} /> : null}
                </View>
                <Text style={styles.notifMeta}>
                  {n.userName ? n.userName : "System"}
                  {" • "}
                  {n.createdAt
                    ? new Date(n.createdAt).toLocaleString()
                    : ""}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={Colors.textMuted}
              />
            </Pressable>
          ))}
        </View>
      )}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    flexWrap: "wrap",
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.admin,
    borderColor: Colors.admin,
  },
  filterChipText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: "#FFF",
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    alignItems: "center",
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  errorCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  errorTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  errorBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    fontWeight: "600",
  },
  retryBtn: {
    marginTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.admin,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  retryText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: FontSize.sm,
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
    ...Shadow.card,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  emptyBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    fontWeight: "600",
    maxWidth: 320,
    lineHeight: 20,
  },
  list: {
    gap: Spacing.sm,
  },
  notifCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
    ...Shadow.card,
  },
  notifCardUnread: {
    borderColor: Colors.admin,
    backgroundColor: Colors.surfaceMuted,
  },
  notifIconBubble: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  notifHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 2,
  },
  notifTitle: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  notifMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
});
