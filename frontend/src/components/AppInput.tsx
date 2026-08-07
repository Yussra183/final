import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  rightAdornment?: React.ReactNode;
  helperText?: string;
}

export function AppInput({
  label,
  error,
  rightAdornment,
  helperText,
  style,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputBox,
          focused && { borderColor: Colors.primary },
          error ? { borderColor: Colors.danger } : null,
        ]}
      >
        <TextInput
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
        {rightAdornment ? (
          <View style={styles.adornment}>{rightAdornment}</View>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helper}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing.md },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: "600",
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  /**
   * Holds a trailing control (e.g. the password eye-toggle). It is a plain
   * View so the adornment's own Touchable keeps its press feedback — wrapping
   * it in a disabled TouchableOpacity used to swallow that.
   */
  adornment: {
    paddingLeft: Spacing.sm,
  },
  error: {
    color: Colors.danger,
    fontSize: FontSize.xs,
    marginTop: 4,
  },
  helper: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 4,
  },
});
