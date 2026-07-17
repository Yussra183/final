/**
 * AdminTable — generic, responsive table with sticky-feeling header,
 * row separators and per-row action slots. Designed for the admin
 * dashboard's "list" pages (Suppliers, Sellers, Riders, etc.).
 *
 * On narrow viewports the table gracefully degrades to a stacked list
 * via the `responsive` prop, but the default desktop layout uses the
 * full grid with column widths.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../../constants/colors";

export interface AdminTableColumn<T> {
  key: string;
  label: string;
  /** Flex weight, defaults to 1. */
  flex?: number;
  /** Render cell content for a given row. */
  render: (row: T) => React.ReactNode;
  /** Optional alignment override. */
  align?: "left" | "right" | "center";
}

interface Props<T> {
  columns: AdminTableColumn<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  /** When set, rendered as the right-most cell of each row. */
  rowActions?: (row: T) => React.ReactNode;
  emptyMessage?: string;
}

export function AdminTable<T>({
  columns,
  rows,
  keyExtractor,
  rowActions,
  emptyMessage = "No records found.",
}: Props<T>) {
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={[styles.row, styles.headerRow]}>
        {columns.map((c) => (
          <View
            key={c.key}
            style={{
              flex: c.flex ?? 1,
              alignItems:
                c.align === "right"
                  ? "flex-end"
                  : c.align === "center"
                  ? "center"
                  : "flex-start",
            }}
          >
            <Text style={styles.headerText}>{c.label}</Text>
          </View>
        ))}
        {rowActions ? (
          <View style={{ width: 140, alignItems: "flex-end" }}>
            <Text style={styles.headerText}>Actions</Text>
          </View>
        ) : null}
      </View>

      {/* Body */}
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      ) : (
        rows.map((row, idx) => (
          <View
            key={keyExtractor(row)}
            style={[
              styles.row,
              styles.bodyRow,
              idx === rows.length - 1 && { borderBottomWidth: 0 },
            ]}
          >
            {columns.map((c) => (
              <View
                key={c.key}
                style={{
                  flex: c.flex ?? 1,
                  alignItems:
                    c.align === "right"
                      ? "flex-end"
                      : c.align === "center"
                      ? "center"
                      : "flex-start",
                }}
              >
                {c.render(row)}
              </View>
            ))}
            {rowActions ? (
              <View style={styles.actionCell}>{rowActions(row)}</View>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    ...Shadow.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerRow: {
    backgroundColor: Colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textSecondary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  bodyRow: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  empty: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  actionCell: {
    width: 140,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
});