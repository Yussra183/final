/**
 * Permit status banner — surfaces the seller's current permit state at
 * the top of every seller screen when the application is anything other
 * than "approved". When the seller is fully approved the banner returns
 * `null` so it costs nothing to mount on every screen.
 *
 * Designed to be a thin wrapper around the shared {@link Card} primitive
 * + {@link StatusPill} so styling stays consistent with the rest of the
 * seller module.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "./Card";
import { StatusPill } from "./StatusPill";
import type { PermitStatus, SellerPermit } from "../../constants/types";

interface Props {
  /**
   * Permit object for the signed-in seller. `null` means the seller
   * hasn't started an application yet (treated as "pending draft").
   */
  permit: SellerPermit | null | undefined;
  /**
   * When true, render an emphasised red banner instead of the muted
   * "your account is awaiting" copy. Used on the dashboard hero when
   * the seller is still in the verification queue.
   */
  emphasis?: boolean;
}

export function PermitStatusBanner({ permit, emphasis }: Props) {
  if (!permit || permit.status === "approved") return null;

  const status = permit.status as PermitStatus;
  const title = headline(status);
  const body = description(status, permit);
  const tone = pillTone(status);

  return (
    <Card style={[styles.card, emphasis && styles.cardEmphasised]}>
      <View style={styles.row}>
        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{body}</Text>
          {permit.rejectionReason && permit.status === "rejected" ? (
            <Text style={styles.reason}>
              Reason: {permit.rejectionReason}
            </Text>
          ) : null}
        </View>
        <StatusPill label={labelFor(status)} tone={tone} />
      </View>
    </Card>
  );
}

function headline(status: PermitStatus): string {
  switch (status) {
    case "draft":
      return "Complete your permit application";
    case "rejected":
      return "Your permit application was rejected";
    case "under_review":
      return "Your permit is under administrator review";
    case "pending":
    default:
      return "Your account is awaiting permit verification";
  }
}

function description(status: PermitStatus, permit: SellerPermit | null): string {
  if (status === "rejected") {
    return "Please review the reason below, upload corrected documents, and submit a new application.";
  }
  if (status === "under_review") {
    return "An administrator is reviewing your application. You'll be notified as soon as a decision is made.";
  }
  if (status === "pending") {
    if (permit?.submittedAt) {
      return "Your application has been received. We're verifying your documents — this usually takes 1–2 business days.";
    }
    return "Upload your three required documents and submit your application to start selling.";
  }
  return "Complete your permit application to start selling gas on the platform.";
}

function labelFor(status: PermitStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "under_review":
      return "Under Review";
    case "pending":
      return "Pending Review";
    default:
      return "Not Submitted";
  }
}

function pillTone(
  status: PermitStatus,
): "primary" | "success" | "warning" | "danger" | "info" | "muted" {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "under_review":
      return "info";
    case "pending":
      return "warning";
    default:
      return "muted";
  }
}

const styles = StyleSheet.create({
  card: {
    borderColor: Colors.border,
    borderWidth: 1,
  },
  cardEmphasised: {
    borderColor: Colors.warning,
    backgroundColor: "#FEF3C7",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 2,
  },
  message: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  reason: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    marginTop: Spacing.xs,
    fontWeight: "700",
  },
});
