/**
 * src/utils/customerRouting.ts
 *
 * Shared customer-side navigation helpers. Centralised so the home
 * screen and the seller-details screen both encode the order-form
 * params the same way — the decoder lives on the receiving end of
 * the route (`readSeller` in `app/(customer)/orders.tsx`) and any
 * drift here would silently break pre-fill.
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
 * same screen entry pattern: router.push("/(customer)/orders"). The
 * "Choose another seller" CTA in the details screen instead uses
 * `router.back()` to return to the map.
 */
import type { Router } from "expo-router";
import type { NearbySeller } from "./sellers";

/**
 * Pipe-joined arrays survive the URL param round-trip safely without
 * JSON-encoding. `readSeller()` on the orders screen splits on `|`.
 * Empty values are dropped so we don't pass `"LPG|"` to the form.
 */
function joinPipe(items: string[] | undefined | null): string {
  if (!items) return "";
  return items.map((s) => (typeof s === "string" ? s : "")).filter(Boolean).join("|");
}

/**
 * Build the URL params for `/(customer)/orders` so the order form
 * pre-fills the seller.
 *
 * Exposed independently (in addition to `placeOrderForSeller`) so
 * callers that want to navigate via a different surface (e.g.
 * imperative gesture from a sheet row) can still reuse the payload
 * shape.
 */
export function orderParamsForSeller(seller: NearbySeller): {
  pathname: "/(customer)/orders";
  params: {
    sellerId: string;
    sellerName: string;
    sellerLocation: string;
    sellerGasTypes: string;
    sellerSizes: string;
  };
} {
  return {
    pathname: "/(customer)/orders" as const,
    params: {
      sellerId: seller.id,
      sellerName: seller.name,
      sellerLocation: seller.location,
      sellerGasTypes: joinPipe(seller.gasTypes),
      sellerSizes: joinPipe(seller.cylinderSizes),
    },
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
): void {
  router.push(orderParamsForSeller(seller) as unknown as Parameters<Router["push"]>[0]);
}
