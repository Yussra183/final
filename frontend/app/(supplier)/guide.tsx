/**
 * Supplier guide screen — gas-safety reference.
 *
 * The previous version was a placeholder with three quick links to
 * /restock, /live, and /reports. Those shortcuts have been removed
 * per the supplier delivery-operations scope: the supplier discovers
 * those surfaces from the sidebar and the Delivery Operations page
 * itself. The page now reads as a concise safety briefing, matching
 * the brief's intent ("guide helps prevent accidents caused by gases").
 */
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { Card } from "../../src/components/Card";
import { SidebarLayout } from "../../src/components/SidebarLayout";

export default function SupplierGuideScreen() {
  return (
    <SidebarLayout>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <ScreenHeader
          title="Guide"
          subtitle="Gas-safety reference for the road"
          left={<DrawerMenuButton />}
        />
        <ScrollView contentContainerStyle={styles.body}>
          <Card>
            <View style={styles.heroRow}>
              <View style={styles.heroIcon}>
                <Ionicons
                  name="book-outline"
                  size={26}
                  color={Colors.supplier}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heading}>Supplier Guide</Text>
                <Text style={styles.placeholder}>
                  Gas-safety reference for suppliers on the road. Read before
                  your first delivery and keep handy for emergencies.
                </Text>
              </View>
            </View>
          </Card>

          <Text style={styles.sectionLabel}>Gas safety basics</Text>
          <Card>
            <SafetyItem
              icon="warning-outline"
              title="Keep cylinders upright"
              body="Never lay an LPG cylinder on its side during transport or storage. A tilted cylinder can leak liquid through the relief valve."
            />
            <View style={styles.divider} />
            <SafetyItem
              icon="thermometer-outline"
              title="Heat is the #1 cause of accidents"
              body="Never leave cylinders in direct sunlight or near a heat source. Hot ambient temperature raises internal pressure and can trigger the relief valve."
            />
            <View style={styles.divider} />
            <SafetyItem
              icon="bonfire-outline"
              title="No flames, no sparks"
              body="Never smoke or use a flame near a cylinder. Turn off vehicle engines before loading or unloading."
            />
            <View style={styles.divider} />
            <SafetyItem
              icon="medkit-outline"
              title="If you smell gas"
              body="Move people away, avoid creating sparks, shut the cylinder valve, and call emergency services."
            />
          </Card>
        </ScrollView>
      </SafeAreaView>
    </SidebarLayout>
  );
}

function SafetyItem({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemIcon}>
        <Ionicons name={icon} size={16} color={Colors.supplier} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 4,
  },
  placeholder: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  itemBody: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
});
