/**
 * AdminAsyncBoundary — renders the loading / error states around a
 * backend-driven admin screen.
 *
 * Admin screens read from `/api/admin/**` via `useAdminResource`, so they
 * all share the same three pre-content states: a spinner on first load, a
 * retryable message when the request failed, and the content itself. This
 * keeps that shape in one place so every screen behaves identically when
 * the backend is slow or unreachable.
 *
 * The empty case is deliberately NOT handled here — "no rows" is
 * screen-specific (a filtered table says something different from an
 * unfiltered one), so screens render {@link AdminEmptyState} themselves.
 */
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../../constants/colors";
import { AdminButton } from "./AdminButton";

interface Props {
  loading: boolean;
  error: string | null;
  /** Re-runs the fetch. Wired to the retry button on the error state. */
  onRetry: () => void;
  /** True once data has arrived; keeps content visible during a refresh. */
  hasData: boolean;
  children: React.ReactNode;
  loadingLabel?: string;
}

export function AdminAsyncBoundary({
  loading,
  error,
  onRetry,
  hasData,
  children,
  loadingLabel = "Loading from server…",
}: Props) {
  // First load — nothing to show yet.
  if (loading && !hasData) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={Colors.admin} />
        <Text style={styles.loadingText}>{loadingLabel}</Text>
      </View>
    );
  }

  // Failed with nothing cached to fall back on.
  if (error && !hasData) {
    return (
      <View style={styles.centre}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>⚠️</Text>
        </View>
        <Text style={styles.errorTitle}>Couldn&apos;t load this page</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <View style={{ marginTop: Spacing.lg }}>
          <AdminButton label="Try again" icon="↻" onPress={onRetry} />
        </View>
      </View>
    );
  }

  return (
    <>
      {/* A refresh failed but stale data is still on screen — say so
          rather than silently showing figures that may have moved. */}
      {error ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Showing the last loaded data — refresh failed: {error}
          </Text>
          <AdminButton
            label="Retry"
            variant="ghost"
            size="sm"
            onPress={onRetry}
          />
        </View>
      ) : null}
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  centre: {
    paddingVertical: Spacing.xxl * 2,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
    fontWeight: "700",
    fontSize: FontSize.sm,
  },
  errorIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  errorIconText: { fontSize: 36 },
  errorTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  errorMessage: {
    marginTop: 4,
    color: Colors.textSecondary,
    textAlign: "center",
    fontWeight: "600",
    paddingHorizontal: Spacing.xl,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    backgroundColor: "#FEF3C7",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  bannerText: {
    flex: 1,
    color: "#92400E",
    fontWeight: "700",
    fontSize: FontSize.sm,
  },
});
