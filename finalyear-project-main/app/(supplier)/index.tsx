import React, { useMemo } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatCard } from "../../src/components/StatCard";
import { StatusPill } from "../../src/components/StatusPill";
import { Avatar } from "../../src/components/Avatar";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { AppButton } from "../../src/components/AppButton";
import { EmptyState } from "../../src/components/EmptyState";
import { formatDate } from "../../src/utils/format";
import { RestockRequest } from "../../constants/types";

const ACCENT = "#6366F1";

/**
 * Supplier home dashboard. Frames the supplier's day around four buckets
 * that mirror the request lifecycle:
 *
 *   pending  → awaiting the supplier's approve/reject decision
 *   approved → accepted, waiting to be dispatched
 *   in_transit → on the road to the seller
 *   delivered / rejected → closed (history)
 *
 * The screen surfaces the two buckets that need action today ("Awaiting
 * your action" + "Today's dispatches") above the fold so the supplier
 * can clear the queue without digging through the full Requests list.
 */
export default function SupplierHome() {
  const router = useRouter();
  const {
    session,
    getRestockForSupplier,
    updateRestockStatus,
  } = useStore();
  const user = session?.user!;
  const requests = getRestockForSupplier(user.id);

  // KPI counts — one per lifecycle bucket.
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const inTransitCount = requests.filter((r) => r.status === "in_transit").length;
  const deliveredCount = requests.filter((r) => r.status === "delivered").length;

  // "Awaiting your action" — pending requests need an approve/reject.
  const awaiting = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests],
  );

  // "Today's dispatches" — approved (ready to dispatch) + in_transit.
  const dispatching = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "approved" || r.status === "in_transit",
      ),
    [requests],
  );

  const handleAccept = (r: RestockRequest) => {
    updateRestockStatus(r.id, "approved");
    Alert.alert("Request accepted", `${r.sellerName}'s request approved.`);
  };

  const handleReject = (r: RestockRequest) => {
    Alert.alert(
      "Reject request?",
      `${r.sellerName} will be notified.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: () => updateRestockStatus(r.id, "rejected"),
        },
      ],
    );
  };

  const statusPillTone = (s: RestockRequest["status"]) => {
    switch (s) {
      case "delivered":
        return "success" as const;
      case "rejected":
        return "danger" as const;
      case "in_transit":
        return "info" as const;
      case "approved":
        return "primary" as const;
      default:
        return "warning" as const;
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        {/* ---------------- Header ---------------- */}
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Supplier Hub</Text>
          </View>
          <Avatar name={user.fullName} size={48} color={ACCENT} />
        </View>

        {/* ---------------- KPI strip ---------------- */}
        <View style={styles.statsRow}>
          <StatCard
            label="Pending"
            value={pendingCount}
            icon="⏳"
            tone="warning"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Approved"
            value={approvedCount}
            icon="✅"
            tone="primary"
            style={{ marginRight: Spacing.sm }}
          />
        </View>
        <View style={[styles.statsRow, { marginTop: Spacing.sm }]}>
          <StatCard
            label="In transit"
            value={inTransitCount}
            icon="🚚"
            tone="info"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Delivered"
            value={deliveredCount}
            icon="📦"
            tone="primary"
          />
        </View>

        {/* ---------------- Awaiting your action ---------------- */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Awaiting your action</Text>
          <TouchableOpacity onPress={() => router.push("/(supplier)/requests" as any)}>
            <Text style={styles.linkText}>View all</Text>
          </TouchableOpacity>
        </View>
        {awaiting.length === 0 ? (
          <View style={{ marginHorizontal: Spacing.lg }}>
            <EmptyState
              icon="🎉"
              title="All clear"
              message="No pending requests right now."
            />
          </View>
        ) : (
          awaiting.slice(0, 3).map((r) => (
            <Card
              key={r.id}
              style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}
            >
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>
                    {r.productName} ({r.size}) ×{r.quantity}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {r.sellerName} • {formatDate(r.createdAt)}
                  </Text>
                </View>
                <StatusPill label="Pending" tone="warning" />
              </View>
              <View style={styles.actionRow}>
                <AppButton
                  title="Accept"
                  variant="primary"
                  onPress={() => handleAccept(r)}
                  style={{ flex: 1, marginRight: 6 }}
                />
                <AppButton
                  title="Reject"
                  variant="danger"
                  onPress={() => handleReject(r)}
                  style={{ flex: 1, marginLeft: 6 }}
                />
              </View>
            </Card>
          ))
        )}

        {/* ---------------- Today's dispatches ---------------- */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's dispatches</Text>
          <TouchableOpacity
            onPress={() => router.push("/(supplier)/deliveries" as any)}
          >
            <Text style={styles.linkText}>Deliveries</Text>
          </TouchableOpacity>
        </View>
        {dispatching.length === 0 ? (
          <View style={{ marginHorizontal: Spacing.lg }}>
            <EmptyState
              icon="🚛"
              title="Nothing on the road"
              message="Approved and in-transit requests will appear here."
            />
          </View>
        ) : (
          dispatching.slice(0, 4).map((r) => (
            <Card
              key={r.id}
              style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}
            >
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>
                    {r.productName} ({r.size}) ×{r.quantity}
                  </Text>
                  <Text style={styles.itemMeta}>
                    To {r.sellerName} • {formatDate(r.createdAt)}
                  </Text>
                </View>
                <StatusPill
                  label={r.status === "in_transit" ? "In transit" : "Approved"}
                  tone={statusPillTone(r.status)}
                />
              </View>
              {r.status === "approved" ? (
                <AppButton
                  title="Mark in transit"
                  variant="secondary"
                  fullWidth
                  style={{ marginTop: Spacing.sm }}
                  onPress={() => updateRestockStatus(r.id, "in_transit")}
                />
              ) : (
                <AppButton
                  title="Confirm delivery"
                  variant="primary"
                  fullWidth
                  style={{ marginTop: Spacing.sm }}
                  onPress={() => updateRestockStatus(r.id, "delivered")}
                />
              )}
            </Card>
          ))
        )}

        {/* ---------------- Quick actions ---------------- */}
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.actionGrid}>
          {[
            { label: "Requests", icon: "📥", route: "/(supplier)/requests" },
            { label: "Deliveries", icon: "🚚", route: "/(supplier)/deliveries" },
            { label: "Profile", icon: "👤", route: "/(supplier)/profile" },
            { label: "Guide", icon: "📘", route: "/(supplier)/guide" },
          ].map((a) => (
            <TouchableOpacity
              key={a.label}
              style={styles.actionTile}
              activeOpacity={0.8}
              onPress={() => router.push(a.route as any)}
            >
              <Text style={styles.actionIcon}>{a.icon}</Text>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  greeting: { fontSize: FontSize.xl, fontWeight: "800", color: Colors.text },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: "row", paddingHorizontal: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  linkText: {
    color: ACCENT,
    fontWeight: "700",
    marginRight: Spacing.lg,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  actionTile: {
    flexBasis: "47%",
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: "center",
    boxShadow: "0 4px 8px rgba(0,0,0,0.08)",
  },
  actionIcon: { fontSize: 28, marginBottom: 4 },
  actionLabel: { fontSize: FontSize.xs, fontWeight: "700", color: Colors.text },
  row: { flexDirection: "row", alignItems: "center" },
  itemTitle: { fontWeight: "800", color: Colors.text, fontSize: FontSize.md },
  itemMeta: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  actionRow: { flexDirection: "row", marginTop: Spacing.sm },
});