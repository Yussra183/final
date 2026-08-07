/**
 * Approval gate for supplier business screens.
 *
 * Wraps a screen's content and, while the supplier's verification
 * application is not APPROVED, replaces it with the
 * "awaiting administrator approval" card instead. Approved suppliers
 * see the wrapped content untouched, so existing screen behaviour is
 * completely unchanged once verification passes.
 *
 * Usage:
 *
 *   export default function SupplierRequests() {
 *     ...
 *     return (
 *       <SupplierApprovalGate title="Restock Requests">
 *         {…the existing screen body…}
 *       </SupplierApprovalGate>
 *     );
 *   }
 */
import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { DrawerMenuButton } from "./DrawerMenuButton";
import { SupplierVerificationRequiredCard } from "./SupplierVerificationRequiredCard";
import { useSupplierVerificationStatus } from "../hooks/useSupplierVerificationStatus";
import { Colors, FontSize, Spacing } from "../../constants/colors";

interface Props {
  /** Screen title shown in the locked-state header. */
  title: string;
  children: React.ReactNode;
}

export function SupplierApprovalGate({ title, children }: Props) {
  const router = useRouter();
  const verification = useSupplierVerificationStatus();

  // While the status is still resolving, show a spinner rather than
  // flashing the locked state at an already-approved supplier.
  if (verification.isLoading && !verification.application) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <View style={styles.header}>
          <DrawerMenuButton />
          <Text style={[styles.title, { flex: 1 }]}>{title}</Text>
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.supplier} />
        </View>
      </SafeAreaView>
    );
  }

  if (verification.isApproved) {
    return <>{children}</>;
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingBottom: Spacing.xxl,
        }}
      >
        <View style={styles.header}>
          <DrawerMenuButton />
          <Text style={[styles.title, { flex: 1 }]}>{title}</Text>
        </View>
        <SupplierVerificationRequiredCard
          info={verification}
          onOpenVerification={() =>
            router.push("/(supplier)/profile" as any)
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.text,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
