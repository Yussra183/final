import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { Card } from "../../src/components/Card";

/**
 * Supplier guide screen — placeholder. Content will be added later.
 */
export default function SupplierGuideScreen() {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScreenHeader
        title="Guide"
        left={<DrawerMenuButton />}
      />
      <ScrollView contentContainerStyle={styles.body}>
        <Card>
          <Text style={styles.heading}>Supplier Guide</Text>
          <Text style={styles.placeholder}>
            Coming soon. This is a placeholder — content will be filled in
            later.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  heading: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  placeholder: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
});
