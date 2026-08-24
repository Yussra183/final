/**
 * SupplierHeaderAvatar
 *
 * Tappable avatar with a small account dropdown that mirrors the
 * seller header's menu (see `SellerHeader.tsx`). Opens a modal menu
 * anchored under the avatar with two entries:
 *
 *   • Profile  — navigates to `/(supplier)/profile`
 *   • Logout   — runs the existing `logout()` from the store
 *
 * The component is intentionally small and stateless. It does NOT
 * touch authentication, session, JWT, or any auth-flow code — it
 * simply calls `useStore().logout()` (the same call the Profile
 * screen previously made) and lets the route guards do the redirect.
 *
 * Use it in supplier headers (dashboard, restock, etc.) wherever an
 * `<Avatar>` is currently shown as a decorative element. The avatar
 * size is configurable via `size` so the component slots into both
 * the dashboard's larger 48px bubble and the smaller side panels.
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
  /** Diameter of the avatar bubble. Default matches the supplier
   *  dashboard header (48px). */
  size?: number;
}

export function SupplierHeaderAvatar({ size = 48 }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, logout } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const user = session?.user;
  const userFullName = user?.fullName ?? "Supplier";

  /**
   * Confirm-then-logout flow — same shape the Profile screen used so
   * the supplier isn't logged out by an accidental tap. Calling the
   * store's existing `logout()` (which sets session=null) lets the
   * supplier layout's route guard send the user to /auth/login.
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
    router.push("/(supplier)/profile" as any);
  };

  return (
    <>
      <TouchableOpacity
        accessibilityLabel="Account menu"
        accessibilityRole="button"
        style={styles.avatarBtn}
        onPress={() => setMenuOpen(true)}
      >
        <Avatar
          name={userFullName}
          size={size}
          color={Colors.supplier}
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
                color={Colors.supplier}
              />
              <View style={styles.menuIdentityText}>
                <Text style={styles.menuName} numberOfLines={1}>
                  {userFullName}
                </Text>
                <Text style={styles.menuRole} numberOfLines={1}>
                  {user?.email ?? "Supplier"}
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