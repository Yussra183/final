/**
 * AdminLayout — responsive wrapper that places the AdminSidebar on the
 * left for tablet/desktop (≥ 900 px) and provides a slide-in drawer on
 * mobile. Renders a modern top bar with:
 *
 *   • hamburger (always visible — opens the sidebar drawer)
 *   • breadcrumb "System Admin / <page>"
 *   • page title + subtitle
 *   • live notification bell (AdminApi.notifications)
 *   • admin profile menu (avatar + name → /profile + Logout)
 *
 * The hamburger is always shown so the admin can open the sidebar at any
 * time, on any width. On desktop it's a redundant convenience — the
 * sidebar is already there — on mobile it's the only way to navigate.
 * The header profile area is the single place the admin's identity
 * appears; the sidebar intentionally has no profile chip / logout row.
 */
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../../constants/colors";
import { AdminSidebar } from "./AdminSidebar";
import { AdminIcon } from "./Icon";
import { AdminApi } from "../../api/endpoints";
import { useStore } from "../../store/StoreContext";
import type { AdminNotification } from "../../../constants/types";

const DESKTOP_BREAKPOINT = 900;

interface Props {
  title: string;
  subtitle?: string;
  /**
   * Optional right-side actions rendered inside the top bar. The Admin
   * chrome keeps a tight, fixed shape — hamburger, notifications bell,
   * admin profile chip — and ignores `rightActions` so pages can't
   * crowd the header. Pull-to-refresh on the body still works via the
   * separate `refreshControl` prop.
   */
  rightActions?: React.ReactNode;
  /**
   * Pull-to-refresh control for the body scroll view. Admin pages read
   * from the backend on every reload, so this is how a user forces a
   * re-fetch without leaving the screen.
   */
  refreshControl?: React.ReactElement<
    React.ComponentProps<typeof RefreshControl>
  >;
  children: React.ReactNode;
}

