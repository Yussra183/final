import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { PressableScale, PulseDot } from "../../src/components/MicroAnimations";
import { useStore } from "../../src/store/StoreContext";
import { useNearbySellers } from "../../src/hooks/useNearbySellers";
import type { NearbySeller } from "../../src/utils/sellers";

/**
 * Mock seller pool. Lives at module scope so React doesn't re-create
 * the array on every render, and so future filtering helpers can be
 * unit-tested against a stable fixture.
 *
 * Each entry carries:
 *   • id, name, status, image
 *   • location, district, region (so district/region filtering works)
 *   • lat / lng (so GPS-based distance ranking works in the future)
 *   • gasTypes, cylinderSizes, phone (rendered on the card)
 *   • distanceKm (pre-computed server value; kept for display)
 */
const MOCK_SELLERS: NearbySeller[] = [
  {
    id: "s-1",
    name: "ABC Gas Supplier",
    image:
      "https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=400&h=300&fit=crop",
    status: "Active",
    distanceKm: 1.5,
    location: "Stone Town, Zanzibar",
    district: "Stone Town",
    region: "Zanzibar Urban",
    lat: -6.1629,
    lng: 39.2026,
    gasTypes: ["LPG", "Cooking Gas"],
    cylinderSizes: ["6kg", "15kg", "38kg"],
    phone: "+255 712 345 678",
  },
  {
    id: "s-2",
    name: "Zanzibar Gas Center",
    image:
      "https://images.unsplash.com/photo-1605664041952-4a2855dbf953?w=400&h=300&fit=crop",
    status: "Active",
    distanceKm: 2.4,
    location: "Kariakoo, Zanzibar",
    district: "Stone Town",
    region: "Zanzibar Urban",
    lat: -6.165,
    lng: 39.205,
    gasTypes: ["LPG", "Cooking Gas", "Industrial Gas"],
    cylinderSizes: ["6kg", "13kg", "15kg", "38kg"],
    phone: "+255 713 222 909",
  },
  {
    id: "s-3",
    name: "SafeGas Supplier",
    image:
      "https://images.unsplash.com/photo-1611288875785-f2b4c2d4f0a5?w=400&h=300&fit=crop",
    status: "Active",
    distanceKm: 6.2,
    location: "Mwera, Zanzibar",
    district: "Mwera",
    region: "Zanzibar West",
    lat: -6.21,
    lng: 39.24,
    gasTypes: ["LPG", "Cooking Gas"],
    cylinderSizes: ["6kg", "12.5kg", "15kg"],
    phone: "+255 715 884 110",
  },
  {
    id: "s-4",
    name: "Green Flame Gas",
    image:
      "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=300&fit=crop",
    status: "Active",
    distanceKm: 9.8,
    location: "Mkocheni, Dar es Salaam",
    district: "Mkocheni",
    region: "Dar es Salaam",
    lat: -6.76,
    lng: 39.24,
    gasTypes: ["LPG", "Refill"],
    cylinderSizes: ["6kg", "15kg", "22kg", "38kg"],
    phone: "+255 718 003 421",
  },
  {
    id: "s-5",
    name: "City Gas Distributor",
    image:
      "https://images.unsplash.com/photo-1612892483236-52d32a0e0ac1?w=400&h=300&fit=crop",
    status: "Active",
    distanceKm: 11.3,
    location: "Buguruni, Dar es Salaam",
    district: "Buguruni",
    region: "Dar es Salaam",
    lat: -6.83,
    lng: 39.26,
    gasTypes: ["LPG"],
    cylinderSizes: ["6kg", "15kg", "50kg"],
    phone: "+255 717 550 219",
  },
];

/**
 * Customer Home — Dashboard landing page.
 *
 * Architecture:
 *   • `useNearbySellers(MOCK_SELLERS)` returns the recommendation
 *     list, already filtered and ranked by the customer's profile
 *     location. When the customer's address changes (today via
 *     the profile screen, tomorrow via GPS), the list updates
 *     automatically because the hook re-derives on location change.
 *   • Each card has its own "Place Order" button that pushes the
 *     Orders screen with the chosen seller attached as route params.
 *   • The Orders screen reads those params, pre-fills the seller
 *     block, and renders an order form for the customer to complete.
 */
