/**
 * Customer → Seller Details.
 *
 * Reached by tapping a pin on the Home map or a row on the Home map
 * sheet. Renders the seller's public profile (business name, status,
 * rating, address, phone, gas types, cylinder sizes, map preview)
 * with two CTAs at the foot of the scrollable body:
 *
 *   - "Choose another seller"  → `router.back()` (returns to the map)
 *   - "Place Order"            → pushes the order form pre-filled with
 *                                this seller.
 *
 * Data lookup is two-tier:
 *   1. The `useNearbySellers` hook typically already has this seller
 *      (it's the slice we rendered on the map). Cache hit, no fetch.
 *   2. Otherwise (deep link, hot reload, race) we fetch via
 *      `SellersApi.byId` and render a `Card` skeleton during the
 *      brief load window. The mapper below converts
 *      `SellerProfile` → `NearbySeller` so the rest of the screen
 *      uses one shape.
 *
 * Edge cases:
 *   - id not found in the slice AND the API fetch rejects → render
 *     an EmptyState with a "Back to map" button.
 *   - Phone link is a no-op on web (`Linking.openURL` silently
 *     swallows the "no tel: handler" error). The number stays visible.
 *   - The map preview card is omitted when the seller has no
 *     `lat`/`lng` (`ShopMapPreview` returns `null` in that case).
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../../constants/colors";
import { AppButton } from "../../../src/components/AppButton";
import { Card } from "../../../src/components/Card";
import { EmptyState } from "../../../src/components/EmptyState";
import { ShopMapPreview } from "../../../src/components/ShopMapPreview";
import { StatusPill } from "../../../src/components/StatusPill";
import { FadeIn } from "../../../src/components/MicroAnimations";
import { SellersApi } from "../../../src/api/endpoints";
import { useStore } from "../../../src/store/StoreContext";
import { useNearbySellers } from "../../../src/hooks/useNearbySellers";
import { isFiniteNumber } from "../../../src/components/mapPickerBridge";
import { placeOrderForSeller } from "../../../src/utils/customerRouting";
import { SellerProfile } from "../../../constants/types";
import type { NearbySeller } from "../../../src/utils/sellers";

/** Convert a `SellerProfile` (wire shape) to `NearbySeller` (display). */
function sellerProfileToNearby(p: SellerProfile): NearbySeller {
  return {
    id: p.sellerId,
    name: p.businessName,
    status: p.openNow ? ("Active" as const) : ("Closed" as const),
    distanceKm: p.distanceKm,
    location: p.location,
    gasTypes: ["LPG"],
    cylinderSizes: p.availableSizes ?? [],
    phone: p.phone,
    lat: p.lat,
    lng: p.lng,
  };
}

/**
 * Pick the seller out of the cache if available, otherwise fetch
 * once. Uses an "apiSellers"-shaped fallback pool so the hook's
 * data path stays untouched.
 */
