import React, { useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { LogoutButton } from "../../src/components/LogoutButton";
import { EmptyState } from "../../src/components/EmptyState";
import {
  formatCurrency,
  formatDate,
  orderStatusLabel,
  orderTone,
} from "../../src/utils/format";

export default function DeliveryHistory() {
  const { session, getOrdersForUser } = useStore();
  const user = session!.user;
  const history = useMemo(
    () =>
      getOrdersForUser(user.id, "rider").filter(
        (o) => o.status === "delivered" || o.status === "cancelled",
      ),
    [user.id, getOrdersForUser],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScreenHeader
        title="Delivery History"
        subtitle={`${history.length} completed trip${history.length === 1 ? "" : "s"}`}
        left={<DrawerMenuButton />}
        right={<LogoutButton />}
      />
      <FlatList
        data={history}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <EmptyState
            icon="📜"
            title="No history yet"
            message="Completed trips will be archived here."
          />
        }
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  Order #{item.id.slice(-4)}
                </Text>
                <Text style={styles.sub}>{item.customerName}</Text>
                <Text style={styles.sub}>{formatDate(item.updatedAt)}</Text>
              </View>
              <StatusPill
                label={orderStatusLabel(item.status)}
                tone={orderTone(item.status)}
              />
            </View>
            <Text style={styles.amount}>
              {formatCurrency(item.total)}
            </Text>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  cardTitle: { fontWeight: "800", color: Colors.text, fontSize: FontSize.md },
  sub: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  amount: {
    marginTop: Spacing.sm,
    color: Colors.primary,
    fontWeight: "800",
  },
});