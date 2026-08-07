/**
 * AdminModal — modal dialog wrapper used for confirmations and small
 * forms. Provides a backdrop tap-to-close and a centered card.
 */
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../../constants/colors";

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** When provided, renders the standard Cancel + Confirm footer. */
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger" | "success" | "warning";
  /** Optional subtitle below the title. */
  subtitle?: string;
  /** Hide the standard footer when the consumer renders its own. */
  hideFooter?: boolean;
}

export function AdminModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  hideFooter,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? (
                <Text style={styles.subtitle}>{subtitle}</Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.body}>{children}</View>

          {!hideFooter && onConfirm ? (
            <View style={styles.footer}>
              <Pressable
                onPress={onClose}
                style={[styles.footerBtn, styles.cancelBtn]}
              >
                <Text style={styles.cancelBtnText}>{cancelLabel}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onConfirm();
                  onClose();
                }}
                style={[
                  styles.footerBtn,
                  confirmVariant === "danger" && styles.dangerBtn,
                  confirmVariant === "success" && styles.successBtn,
                  confirmVariant === "warning" && styles.warningBtn,
                  confirmVariant === "primary" && styles.primaryBtn,
                ]}
              >
                <Text style={styles.confirmBtnText}>{confirmLabel}</Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: "hidden",
    ...Shadow.raised,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceMuted,
  },
  closeBtnText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  body: {
    padding: Spacing.lg,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
  },
  footerBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  cancelBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelBtnText: {
    fontWeight: "800",
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  primaryBtn: {
    backgroundColor: Colors.admin,
  },
  dangerBtn: {
    backgroundColor: Colors.danger,
  },
  successBtn: {
    backgroundColor: Colors.success,
  },
  warningBtn: {
    backgroundColor: Colors.warning,
  },
  confirmBtnText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: FontSize.sm,
  },
});