export function AdminLayout({
  title,
  subtitle,
  rightActions,
  refreshControl,
  children,
}: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const router = useRouter();
  const { session, logout } = useStore();
  const adminName =
    session?.user?.fullName || session?.user?.username || "Admin";
  const adminInitials = adminName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  // Header dropdowns
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifs, setNotifs] = useState<AdminNotification[]>([]);
  const profileButtonRef = useRef<View>(null);

  // Close the open dropdown if the window size flips so it doesn't stick
  // around across a viewport change.
  useEffect(() => {
    setProfileOpen(false);
  }, [isDesktop]);

  // Fetch the latest notifications once on mount so the bell has an
  // accurate badge — the full list lives on /notifications.
  useEffect(() => {
    let cancelled = false;
    AdminApi.notifications()
      .then((rows) => {
        if (!cancelled) setNotifs(rows);
      })
      .catch(() => {
        /* swallow — header bell just won't show a count */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unreadCount = notifs.filter((n) => !n.read).length;

  const handleOpenNotifications = () => {
    setProfileOpen(false);
    router.push("/notifications" as any);
  };

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    router.replace("/auth/login" as any);
  };

  const handleGoProfile = () => {
    setProfileOpen(false);
    router.push("/profile" as any);
  };

  const content = (
    <View style={styles.content}>
      {/* Top bar — minimal: hamburger · notification bell · profile
          chip. The page-specific title / breadcrumb / subtitle render
          inside the body so the chrome stays compact. */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          {/* Hamburger — always visible. On mobile it opens the
              sidebar; on desktop the sidebar is already there but the
              button keeps the title row aligned with the action rail. */}
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setDrawerOpen(true)}
            activeOpacity={0.8}
            accessibilityLabel="Open sidebar"
          >
            <Ionicons name="menu-outline" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.topBarRight}>
          {/* Notification bell — opens the Notifications page so the
              admin can read full messages and act on them. */}
          <View>
            <TouchableOpacity
              style={styles.iconButton}
              activeOpacity={0.8}
              onPress={handleOpenNotifications}
            >
              <Ionicons
                name="notifications-outline"
                size={18}
                color={Colors.text}
              />
              {unreadCount > 0 ? (
                <View style={styles.iconBadge}>
                  <Text style={styles.iconBadgeText}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>

          {/* Profile chip */}
          <View ref={profileButtonRef} collapsable={false}>
            <TouchableOpacity
              style={styles.profileChip}
              activeOpacity={0.85}
              onPress={() => setProfileOpen((v) => !v)}
            >
              <View style={styles.avatarBubble}>
                <Text style={styles.avatarText}>
                  {adminInitials || "A"}
                </Text>
              </View>
              <View style={styles.profileText}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {adminName}
                </Text>
                <Text style={styles.profileRole} numberOfLines={1}>
                  System Admin
                </Text>
              </View>
              <Ionicons
                name="chevron-down-outline"
                size={14}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Profile dropdown */}
      {profileOpen ? (
        <View style={styles.dropdown} pointerEvents="box-none">
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => setProfileOpen(false)}
          />
          <View
            style={[
              styles.dropdownPanel,
              styles.dropdownPanelRight,
            ]}
          >
            <View style={styles.profileHeader}>
              <View style={[styles.avatarBubble, styles.avatarBubbleLg]}>
                <Text style={styles.avatarText}>
                  {adminInitials || "A"}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {adminName}
                </Text>
                <Text style={styles.profileRole} numberOfLines={1}>
                  {session?.user?.email ?? "System Admin"}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={handleGoProfile}
            >
              <AdminIcon name="profile" size={16} color={Colors.text} />
              <Text style={styles.dropdownItemText}>My Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={handleLogout}
            >
              <AdminIcon name="logout" size={16} color={Colors.danger} />
              <Text style={[styles.dropdownItemText, { color: Colors.danger }]}>
                Logout
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Body */}
      <ScrollView
        contentContainerStyle={[
          styles.body,
          !isDesktop && styles.bodyMobile,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {/* Page heading — lives inside the body so the top bar can
            stay a constant compact chrome across every screen. */}
        <View style={styles.pageHeading}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {children}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView
      style={styles.desktopRoot}
      edges={isDesktop ? ["top", "left", "right"] : ["top"]}
    >
      {isDesktop ? (
        <>
          <View style={styles.desktopSidebar}>
            <AdminSidebar asPanel />
          </View>
          <View style={{ flex: 1 }}>{content}</View>
        </>
      ) : (
        <View style={{ flex: 1 }}>{content}</View>
      )}

      {/* Mobile/tablet drawer — only mounted when the persistent
              sidebar isn't already visible, otherwise the hamburger
              would open a redundant modal over the desktop sidebar. */}
      {!isDesktop ? (
        <Modal
          visible={drawerOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setDrawerOpen(false)}
        >
          <Pressable
            style={styles.drawerBackdrop}
            onPress={() => setDrawerOpen(false)}
          >
            <Pressable style={styles.drawerPanel} onPress={() => undefined}>
              <SafeAreaView style={{ flex: 1 }} edges={["top", "left"]}>
                <AdminSidebar onNavigate={() => setDrawerOpen(false)} />
              </SafeAreaView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  desktopRoot: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: Colors.background,
  },
  desktopSidebar: {
    width: 260,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  content: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
    ...Shadow.card,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  pageHeading: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: "900",
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  iconBadgeText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "900",
  },
  profileChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    maxWidth: 220,
  },
  profileText: {
    flexShrink: 1,
  },
  profileName: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  profileRole: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  avatarBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.admin,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBubbleLg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "900",
  },
  dropdown: {
    position: "absolute",
    top: 64,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  dropdownPanel: {
    position: "absolute",
    top: 12,
    right: Spacing.lg,
    width: 320,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    ...Shadow.card,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  dropdownPanelRight: {
    right: Spacing.lg,
    width: 260,
  },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  dropdownTitle: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  dropdownLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  dropdownError: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: "600",
    paddingHorizontal: Spacing.md,
  },
  dropdownHelper: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontWeight: "600",
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  notifIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  notifTitle: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.text,
  },
  notifMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: "600",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  dropdownItemText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.text,
  },
  body: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  bodyMobile: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: Colors.scrim,
    flexDirection: "row",
  },
  drawerPanel: {
    width: 280,
    backgroundColor: Colors.surface,
    height: "100%",
  },
});
