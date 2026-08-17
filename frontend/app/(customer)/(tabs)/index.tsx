/**
 * Customer Home — Map-first dashboard. Tab destination inside the
 * bottom-tab navigator (`(customer)/(tabs)/_layout.tsx`).
 *
 * Architecture
 * ------------
 * - Map: full-bleed map showing every nearby seller with finite
 *   lat/lng. Tap a pin → seller-details screen.
 * - Location: `useCustomerLocation` resolves device GPS first, then
 *   the saved profile address, then Zanzibar default. The map
 *   centres on the resolved coordinates and is framed so the user +
 *   every nearby seller are visible at once.
 * - Floating buttons:
 *     • "Locate me" — re-runs the GPS resolver, recentres the map.
 *     • "List"     — opens a `Sheet` showing the same sellers in a
 *                    vertical list. Tap a row → seller details.
 * - Empty state: "Set a delivery address on your profile…" when no
 *   sellers are visible.
 *
 * App bar is intentionally minimal: title + notification bell on the
 * right. The drawer (and its hamburger) is gone; logout now lives
 * inside the Profile tab.
 */
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../../constants/colors";
import { Card } from "../../../src/components/Card";
import { StatusPill } from "../../../src/components/StatusPill";
import { Sheet } from "../../../src/components/Sheet";
import {
  NearbySellersMap,
  type NearbySellerMarker,
} from "../../../src/components/NearbySellersMap";
import { PressableScale, PulseDot } from "../../../src/components/MicroAnimations";
import { useStore } from "../../../src/store/StoreContext";
import { useNearbySellers } from "../../../src/hooks/useNearbySellers";
import { useCustomerLocation } from "../../../src/hooks/useCustomerLocation";
import { identityColor } from "../../../src/lib/identityColor";
import {
  UNGUJA_PLACES,
  nearestPlaceName,
} from "../../../src/lib/ungujaPlaces";
import { isFiniteNumber } from "../../../src/components/mapPickerBridge";
import type { NearbySeller } from "../../../src/utils/sellers";

