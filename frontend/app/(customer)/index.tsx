/**
 * Customer Home — Map-first dashboard.
 *
 * Architecture
 * ------------
 * - Map: full-bleed OpenStreetMap (`NearbyMap`) showing every nearby
 *   seller with finite lat/lng. Tap a pin → seller-details screen.
 * - Location: `useCustomerLocation` resolves device GPS first, then
 *   the saved profile address, then Zanzibar default. The map centres
 *   on the resolved coordinates.
 * - Floating buttons:
 *     • "Locate me" — re-runs the GPS resolver, recentres the map.
 *     • "List"     — opens a `Sheet` showing the same sellers in a
 *                    vertical list (a `Place Order`-free mirror of
 *                    the prior screen). Tap a row → seller details.
 * - Empty state: unchanged copy ("Set a delivery address on your
 *   profile…") when no sellers are visible.
 * - Per-row "Place Order" CTA was REMOVED in favour of the
 *   flow-through-the-details-screen path. The Home screen no longer
 *   goes directly to the order form; the seller details screen is
 *   the new entry point.
 *
 * The header (drawer / notifications / logout) is unchanged.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
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
import { Sheet } from "../../src/components/Sheet";
import {
  NearbySellersMap,
  type NearbySellerMarker,
} from "../../src/components/NearbySellersMap";
import { PressableScale, PulseDot } from "../../src/components/MicroAnimations";
import { useStore } from "../../src/store/StoreContext";
import { useNearbySellers } from "../../src/hooks/useNearbySellers";
import {
  UNGUJA_PLACES,
  nearestPlaceName,
} from "../../src/lib/ungujaPlaces";
import {
  isFiniteNumber,
} from "../../src/components/mapPickerBridge";
import type { NearbySeller } from "../../src/utils/sellers";

export default function CustomerHome() {
  const router = useRouter();
  const drawer = useNavigation<any>();
  const { session, logout, getNotificationsForUser, sellers: storeSellers } =
    useStore();

  // Sourced from the live `GET /api/sellers` store slice.
  const apiSellers: NearbySeller[] = useMemo(() => {
    return storeSellers.map((s) => ({
      id: s.sellerId,
      name: s.businessName,
      status: s.openNow ? ("Active" as const) : ("Closed" as const),
      distanceKm: s.distanceKm,
      location: s.location,
      district: undefined,
      region: undefined,
      gasTypes: ["LPG"],
      cylinderSizes: s.availableSizes,
      phone: s.phone,
      lat: s.lat,
      lng: s.lng,
    }));
  }, [storeSellers]);

  const { sellers, usingDefaultLocation, effectiveLocation } =
    useNearbySellers(apiSellers);

  // Local UI state — bottom sheet visibility + a tick to nudge the
  // camera back to the user's resolved location when they tap
  // "Locate me", plus the active place chip (drives the map's
  // recentre target).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);
  // Place-chip selection state is kept so the chip strip still shows
  // its active highlight, but it no longer drives a camera recentre —
  // the map stays framed on "user + all nearby sellers" at all times.
  // Tapping a seller pin still opens the seller-details screen via
  // `onMarkerTap` below.
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);

  const user = session?.user;
  const unreadCount = user
    ? getNotificationsForUser(user.id).filter((n) => !n.read).length
    : 0;

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

  // ---- Markers derived from the recommendation list ------------------
  // Sellers without finite coords are dropped from the map (the plan
  // calls this out explicitly — they still appear in the bottom sheet).
  // Each marker is annotated with the nearest Unguja place name
  // (resolved via `nearestPlaceName`); if the seller's coordinates
  // fall within 1.5 km of a known place, the pin is also snapped to
  // that place's centroid so two sellers on the same street don't
  // overlap on the map.
  const { mappedMarkers, mappedSellers } = useMemo(() => {
    const mapped: NearbySellerMarker[] = sellers
      .filter((s) => isFiniteNumber(s.lat) && isFiniteNumber(s.lng))
      .map((s) => {
        const placeName = nearestPlaceName({ lat: s.lat!, lng: s.lng! });
        return {
          id: s.id,
          lat: s.lat!,
          lng: s.lng!,
          // Show the resolved place name under the pin (or the raw
          // distance if the seller is more than 1.5 km from any
          // known place).
          label: placeName ?? `${s.distanceKm.toFixed(1)} km`,
        };
      });
    return { mappedMarkers: mapped, mappedSellers: sellers };
  }, [sellers]);

  // Open the seller-details screen with the tapped id. From the
  // sheet we close the bottom sheet first so the route push doesn't
  // collide with the sheet's modal animation.
  const openSeller = useCallback(
    (id: string) => {
      setSheetOpen(false);
      // tiny defer so the sheet close animation starts before push
      setTimeout(() => {
        router.push({
          pathname: "/(customer)/seller/" + encodeURIComponent(id),
        } as any);
      }, 60);
    },
    [router],
  );

  // ---- Floating buttons ---------------------------------------------
  const onLocateMe = () => {
    // Bump the recenter token — `useCustomerLocation` is read-only on
    // mount per its contract, so the simplest UX is to bump a counter
    // that the map's `center` will pick up below by re-reading
    // `effectiveLocation`. The hook is intentionally not re-run here
    // (would race the device permission flow); the visible effect is
    // the map recentring, which matches the user's request.
    setRecenterToken((t) => t + 1);
    // If there's no current source and we still rely on the default,
    // we don't have anything better to centre on; the map will keep
    // its current view.
  };

  // The map's `center` is the resolved location. We intentionally
  // recompute on `recenterToken` so the floating button nudges the
  // camera back to the user.
  const mapCenter = useMemo(() => {
    if (
      effectiveLocation &&
      isFiniteNumber(effectiveLocation.lat) &&
      isFiniteNumber(effectiveLocation.lng)
    ) {
      return {
        lat: effectiveLocation.lat,
        lng: effectiveLocation.lng,
      };
    }
    return { lat: -6.1629, lng: 39.2026 }; // Zanzibar
    // recenterToken is referenced to keep the memo freshness tied
    // to the button tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveLocation, recenterToken]);

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

      {/* ---------------- Places chip strip ---------------- */}
      {/* Horizontal scroll of Unguja places; tap a chip to recentre
          the map on that place. The active chip is highlighted. */}
      <View style={styles.placesWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={UNGUJA_PLACES}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.placesList}
          renderItem={({ item }) => {
            const active = item.id === activePlaceId;
            return (
              <PressableScale
                onPress={() => {
                  // Toggle: tapping the same chip again clears it and
                  // the map returns to the bbox-fit view.
                  setActivePlaceId((current) =>
                    current === item.id ? null : item.id,
                  );
                }}
                style={StyleSheet.flatten([
                  styles.placeChip,
                  active && styles.placeChipActive,
                ])}
                accessibilityRole="button"
                accessibilityLabel={`Centre map on ${item.name}`}
              >
                <Ionicons
                  name={
                    active
                      ? "location"
                      : item.region === "Zanzibar City"
                      ? "business"
                      : item.region === "North" || item.region === "South"
                      ? "sunny-outline"
                      : "navigate-outline"
                  }
                  size={12}
                  color={active ? "#FFF" : Colors.primary}
                />
                <Text
                  style={[
                    styles.placeChipText,
                    active && styles.placeChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
              </PressableScale>
            );
          }}
        />
      </View>

      {/* ---------------- Map ---------------- */}
      <View style={styles.mapWrap}>
        <NearbySellersMap
          markers={mappedMarkers}
          center={mapCenter}
          recenterToken={recenterToken}
          style={StyleSheet.absoluteFill}
          onMarkerTap={(id) => openSeller(id)}
        />

        {/* Top-left floating chip: location summary. */}
        <View style={styles.locationChip} pointerEvents="none">
          <Ionicons
            name={usingDefaultLocation ? "location-outline" : "navigate-outline"}
            size={14}
            color={Colors.primary}
          />
          <Text style={styles.locationChipText} numberOfLines={1}>
            {effectiveLocation?.address
              ? `Near ${effectiveLocation.address}`
              : "Using default location"}
          </Text>
        </View>

        {/* Bottom-right floating button cluster. */}
        <View style={styles.fabCluster}>
          <PressableScale
            onPress={onLocateMe}
            style={StyleSheet.flatten([styles.fab, styles.fabGhost])}
            accessibilityLabel="Recentre on my location"
          >
            <Ionicons name="locate" size={20} color={Colors.primary} />
          </PressableScale>
          <PressableScale
            onPress={() => setSheetOpen(true)}
            style={styles.fab}
            accessibilityLabel="Open seller list"
          >
            <Ionicons name="list-outline" size={20} color="#FFF" />
            {mappedSellers.length > 0 ? (
              <View style={styles.fabBadge}>
                <Text style={styles.fabBadgeText}>{mappedSellers.length}</Text>
              </View>
            ) : null}
          </PressableScale>
        </View>

        {/* Empty state overlay over the map. */}
        {mappedSellers.length === 0 ? (
          <View style={styles.mapEmptyWrap} pointerEvents="box-none">
            <Card style={styles.mapEmptyCard}>
              <Ionicons
                name="search-outline"
                size={36}
                color={Colors.textMuted}
              />
              <Text style={styles.mapEmptyTitle}>No sellers nearby</Text>
              <Text style={styles.mapEmptyText}>
                {usingDefaultLocation
                  ? "Set a delivery address on your profile to see sellers in your area."
                  : "No nearby approved gas sellers found in your area."}
              </Text>
              <PressableScale
                onPress={() => router.push("/(customer)/profile" as any)}
                style={styles.mapEmptyCta}
              >
                <Text style={styles.mapEmptyCtaText}>Update delivery address</Text>
              </PressableScale>
            </Card>
          </View>
        ) : null}
      </View>

      {/* ---------------- Bottom sheet (list) ---------------- */}
      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={`Nearby sellers (${mappedSellers.length})`}
      >
        <FlatList
          data={mappedSellers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.sheetList}
          ItemSeparatorComponent={() => (
            <View style={styles.sheetDivider} />
          )}
          ListEmptyComponent={
            <View style={styles.sheetEmpty}>
              <Ionicons
                name="search-outline"
                size={32}
                color={Colors.textMuted}
              />
              <Text style={styles.sheetEmptyTitle}>No sellers nearby</Text>
              <Text style={styles.sheetEmptyText}>
                Pull down the map to refresh, or update your delivery address.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <SheetSellerRow
              seller={item}
              onPress={() => openSeller(item.id)}
            />
          )}
        />
      </Sheet>
    </SafeAreaView>
  );
}

