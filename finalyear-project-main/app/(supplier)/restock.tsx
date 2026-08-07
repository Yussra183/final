/**
 * Restock page — consolidates the supplier's three legacy restock screens
 * (Restock Home dashboard, Restock Requests list, Restock Deliveries
 * list) into one tabbed page.
 *
 * Tabs:
 *   • Home       — KPIs + "Awaiting your action" + "Today's dispatches"
 *                  + Quick actions grid (the original restock dashboard)
 *   • Requests   — every restock request with status filter chips
 *   • Deliveries — Active vs History lists for in-flight and closed
 *                  restock dispatches
 *
 * All functionality from the three merged pages is preserved verbatim;
 * only the chrome has changed.
 */
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
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
import { SupplierApprovalGate } from "../../src/components/SupplierApprovalGate";
import { RestockRequest } from "../../constants/types";

type RestockTab = "home" | "requests" | "deliveries";
const ACCENT = "#6366F1";

export default function SupplierRestock() {
  return (
    <SupplierApprovalGate title="Restock">
      <RestockContent />
    </SupplierApprovalGate>
  );
}

function RestockContent() {
  const [tab, setTab] = useState<RestockTab>("home");

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <View style={styles.header}>
        <DrawerMenuButton />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Restock</Text>
          <Text style={styles.subtitle}>
            Manage restock requests from sellers
          </Text>
        </View>
      </View>

      {/* Tab bar — segmented control */}
      <View style={styles.tabBar}>
        {(
          [
            { key: "home", label: "Home", icon: "🏠" },
            { key: "requests", label: "Requests", icon: "📥" },
            { key: "deliveries", label: "Deliveries", icon: "🚚" },
          ] as { key: RestockTab; label: string; icon: string }[]
        ).map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              activeOpacity={0.85}
              onPress={() => setTab(t.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={styles.tabIcon}>{t.icon}</Text>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === "home" ? (
        <RestockHomeSection />
      ) : tab === "requests" ? (
        <RestockRequestsSection />
      ) : (
        <RestockDeliveriesSection />
      )}
    </SafeAreaView>
  );
}

/* ---------- Restock Home (KPI strip + awaiting + dispatches) ---------- */

function RestockHomeSection() {
  const router = useRouter();
  const {
    session,
    getRestockForSupplier,
    updateRestockStatus,
  } = useStore();
  const user = session?.user!;
  const requests = getRestockForSupplier(user.id);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const inTransitCount = requests.filter(
    (r) => r.status === "in_transit",
  ).length;
  const deliveredCount = requests.filter(
    (r) => r.status === "delivered",
  ).length;

  const awaiting = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests],
  );

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
    Alert.alert("Reject request?", `${r.sellerName} will be notified.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: () => updateRestockStatus(r.id, "rejected"),
      },
    ]);
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
    <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
      {/* Header with greeting + avatar */}
      <View style={styles.subPageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subGreeting}>Supplier Hub</Text>
        </View>
        <Avatar name={user.fullName} size={48} color={ACCENT} />
      </View>

      {/* KPI strip */}
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

      {/* Awaiting your action */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Awaiting your action</Text>
        <TouchableOpacity
          onPress={() => router.push("/(supplier)/restock" as any)}
        >
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

      {/* Today's dispatches */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today's dispatches</Text>
        <TouchableOpacity
          onPress={() => router.push("/(supplier)/restock" as any)}
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

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick actions</Text>
      <View style={styles.actionGrid}>
        {[
          { label: "Requests", icon: "📥", route: "/(supplier)/restock" },
          { label: "Deliveries", icon: "🚚", route: "/(supplier)/restock" },
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
  );
}

/* ---------- Restock Requests list ---------- */

type RequestFilter =
  | "all"
  | "pending"
  | "approved"
  | "in_transit"
  | "delivered";

function RestockRequestsSection() {
  const { session, getRestockForSupplier, updateRestockStatus } = useStore();
  const user = session?.user!;
  const requests = getRestockForSupplier(user.id);
  const [filter, setFilter] = useState<RequestFilter>("all");

  const filtered =
    filter === "all"
      ? requests
      : requests.filter((r) => r.status === filter);

  const setSupplier = (r: RestockRequest) => {
    updateRestockStatus(r.id, "approved");
    Alert.alert("Request accepted", `You accepted ${r.sellerName}'s request.`);
  };

  return (
    <>
      <View style={styles.tabRow}>
        {(
          ["all", "pending", "approved", "in_transit", "delivered"] as const
        ).map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.subTab, active && styles.subTabActive]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[styles.subTabText, active && styles.subTabTextActive]}
              >
                {f.replace("_", " ")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <EmptyState
            icon="📭"
            title="No requests"
            message="Restock requests from sellers will appear here."
          />
        }
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>
                  {item.productName} ({item.size})
                </Text>
                <Text style={styles.itemMeta}>
                  {item.sellerName} • {formatDate(item.createdAt)}
                </Text>
              </View>
              <StatusPill
                label={item.status.replace("_", " ")}
                tone={
                  item.status === "delivered"
                    ? "success"
                    : item.status === "rejected"
                      ? "danger"
                      : item.status === "in_transit"
                        ? "info"
                        : item.status === "approved"
                          ? "primary"
                          : "warning"
                }
              />
            </View>
            <Text style={styles.qty}>Quantity: {item.quantity} units</Text>
            {item.status === "pending" ? (
              <View style={styles.actionRow}>
                <AppButton
                  title="Accept"
                  variant="primary"
                  onPress={() => setSupplier(item)}
                  style={{ flex: 1, marginRight: 6 }}
                />
                <AppButton
                  title="Reject"
                  variant="danger"
                  onPress={() => updateRestockStatus(item.id, "rejected")}
                  style={{ flex: 1, marginLeft: 6 }}
                />
              </View>
            ) : null}
            {item.status === "approved" ? (
              <AppButton
                title="Mark in transit"
                variant="secondary"
                onPress={() => updateRestockStatus(item.id, "in_transit")}
                fullWidth
                style={{ marginTop: Spacing.sm }}
              />
            ) : null}
            {item.status === "in_transit" ? (
              <AppButton
                title="Confirm delivery"
                variant="primary"
                onPress={() => updateRestockStatus(item.id, "delivered")}
                fullWidth
                style={{ marginTop: Spacing.sm }}
              />
            ) : null}
          </Card>
        )}
      />
    </>
  );
}

