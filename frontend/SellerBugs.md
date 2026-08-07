# Seller-Side Bug & UX Audit

> Audited: 2026-08-07  
> Covers: `app/seller/` — all 10 screens (dashboard, orders, inventory, delivery, live-tracking, reports, notifications, profile, licences, _layout)

---

## 🔴 High-Severity Bugs

### BUG-01 · `inventory.tsx` — "Edit Product" creates a duplicate instead of updating

**File:** `app/seller/inventory.tsx` · Lines 340–360  
**Status:** ❌ Open

`handleEditConfirm` calls `addProduct()` (insert) instead of a dedicated update mutation.
Every "Save" in the Edit modal adds a **brand-new duplicate product** with a new ID.
The original product stays in the store with its old price and description.

```ts
// ❌ WRONG — creates a duplicate
const handleEditConfirm = (patch) => {
  addProduct({              // ← should be updateProduct(editTarget.id, patch)
    sellerId: editTarget.sellerId,
    name: editTarget.name,
    price: patch.price,
    ...
  });
};
```

**Fix:**
1. Add `updateProduct(id, patch)` action to the store.
2. Change `handleEditConfirm` to call `updateProduct(editTarget.id, patch)`.

---

### BUG-02 · `inventory.tsx` — "Delete" sets stock=0 but never removes the product

**File:** `app/seller/inventory.tsx` · Lines 362–379  
**Status:** ❌ Open

`handleDelete` zeroes the stock counter (`updateProductStock(p.id, 0)`) and shows a
success "Removed" alert. The product **stays fully visible** in the list with 0 units.
The seller is told the product was removed but it was not — actively misleading.

```ts
// ❌ WRONG — zeroing stock ≠ deleting
onPress: () => {
  updateProductStock(p.id, 0);   // ← should be deleteProduct(p.id)
  Alert.alert("Removed", ...);   // misleading — item is still in the list
}
```

**Fix:**
1. Add `deleteProduct(id)` action to the store.
2. Replace the `updateProductStock` call with `deleteProduct(p.id)`.

---

## 🟠 Medium-Severity Bugs

### BUG-03 · `orders.tsx` — `allOrders` memo has a missing dependency — stale tab counts

**File:** `app/seller/orders.tsx` · Lines 419–422  
**Status:** ❌ Open

The `useMemo` that computes `allOrders` depends on `user` and `getOrdersForUser`, but
**not** on the `orders` store slice. When the store pushes a new/updated order (e.g.
after accept/reject), neither dep changes, so the memo never re-evaluates. Tab badge
counts and the filtered list stay stale until the seller navigates away.

```ts
// ❌ WRONG — missing `orders` in deps
const allOrders = useMemo(
  () => (user ? getOrdersForUser(user.id, "seller") : []),
  [user, getOrdersForUser],  // ← `orders` missing
);
```

**Fix:**
```ts
// Destructure `orders` from the store, then add to deps:
const { session, orders, getOrdersForUser, ... } = useStore();

const allOrders = useMemo(
  () => (user ? getOrdersForUser(user.id, "seller") : []),
  [user, orders, getOrdersForUser],  // ✅ orders added
);
```

---

### BUG-04 · `dashboard.tsx` — "See all / View all / Manage" links are completely dead

**File:** `app/seller/dashboard.tsx` · Lines 289, 308, 334  
**Status:** ❌ Open

Three `<TouchableOpacity>` elements (Recent Orders "See all", Notifications "View all",
Low Stock "Manage") have **no `onPress` handler**. Tapping them silently does nothing.
Users will assume navigation is broken.

```tsx
// ❌ No onPress — dead link
<TouchableOpacity>
  <Text style={styles.linkText}>See all</Text>
</TouchableOpacity>
```

**Fix:** Import `useRouter` from `expo-router` and wire each button:

```tsx
const router = useRouter();

// Recent Orders → See all
<TouchableOpacity onPress={() => router.push("/seller/orders")}>

// Notifications → View all
<TouchableOpacity onPress={() => router.push("/seller/notifications")}>

// Low Stock → Manage
<TouchableOpacity onPress={() => router.push("/seller/inventory")}>
```

---

### BUG-05 · `delivery.tsx` — Cancel delivery button has no confirmation guard

**File:** `app/seller/delivery.tsx` · Lines 271–276  
**Status:** ❌ Open

The "Cancel" button calls `cancel()` immediately on press — no dialog, no undo.
A single mis-tap on an active delivery cancels it with no recovery path.

```tsx
// ❌ No guard — immediate cancel
<TouchableOpacity style={styles.cancelBtn} onPress={cancel}>
  <Text>Cancel</Text>
</TouchableOpacity>
```

**Fix:**
```tsx
<TouchableOpacity
  style={styles.cancelBtn}
  onPress={() =>
    Alert.alert(
      "Cancel delivery?",
      "This will cancel the active delivery and notify the rider.",
      [
        { text: "Keep", style: "cancel" },
        { text: "Cancel delivery", style: "destructive", onPress: cancel },
      ],
    )
  }
>
```

---

## 🟡 Low-Severity Bugs

### BUG-06 · `notifications.tsx` — All notifications marked read on mount (before user sees them)

**File:** `app/seller/notifications.tsx` · Lines 183–192  
**Status:** ❌ Open

`markAllNotificationsRead(user.id)` fires the moment the screen mounts — before the
seller has scrolled or read anything. A seller switching tabs quickly loses all
unread badges without seeing the content.

