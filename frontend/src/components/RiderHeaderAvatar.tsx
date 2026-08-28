/**
 * RiderHeaderAvatar
 *
 * Tappable avatar with a small account dropdown that mirrors the
 * supplier header's menu (see `SupplierHeaderAvatar.tsx`). Opens a
 * modal menu anchored under the avatar with two entries:
 *
 *   • Profile  — navigates to `/rider/profile`
 *   • Logout   — runs the existing `logout()` from the store
 *
 * The component is intentionally small and stateless. It does NOT
 * touch authentication, session, JWT, or any auth-flow code — it
 * simply calls `useStore().logout()` (the same call the supplier
 * header uses) and lets the route guards do the redirect.
 *
 * Use it in the rider drawer header. The avatar size is configurable
 * via `size` so the component slots into the 48px bubble the drawer
 * header needs.
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
  /**
   * Diameter of the avatar bubble. Default matches the rider
   * drawer header (48px).
   *
   * Pass `false` to hide the notification bell (e.g. when this
   * component is rendered inside an already-bell-bearing header).
   */
  size?: number;
  /**
   * When `true`, render the bell-icon notification button next to
   * the avatar with an unread-count badge. Default `true`.
   */
  showNotifications?: boolean;
}

export function RiderHeaderAvatar({
  size = 48,
  showNotifications = true,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, logout, getNotificationsForUser } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const user = session?.user;
  const userFullName = user?.fullName ?? "Rider";

  /**
   * Unread count for the signed-in rider. `getNotificationsForUser`
   * is a memoised selector over the shared notifications list — the
   * badge updates the instant the Notifications screen marks rows
   * read, without re-rendering anything else.
   */
  const unreadCount = user
    ? getNotificationsForUser(user.id).filter((n) => !n.read).length
    : 0;

  const openNotifications = () => {
    router.push("/rider/notifications" as any);
  };

  /**
   * Confirm-then-logout flow — same shape the supplier header uses so
   * the rider isn't logged out by an accidental tap. Calling the
   * store's existing `logout()` (which sets session=null) lets the
   * rider layout's route guard send the user to /auth/login.
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
    router.push("/rider/profile" as any);
  };

  return (
    <>
      <View style={styles.cluster}>
        {showNotifications ? (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={openNotifications}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={Colors.text}
            />
            {unreadCount > 0 ? (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          accessibilityLabel="Account menu"
          accessibilityRole="button"
          style={styles.avatarBtn}
          onPress={() => setMenuOpen(true)}
        >
          <Avatar
            name={userFullName}
            size={size}
            color={Colors.rider}
          />
        </TouchableOpacity>
      </View>

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
                color={Colors.rider}
              />
              <View style={styles.menuIdentityText}>
                <Text style={styles.menuName} numberOfLines={1}>
                  {userFullName}
                </Text>
                <Text style={styles.menuRole} numberOfLines={1}>
                  {user?.email ?? "Rider"}
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
  cluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notifBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  notifBadgeText: {
    color: Colors.textInverse,
    fontSize: 9,
    fontWeight: "800",
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