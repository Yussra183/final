/**
 * CustomerHeaderAvatar
 *
 * Tappable customer avatar for the Customer Home / Dashboard header.
 * Mirrors the existing `SupplierHeaderAvatar` / `SellerHeader` pattern
 * so behaviour stays consistent across roles. Tapping the avatar opens
 * a small modal menu anchored to the top-right of the screen with two
 * entries:
 *
 *   • Profile — navigates to the existing customer Profile tab.
 *   • Logout  — confirms then calls the existing `useStore().logout()`
 *               so the route guard at `(customer)/_layout.tsx` sends
 *               the user to /auth/login, identical to the Profile tab.
 *
 * No authentication, session, JWT, or store logic is introduced here:
 * the component only reuses the existing store action and the existing
 * expo-router profile route. The avatar uses the same `Avatar` and
 * `Colors.customer` token already in use elsewhere.
 */
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import { useStore } from "../store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

interface Props {
  /** Diameter of the avatar bubble. Default 36 fits the customer
   *  home header alongside the gas-help and notifications buttons. */
  size?: number;
}

export function CustomerHeaderAvatar({ size = 36 }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, logout } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const user = session?.user;
  const userFullName = user?.fullName ?? "Customer";

  /**
   * Confirm-then-logout flow — same shape the Profile tab uses so an
   * accidental tap can't sign the customer out. `logout()` is the
   * existing store action; the customer layout's route guard then
   * redirects to /auth/login automatically.
   */
  const confirmLogout = () => {
    setMenuOpen(false);
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: () => logout(),
        },
      ],
      { cancelable: true },
    );
  };

  const openProfile = () => {
    setMenuOpen(false);
    // Reuse the existing Customer Profile tab — no duplicate screen.
    router.push("/(customer)/(tabs)/profile" as any);
  };

  return (
    <>
      <TouchableOpacity
        accessibilityLabel="Account menu"
        accessibilityRole="button"
        style={styles.avatarBtn}
        onPress={() => setMenuOpen(true)}
        hitSlop={8}
      >
        <Avatar
          name={userFullName}
          size={size}
          color={Colors.customer}
        />
      </TouchableOpacity>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setMenuOpen(false)}
          accessibilityLabel="Close menu"
        >
          <View style={[styles.menu, { top: insets.top + 64 }]}>
            <View style={styles.menuIdentity}>
              <Avatar
                name={userFullName}
                size={40}
                color={Colors.customer}
              />
              <View style={styles.menuIdentityText}>
                <Text style={styles.menuName} numberOfLines={1}>
                  {userFullName}
                </Text>
                <Text style={styles.menuRole} numberOfLines={1}>
                  {user?.email ?? "Customer"}
                </Text>
              </View>
            </View>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={openProfile}
              accessibilityRole="button"
            >
              <Ionicons
                name="person-circle-outline"
                size={20}
                color={Colors.text}
              />
              <Text style={styles.menuItemText}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={confirmLogout}
              accessibilityRole="button"
            >
              <Ionicons
                name="log-out-outline"
                size={20}
                color={Colors.danger}
              />
              <Text
                style={[
                  styles.menuItemText,
                  { color: Colors.danger },
                ]}
              >
                Logout
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // 44x44 minimum touch target — meets mobile a11y guidance even when
  // the visible avatar is 36px.
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Account menu ──────────────────────────────────────────────────────
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
  },
  menu: {
    position: "absolute",
    right: Spacing.md,
    minWidth: 220,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
    // RN 0.76+ cross-platform shadow.
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  },
  menuIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  menuIdentityText: { flex: 1 },
  menuName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  menuRole: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  menuItemText: {
    fontSize: FontSize.md,
    fontWeight: "600",
    color: Colors.text,
  },
});
