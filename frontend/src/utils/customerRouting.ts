/**
 * src/utils/customerRouting.ts
 *
 * Shared customer-side navigation helpers. Centralised so the home
 * screen and the seller-details screen both encode the order-form
 * params the same way and any drift here would silently break
 * pre-fill.
 *
 * Why a separate util instead of co-locating with each caller?
 * ------------------------------------------------------------
 * The pre-fill payload is small but very specific:
 *
 *   - `sellerId`, `sellerName`           → identity
 *   - `sellerLocation`                   → rendered as a non-form
 *                                           read-only row
 *   - `sellerGasTypes`, `sellerSizes`    → chip arrays in the form,
 *                                           pipe-joined for URL safety
 *
 * Both the Home map (after the "Place Order" prompt on a future
 * iteration) and the new seller-details screen ("Place Order" CTA)
 * need to construct the same payload. Two copies already diverged
 * once during the seller-side audit (the user's request body had
 * `sellerGasTypes` vs `sellerGasTypes` in an unrelated screen), so
 * we've decided to centralise.
 *
 * Both the Home list and the seller details screen also share the
 * same screen entry pattern: router.push("/(customer)/place-order"). The
 * "Choose another seller" CTA in the details screen instead uses
 * `router.back()` to return to the map.
 */
import type { Router } from "expo-router";
import type { NearbySeller } from "./sellers";

/**
 * Optional gas pre-fill for the order form. Both fields must be
 * provided together; partial values are ignored so the place-order
 * screen falls back to its existing seller-scoped brand/size memos.
 */
export interface PlaceOrderGasPrefill {
  gasBrand?: string;
  cylinderSize?: string;
}

/**
 * Pipe-joined arrays survive the URL param round-trip safely without
 * JSON-encoding. The order screen splits them back on `|`.
 * Empty values are dropped so we don't pass blank brand/size slots.
 */
function joinPipe(items: string[] | undefined | null): string {
  if (!items) return "";
  return items.map((s) => (typeof s === "string" ? s : "")).filter(Boolean).join("|");
}

/**
 * Build the URL params for `/(customer)/place-order` so the order form
 * pre-fills the seller.
 *
 * Exposed independently (in addition to `placeOrderForSeller`) so
 * callers that want to navigate via a different surface (e.g.
 * imperative gesture from a sheet row) can still reuse the payload
 * shape.
 */
export function orderParamsForSeller(
  seller: NearbySeller,
  gasPrefill?: PlaceOrderGasPrefill,
): {
  pathname: "/(customer)/place-order";
  params: {
    sellerId: string;
    sellerName: string;
    sellerLocation: string;
    sellerGasTypes: string;
    sellerSizes: string;
    gasBrand?: string;
    cylinderSize?: string;
  };
} {
  const params: ReturnType<typeof orderParamsForSeller>["params"] = {
    sellerId: seller.id,
    sellerName: seller.name,
    sellerLocation: seller.location,
    sellerGasTypes: joinPipe(seller.gasTypes),
    sellerSizes: joinPipe(seller.cylinderSizes),
  };
  // Only forward gas pre-fill when both fields are present — a
  // partial pre-fill would lock the place-order screen into a brand
  // without a size, which the existing `sellerBrands`/`sellerSizes`
  // memos already guard against.
  if (gasPrefill && gasPrefill.gasBrand && gasPrefill.cylinderSize) {
    params.gasBrand = gasPrefill.gasBrand;
    params.cylinderSize = gasPrefill.cylinderSize;
  }
  return {
    pathname: "/(customer)/place-order" as const,
    params,
  };
}

/**
 * Convenience wrapper that navigates immediately via the supplied
 * Expo Router instance.
 *
 * @example
 *   const router = useRouter();
 *   placeOrderForSeller(seller, router);
 */
export function placeOrderForSeller(
  seller: NearbySeller,
  router: Pick<Router, "push">,
  gasPrefill?: PlaceOrderGasPrefill,
): void {
  router.push(
    orderParamsForSeller(seller, gasPrefill) as unknown as Parameters<Router["push"]>[0],
  );
}
