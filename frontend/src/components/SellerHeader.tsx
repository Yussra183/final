/**
 * SellerHeader — branded top bar used on every Seller screen.
 *
 * Layout:
 *   [☰]  <page title>              [🔔 notifications] [avatar ▾]
 *
 * The ☰ button opens the drawer. The bell routes to Notifications and
 * carries an unread dot. The avatar opens a menu with the seller's identity,
 * "Shop Profile" and "Logout".
 *
 * Previously this bar carried a mail icon labelled "Messages" that actually
 * navigated to Profile, while the icon labelled "Profile" logged the user
 * out. There is no messaging feature in the app, so the mail icon is gone and
 * each remaining action now does what its label says.
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
import { useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { useStore } from "../store/StoreContext";

interface SellerHeaderProps {
  /** Page name shown as the bar's primary line. */
  title?: string;
}

export function SellerHeader({ title }: SellerHeaderProps) {
  // `useNavigation()` returns the drawer navigator's nav object inside a
  // drawer screen, which exposes openDrawer() / closeDrawer().
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  // `getNotificationsForUser` is a memoised selector over the shared
  // notifications list in the store — it returns the same reference until a
  // notification is added / removed / read, so subscribing here means the
  // badge updates the instant the Notifications screen marks rows read.
  const { session, logout, getNotificationsForUser } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const user = session?.user;
  const userFullName = user?.fullName ?? "Seller";

  /**
   * Unread count for the *current* seller. Filtering by `userId` matters
   * because the in-memory notifications list is shared across roles.
   */
  const unreadCount = user
    ? getNotificationsForUser(user.id).filter((n) => !n.read).length
    : 0;

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
          // No manual redirect needed — the route guard in
          // app/seller/_layout.tsx sends us to /auth/login once session=null.
          onPress: () => logout(),
        },
      ],
      { cancelable: true },
    );
  };

  const openProfile = () => {
    setMenuOpen(false);
    (navigation as any).navigate?.("profile");
  };

  return (
    <View style={styles.header}>
      {/* Left — opens the drawer */}
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => (navigation as any).openDrawer?.()}
        accessibilityLabel="Open menu"
        accessibilityRole="button"
      >
        <Ionicons name="menu-outline" size={26} color={Colors.text} />
      </TouchableOpacity>

      {/* Center — current page */}
      <Text style={styles.title} numberOfLines={1}>
        {title ?? "Seller Portal"}
      </Text>

      {/* Right — notifications + account menu */}
      <View style={styles.rightCluster}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => (navigation as any).navigate?.("notifications")}
          accessibilityLabel={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          accessibilityRole="button"
        >
          <Ionicons name="notifications-outline" size={22} color={Colors.text} />
          {unreadCount > 0 ? (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.avatarBtn}
          onPress={() => setMenuOpen(true)}
          accessibilityLabel="Account menu"
          accessibilityRole="button"
        >
          <Avatar name={userFullName} size={32} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Account menu — anchored under the avatar */}
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
          <View style={[styles.menu, { top: insets.top + 56 }]}>
            <View style={styles.menuIdentity}>
              <Avatar name={userFullName} size={40} color={Colors.primary} />
              <View style={styles.menuIdentityText}>
                <Text style={styles.menuName} numberOfLines={1}>
                  {userFullName}
                </Text>
                <Text style={styles.menuRole} numberOfLines={1}>
                  {user?.email ?? "Seller"}
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
                name="storefront-outline"
                size={20}
                color={Colors.text}
              />
              <Text style={styles.menuItemText}>Shop Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={confirmLogout}
              accessibilityRole="button"
            >
              <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
              <Text style={[styles.menuItemText, { color: Colors.danger }]}>
                Logout
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginLeft: Spacing.xs,
  },
  rightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
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

  // ── Account menu ────────────────────────────────────────────────────────
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
