/**
 * Seller License Application section.
 *
 * A self-contained card that lets a seller download the official License
 * Application Form, upload the three required documents (License Form,
 * Birth Certificate, National ID), submit the application for review,
 * track its status, and download the issued license once approved.
 *
 * Designed to live on the Seller Profile screen (`app/(seller)/profile.tsx`
 * and `app/seller/profile.tsx`). It is purely additive — it never replaces
 * or removes any existing profile content.
 *
 * Documents and the "just submitted" status are tracked in local state.
 * On submit the section calls the parent's `onSubmit` callback, which
 * forwards the application to the existing `submitPermit` store action
 * (see `src/store/StoreContext.tsx`). This reuses the admin's existing
 * review pipeline unchanged.
 *
 * File I/O uses `expo-file-system` (bundled separately in Expo SDK 54,
 * installed via `expo install expo-file-system`):
 *  - `File.pickFileAsync()` opens the OS document picker.
 *  - `File` / `Directory` / `Paths` write the bundled license-form PDF
 *    into the cache directory so the device's "Files" / "Downloads" apps
 *    can surface the downloaded file.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { File, Directory, Paths } from "expo-file-system";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "./Card";
import { AppButton } from "./AppButton";
import { StatusPill } from "./StatusPill";
import { formatDateTime } from "../utils/format";
import type { PermitApplication, User } from "../../constants/types";

// Bundled PDF asset — the same file used as both the application form
// template and a placeholder for the issued license. Cached at module
// load so re-renders don't re-resolve it.
const LICENSE_FORM_PDF = require("../../assets/license-application-form.pdf");

/**
 * Three documents the seller must attach before submission. Kept as a
 * literal tuple so iteration order matches the visual order in the UI.
 */
const REQUIRED_DOCS = [
  {
    key: "applicationForm" as const,
    label: "Completed License Application Form",
    helper: "Download the form below, fill it in, and upload the signed copy.",
    icon: "📄" as const,
  },
  {
    key: "birthCertificate" as const,
    label: "Birth Certificate",
    helper: "Scan or photograph the certificate clearly.",
    icon: "🪪" as const,
  },
  {
    key: "nationalId" as const,
    label: "National ID Card",
    helper: "Photo or scanned copy of your government-issued ID.",
    icon: "🆔" as const,
  },
];

/** Input shape passed back to the parent when the seller submits. */
export interface LicenseSubmitPayload {
  businessName: string;
  businessAddress: string;
  businessType: string;
  registrationNumber: string;
  documents: string[];
}

interface Props {
  user: User;
  permit: PermitApplication | undefined;
  onSubmit: (payload: LicenseSubmitPayload) => Promise<void> | void;
}

