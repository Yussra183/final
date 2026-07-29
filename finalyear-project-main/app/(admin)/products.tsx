/**
 * Admin Dashboard – Products page.
 *
 * Reads `GET /api/admin/products`, which returns the full catalogue
 * across every seller — including inactive rows. The active/inactive
 * filter and free-text search are passed to the backend, so filtering
 * happens against the database.
 *
 * Read-only. The seller-facing write surface is `PATCH
 * /api/products/{id}/stock`; there is no admin-side mutation. The
 * screen reports catalogue state rather than changing it.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminAsyncBoundary,
  AdminAvatar,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminModal,
  AdminSearchBar,
  AdminStatTile,
} from "../../src/components/admin";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { AdminApi } from "../../src/api/endpoints";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import type { AdminProduct } from "../../constants/types";

type FilterKey = "all" | "active" | "inactive";

const formatCurrency = (n: number) =>
  `TZS ${Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewTarget, setViewTarget] = useState<AdminProduct | null>(null);

  // Debounce so a keystroke doesn't fire a request per letter.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const active =
    filter === "all" ? undefined : filter === "active" ? true : false;

  const { data, loading, error, reload, refreshing } = useAdminResource<
    AdminProduct[]
  >(
    () =>
      AdminApi.products({
        q: debouncedSearch || undefined,
        active,
      }),
    [debouncedSearch, active],
  );

  const products = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    const inStock = products.filter((p) => p.stock > 0).length;
    return {
      all: products.length,
      active: products.filter((p) => p.active).length,
      inactive: products.filter((p) => !p.active).length,
      inStock,
    };
  }, [products]);

  return (
    <AdminLayout
      title="Products"
      subtitle="Every product listed in the catalogue"
      rightActions={
        <AdminButton
          label="Refresh"
          icon="↻"
          variant="secondary"
          onPress={reload}
          loading={refreshing}
        />
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={reload} />
      }
    >
      <AdminAsyncBoundary
        loading={loading}
        error={error}
        onRetry={reload}
        hasData={!!data}
        loadingLabel="Loading products…"
      >
        <View style={styles.kpiRow}>
          <AdminStatTile
            label="Products Shown"
            value={counts.all}
            icon="🛢️"
            tone="primary"
          />
          <AdminStatTile
            label="Active"
            value={counts.active}
            icon="✅"
            tone="success"
          />
          <AdminStatTile
            label="Inactive"
            value={counts.inactive}
            icon="💤"
            tone="warning"
          />
          <AdminStatTile
            label="In Stock"
            value={counts.inStock}
            icon="📦"
            tone="info"
          />
        </View>

        <AdminCard style={{ marginTop: Spacing.lg }}>
          <AdminSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name, size or category"
            filters={[
              { key: "all", label: "All" },
              { key: "active", label: "Active" },
              { key: "inactive", label: "Inactive" },
            ]}
            activeFilter={filter}
            onFilterChange={(k) => setFilter(k as FilterKey)}
          />
          {products.length === 0 ? (
            <AdminEmptyState
              icon="🛢️"
              title="No products found"
              message={
                search || filter !== "all"
                  ? "No product in the database matches this filter."
                  : "No products have been added to the catalogue yet."
              }
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ minWidth: 920 }}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.col, { flex: 2.4 }]}>Product</Text>
                  <Text style={[styles.col, { flex: 1.6 }]}>Seller</Text>
                  <Text style={[styles.col, { flex: 0.9 }]}>Size</Text>
                  <Text style={[styles.col, { flex: 1.1, textAlign: "right" }]}>Price</Text>
                  <Text style={[styles.col, { flex: 0.7, textAlign: "center" }]}>Stock</Text>
                  <Text style={[styles.col, { flex: 1.1 }]}>Status</Text>
                  <Text style={[styles.col, { flex: 0.9, textAlign: "right" }]}>
                    Action
                  </Text>
                </View>
                {products.map((p) => (
                  <View key={p.id} style={styles.row}>
                    <View style={[styles.col, { flex: 2.4 }]}>
                      <Text style={styles.cellTitle}>{p.name}</Text>
                      <Text style={styles.cellMeta}>
                        {p.category ?? "—"}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.col,
                        { flex: 1.6, flexDirection: "row", alignItems: "center", gap: 6 },
                      ]}
                    >
                      <AdminAvatar
                        name={p.sellerName ?? "—"}
                        size={26}
                      />
                      <Text style={styles.cellText} numberOfLines={1}>
                        {p.sellerName ?? `Seller ${p.sellerId}`}
                      </Text>
                    </View>
                    <Text style={[styles.col, { flex: 0.9 }]}>
                      {p.size || "—"}
                    </Text>
                    <Text
                      style={[
                        styles.col,
                        { flex: 1.1, textAlign: "right", color: Colors.primary, fontWeight: "800" },
                      ]}
                    >
                      {formatCurrency(p.price)}
                    </Text>
                    <View
                      style={[
                        styles.col,
                        { flex: 0.7, alignItems: "center" },
                      ]}
                    >
                      <View
                        style={[
                          styles.stockBubble,
                          p.stock === 0 && styles.stockBubbleEmpty,
                        ]}
                      >
                        <Text
                          style={[
                            styles.stockText,
                            p.stock === 0 && styles.stockTextEmpty,
                          ]}
                        >
                          {p.stock}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.col, { flex: 1.1 }]}>
                      <AdminBadge
                        label={p.active ? "Active" : "Inactive"}
                        tone={p.active ? "success" : "neutral"}
                      />
                    </View>
                    <View
                      style={[
                        styles.col,
                        { flex: 0.9, alignItems: "flex-end" },
                      ]}
                    >
                      <AdminButton
                        label="View"
                        variant="secondary"
                        size="sm"
                        onPress={() => setViewTarget(p)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </AdminCard>
      </AdminAsyncBoundary>

      {viewTarget ? (
        <AdminModal
          visible
          onClose={() => setViewTarget(null)}
          title={viewTarget.name}
          subtitle={viewTarget.category ?? "Product"}
          hideFooter
        >
          <View style={styles.detailRow}>
            <AdminAvatar name={viewTarget.sellerName ?? "—"} size={56} />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.detailTitle}>{viewTarget.name}</Text>
              <Text style={styles.detailMeta}>
                Sold by {viewTarget.sellerName ?? `Seller ${viewTarget.sellerId}`}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 6,
                  marginTop: 6,
                  flexWrap: "wrap",
                }}
              >
                <AdminBadge
                  label={viewTarget.active ? "Active" : "Inactive"}
                  tone={viewTarget.active ? "success" : "neutral"}
                />
                <AdminBadge
                  label={viewTarget.stock > 0 ? "In stock" : "Out of stock"}
                  tone={viewTarget.stock > 0 ? "info" : "danger"}
                />
              </View>
            </View>
          </View>

          <View style={styles.detailGrid}>
            <Row label="Size" value={viewTarget.size || "—"} />
            <Row label="Category" value={viewTarget.category ?? "—"} />
            <Row label="Price" value={formatCurrency(viewTarget.price)} />
            <Row label="Stock on hand" value={String(viewTarget.stock)} />
          </View>

          {viewTarget.description ? (
            <>
              <Text style={styles.subHeading}>Description</Text>
              <Text style={styles.bodyText}>{viewTarget.description}</Text>
            </>
          ) : null}

          <View style={styles.detailGrid}>
            <Row
              label="Listed"
              value={new Date(viewTarget.createdAt).toLocaleDateString()}
            />
            <Row
              label="Last updated"
              value={new Date(viewTarget.updatedAt).toLocaleDateString()}
            />
          </View>

          <View style={styles.noticeBox}>
            <Text style={styles.noticeTitle}>Read-only here</Text>
            <Text style={styles.noticeText}>
              The admin product list shows the catalogue as it exists. To
              change price, stock or visibility, the seller edits the
              product from their own dashboard.
            </Text>
          </View>
        </AdminModal>
      ) : null}
    </AdminLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  col: {
    paddingHorizontal: 4,
  },
  cellTitle: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  cellMeta: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  cellText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  stockBubble: {
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    minWidth: 36,
    alignItems: "center",
  },
  stockBubbleEmpty: {
    backgroundColor: "#FECACA",
  },
  stockText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  stockTextEmpty: { color: Colors.danger },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  detailTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  detailMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
    fontWeight: "600",
  },
  detailGrid: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  kvLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  kvValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "800",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: Spacing.md,
  },
  subHeading: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  bodyText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "600",
    lineHeight: 20,
  },
  noticeBox: {
    marginTop: Spacing.lg,
    backgroundColor: "#FEF3C7",
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  noticeTitle: {
    color: "#92400E",
    fontWeight: "800",
    fontSize: FontSize.sm,
    marginBottom: 2,
  },
  noticeText: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
});
