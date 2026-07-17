import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { EmptyState } from "../../src/components/EmptyState";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { formatDate } from "../../src/utils/format";

export default function SupplierDeliveries() {
  const { session, getRestockForSupplier } = useStore();
  const user = session?.user!;
  const active = getRestockForSupplier(user.id).filter(
    (r) => r.status === "in_transit" || r.status === "approved",
  );
  const history = getRestockForSupplier(user.id).filter(
    (r) => r.status === "delivered" || r.status === "rejected",
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <View style={styles.header}>
        <DrawerMenuButton />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Deliveries</Text>
          <Text style={styles.subtitle}>{active.length} active, {history.length} completed</Text>
        </View>
      </View>

      <Text style={styles.section}>Active</Text>
      <FlatList
        data={active}
        keyExtractor={(r) => `a-${r.id}`}
        contentContainerStyle={{ paddingHorizontal: Spacing.lg }}
        ListEmptyComponent={
          <View style={{ marginHorizontal: Spacing.lg }}>
            <EmptyState
              icon="🚚"
              title="No active deliveries"
              message="Approved and in-transit requests appear here."
            />
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {item.productName} ({item.size}) ×{item.quantity}
                </Text>
                <Text style={styles.subtitle}>
                  To {item.sellerName} • {formatDate(item.createdAt)}
                </Text>
              </View>
              <StatusPill
                label={item.status.replace("_", " ")}
                tone={item.status === "in_transit" ? "info" : "primary"}
              />
            </View>
          </Card>
        )}
      />

      <Text style={styles.section}>History</Text>
      <FlatList
        data={history}
        keyExtractor={(r) => `h-${r.id}`}
        contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl }}
        ListEmptyComponent={
          <View style={{ marginHorizontal: Spacing.lg }}>
            <EmptyState
              icon="🗂️"
              title="No history yet"
              message="Completed deliveries will be archived here."
            />
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {item.productName} ({item.size}) ×{item.quantity}
                </Text>
                <Text style={styles.subtitle}>
                  {item.sellerName} • {formatDate(item.createdAt)}
                </Text>
              </View>
              <StatusPill
                label={item.status}
                tone={item.status === "delivered" ? "success" : "danger"}
              />
            </View>
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
  section: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center" },
});