export default function CustomerHome() {
  const router = useRouter();
  const { session, getNotificationsForUser, sellers: storeSellers } =
    useStore();

  // Sourced from the live `GET /api/sellers` store slice. The seller
  // IDs, names, lat/lng, and open/closed status all come straight from
  // the backend here — the map picks up the same data the next useMemo
  // passes to the markers array.
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
      locationStatus: s.locationStatus ?? "OK",
    }));
  }, [storeSellers]);

  const { sellers, usingDefaultLocation, effectiveLocation } =
    useNearbySellers(apiSellers);

  // Live device location — drives the "You" pin on the map. Once
  // permission is granted this hook subscribes to watchPositionAsync,
  // so the pin keeps moving with the customer (throttled to 3 s / 5 m).
  // The hook never overwrites the customer's saved profile address;
  // `effectiveLocation` (used for the server-side sellers query) stays
  // tied to `session.user.lat/lng` per the useNearbySellers contract.
  const { coords: deviceCoords, refresh: refreshDeviceLocation } =
    useCustomerLocation();

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
  // Bolt-lite: privacy-style toggle that hides the customer's "You"
  // pin AND the underlying native blue dot together. Default ON.
  const [showUserPin, setShowUserPin] = useState(true);
  // Bolt-lite: highlighted seller (tapped on the map or in the sheet)
  // — used to paint both the pin and the matching card in the
  // selected colour.
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(
    null,
  );

  const user = session?.user;
  const unreadCount = user
    ? getNotificationsForUser(user.id).filter((n) => !n.read).length
    : 0;

  // ---- Markers derived from the recommendation list ------------------
  // Sellers without finite coords are dropped from the map so the
  // customer never sees an invented shop marker. They can still remain
  // in the list flow when the current query path allows it.
  // Each marker is annotated with the nearest Unguja place name
  // (resolved via `nearestPlaceName`).
  // Bolt-lite: also carry the business name, open/closed status,
  // distance, and cylinder sizes through to the marker so the
  // `<NearbySellersMap>` can render richer pin labels.
  const { mappedMarkers, mappedSellers } = useMemo(() => {
    const mapped: NearbySellerMarker[] = sellers
      .filter(
        (s) => isFiniteNumber(s.lat) && isFiniteNumber(s.lng),
      )
      .map((s) => {
        const lat = s.lat!;
        const lng = s.lng!;
        const placeName = nearestPlaceName({ lat, lng });
        const distanceKm = isFiniteNumber(s.distanceKm) ? s.distanceKm : Number.NaN;
        return {
          id: s.id,
          lat,
          lng,
          label: placeName ?? `${distanceKm.toFixed(1)} km`,
          name: s.name,
          status: s.status,
          distanceKm,
          cylinderSizes: s.cylinderSizes,
          locationStatus: "OK",
        };
      });
    if (__DEV__) {
      console.log(
        "[SELLER_DEBUG][MARKERS]",
        mapped.map((m) => ({
          id: m.id,
          name: m.name,
          lat: m.lat,
          lng: m.lng,
          locationStatus: m.locationStatus ?? "OK",
        })),
      );
      // Diagnostic: log every approved seller that reached the
      // marker mapper so we can confirm each one carries its OWN
      // lat/lng (and that all of them reach the map, not just one).
      // Wrapped in __DEV__ so this never ships to production
      // bundles.
      console.info(
        "[CUSTOMER_HOME][NEARBY_SELLERS_MARKERS]",
        JSON.stringify({
          totalSellersReturned: sellers.length,
          markersGenerated: mapped.length,
          missingLocationSellers: sellers.length - mapped.length,
          markers: mapped.map((m) => ({
            id: m.id,
            name: m.name,
            lat: m.lat,
            lng: m.lng,
            locationStatus: m.locationStatus,
          })),
        }),
      );
    }
    return { mappedMarkers: mapped, mappedSellers: sellers };
  }, [sellers, storeSellers]);

  // Open the seller-details screen with the tapped id. From the
  // sheet we close the bottom sheet first so the route push doesn't
  // collide with the sheet's modal animation.
  const openSeller = useCallback(
    (id: string) => {
      setSelectedSellerId(id);
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

  // Handle a pin tap from the map: highlight the matching card and
  // navigate directly to the seller-details screen so the customer
  // sees the shop name, inventory, and distance without an extra
  // sheet step. The bottom sheet remains reachable via the "List"
  // FAB for customers who prefer the list view.
  const onPinTap = useCallback(
    (id: string) => {
      openSeller(id);
    },
    [openSeller],
  );

  // ---- Floating buttons ---------------------------------------------
  const onLocateMe = () => {
    // Kick a fresh GPS fix so the recentre target reflects the
    // device, not a stale profile address. The hook re-runs the
    // permission + GPS race and re-arms the watch subscription on
    // success; while the race is in flight we also bump the recentre
    // token so the camera animates back to whatever centre the
    // resolver is about to land on.
    setRecenterToken((t) => t + 1);
    void refreshDeviceLocation();
  };

  // The map's `center` is the live device position when we have one,
  // otherwise the resolved profile address. We recompute on
  // `recenterToken` so the floating button nudges the camera back to
  // the user.
  const mapCenter = useMemo(() => {
    if (
      isFiniteNumber(deviceCoords.lat) &&
      isFiniteNumber(deviceCoords.lng)
    ) {
      return { lat: deviceCoords.lat, lng: deviceCoords.lng };
    }
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
  }, [deviceCoords.lat, deviceCoords.lng, effectiveLocation, recenterToken]);

  // Customer location summary for the top-left chip. Distinct from
  // `effectiveLocation` (which falls back to the first seller when
  // the customer has no profile address / GPS, so the "Nearby
  // Sellers" hook still has a centre). Showing a seller's location
  // here would be misleading — the chip must always read the
  // customer's own area. Precedence: profile address → live GPS
  // "city-ish" label → generic fallback.
  const customerLocationLabel = useMemo(() => {
    if (user?.address && user.address.trim().length > 0) {
      return `Near ${user.address.trim()}`;
    }
    if (
      isFiniteNumber(deviceCoords.lat) &&
      isFiniteNumber(deviceCoords.lng)
    ) {
      // We have GPS but no profile address. Snap to the nearest known
      // Unguja place so the chip shows a human-readable name instead
      // of raw coordinates. `nearestPlaceName` returns null when the
      // fix is outside Unguja, in which case we fall back to the
      // generic copy.
      const place = nearestPlaceName({
        lat: deviceCoords.lat,
        lng: deviceCoords.lng,
      });
      return place ? `Near ${place}` : "Using your live location";
    }
    return "Using default location";
  }, [user?.address, deviceCoords.lat, deviceCoords.lng]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      {/* ---------------- Header ---------------- */}
      {/* Minimal app bar: title left-aligned, notification bell on the
          right. The drawer and its hamburger are gone; logout lives in
          the Profile tab. */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
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
          showUserPin={showUserPin}
          selectedId={selectedSellerId ?? undefined}
          // `auto` — first paint frames the user together with every
          // nearby seller so the customer sees both themselves and the
          // surrounding service area at a glance. When sellers sit far
          // from the customer the bbox widens (still clamped to
          // Unguja); when they cluster tightly, the camera zooms in
          // to street level. "Locate me" still re-centres via
          // `recenterToken` and uses a tighter street-level delta.
          fitMode="auto"
          style={StyleSheet.absoluteFill}
          onMarkerTap={onPinTap}
        />

        {/* Top-left floating chip: location summary. Always shows the
            CUSTOMER's area (profile address or live GPS), never a
            seller's — see `customerLocationLabel` above. */}
        <View style={styles.locationChip} pointerEvents="none">
          <Ionicons
            name={usingDefaultLocation ? "location-outline" : "navigate-outline"}
            size={14}
            color={Colors.primary}
          />
          <Text style={styles.locationChipText} numberOfLines={1}>
            {customerLocationLabel}
          </Text>
        </View>

        {/* Bottom-right floating button cluster. */}
        <View style={styles.fabCluster}>
          <PressableScale
            onPress={() => setShowUserPin((v) => !v)}
            style={StyleSheet.flatten([
              styles.fab,
              styles.fabGhost,
              showUserPin && styles.fabGhostActive,
            ])}
            accessibilityRole="switch"
            accessibilityState={{ checked: showUserPin }}
            accessibilityLabel={
              showUserPin ? "Hide my live location" : "Show my live location"
            }
          >
            <Ionicons
              name={showUserPin ? "eye-outline" : "eye-off-outline"}
              size={20}
              color={showUserPin ? Colors.accent : Colors.primary}
            />
          </PressableScale>
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
            {mappedMarkers.length > 0 ? (
              <View style={styles.fabBadge}>
                <Text style={styles.fabBadgeText}>{mappedMarkers.length}</Text>
              </View>
            ) : null}
          </PressableScale>
        </View>

        {/* Empty state overlay over the map. The previous
            implementation showed "No sellers nearby" whenever the
            marker array was empty, which conflated three distinct
            failure modes. The copy now branches on the actual root
            cause: no approved sellers at all, sellers exist but the
            customer is outside the 25 km radius, or sellers exist but
            are stuck with no GPS pin (the original symptom). */}
        {mappedMarkers.length === 0 ? (
          <View style={styles.mapEmptyWrap} pointerEvents="box-none">
            <Card style={styles.mapEmptyCard}>
              <Ionicons
                name="search-outline"
                size={36}
                color={Colors.textMuted}
              />
              <Text style={styles.mapEmptyTitle}>
                {usingDefaultLocation
                  ? "Set a delivery address to see sellers"
                  : mappedSellers.length === 0
                  ? "No sellers yet"
                  : "No sellers in your area"}
              </Text>
              <Text style={styles.mapEmptyText}>
                {usingDefaultLocation
                  ? "Set a delivery address on your profile to see sellers in your area."
                  : mappedSellers.length === 0
                  ? "We're working on onboarding sellers across Zanzibar. Check back soon."
                  : "The approved sellers we found are outside the 25 km service radius. Pull the list to see them anyway."}
              </Text>
              <PressableScale
                onPress={() => setSheetOpen(true)}
                style={styles.mapEmptyCta}
              >
                <Text style={styles.mapEmptyCtaText}>
                  {mappedSellers.length > 0 ? "View full list" : "Update delivery address"}
                </Text>
              </PressableScale>
            </Card>
          </View>
        ) : null}
      </View>

      {/* ---------------- Bottom sheet (list) ---------------- */}
      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={`Nearby sellers (${mappedMarkers.length})`}
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
              color={identityColor(item.id)}
              selected={item.id === selectedSellerId}
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
  color,
  selected,
  onPress,
}: {
  seller: NearbySeller;
  color: string;
  selected: boolean;
  onPress: () => void;
}) {
  const initials = seller.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const hasNoCoords = !isFiniteNumber(seller.lat) || !isFiniteNumber(seller.lng);
  const hasFiniteDistance = isFiniteNumber(seller.distanceKm);
  const sizes = seller.cylinderSizes ?? [];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetRow,
        pressed && { opacity: 0.85 },
        selected && styles.sheetRowSelected,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`View details for ${seller.name}`}
    >
      <View
        style={[
          styles.sheetRowAvatar,
          { backgroundColor: color },
          selected && [
            styles.sheetRowAvatarSelected,
            { borderColor: color },
          ],
        ]}
      >
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
            {hasFiniteDistance ? `${seller.distanceKm.toFixed(1)} km` : "—"}
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
        {sizes.length > 0 ? (
          <View style={styles.sheetRowSizes}>
            {sizes.slice(0, 4).map((size) => (
              <View key={size} style={styles.sheetRowSizeChip}>
                <Text style={styles.sheetRowSizeChipText}>{size}</Text>
              </View>
            ))}
          </View>
        ) : null}
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
  notifBtn: {
    backgroundColor: "#CCFBF1",
    marginLeft: Spacing.xs,
  },
  notifDotWrap: {
    position: "absolute",
    top: -3,
    right: -3,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "flex-start",
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
  fabGhostActive: {
    borderWidth: 2,
    borderColor: Colors.accent,
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
    borderRadius: Radius.md,
  },
  sheetRowSelected: {
    backgroundColor: "#CCFBF1",
  },
  sheetRowAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetRowAvatarSelected: {
    borderWidth: 2,
    borderColor: Colors.accent,
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
  sheetRowSizes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
  },
  sheetRowSizeChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sheetRowSizeChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.primary,
  },
});
