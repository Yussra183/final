/**
 * SellerHeader — branded top bar used on every Seller screen.
 *
 * Layout:
 *   [☰]   [avatar] <seller full name>   [🔔 notifications] [✉ messages] [👤 profile]
 *
 * The ☰ button calls `navigation.openDrawer()` so the sidebar slides in.
 * The profile button surfaces an Alert.alert confirmation; on confirm it
 * clears the session and routes back to /auth/login (preserving the
 * original logout behaviour — it's now reached through the avatar/profile
 * icon, which mirrors how professional dashboards treat the user menu).
 */
import React from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { useStore } from "../store/StoreContext";

interface SellerHeaderProps {
  title?: string;
}

export function SellerHeader({ title }: SellerHeaderProps) {
  // `useNavigation()` returns the drawer navigator's nav object inside a drawer
  // screen, which exposes openDrawer() / closeDrawer().
  const navigation = useNavigation();
  // `getNotificationsForUser` is a memoised selector over the shared
  // notifications list in the store — it returns the same reference
  // until a notification is added / removed / read, so subscribing to
  // it here means the badge re-renders the instant the Seller
  // Notifications screen flips the rows to `read: true`, without the
  // header needing its own state or polling.
  const { session, logout, getNotificationsForUser } = useStore();

  const user = session?.user;
  const userFullName = user?.fullName ?? "Seller";

  /**
   * Unread count for the *current* seller. Filtering by `userId` is
   * important because the same in-memory notifications list is shared
   * across every signed-in role; if the store ever carried rows for
   * other users (it currently doesn't, but the helper is the safe
   * one) the badge would otherwise flash false positives for them.
   */
  const unreadCount = user
    ? getNotificationsForUser(user.id).filter((n) => !n.read).length
    : 0;

  const confirmLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: () => {
            logout();
            // navigation.reset isn't strictly necessary because the route
            // guard in app/seller/_layout.tsx will redirect when session=null.
          },
        },
      ],
      { cancelable: true },
    );
  };

  const openNotifications = () => {
    (navigation as any).navigate?.("notifications");
  };

  const openProfile = () => {
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

      {/* Center — seller identity (avatar + full name) */}
      <View style={styles.identity}>
        <Avatar
          name={userFullName}
          size={36}
          color={Colors.primary}
          style={styles.avatar}
        />
        <View style={styles.nameWrap}>
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          <Text style={styles.sellerName} numberOfLines={1}>
            {userFullName}
          </Text>
        </View>
      </View>

      {/* Right — professional system icons: notifications, messages, profile */}
      <View style={styles.rightCluster}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={openNotifications}
          accessibilityLabel={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
          accessibilityRole="button"
        >
          <Ionicons
            name="notifications-outline"
            size={22}
            color={Colors.text}
          />
          {/*
            Red unread-count dot. Rendered only when the seller has at
            least one unread row. When the Seller Notifications screen
            flips every row to read=true on mount, the store list
            updates and this component re-renders with unreadCount=0,
            so the badge disappears instantly — no manual refresh,
            no app restart. If a new notification arrives later the
            badge reappears because the count ticks back above 0.
          */}
          {unreadCount > 0 ? <View style={styles.notifBadge} /> : null}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={openProfile}
          accessibilityLabel="Messages"
          accessibilityRole="button"
        >
          <Ionicons
            name="mail-unread-outline"
            size={22}
            color={Colors.text}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={confirmLogout}
          accessibilityLabel="Profile"
          accessibilityRole="button"
        >
          <Ionicons
            name="person-circle-outline"
            size={24}
            color={Colors.text}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  avatar: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  nameWrap: {
    flex: 1,
  },
  title: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  sellerName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  rightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notifBadge: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
});