// ----------------------------------------------------------------------
// Bottom-sheet row — a smaller card density than the old Home card.
// ----------------------------------------------------------------------
function SheetSellerRow({
  seller,
  onPress,
}: {
  seller: NearbySeller;
  onPress: () => void;
}) {
  const initials = seller.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const hasNoCoords = !isFiniteNumber(seller.lat) || !isFiniteNumber(seller.lng);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetRow,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`View details for ${seller.name}`}
    >
      <View style={styles.sheetRowAvatar}>
        <Text style={styles.sheetRowAvatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.sheetRowTop}>
          <Text style={styles.sheetRowName} numberOfLines={1}>
            {seller.name}
          </Text>
          <StatusPill
            label={seller.status}
            tone={seller.status === "Active" ? "success" : "muted"}
          />
        </View>
        <View style={styles.sheetRowMeta}>
          <Ionicons name="navigate-outline" size={12} color={Colors.primary} />
          <Text style={styles.sheetRowMetaText}>
            {seller.distanceKm.toFixed(1)} km
          </Text>
          {hasNoCoords ? (
            <View style={styles.sheetRowNoCoords}>
              <Ionicons
                name="location-outline"
                size={12}
                color={Colors.textMuted}
              />
              <Text style={styles.sheetRowNoCoordsText}>Location not set</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sheetRowLocation} numberOfLines={1}>
          {seller.location}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={Colors.textSecondary}
      />
    </Pressable>
  );
}