**Fix:** Mark individual notifications read only when the seller taps them
(`onPress` → `markNotificationRead(item.id)`). Optionally add an explicit
"Mark all read" button instead of the auto-fire.

---

### BUG-07 · `dashboard.tsx` — `boxShadow` is CSS-only, silently ignored on Android

**File:** `app/seller/dashboard.tsx` · Line 412  
**Status:** ❌ Open

```ts
summaryCard: {
  boxShadow: "0 4px 8px rgba(0,0,0,0.08)",  // ❌ web CSS — not valid in RN StyleSheet
}
```

React Native uses `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius`
(iOS) and `elevation` (Android). `boxShadow` does nothing on device.

**Fix:**
```ts
summaryCard: {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 4,        // Android
}
```

---

## 🟡 UX Friction Points

### UX-01 · `orders.tsx` — Multi-item orders only show the first item on the card

**File:** `app/seller/orders.tsx` · Lines 155–190  

`OrderCard` always reads `order.items[0]` for Gas Type / Size / Qty.
A customer ordering 2+ products shows only the first one. No indicator of
additional items exists on the card (the detail modal shows all correctly).

**Fix:** When `order.items.length > 1`, show `{order.items.length} items` or
render a compact multi-line list.

---

### UX-02 · `reports.tsx` — Bar chart hides values below TSh 1,000

**File:** `app/seller/reports.tsx` · Lines 63–65  

```ts
{d.value > 0 ? Math.round(d.value / 1000) + "k" : ""}
```

A sale of TSh 500 rounds to `0k` and renders as an empty string.
The bar is visible but has no label — looks broken.

**Fix:**
```ts
d.value >= 1000
  ? Math.round(d.value / 1000) + "k"
  : d.value > 0
    ? String(d.value)
    : ""
```

---

### UX-03 · `inventory.tsx` — Stock bar hardcoded to 50 units = 100%

**File:** `app/seller/inventory.tsx` · Line 60  

```ts
const stockPct = Math.min(100, (product.stock / 50) * 100);
```

A seller with 200 units sees a bar capped at 100% at 50 units.
The progress bar conveys no information above 50.

**Fix:**
```ts
const maxStock = Math.max(50, ...myProducts.map(p => p.stock));
const stockPct = Math.min(100, (product.stock / maxStock) * 100);
```

---

### UX-04 · `delivery.tsx` — Rider location shown as raw lat/lng coordinates

**File:** `app/seller/delivery.tsx` · Lines 294–296  

```tsx
<Text>{state.riderLatLng.lat.toFixed(4)}, {state.riderLatLng.lng.toFixed(4)}</Text>
```

`−6.7924, 39.2083` is meaningless to a seller. They need a human-readable location.

**Fix:** Reverse-geocode the coordinates and display a street/district label, or
compute a directional label: `"1.2km north-east of your shop"`.

---

### UX-05 · `orders.tsx` — No pull-to-refresh on the orders list

**File:** `app/seller/orders.tsx` · Lines 494–555  

The main `ScrollView` has no `RefreshControl`. A seller waiting for a new order
must navigate away and back to see updates.

**Fix:**
```tsx
const [refreshing, setRefreshing] = useState(false);
const onRefresh = async () => {
  setRefreshing(true);
  try { await refresh(); } finally { setRefreshing(false); }
};

<ScrollView
  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
>
```

---

### UX-06 · `profile.tsx` — Working hours hardcoded and uneditable

**File:** `app/seller/profile.tsx` · Line 139  

```ts
hours: "Mon–Sat, 08:00 – 20:00",  // static — always this, for every seller
```

Displayed as a real business field but the value never changes.
Sellers may trust this as their actual hours — it isn't.

**Fix:** Add a `workingHours` field to the `User` model and expose it in the
Edit Business Address modal. Until then, mark it: `"Default hours (not set)"`.

---

## Summary Table

| ID | File | Severity | Status | Title |
|----|------|----------|--------|-------|
| BUG-01 | inventory.tsx | 🔴 High | ❌ Open | Edit creates duplicate product |
| BUG-02 | inventory.tsx | 🔴 High | ❌ Open | Delete sets stock=0, product stays |
| BUG-03 | orders.tsx | 🟠 Medium | ❌ Open | Stale allOrders — missing dep |
| BUG-04 | dashboard.tsx | 🟠 Medium | ❌ Open | "See all" links are dead (no onPress) |
| BUG-05 | delivery.tsx | 🟠 Medium | ❌ Open | Cancel delivery has no confirmation |
| BUG-06 | notifications.tsx | 🟡 Low | ❌ Open | Mark-all-read fires on mount |
| BUG-07 | dashboard.tsx | 🟡 Low | ❌ Open | boxShadow ignored on Android |
| UX-01 | orders.tsx | 🟡 Medium | ❌ Open | Multi-item orders show only first item |
| UX-02 | reports.tsx | 🟡 Low | ❌ Open | Bar chart hides values < 1k |
| UX-03 | inventory.tsx | 🟡 Low | ❌ Open | Stock bar hardcoded 50-unit max |
| UX-04 | delivery.tsx | 🟡 Low | ❌ Open | Rider location shown as raw lat/lng |
| UX-05 | orders.tsx | 🟡 Medium | ❌ Open | No pull-to-refresh on orders list |
| UX-06 | profile.tsx | 🟡 Medium | ❌ Open | Working hours hardcoded/uneditable |