export default function CustomerHome() {
  const router = useRouter();
  const drawer = useNavigation<any>();
  const { session, logout, getNotificationsForUser } = useStore();
  const { sellers, usingDefaultLocation, effectiveLocation } =
    useNearbySellers(MOCK_SELLERS);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const user = session?.user;
  const unreadCount = user
    ? getNotificationsForUser(user.id).filter((n) => !n.read).length
    : 0;
  const firstName = useMemo(
    () => (user?.fullName ? user.fullName.split(" ")[0] : "Customer"),
    [user?.fullName],
  );

  const openDrawer = () => {
    drawer.openDrawer?.();
  };

  const confirmLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          logout();
          router.replace("/auth/login" as any);
        },
      },
    ]);
  };

  /**
   * Push the Orders screen with the chosen seller attached as params
   * so the order form can pre-fill the seller.
   */
  const placeOrderForSeller = (seller: NearbySeller) => {
    router.push({
      pathname: "/(customer)/orders",
      params: {
        sellerId: seller.id,
        sellerName: seller.name,
        sellerLocation: seller.location,
        sellerGasTypes: seller.gasTypes.join("|"),
        sellerSizes: seller.cylinderSizes.join("|"),
      },
    } as any);
  };

  const markImageError = (id: string) =>
    setImageErrors((prev) => ({ ...prev, [id]: true }));

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      {/* ---------------- Header ---------------- */}
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Open drawer menu"
          style={styles.iconBtn}
          onPress={openDrawer}
        >
          <Ionicons name="menu-outline" size={20} color={Colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Home</Text>
        </View>

        <TouchableOpacity
          accessibilityLabel="View notifications"
          style={[styles.iconBtn, styles.notifBtn]}
          onPress={() => router.push("/(customer)/notifications" as any)}
        >
          <Ionicons
            name="notifications-outline"
            size={20}
            color={Colors.primary}
          />
          {unreadCount > 0 ? (
            <View style={styles.notifDotWrap}>
              <PulseDot size={10} color={Colors.danger} />
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityLabel="Logout"
          style={[styles.iconBtn, styles.logoutBtn]}
          onPress={confirmLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#B91C1C" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------- Welcome ---------------- */}
        <View style={styles.welcomeBlock}>
          <Text style={styles.welcomeTitle}>Welcome Back, {firstName}</Text>
          <Text style={styles.welcomeSubtitle}>
            Find nearby gas sellers around you
          </Text>
          {effectiveLocation?.address ? (
            <Text style={styles.welcomeLocation}>
              Showing sellers near {effectiveLocation.address}
            </Text>
          ) : null}
        </View>

        {/* ---------------- Nearby Sellers ---------------- */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Nearby Active Sellers</Text>
          <Text style={styles.sectionMeta}>
            {sellers.length} available
          </Text>
        </View>

        {sellers.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No sellers nearby</Text>
            <Text style={styles.emptyText}>
              {usingDefaultLocation
                ? "Set a delivery address on your profile to see sellers in your area."
                : "Try changing your profile address to find more sellers."}
            </Text>
          </Card>
        ) : (
          sellers.map((seller) => {
            const initials = seller.name
              .split(" ")
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join("");
            const useFallback = imageErrors[seller.id];

            return (
              <Card key={seller.id} style={styles.sellerCard}>
                <View style={styles.sellerImageWrap}>
                  {useFallback ? (
                    <View style={styles.sellerImageFallback}>
                      <Text style={styles.sellerImageFallbackText}>
                        {initials}
                      </Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: seller.image }}
                      style={styles.sellerImage}
                      onError={() => markImageError(seller.id)}
                    />
                  )}
                  <View style={styles.sellerAvatarBadge}>
                    <Ionicons name="storefront-outline" size={18} color={Colors.primary} />
                  </View>
                </View>

                <View style={styles.sellerBody}>
                  <View style={styles.sellerNameRow}>
                    <Text style={styles.sellerName} numberOfLines={1}>
                      {seller.name}
                    </Text>
                    <StatusPill
                      label={seller.status}
                      tone={seller.status === "Active" ? "success" : "muted"}
                    />
                  </View>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Distance: </Text>
                      {seller.distanceKm.toFixed(1)} km
                    </Text>
                    <Text style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Location: </Text>
                      {seller.location}
                    </Text>
                  </View>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Gas Types: </Text>
                      {seller.gasTypes.length
                        ? seller.gasTypes.join(", ")
                        : "—"}
                    </Text>
                  </View>

                  <View style={styles.sizeRow}>
                    {seller.cylinderSizes.map((s) => (
                      <View key={s} style={styles.sizePill}>
                        <Text style={styles.sizePillText}>{s}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.phoneRow}>
                    <Ionicons name="call-outline" size={14} color={Colors.primary} />
                    <Text style={styles.phoneValue}>{seller.phone}</Text>
                  </View>
                </View>

                {/* Per-card "Place Order" CTA — does NOT place the order;
                    it just routes the user to the form with the seller
                    pre-selected. */}
                <PressableScale
                  onPress={() => placeOrderForSeller(seller)}
                  style={styles.placeOrderBtn}
                >
                  <View style={styles.placeOrderInner}>
                    <Ionicons name="add-circle-outline" size={16} color="#FFF" />
                    <Text style={styles.placeOrderText}>Place Order</Text>
                  </View>
                </PressableScale>
              </Card>
            );
          })
        )}

        <View style={{ height: Spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  /* ----- Header ----- */
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutBtn: {
    backgroundColor: "#FEE2E2",
    marginLeft: Spacing.xs,
  },
  notifBtn: {
    backgroundColor: "#CCFBF1",
    marginLeft: Spacing.xs,
  },
  notifDotWrap: {
    position: "absolute",
    top: -3,
    right: -3,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },

  /* ----- Welcome ----- */
  welcomeBlock: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  welcomeTitle: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.text,
  },
  welcomeSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  welcomeLocation: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: "700",
    marginTop: 6,
  },

  /* ----- Section header ----- */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  sectionMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },

  /* ----- Empty state ----- */
  emptyCard: {
    alignItems: "center",
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.sm,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  /* ----- Seller card ----- */
  sellerCard: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  sellerImageWrap: {
    position: "relative",
    height: 130,
    borderRadius: Radius.md,
    overflow: "hidden",
    backgroundColor: Colors.surfaceMuted,
    marginBottom: Spacing.md,
  },
  sellerImage: {
    width: "100%",
    height: "100%",
  },
  sellerImageFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  sellerImageFallbackText: {
    color: "#FFF",
    fontSize: FontSize.xxl,
    fontWeight: "800",
  },
  sellerAvatarBadge: {
    position: "absolute",
    bottom: -10,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
  },
  sellerBody: {
    paddingTop: Spacing.xs,
  },
  sellerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  sellerName: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    flex: 1,
  },
  metaRow: {
    marginTop: 6,
  },
  metaItem: {
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  metaLabel: {
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  sizeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: Spacing.sm,
  },
  sizePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#CCFBF1",
    borderRadius: Radius.pill,
  },
  sizePillText: {
    color: Colors.primary,
    fontWeight: "700",
    fontSize: FontSize.xs,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 6,
  },
  phoneValue: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.text,
  },

  /* ----- Per-card "Place Order" button ----- */
  placeOrderBtn: {
    marginTop: Spacing.md,
  },
  placeOrderInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 12,
    gap: 6,
    boxShadow: "0 2px 4px rgba(15,118,110,0.25)",
  },
  placeOrderText: {
    color: "#FFF",
    fontSize: FontSize.md,
    fontWeight: "800",
  },
});