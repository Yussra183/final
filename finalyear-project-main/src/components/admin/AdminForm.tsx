/**
 * AdminFormField & AdminFormGrid — small form primitives used by the
 * register/edit modals. Provides labelled inputs, selects and text
 * areas that match the rest of the admin UI.
 */
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../../constants/colors";

interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}

export function AdminFormField({ label, required, children, hint }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label} {required ? <Text style={styles.required}>*</Text> : null}
      </Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

interface InputProps extends TextInputProps {
  invalid?: boolean;
}

export function AdminInput({ invalid, style, ...props }: InputProps) {
  return (
    <TextInput
      placeholderTextColor={Colors.textMuted}
      {...props}
      style={[styles.input, invalid && styles.invalid, style]}
    />
  );
}

interface SelectProps {
  value: string;
  onValueChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}

export function AdminSelect({
  value,
  onValueChange,
  options,
  placeholder,
}: SelectProps) {
  return (
    <View style={styles.selectWrap}>
      <Picker
        selectedValue={value}
        onValueChange={onValueChange}
        style={styles.select}
        dropdownIconColor={Colors.textSecondary}
      >
        {placeholder ? (
          <Picker.Item label={placeholder} value="" color={Colors.textMuted} />
        ) : null}
        {options.map((o) => (
          <Picker.Item key={o.value} label={o.label} value={o.value} />
        ))}
      </Picker>
    </View>
  );
}

interface GridProps {
  children: React.ReactNode;
  columns?: number;
}

export function AdminFormGrid({ children, columns = 2 }: GridProps) {
  return (
    <View style={[styles.grid, { gap: Spacing.md }]}>
      {React.Children.map(children, (child, idx) => (
        <View
          key={idx}
          style={{ flexBasis: `${100 / columns - 2}%`, flexGrow: 1 }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 6,
  },
  required: {
    color: Colors.danger,
  },
  hint: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
    ...Platform.select({ web: { outlineStyle: "none" as const } }),
  },
  invalid: {
    borderColor: Colors.danger,
  },
  selectWrap: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  select: {
    color: Colors.text,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});