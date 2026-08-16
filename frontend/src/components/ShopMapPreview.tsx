/**
 * ShopMapPreview — a small read-only preview of the seller's shop
 * location, rendered inline in the seller Shop Profile "Business
 * Information" card.
 *
 * Reuses `<NearbySellersMap>` so the seller gets the same Bolt-lite
 * pin + halo design as the customer Home, painted in their own
 * `identityColor(session.user.id)` accent. Native on iOS / Android
 * (real Google tiles, native gestures); canvas-grid fallback on
 * web / Expo Go via the same shared renderer.
 *
 * The marker is locked "selected" so the seller sees their shop
 * with the strong Bolt-lite ring that the customer Home uses for
 * the active seller.
 */
import React from "react";
import { StyleSheet } from "react-native";
import { Spacing } from "../../constants/colors";
import { NearbySellersMap } from "./NearbySellersMap";
import { identityColor } from "../lib/identityColor";
import { useStore } from "../store/StoreContext";

interface ShopMapPreviewProps {
  lat: number;
  lng: number;
  height?: number;
}

export function ShopMapPreview({
  lat,
  lng,
  height = 140,
}: ShopMapPreviewProps) {
  const { session } = useStore();
  const me = session?.user;
  const myColor = identityColor(me?.id ?? "self");
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    typeof lng !== "number" ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  return (
    <NearbySellersMap
      markers={[
        {
          id: "self",
          lat,
          lng,
          name: me?.fullName ? `${me.fullName}'s shop` : "Your shop",
          color: myColor,
          selected: true,
        },
      ]}
      center={{ lat, lng }}
      fitMode="fixed"
      includeCenterInFit={false}
      showUserPin={false}
      style={[styles.preview, { height }]}
    />
  );
}

const styles = StyleSheet.create({
  preview: {
    marginTop: Spacing.sm,
  },
});