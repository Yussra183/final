/**
 * "Supplier account awaiting approval" banner card.
 *
 * Surfaced in place of the supply / delivery / inventory sections on
 * every supplier business screen whenever the supplier's verification
 * status is anything other than "approved". Carries the brief's required
 * copy verbatim:
 *
 *   "Your supplier account is awaiting administrator approval."
 *
 * Renders nothing when the supplier IS approved, so callers can drop it
 * at the top of a screen unconditionally.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { AppButton } from "./AppButton";
import { StatusPill } from "./StatusPill";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import type {
  SupplierVerificationInfo,
  SupplierVerificationStatus,
} from "../hooks/useSupplierVerificationStatus";

interface Props {
  /** Source of the verification state. */
  info: SupplierVerificationInfo;
  /** Where to navigate when the supplier taps the action button. */
  onOpenVerification?: () => void;
}

function statusLabel(
  status: SupplierVerificationStatus,
  isSubmitted: boolean,
): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "pending":
    default:
      return isSubmitted ? "Submitted" : "Pending";
  }
}

function statusTone(
  status: SupplierVerificationStatus,
): "primary" | "success" | "warning" | "danger" | "info" | "muted" {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "pending":
    default:
      return "warning";
  }
}

export function SupplierVerificationRequiredCard({
  info,
  onOpenVerification,
}: Props) {
  // Approved suppliers don't see this card — every business action is
  // enabled. The gate covers all non-approved states.
  if (info.isApproved) return null;

  const { isRejected, isSubmitted } = info;

  const titleText = isRejected
    ? "Supplier Application Rejected"
    : "Awaiting Administrator Approval";

  // The three non-approved states each need distinct guidance:
  //   rejected  → show the reason + invite a corrected re-submission
  //   submitted → reassure; nothing left for the supplier to do
  //   pending   → walk them through the application steps
  const bodyText = isRejected
    ? info.application?.rejectionReason
      ? `Your supplier account is awaiting administrator approval.\n\nReason for rejection: ${info.application.rejectionReason}\n\n` +
        "Please review the reason, upload corrected documents, and submit your application again."
      : "Your supplier account is awaiting administrator approval.\n\nPlease upload corrected documents and submit your application again."
    : isSubmitted
      ? "Your supplier account is awaiting administrator approval.\n\n" +
        "Your application has been submitted successfully and is being reviewed. " +
        "You will receive a notification as soon as a decision has been made."
      : "Your supplier account is awaiting administrator approval.\n\nPlease:\n" +
        "  • Download the Supplier Application Form\n" +
        "  • Upload all required documents\n" +
        "  • Submit your application\n\n" +
        "After approval by the Administrator, you will be able to supply gas to sellers and receive supply requests.";

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: isRejected ? "#FEE2E2" : "#FEF3C7" },
          ]}
        >
          <Ionicons
            name={isRejected ? "alert-circle" : "time-outline"}
            size={22}
            color={isRejected ? Colors.danger : Colors.warning}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{titleText}</Text>
          <View style={{ marginTop: 4 }}>
            <StatusPill
              label={statusLabel(info.status, isSubmitted)}
              tone={statusTone(info.status)}
            />
          </View>
        </View>
      </View>
      <Text style={styles.body}>{bodyText}</Text>
      {onOpenVerification ? (
        <AppButton
          title={
            isRejected
              ? "Update Application"
              : isSubmitted
                ? "View Application Status"
                : "Open Supplier Verification"
          }
          variant="primary"
          leftIcon={
            <Ionicons
              name={
                isRejected
                  ? "refresh-circle-outline"
                  : "document-text-outline"
              }
              size={18}
              color="#FFF"
            />
          }
          onPress={onOpenVerification}
          style={{ marginTop: Spacing.md }}
          fullWidth
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  body: {
    color: Colors.text,
    fontSize: FontSize.sm,
    marginTop: Spacing.md,
    lineHeight: 20,
  },
});