export function LicenseApplicationSection({ user, permit, onSubmit }: Props) {
  // ---- State -----------------------------------------------------------
  /** Filename (or short label) the seller picked for each required doc. */
  const [docs, setDocs] = useState<Record<string, string>>({});
  /** Which doc row is currently in "type name" fallback mode. */
  const [typingKey, setTypingKey] = useState<string | null>(null);
  /** Inline text input for fallback naming. */
  const [typingValue, setTypingValue] = useState("");
  /** Local "just submitted" flag — drives the Under Verification pill. */
  const [justSubmitted, setJustSubmitted] = useState(false);
  /** Cleared after a 2s flash so the section falls back to "Pending Review". */
  useEffect(() => {
    if (!justSubmitted) return;
    const t = setTimeout(() => setJustSubmitted(false), 2000);
    return () => clearTimeout(t);
  }, [justSubmitted]);
  /** Inline error message for download failures. */
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // ---- Derived ---------------------------------------------------------
  /** Total documents attached — shown as a checklist progress hint. */
  const uploadedCount = REQUIRED_DOCS.filter((d) => docs[d.key]).length;
  const allUploaded = uploadedCount === REQUIRED_DOCS.length;

  /** Visible status label. Approved/Rejected always win over the others. */
  const statusLabel = useMemo(() => {
    if (!permit || permit.status === "draft") return "Not Submitted";
    if (permit.status === "approved") return "Approved";
    if (permit.status === "rejected") return "Rejected";
    // pending — show transient "Under Verification" right after submit.
    if (justSubmitted) return "Under Verification";
    return "Pending Review";
  }, [permit, justSubmitted]);

  const statusTone = useMemo<
    "primary" | "success" | "warning" | "danger" | "info" | "muted"
  >(() => {
    if (!permit || permit.status === "draft") return "muted";
    if (permit.status === "approved") return "success";
    if (permit.status === "rejected") return "danger";
    return "warning";
  }, [permit]);

  const submittedAt = permit?.submittedAt
    ? formatDateTime(permit.submittedAt)
    : null;

  // ---- Helpers ---------------------------------------------------------
  /** Open the OS file picker and store the picked file's display name. */
  const handlePickFile = async (key: string) => {
    try {
      const picked = await File.pickFileAsync();
      if (picked && (picked as any).name) {
        setDocs((prev) => ({ ...prev, [key]: (picked as any).name }));
        setTypingKey(null);
        setTypingValue("");
      }
    } catch {
      // OS picker can be cancelled or unavailable on web — fall back.
      setTypingKey(key);
      setTypingValue(docs[key] ?? "");
    }
  };

  /** Toggle into fallback "type name" mode. */
  const startTyping = (key: string) => {
    setTypingKey(key);
    setTypingValue(docs[key] ?? "");
  };

  const confirmTyped = () => {
    if (typingKey && typingValue.trim()) {
      setDocs((prev) => ({ ...prev, [typingKey]: typingValue.trim() }));
      setTypingKey(null);
      setTypingValue("");
    }
  };

  const clearDoc = (key: string) => {
    setDocs((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  /** Build a payload + invoke the parent's submit handler. */
  const handleSubmit = async () => {
    if (!allUploaded) {
      Alert.alert(
        "Missing documents",
        "Please attach all three required documents before submitting for verification.",
      );
      return;
    }
    const documents = REQUIRED_DOCS
      .map((d) => docs[d.key])
      .filter(Boolean) as string[];
    try {
      await onSubmit({
        businessName: `${user.fullName}'s Gas Business`,
        businessAddress: user.address ?? "",
        businessType: "Retail",
        registrationNumber: `LS-${user.id}`,
        documents,
      });
      setJustSubmitted(true);
    } catch (err) {
      Alert.alert(
        "Submission failed",
        (err as Error)?.message ?? "Please try again in a moment.",
      );
    }
  };

  /**
   * Copy the bundled license-form PDF into the cache directory so
   * platform "Downloads" / "Files" apps can surface it, then surface
   * the path via Alert. We avoid new dependencies (no `expo-sharing`);
   * the cache directory is shared between the app and the OS file
   * browser.
   */
  const downloadLicenseForm = async () => {
    setDownloadError(null);
    try {
      const destDir = new Directory(Paths.cache, "forms");
      if (!destDir.exists) destDir.create();
      const target = new File(destDir, "license-application-form.pdf");
      const sourceUri = (LICENSE_FORM_PDF as any).uri ?? LICENSE_FORM_PDF;
      const source = new File(sourceUri);
      if (target.exists) target.delete();
      source.copy(target);
      Alert.alert(
        "License Application Form ready",
        `Saved to: ${target.uri}\n\nFill it in and upload the signed copy below.`,
      );
    } catch (err) {
      setDownloadError(
        (err as Error)?.message ?? "Could not save the form. Try again.",
      );
    }
  };

  const downloadApprovedLicense = async () => {
    setDownloadError(null);
    if (!permit || permit.status !== "approved") return;
    try {
      const destDir = new Directory(Paths.cache, "licenses");
      if (!destDir.exists) destDir.create();
      const target = new File(
        destDir,
        `license-${permit.registrationNumber}.pdf`,
      );
      // Same bundled PDF serves as a placeholder for the issued license
      // — the real backend will replace this with the admin-uploaded PDF.
      const sourceUri = (LICENSE_FORM_PDF as any).uri ?? LICENSE_FORM_PDF;
      const source = new File(sourceUri);
      if (target.exists) target.delete();
      source.copy(target);
      Alert.alert(
        "Approved License ready",
        `License #${permit.registrationNumber} saved to: ${target.uri}`,
      );
    } catch (err) {
      setDownloadError(
        (err as Error)?.message ?? "Could not download the license. Try again.",
      );
    }
  };

  // ---- Render ----------------------------------------------------------
  return (
    <Card>
      <Text style={styles.intro}>
        Complete the licensing process below to be approved as a gas seller
        in the system.
      </Text>

      {/* Status row */}
      <View style={styles.statusRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusLabel}>Application Status</Text>
          <View style={{ marginTop: 4 }}>
            <StatusPill label={statusLabel} tone={statusTone} />
          </View>
          {submittedAt ? (
            <Text style={styles.statusSub}>Submitted {submittedAt}</Text>
          ) : null}
        </View>
        {permit?.status === "approved" && permit.reviewNote ? (
          <View style={styles.reviewNote}>
            <Text style={styles.reviewNoteText}>{permit.reviewNote}</Text>
          </View>
        ) : null}
      </View>

      {/* Step 1 — Download form */}
      <View style={styles.step}>
        <View style={styles.stepHead}>
          <Text style={styles.stepNumber}>1</Text>
          <Text style={styles.stepTitle}>Download License Application Form</Text>
        </View>
        <Text style={styles.stepHelper}>
          Save the official form to your device, fill it in, and upload the
          completed copy in the next step.
        </Text>
        <AppButton
          title="Download License Application Form"
          variant="outline"
          fullWidth
          leftIcon={<Text style={styles.btnEmoji}>⬇️</Text>}
          onPress={downloadLicenseForm}
        />
      </View>

      {/* Step 2 — Upload documents */}
      <View style={styles.step}>
        <View style={styles.stepHead}>
          <Text style={styles.stepNumber}>2</Text>
          <Text style={styles.stepTitle}>Upload Required Documents</Text>
          <Text style={styles.stepCount}>
            {uploadedCount}/{REQUIRED_DOCS.length} attached
          </Text>
        </View>

        {REQUIRED_DOCS.map((doc) => {
          const value = docs[doc.key];
          const isTyping = typingKey === doc.key;
          return (
            <View key={doc.key} style={styles.docRow}>
              <View style={styles.docIcon}>
                <Text style={styles.docIconText}>{doc.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.docLabel}>{doc.label}</Text>
                {isTyping ? (
                  <View style={styles.docTyping}>
                    <TextInput
                      style={styles.docInput}
                      value={typingValue}
                      onChangeText={setTypingValue}
                      placeholder="e.g. id_card_front.jpg"
                      placeholderTextColor={Colors.textMuted}
                      autoFocus
                    />
                    <AppButton
                      title="OK"
                      variant="primary"
                      onPress={confirmTyped}
                      style={styles.docOk}
                    />
                  </View>
                ) : value ? (
                  <View style={styles.docFilled}>
                    <Text style={styles.docValue} numberOfLines={1}>
                      📎 {value}
                    </Text>
                    <View style={styles.docActions}>
                      <TouchableOpacity
                        onPress={() => handlePickFile(doc.key)}
                        style={styles.docLinkBtn}
                      >
                        <Text style={styles.docLink}>Replace</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => clearDoc(doc.key)}
                        style={styles.docLinkBtn}
                      >
                        <Text style={[styles.docLink, styles.docLinkDanger]}>
                          Remove
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.docEmpty}>
                    <Text style={styles.docHelper}>{doc.helper}</Text>
                    <View style={styles.docActions}>
                      <AppButton
                        title="Pick file"
                        variant="primary"
                        leftIcon={
                          <Ionicons
                            name="cloud-upload-outline"
                            size={16}
                            color="#FFF"
                          />
                        }
                        onPress={() => handlePickFile(doc.key)}
                        style={styles.docBtn}
                      />
                      <AppButton
                        title="Type name instead"
                        variant="outline"
                        onPress={() => startTyping(doc.key)}
                        style={styles.docBtn}
                      />
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Step 3 — Submit for verification */}
      <View style={styles.step}>
        <View style={styles.stepHead}>
          <Text style={styles.stepNumber}>3</Text>
          <Text style={styles.stepTitle}>Submit for Verification</Text>
        </View>
        <Text style={styles.stepHelper}>
          Once all three documents are attached, submit your application.
          The admin will review it and notify you when a decision is made.
        </Text>
        <AppButton
          title={
            permit && permit.status !== "draft"
              ? "Resubmit Application"
              : "Submit for Verification"
          }
          variant="primary"
          fullWidth
          disabled={!allUploaded}
          leftIcon={<Text style={styles.btnEmoji}>📨</Text>}
          onPress={handleSubmit}
        />
        {!allUploaded ? (
          <Text style={styles.validation}>
            Attach all three documents to enable submission.
          </Text>
        ) : null}
      </View>

      {/* Step 4 — Download approved license */}
      <View style={[styles.step, styles.stepLast]}>
        <View style={styles.stepHead}>
          <Text style={styles.stepNumber}>4</Text>
          <Text style={styles.stepTitle}>Download Approved License</Text>
        </View>
        {permit?.status === "approved" ? (
          <>
            <Text style={styles.stepHelper}>
              Your license has been approved. Download a copy to keep on your
              device.
            </Text>
            <AppButton
              title="Download License"
              variant="primary"
              fullWidth
              leftIcon={<Text style={styles.btnEmoji}>⬇️</Text>}
              onPress={downloadApprovedLicense}
            />
          </>
        ) : (
          <Text style={styles.pending}>
            Approval is still pending. The download button will be enabled
            once your application is approved by the admin.
          </Text>
        )}
      </View>

      {downloadError ? (
        <Text style={styles.error}>{downloadError}</Text>
      ) : null}
    </Card>
  );
}

// ---- Styles -----------------------------------------------------------

const styles = StyleSheet.create({
  intro: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  statusLabel: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statusSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 4,
  },
  reviewNote: {
    flex: 1,
    marginLeft: Spacing.sm,
    backgroundColor: Colors.surface,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reviewNoteText: {
    fontSize: FontSize.xs,
    color: Colors.text,
  },
  step: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stepLast: {
    borderBottomWidth: 0,
  },
  stepHead: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    color: "#FFF",
    fontSize: FontSize.xs,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 24,
    marginRight: Spacing.sm,
  },
  stepTitle: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  stepCount: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  stepHelper: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    lineHeight: 18,
  },
  btnEmoji: {
    fontSize: 16,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  docIconText: {
    fontSize: 20,
  },
  docLabel: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.text,
  },
  docHelper: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 4,
  },
  docValue: {
    fontSize: FontSize.xs,
    color: Colors.text,
    marginTop: 4,
    fontWeight: "600",
  },
  docEmpty: {
    marginTop: 4,
  },
  docFilled: {
    marginTop: 4,
  },
  docActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  docBtn: {
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
  },
  docLinkBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  docLink: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.primary,
    textDecorationLine: "underline",
  },
  docLinkDanger: {
    color: Colors.danger,
  },
  docTyping: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  docInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: FontSize.xs,
    color: Colors.text,
  },
  docOk: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
  },
  validation: {
    fontSize: FontSize.xs,
    color: Colors.warning,
    marginTop: 6,
    fontWeight: "600",
  },
  pending: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  error: {
    marginTop: Spacing.sm,
    color: Colors.danger,
    fontSize: FontSize.xs,
    fontWeight: "600",
  },
});