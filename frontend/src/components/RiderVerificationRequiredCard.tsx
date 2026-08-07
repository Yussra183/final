/**
 * "Rider Verification Required" banner card.
 *
 * Surfaced at the top of every delivery-related rider screen whenever the
 * rider's verification status is anything other than "approved". Mirrors
 * the brief's required copy verbatim so the UX is consistent across the
 * rider module.
 *
 * Renders nothing when the rider IS approved — the gate is purely
 * advisory.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { AppButton } from "./AppButton";
import { StatusPill } from "./StatusPill";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import type {
  RiderVerificationInfo,
  RiderVerificationStatus,
} from "../hooks/useRiderVerificationStatus";

interface Props {
  /** Source of the verification state. */
  info: RiderVerificationInfo;
  /** Where to navigate when the rider taps "Open Verification". */
  onOpenVerification?: () => void;
}

function statusLabel(status: RiderVerificationStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "pending":
    default:
      return "Pending Review";
  }
}

function statusTone(
  status: RiderVerificationStatus,
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

export function RiderVerificationRequiredCard({
  info,
  onOpenVerification,
}: Props) {
  // Approved riders don't see this card — every delivery action is
  // enabled. The gate is "advisory" (covers all non-approved states).
  if (info.isApproved) return null;

  const isRejected = info.isRejected;
  const isSubmitted = info.isPending && !!info.application?.submittedAt;
  const titleText = isRejected
    ? "Rider Verification Rejected"
    : "Rider Verification Required";
  // Three non-approved states each need distinct guidance:
  //   rejected   → show the reason + invite a corrected re-submission
  //   submitted  → reassure; nothing left for the rider to do
  //   pending    → brief's verbatim "not yet verified" copy
  const bodyText = isRejected
    ? info.application?.rejectionReason
      ? `Reason: ${info.application.rejectionReason}\n\n` +
        "Please review the reason, upload corrected documents, and submit your application again."
      : "Please upload corrected documents and submit your application again."
    : isSubmitted
      ? "Your rider application has been submitted and is awaiting administrator verification. You will be notified as soon as a decision has been made."
      : "Your Rider account has not yet been verified.\n\nPlease complete and submit your Rider Application before accessing delivery features.";

  const buttonLabel = isRejected
    ? "Update Application"
    : isSubmitted
      ? "View Application Status"
      : "Open Rider Verification";

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
            name={isRejected ? "alert-circle" : "shield-checkmark-outline"}
            size={22}
            color={isRejected ? Colors.danger : Colors.warning}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{titleText}</Text>
          <View style={{ marginTop: 4 }}>
            <StatusPill
              label={statusLabel(info.status)}
              tone={statusTone(info.status)}
            />
          </View>
        </View>
      </View>
      <Text style={styles.body}>{bodyText}</Text>
      {onOpenVerification ? (
        <AppButton
          title={buttonLabel}
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