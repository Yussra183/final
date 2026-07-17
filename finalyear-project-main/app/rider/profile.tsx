import React from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { Avatar } from "../../src/components/Avatar";
import { AppButton } from "../../src/components/AppButton";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { LogoutButton } from "../../src/components/LogoutButton";

export default function RiderProfile() {
  const router = useRouter();
  const { session, logout } = useStore();
  const user = session!.user;
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScreenHeader
        title="Profile"
        left={<DrawerMenuButton />}
        right={<LogoutButton />}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        <View style={{ paddingHorizontal: Spacing.lg }}>
          <Card style={{ alignItems: "center" }}>
            <Avatar name={user.fullName} size={80} color={Colors.rider} />
            <Text style={styles.name}>{user.fullName}</Text>
            <Text style={styles.role}>
              @{user.username} • Rider
            </Text>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{user.email}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{user.phone}</Text>
              </View>
            </View>
          </Card>

          <AppButton
            title="Logout"
            variant="outline"
            fullWidth
            style={{ marginTop: Spacing.lg }}
            onPress={() =>
              Alert.alert("Logout", "Sign out of your account?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Logout",
                  style: "destructive",
                  onPress: () => {
                    logout();
                    router.replace("/auth/login");
                  },
                },
              ])
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  name: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  role: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  infoRow: { flexDirection: "row", width: "100%", marginTop: Spacing.md },
  infoItem: { flex: 1 },
  infoLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: "600",
  },
  infoValue: { color: Colors.text, fontWeight: "700", marginTop: 2 },
});