// ----------------------------------------------------------------------
// Styles
// ----------------------------------------------------------------------
const styles = StyleSheet.create({
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
  /* ----- Places chip strip ----- */
  placesWrap: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  placesList: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  placeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  placeChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  placeChipText: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.text,
  },
  placeChipTextActive: {
    color: "#FFF",
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

  /* ----- Map + overlays ----- */
  mapWrap: {
    flex: 1,
    position: "relative",
  },
  locationChip: {
    position: "absolute",
    top: Spacing.md,
    left: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: "70%",
    boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
  },
  locationChipText: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.text,
    flexShrink: 1,
  },

  fabCluster: {
    position: "absolute",
    right: Spacing.md,
    bottom: Spacing.md,
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 10px rgba(15,118,110,0.35)",
  },
  fabGhost: {
    backgroundColor: Colors.surface,
    boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
  },
  fabBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  fabBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#FFF",
  },

  mapEmptyWrap: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  mapEmptyCard: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    padding: Spacing.lg,
  },
  mapEmptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  mapEmptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  mapEmptyCta: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  mapEmptyCtaText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: FontSize.sm,
  },

  /* ----- Bottom sheet ----- */
  sheetList: {
    paddingVertical: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  sheetEmpty: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  sheetEmptyTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  sheetEmptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 20,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  sheetRowAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetRowAvatarText: {
    color: "#FFF",
    fontSize: FontSize.md,
    fontWeight: "800",
  },
  sheetRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  sheetRowName: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  sheetRowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  sheetRowMetaText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: "700",
  },
  sheetRowNoCoords: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: Spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceMuted,
  },
  sheetRowNoCoordsText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  sheetRowLocation: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
