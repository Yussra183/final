/**
 * AdminLayout — responsive wrapper that places the AdminSidebar on the
 * left for tablet/desktop (≥ 900 px) and provides a slide-in drawer on
 * mobile. Renders a top bar with a menu toggle, page title, and search.
 */
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../../constants/colors";
import { AdminSidebar } from "./AdminSidebar";

const DESKTOP_BREAKPOINT = 900;

interface Props {
  title: string;
  subtitle?: string;
  /** Optional right-side actions rendered inside the top bar. */
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

  const content = (
    <View style={styles.content}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          {!isDesktop ? (
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setDrawerOpen(true)}
              activeOpacity={0.8}
            >
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
            </TouchableOpacity>
          ) : null}
          <View style={[styles.titleBlock, { marginLeft: isDesktop ? 0 : Spacing.md }]}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.topBarRight}>
          {/* Search is desktop-only — the mobile header is too narrow
              for a 220 px input alongside the action buttons. */}
          {isDesktop ? (
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                placeholder="Search anything…"
                placeholderTextColor={Colors.textMuted}
                style={styles.searchInput as any}
              />
            </View>
          ) : null}
          {rightActions}
          <TouchableOpacity style={styles.iconButton} activeOpacity={0.8}>
            <Text style={styles.iconButtonText}>🔔</Text>
            <View style={styles.iconDot} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Mobile-only inline search row removed — each page renders its
          own AdminSearchBar in the body, so a second search header in
          the top area created a duplicated header on small screens. */}

      {/* Body */}
      <ScrollView
        contentContainerStyle={[
          styles.body,
          !isDesktop && styles.bodyMobile,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
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

      {/* Mobile drawer */}
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
  // Title block needs `flexShrink: 1` + `minWidth: 0` so the text
  // truncates with `numberOfLines` instead of forcing the header to
  // overflow on narrow phone screens.
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
    paddingHorizontal: 10,
  },
  menuLine: {
    width: 18,
    height: 2,
    backgroundColor: Colors.text,
    marginVertical: 2,
    borderRadius: 1,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    minWidth: 220,
  },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    padding: 0,
    ...Platform.select({ web: { outlineStyle: "none" as const } }),
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonText: { fontSize: 18 },
  iconDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
    borderWidth: 2,
    borderColor: Colors.surface,
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
    backgroundColor: "rgba(15,23,42,0.55)",
    flexDirection: "row",
  },
  drawerPanel: {
    width: 280,
    backgroundColor: Colors.surface,
    height: "100%",
  },
});