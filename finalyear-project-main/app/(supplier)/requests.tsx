import React, { useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { EmptyState } from "../../src/components/EmptyState";
import { AppButton } from "../../src/components/AppButton";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { formatDate } from "../../src/utils/format";
import { RestockRequest } from "../../constants/types";

export default function SupplierRequests() {
  const { session, getRestockForSupplier, updateRestockStatus } = useStore();
  const user = session?.user!;
  const requests = getRestockForSupplier(user.id);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "in_transit" | "delivered">("all");

  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  const setSupplier = (r: RestockRequest) => {
    updateRestockStatus(r.id, "approved");
    Alert.alert("Request accepted", `You accepted ${r.sellerName}'s request.`);
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <View style={styles.header}>
        <DrawerMenuButton />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Restock Requests</Text>
          <Text style={styles.subtitle}>{requests.length} total requests</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        {(["all", "pending", "approved", "in_transit", "delivered"] as const).map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
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
                <Text style={styles.title}>
                  {item.productName} ({item.size})
                </Text>
                <Text style={styles.subtitle}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.text },
  subtitle: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 6,
    flexWrap: "wrap",
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: { backgroundColor: "#6366F1", borderColor: "#6366F1" },
  tabText: { fontSize: FontSize.xs, fontWeight: "700", color: Colors.textSecondary },
  tabTextActive: { color: "#FFF" },
  row: { flexDirection: "row", alignItems: "center" },
  qty: {
    marginTop: Spacing.sm,
    fontWeight: "700",
    color: Colors.text,
  },
  actionRow: { flexDirection: "row", marginTop: Spacing.sm },
});