function useSellerDetails(id: string): {
  seller: NearbySeller | null;
  loading: boolean;
  error: string | null;
} {
  const { session, sellers: storeSellers } = useStore();
  void session; // session isn't strictly needed; the slice is keyed off storeSellers
  // Build the same fallback pool the home screen feeds the hook with.
  const apiSellers = useMemo<NearbySeller[]>(
    () =>
      storeSellers.map((s) => ({
        id: s.sellerId,
        name: s.businessName,
        status: s.openNow ? ("Active" as const) : ("Closed" as const),
        distanceKm: s.distanceKm,
        location: s.location,
        gasTypes: ["LPG"],
        cylinderSizes: s.availableSizes,
        phone: s.phone,
        lat: s.lat,
        lng: s.lng,
      })),
    [storeSellers],
  );
  const { sellers } = useNearbySellers(apiSellers);
  const cached = sellers.find((s) => s.id === id) ?? null;
  const [fetched, setFetched] = useState<NearbySeller | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    setLoading(true);
    SellersApi.byId(id)
      .then((p) => {
        if (cancelled) return;
        setFetched(sellerProfileToNearby(p));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load seller");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, cached]);

  return { seller: cached ?? fetched, loading, error };
}

export default function CustomerSellerDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { seller, loading, error } = useSellerDetails(id);

  // -------- Render -------------------------------------------------
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header — back chevron only (this screen is a hidden push
          target, not a drawer entry). */}
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Choose another seller"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Seller details</Text>
        <View style={{ width: 40 }} />
      </View>

      {!seller && (loading || (!error && !seller)) ? (
        <View style={styles.loadingWrap}>
          <FadeIn>
            <Card style={styles.loadingCard}>
              <View style={styles.loadingIconWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
              <Text style={styles.loadingTitle}>Loading seller…</Text>
              <Text style={styles.loadingText}>
                Fetching the latest shop information.
              </Text>
            </Card>
          </FadeIn>
        </View>
      ) : !seller ? (
        <View style={styles.loadingWrap}>
          <EmptyState
            icon="🛒"
            title="Seller not found"
            message={
              error ??
              "We couldn't find this shop. Go back to the map and pick another seller."
            }
            action={
              <AppButton
                title="Back to map"
                variant="primary"
                onPress={() => router.back()}
              />
            }
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ---- Header card ---- */}
          <Card style={styles.headerCard}>
            <View style={styles.headerRow}>
              <View style={styles.shopBubble}>
                <Ionicons
                  name="storefront-outline"
                  size={24}
                  color={Colors.primary}
                />
              </View>
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <Text style={styles.shopName} numberOfLines={2}>
                  {seller.name}
                </Text>
                <View style={styles.headerPillsRow}>
                  <StatusPill
                    label={seller.status}
                    tone={seller.status === "Active" ? "success" : "muted"}
                  />
                  {seller.status === "Active" ? (
                    <StatusPill label="Open now" tone="primary" />
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.headerMetaRow}>
              <View style={styles.metaItem}>
                <Ionicons
                  name="navigate-outline"
                  size={14}
                  color={Colors.primary}
                />
                <Text style={styles.metaValue}>
                  {seller.distanceKm.toFixed(1)} km away
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="star" size={14} color={Colors.warning} />
                <Text style={styles.metaValue}>Rated 4.5</Text>
              </View>
            </View>
          </Card>

          {/* ---- Address ---- */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Address</Text>
            <View style={styles.addressRow}>
              <Ionicons
                name="location-outline"
                size={18}
                color={Colors.primary}
              />
              <Text style={styles.addressText}>
                {seller.location || "—"}
              </Text>
            </View>
          </Card>

          {/* ---- Phone ---- */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Contact</Text>
            <TouchableOpacity
              accessibilityLabel={`Call ${seller.phone}`}
              onPress={() => {
                if (!seller.phone) return;
                Linking.openURL(`tel:${seller.phone}`).catch(() => {
                  // Linking silently swallows invalid schemes on web.
                  Alert.alert(
                    "Calling unavailable",
                    "Your device can't place a phone call from this app.",
                  );
                });
              }}
              style={styles.phoneBtn}
            >
              <Ionicons
                name="call-outline"
                size={18}
                color={Colors.primary}
              />
              <Text style={styles.phoneValue}>{seller.phone}</Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={Colors.textSecondary}
                style={{ marginLeft: "auto" }}
              />
            </TouchableOpacity>
          </Card>

          {/* ---- Products ---- */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Products available</Text>

            <Text style={styles.cardLabel}>Gas types</Text>
            <View style={styles.chipRow}>
              {(seller.gasTypes.length ? seller.gasTypes : ["LPG"]).map(
                (g) => (
                  <View key={g} style={styles.chip}>
                    <Text style={styles.chipText}>{g}</Text>
                  </View>
                ),
              )}
            </View>

            <Text style={styles.cardLabel}>Cylinder sizes</Text>
            <View style={styles.chipRow}>
              {(seller.cylinderSizes.length
                ? seller.cylinderSizes
                : ["6kg", "13kg", "15kg", "38kg"]
              ).map((s) => (
                <View key={s} style={styles.chip}>
                  <Text style={styles.chipText}>{s}</Text>
                </View>
              ))}
            </View>
          </Card>

          {/* ---- Map preview (only if the seller has coords) ---- */}
          {isFiniteNumber(seller.lat) && isFiniteNumber(seller.lng) ? (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Shop location</Text>
              <ShopMapPreview
                lat={seller.lat!}
                lng={seller.lng!}
                height={180}
              />
            </Card>
          ) : null}

          {/* Spacer for the in-flow footer below. */}
          <View style={{ height: Spacing.xl }} />

          {/* ---- Footer CTAs ---- */}
          <View style={styles.footer}>
            <AppButton
              title="Choose another seller"
              variant="outline"
              onPress={() => router.back()}
              style={{ flex: 1 }}
            />
            <AppButton
              title="Place Order"
              variant="primary"
              leftIcon={
                <Ionicons name="add-circle-outline" size={16} color="#FFF" />
              }
              onPress={() => placeOrderForSeller(seller, router)}
              style={{ flex: 1.4 }}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },

  /* ----- Scroll content ----- */
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  /* ----- Loading ----- */
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  loadingCard: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    maxWidth: 340,
  },
  loadingIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.md,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },

  /* ----- Header card ----- */
  headerCard: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  shopBubble: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  shopName: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.text,
  },
  headerPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.lg,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "700",
  },

  /* ----- Sections ----- */
  card: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  cardLabel: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: Spacing.md,
    marginBottom: 6,
  },

  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  addressText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },

  phoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySoft,
    gap: Spacing.sm,
  },
  phoneValue: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.primary,
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.primary,
  },

  /* ----- Footer ----- */
  footer: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
});