/* ---------- Restock Deliveries (active + history) ---------- */

function RestockDeliveriesSection() {
  const { session, getRestockForSupplier } = useStore();
  const user = session?.user!;
  const all = getRestockForSupplier(user.id);
  const active = all.filter(
    (r) => r.status === "in_transit" || r.status === "approved",
  );
  const history = all.filter(
    (r) => r.status === "delivered" || r.status === "rejected",
  );

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
      <Text style={styles.sectionTitle}>Active</Text>
      {active.length === 0 ? (
        <View style={{ marginHorizontal: Spacing.lg }}>
          <EmptyState
            icon="🚚"
            title="No active deliveries"
            message="Approved and in-transit requests appear here."
          />
        </View>
      ) : (
        active.map((item) => (
          <Card
            key={`a-${item.id}`}
            style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}
          >
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>
                  {item.productName} ({item.size}) ×{item.quantity}
                </Text>
                <Text style={styles.itemMeta}>
                  To {item.sellerName} • {formatDate(item.createdAt)}
                </Text>
              </View>
              <StatusPill
                label={item.status.replace("_", " ")}
                tone={item.status === "in_transit" ? "info" : "primary"}
              />
            </View>
          </Card>
        ))
      )}

      <Text style={styles.sectionTitle}>History</Text>
      {history.length === 0 ? (
        <View style={{ marginHorizontal: Spacing.lg }}>
          <EmptyState
            icon="🗂️"
            title="No history yet"
            message="Completed deliveries will be archived here."
          />
        </View>
      ) : (
        history.map((item) => (
          <Card
            key={`h-${item.id}`}
            style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}
          >
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>
                  {item.productName} ({item.size}) ×{item.quantity}
                </Text>
                <Text style={styles.itemMeta}>
                  {item.sellerName} • {formatDate(item.createdAt)}
                </Text>
              </View>
              <StatusPill
                label={item.status}
                tone={item.status === "delivered" ? "success" : "danger"}
              />
            </View>
          </Card>
        ))
      )}
    </ScrollView>
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
  title: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.text },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  /* segmented tab bar */
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 6,
  },
  tabActive: {
    backgroundColor: Colors.supplier,
    borderColor: Colors.supplier,
  },
  tabIcon: { fontSize: 14 },
  tabText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  tabTextActive: { color: "#FFF" },
  /* home */
  subPageHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  subGreeting: { fontSize: FontSize.xl, fontWeight: "800", color: Colors.text },
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
  linkText: { color: ACCENT, fontWeight: "700", marginRight: Spacing.lg },
  row: { flexDirection: "row", alignItems: "center" },
  itemTitle: { fontWeight: "800", color: Colors.text, fontSize: FontSize.md },
  itemMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  actionRow: { flexDirection: "row", marginTop: Spacing.sm },
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
  /* requests filter chips */
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 6,
    flexWrap: "wrap",
  },
  subTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subTabActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  subTabText: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  subTabTextActive: { color: "#FFF" },
  qty: { marginTop: Spacing.sm, fontWeight: "700", color: Colors.text },
});