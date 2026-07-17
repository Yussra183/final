/**
 * AdminSearchBar — search + filter row used at the top of every list
 * page (Suppliers, Sellers, Riders, Customers, Orders, etc.). Includes
 * a text input, optional filter buttons, and an action button slot.
 */
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../../constants/colors";

export interface FilterChip {
  key: string;
  label: string;
  count?: number;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  filters?: FilterChip[];
  activeFilter?: string;
  onFilterChange?: (key: string) => void;
  rightAction?: React.ReactNode;
}

export function AdminSearchBar({
  value,
  onChange,
  placeholder = "Search…",
  filters,
  activeFilter,
  onFilterChange,
  rightAction,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
          />
        </View>
        {rightAction}
      </View>

      {filters && filters.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {filters.map((f) => {
            const active = activeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => onFilterChange?.(f.key)}
                activeOpacity={0.85}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {f.label}
                </Text>
                {f.count !== undefined ? (
                  <View
                    style={[
                      styles.countBubble,
                      active && { backgroundColor: Colors.admin },
                    ]}
                  >
                    <Text
                      style={[
                        styles.countText,
                        active && { color: "#FFF" },
                      ]}
                    >
                      {f.count}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  input: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    padding: 0,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: Spacing.md,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  chipActive: {
    backgroundColor: Colors.admin,
    borderColor: Colors.admin,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  countBubble: {
    marginLeft: 8,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
});