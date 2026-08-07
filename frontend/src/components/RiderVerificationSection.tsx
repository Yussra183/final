/**
 * Rider Verification Application — self-contained card embedded on the
 * Rider Profile screen.
 *
 * Mirrors `LicenseApplicationSection` (seller flow) end-to-end:
 *   Step 1: Download the blank application form PDF.
 *   Step 2: Upload the five required documents (PDF / image).
 *           Each slot supports upload / replace / view / remove.
 *   Step 3: Submit (enabled only when every slot is filled AND status
 *           is still PENDING without a submittedAt). Editing is locked
 *           afterwards.
 *   Post-approval: the rider's official Gas Delivery Rider Certificate
 *           download section appears. The certificate is NOT available
 *           before approval.
 *   Post-rejection: status pill flips to "Rejected" with the rider-
 *           facing reason; the rider can re-upload corrected docs and
 *           re-submit (which re-flips status to PENDING).
 *
 * Talks directly to the live API via {@link useStore} so the parent
 * doesn't need to wire any data fetching.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { File, Directory, Paths } from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import { Card } from "./Card";
import { AppButton } from "./AppButton";
import { StatusPill } from "./StatusPill";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { useStore } from "../store/StoreContext";
import { savePdfToDevice, openSavedPdf } from "../utils/savePdf";
import { API_CONFIG } from "../api/config";
import { RiderPermitsApi } from "../api/endpoints";
import {
  RiderApplicationDocument,
  RiderApplicationDocumentType,
  RiderPermitSummary,
  PermitStatus,
} from "../../constants/types";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

// ============================================================================
// Slot catalogue
// ============================================================================

/**
 * The five rider-facing slots the brief requires. Order matches the
 * visual step list on the screen (form → NID → driving licence →
 * passport photo → vehicle registration).
 */
const REQUIRED_SLOTS: Array<{
  type: Exclude<RiderApplicationDocumentType, "rider_permit">;
  label: string;
  helper: string;
  icon: string;
}> = [
  {
    type: "rider_application_form",
    label: "Completed Rider Application Form",
    helper:
      "Download the form below, print, complete, sign, scan back, and upload the signed PDF.",
    icon: "📄",
  },
  {
    type: "rider_national_id",
    label: "National ID Card",
    helper: "Upload a clear PDF or image (JPG/PNG) of your National ID.",
    icon: "🆔",
  },
  {
    type: "rider_driving_licence",
    label: "Driving Licence",
    helper: "Upload a PDF copy of your driving licence.",
    icon: "📜",
  },
  {
    type: "rider_passport_photo",
    label: "Passport Size Photo",
    helper: "Upload a JPG or PNG of your recent passport-size photograph.",
    icon: "🖼️",
  },
  {
    type: "rider_vehicle_registration",
    label: "Vehicle Registration Card",
    helper:
      "Upload a PDF copy of your vehicle registration card (if you ride your own vehicle).",
    icon: "🚗",
  },
];

interface SlotPolicy {
  allowedMimes: string[];
  mimeHint: string;
  buttonLabel: string;
}

/**
 * Per-slot MIME policy — mirrors the server-side
 * `RiderPermitDocumentStorageService.ALLOWED_MIME` table so the OS
 * picker hint matches what the backend will accept.
 */
const SLOT_POLICY: Record<
  Exclude<RiderApplicationDocumentType, "rider_permit">,
  SlotPolicy
> = {
  rider_application_form: {
    allowedMimes: ["application/pdf"],
    mimeHint: "application/pdf",
    buttonLabel: "Pick PDF",
  },
  rider_national_id: {
    allowedMimes: ["application/pdf", "image/jpeg", "image/png"],
    mimeHint: "application/pdf",
    buttonLabel: "Pick file",
  },
  rider_driving_licence: {
    allowedMimes: ["application/pdf"],
    mimeHint: "application/pdf",
    buttonLabel: "Pick PDF",
  },
  rider_passport_photo: {
    allowedMimes: ["application/pdf", "image/jpeg", "image/png"],
    mimeHint: "image/*",
    buttonLabel: "Pick image",
  },
  rider_vehicle_registration: {
    allowedMimes: ["application/pdf"],
    mimeHint: "application/pdf",
    buttonLabel: "Pick PDF",
  },
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, matches backend.

function extensionForMime(mime: string | null | undefined): string {
  if (!mime) return "pdf";
  const m = mime.toLowerCase();
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "application/pdf") return "pdf";
  return "bin";
}

function humanAllowedTypes(allowed: string[]): string {
  if (allowed.length === 1) {
    return allowed[0].includes("pdf") ? "PDF" : "image";
  }
  return "PDF or image (JPG/PNG)";
}

/**
 * Format the application number as `RDR-YYYY-000001` to match the brief
 * and the backend's `RDR-` prefix on the certificate / application id.
 * `id` is the application row's BIGSERIAL — we zero-pad to 6 digits and
 * prefix with the current year so the number reads the same on every
 * screen (the certificate PDF, the rider app, the admin queue).
 */
function formatApplicationNumber(id: string | null | undefined): string {
  if (!id) return "—";
  const trimmed = String(id).replace(/[^0-9]/g, "");
  if (!trimmed) return "—";
  const padded = trimmed.padStart(6, "0");
  const year = new Date().getFullYear();
  return `RDR-${year}-${padded}`;
}

/**
 * Format an ISO timestamp as `DD MMM YYYY` for the application summary.
 * Returns "—" when the timestamp is missing — every approved rider
 * carries a `submittedAt` so the user only sees "—" on the very first
 * render before the lazy-created draft PENDING row has been persisted.
 */
function formatSubmissionDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function permitStatusLabel(status: RiderPermitSummary["status"]): string {
  if (!status) return "Pending";
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "under_review":
      return "Under Review";
    case "pending":
    case "draft":
    default:
      return "Pending Review";
  }
}

function permitStatusTone(
  status: RiderPermitSummary["status"],
): "primary" | "success" | "warning" | "danger" | "info" | "muted" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "under_review") return "info";
  return "warning";
}

// ============================================================================
// Component
// ============================================================================

export function RiderVerificationSection() {
  const store = useStore();
  const session = store.session;
  const user = session?.user;
  const cachedApplication = user
    ? store.riderPermits[user.id]
    : undefined;

  // ---- Live state ------------------------------------------------------
  const [application, setApplication] = useState<
    RiderPermitSummary | null
  >(cachedApplication ?? null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // ---- Per-slot busy / success state ----------------------------------
  const [uploading, setUploading] = useState<
    Record<string, boolean>
  >({});
  const [deleting, setDeleting] = useState<
    Record<string, boolean>
  >({});

  // ---- Application form PDF download ----------------------------------
  const [downloadingForm, setDownloadingForm] = useState(false);
  const [formSavedUri, setFormSavedUri] = useState<string | null>(null);
  const [formDownloadMessage, setFormDownloadMessage] =
    useState<string | null>(null);

  // ---- Certificate PDF download ---------------------------------------
  const [downloadingCert, setDownloadingCert] = useState(false);
  const [certSavedUri, setCertSavedUri] = useState<string | null>(null);
  const [certDownloadMessage, setCertDownloadMessage] =
    useState<string | null>(null);
  /**
   * Whether the most recent successful download landed in the public
   * Android Downloads folder (`"downloads"`), the native share sheet
   * (`"shared"`), or only the app-private Documents folder
   * (`"documents"`). Drives the post-download action button — we can
   * show a meaningful "View Downloads" hint on Android only when the
   * file actually made it into the system Downloads folder.
   */
  const [certSavedMethod, setCertSavedMethod] =
    useState<"downloads" | "shared" | "documents" | null>(null);

  // ---- Document preview ------------------------------------------------
  const [previewDoc, setPreviewDoc] = useState<
    RiderApplicationDocument | null
  >(null);

  // ---- Initial fetch + refresh ----------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const fetched = await store.fetchMyRiderApplication();
        if (!cancelled) setApplication(fetched);
      } catch (err) {
        if (!cancelled) {
          setActionError(
            (err as Error)?.message ?? "Couldn't load rider application.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    if (!uploadSuccess) return;
    const t = setTimeout(() => setUploadSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [uploadSuccess]);

  useEffect(() => {
    if (!formDownloadMessage) return;
    const t = setTimeout(() => setFormDownloadMessage(null), 3500);
    return () => clearTimeout(t);
  }, [formDownloadMessage]);

  useEffect(() => {
    if (!certDownloadMessage) return;
    const t = setTimeout(() => setCertDownloadMessage(null), 3500);
    return () => clearTimeout(t);
  }, [certDownloadMessage]);

  // ---- Derived --------------------------------------------------------
  const documentsBySlot = useMemo(() => {
    const map: Partial<
      Record<
        Exclude<RiderApplicationDocumentType, "rider_permit">,
        RiderApplicationDocument
      >
    > = {};
    application?.documents?.forEach((d) => {
      if (d.documentType !== "rider_permit") {
        map[d.documentType as Exclude<RiderApplicationDocumentType, "rider_permit">] = d;
      }
    });
    return map;
  }, [application]);

  const uploadedCount = REQUIRED_SLOTS.filter(
    (s) => !!documentsBySlot[s.type],
  ).length;
  const allUploaded = uploadedCount === REQUIRED_SLOTS.length;

  // Editing is locked once submitted (PENDING with submittedAt set),
  // under review, or approved. Rejections re-enable editing so the rider
  // can re-upload corrected documents.
  const isLocked = useMemo(() => {
    const status = application?.status;
    if (status === "approved" || status === "under_review") return true;
    if (status === "pending" && application?.submittedAt) return true;
    return false;
  }, [application]);

  const isApproved = application?.status === "approved";
  const isRejected = application?.status === "rejected";
  const isSubmitted =
    application?.status === "pending" && !!application?.submittedAt;

  // ---- Pickers + upload ----------------------------------------------
  const handlePickFile = async (
    slotType: Exclude<RiderApplicationDocumentType, "rider_permit">,
    policy: SlotPolicy,
  ) => {
    setActionError(null);
    setUploadSuccess(null);
    try {
      const result = await File.pickFileAsync(policy.mimeHint);
      const picked = Array.isArray(result) ? result[0] : result;
      if (!picked) return;
      const pickedAny = picked as unknown as {
        name?: string;
        size?: number;
        type?: string;
        uri?: string;
      };
      if (typeof pickedAny.size === "number" && pickedAny.size > MAX_BYTES) {
        Alert.alert(
          "File too large",
          "The selected file is larger than the 10 MB limit. Please compress it and try again.",
        );
        return;
      }
      const pickedType = (pickedAny.type ?? "").toLowerCase();
      if (pickedType && !policy.allowedMimes.includes(pickedType)) {
        Alert.alert(
          "Wrong file type",
          `This slot only accepts ${humanAllowedTypes(policy.allowedMimes)}. The picked file is "${pickedType || "unknown"}".`,
        );
        return;
      }
      setUploading((prev) => ({ ...prev, [slotType]: true }));
      const fallbackExt = extensionForMime(pickedType || policy.allowedMimes[0]);
      const fallbackName = pickedAny.name ?? `${slotType}.${fallbackExt}`;
      const filePart = {
        uri: pickedAny.uri ?? "",
        name: fallbackName,
        type: pickedType || policy.allowedMimes[0] || "application/octet-stream",
      };
      await store.uploadRiderApplicationDocument(slotType, filePart, fallbackName);
      // Re-pull the cached application so the docs list updates.
      const refreshed = await store.fetchMyRiderApplication();
      setApplication(refreshed);
      const humanLabel =
        REQUIRED_SLOTS.find((s) => s.type === slotType)?.label ?? slotType;
      setUploadSuccess(`✅ ${humanLabel} uploaded successfully.`);
    } catch (err) {
      console.error("[RiderVerificationSection] upload error", err);
      setActionError(
        (err as Error)?.message ?? "Could not upload the document.",
      );
    } finally {
      setUploading((prev) => ({ ...prev, [slotType]: false }));
    }
  };

  const handleDelete = async (
    slotType: Exclude<RiderApplicationDocumentType, "rider_permit">,
    documentId: string,
  ) => {
    Alert.alert(
      "Remove document",
      `Remove the uploaded document for this slot? You can re-upload at any time before submission.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setActionError(null);
            setDeleting((prev) => ({ ...prev, [slotType]: true }));
            try {
              await store.deleteRiderApplicationDocument(documentId);
              const refreshed = await store.fetchMyRiderApplication();
              setApplication(refreshed);
            } catch (err) {
              setActionError(
                (err as Error)?.message ?? "Could not remove the document.",
              );
            } finally {
              setDeleting((prev) => ({ ...prev, [slotType]: false }));
            }
          },
        },
      ],
    );
  };

  // ---- Submit ---------------------------------------------------------
  const handleSubmit = async () => {
    if (!application) return;
    if (!allUploaded) {
      setActionError(
        "Please upload every required document before submitting.",
      );
      return;
    }
    setActionError(null);
    setActionBusy(true);
    try {
      const submitted = await store.submitRiderApplication();
      setApplication(submitted);
      Alert.alert(
        "Application submitted",
        "Your application has been submitted successfully. Please wait for administrator verification.",
      );
    } catch (err) {
      setActionError(
        (err as Error)?.message ?? "Could not submit your application.",
      );
    } finally {
      setActionBusy(false);
    }
  };

  // ---- Download blank application form --------------------------------
  /**
   * Fetch the blank Rider Application Form from the backend and save it
   * onto the device. The bytes come from the live
   * `GET /api/rider-permits/me/application-form` endpoint — the same PDF
   * the server generates for admins — never a bundled or mock file.
   *
   * The download lands in the public Downloads folder on Android; if the
   * user declines the folder grant we fall back to the native Save/Share
   * sheet so they can still place the file themselves. Either way an
   * app-local copy is retained so "Open Form" works offline afterwards.
   */
  const downloadBlankForm = async () => {
    setFormDownloadMessage(null);
    setActionError(null);
    const url = `${API_CONFIG.BASE_URL}${RiderPermitsApi.applicationFormUrl()}`;
    const filename = "Rider_Application_Form.pdf";
    setDownloadingForm(true);
    try {
      const tempDir = new Directory(Paths.cache, "rider-application-forms");
      if (!tempDir.exists) {
        tempDir.create({ intermediates: true, idempotent: true });
      }
      const tempTarget = new File(tempDir, filename);
      if (tempTarget.exists) tempTarget.delete();

      const result = await FileSystemLegacy.downloadAsync(url, tempTarget.uri, {
        headers: {
          Accept: "application/pdf",
          "X-Api-Version": API_CONFIG.API_VERSION,
          ...(session?.token
            ? { Authorization: `Bearer ${session.token}` }
            : {}),
        },
      });
      if (result.status === 401 || result.status === 403) {
        throw new Error(
          "Your session has expired. Please sign in again to download the application form.",
        );
      }
      if (result.status < 200 || result.status >= 300) {
        throw new Error(
          `The server could not provide the application form (error ${result.status}). Please try again in a moment.`,
        );
      }
      if (!tempTarget.exists || (tempTarget.size ?? 0) <= 0) {
        throw new Error(
          "The downloaded application form was empty. Please try again.",
        );
      }
      const head = String.fromCharCode(...tempTarget.bytesSync().slice(0, 5));
      if (head !== "%PDF-") {
        throw new Error(
          "The downloaded file was not a valid PDF. Please try again.",
        );
      }

      // Persist to device storage (Downloads / Save dialog / app folder).
      const saved = await savePdfToDevice(
        tempTarget,
        filename,
        "rider-application-forms",
        "Save Rider Application Form",
      );
      tempTarget.delete();

      setFormSavedUri(saved.localUri);
      setFormDownloadMessage("Application form downloaded successfully.");
    } catch (err) {
      const failure = err instanceof Error ? err : new Error(String(err));
      console.error("[downloadBlankForm] failed", failure);
      setFormDownloadMessage(null);
      setActionError(
        failure.message ||
          "Could not download the application form. Please check your internet connection and try again.",
      );
    } finally {
      setDownloadingForm(false);
    }
  };

  const viewBlankForm = async () => {
    if (!formSavedUri) return;
    try {
      await openSavedPdf(formSavedUri, "Rider Application Form");
    } catch (err) {
      Alert.alert(
        "Could not open form",
        (err as Error)?.message ?? "No PDF viewer was found on this device.",
      );
    }
  };

  // ---- Download official rider certificate ----------------------------
  /**
   * Fetch the official Gas Delivery Rider Certificate PDF from the
   * backend and **physically save it to the device** — not just open a
   * preview.
   *
   * Pipeline:
   *   1. Stream the PDF into a cache file via `FileSystemLegacy.downloadAsync`
   *      with the same auth/Accept headers the JSON client uses, so
   *      401 / 403 / non-2xx responses surface as a clean error instead
   *      of silently landing an empty file.
   *   2. Verify `%PDF-` magic bytes — guards against HTML error pages
   *      being mis-saved as `.pdf`.
   *   3. Hand the file off to {@link savePdfToDevice}, which writes the
   *      bytes into the public Android Downloads folder (Storage Access
   *      Framework, no manifest permission needed on Android 10+) and
   *      falls back to the native Save/Share sheet on iOS / when the
   *      user declines the folder grant. The app-local copy is kept so
   *      "Open Certificate" works offline afterwards.
   *
   * The user-facing messages and button copy reflect whichever save
   * method actually succeeded — Downloads vs. share sheet — so the
   * success state never claims a download that didn't happen.
   */
  const downloadCertificate = async () => {
    if (!application || application.status !== "approved") return;
    setCertDownloadMessage(null);
    setCertSavedMethod(null);
    setActionError(null);
    const url = `${API_CONFIG.BASE_URL}${RiderPermitsApi.riderCertificateUrl()}`;
    const filename = `Rider_Permit_Certificate-${user?.id ?? "me"}.pdf`;
    setDownloadingCert(true);
    try {
      const tempDir = new Directory(Paths.cache, "rider-permits");
      if (!tempDir.exists) {
        tempDir.create({ intermediates: true, idempotent: true });
      }
      const tempTarget = new File(tempDir, filename);
      if (tempTarget.exists) tempTarget.delete();

      const result = await FileSystemLegacy.downloadAsync(url, tempTarget.uri, {
        headers: {
          Accept: "application/pdf",
          "X-Api-Version": API_CONFIG.API_VERSION,
          ...(session?.token
            ? { Authorization: `Bearer ${session.token}` }
            : {}),
        },
      });
      if (result.status === 401 || result.status === 403) {
        throw new Error(
          "Your session has expired. Please sign in again to download the certificate.",
        );
      }
      if (result.status < 200 || result.status >= 300) {
        throw new Error(
          `The server could not provide the certificate (error ${result.status}). Please try again in a moment.`,
        );
      }
      if (!tempTarget.exists || (tempTarget.size ?? 0) <= 0) {
        throw new Error("Saved certificate is empty. Please try again.");
      }
      const head = String.fromCharCode(...tempTarget.bytesSync().slice(0, 5));
      if (head !== "%PDF-") {
        throw new Error(
          "Downloaded certificate is not a valid PDF. Please try again.",
        );
      }

      // Persist to device storage (Downloads / Save dialog / app folder).
      const saved = await savePdfToDevice(
        tempTarget,
        filename,
        "rider-permits",
        "Save Gas Delivery Rider Certificate",
      );
      tempTarget.delete();

      setCertSavedUri(saved.localUri);
      setCertSavedMethod(saved.method);
      setCertDownloadMessage(
        saved.method === "downloads"
          ? "✅ Certificate downloaded successfully."
          : saved.method === "shared"
            ? "✅ Certificate saved. You can place it in your Downloads / Files from the share sheet."
            : "✅ Certificate saved to the app's Documents folder.",
      );
    } catch (err) {
      const failure = err instanceof Error ? err : new Error(String(err));
      console.error("[downloadCertificate] failed", failure);
      setCertSavedUri(null);
      setCertSavedMethod(null);
      setCertDownloadMessage(null);
      setActionError(
        failure.message ||
          "Could not download the certificate. Please check your internet connection and try again.",
      );
    } finally {
      setDownloadingCert(false);
    }
  };

  /**
   * Open the Files / Downloads app on Android (best-effort) so the user
   * can locate the certificate they just saved. No-op on platforms
   * where the path isn't recognised by the OS file manager.
   */
  const openDownloadsFolder = async () => {
    if (Platform.OS !== "android") return;
    try {
      const Linking = await import("expo-linking");
      await Linking.openURL("content://com.android.documentsui.directory/download");
    } catch {
      // Some OEMs replace the AOSP documents UI. The action button is
      // still helpful on stock Android even when this silently fails.
    }
  };

  const viewCertificate = async () => {
    if (!certSavedUri) return;
    try {
      await openSavedPdf(certSavedUri, "Gas Delivery Rider Certificate");
    } catch (err) {
      Alert.alert(
        "Could not open certificate",
        (err as Error)?.message ?? "No PDF viewer was found on this device.",
      );
    }
  };

  // ---- Render ---------------------------------------------------------
  return (
    <View>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerIconWrap}>
            <Ionicons
              name="shield-checkmark-outline"
              size={22}
              color={Colors.rider}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>
              Rider Verification Application
            </Text>
            <Text style={styles.headerSub}>
              {isApproved
                ? "Your application is approved and your account is active for deliveries."
                : isSubmitted
                  ? "Your application has been submitted and is awaiting administrator verification."
                  : isRejected
                    ? "Your application was rejected. Please review the reason and re-submit."
                    : "Upload the required documents and submit for administrator verification."}
            </Text>
          </View>
          {application ? (
            <StatusPill
              label={permitStatusLabel(application.status)}
              tone={permitStatusTone(application.status)}
            />
          ) : null}
        </View>

        {loading && !application ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Colors.rider} />
            <Text style={styles.loadingText}>Loading your application…</Text>
          </View>
        ) : null}

        {actionError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{actionError}</Text>
          </View>
        ) : null}
      </Card>

      {/* Application Summary — the brief requires this professional card
          showing Application Number, Applicant Name, Submission Date
          and Status in a single block (no National ID display). Rendered
          once the lazy-created PENDING row has been fetched. */}
      {application ? (
        <Card style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryIconWrap}>
              <Ionicons
                name="document-text-outline"
                size={22}
                color={Colors.rider}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>Application Summary</Text>
              <Text style={styles.summarySub}>
                {formatApplicationNumber(application.id)}
              </Text>
            </View>
            <StatusPill
              label={permitStatusLabel(application.status)}
              tone={permitStatusTone(application.status)}
            />
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Application Number</Text>
            <Text style={styles.summaryValue}>
              {formatApplicationNumber(application.id)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Applicant Name</Text>
            <Text style={styles.summaryValue}>
              {application.applicantName ??
                user?.fullName ??
                "Rider"}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Submission Date</Text>
            <Text style={styles.summaryValue}>
              {formatSubmissionDate(application.submittedAt)}
            </Text>
          </View>
          <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.summaryLabel}>Current Status</Text>
            <Text style={styles.summaryValue}>
              {permitStatusLabel(application.status)}
            </Text>
          </View>
        </Card>
      ) : null}

      {/* Step 1: Download the blank application form */}
      <Text style={styles.stepTitle}>Step 1 — Download the application form</Text>
      <Card>
        <Text style={styles.helper}>
          Download the official Rider Application Form, print or fill it
          electronically, sign it, and scan it back as a PDF. Upload the
          signed PDF in Step 2 below.
        </Text>
        <View style={styles.actionRow}>
          <AppButton
            title={
              downloadingForm ? "Downloading…" : "Download Application Form"
            }
            variant="outline"
            leftIcon={
              <Ionicons
                name="download-outline"
                size={18}
                color={Colors.primary}
              />
            }
            style={{ flex: 1 }}
            onPress={downloadBlankForm}
            disabled={downloadingForm}
          />
          {formSavedUri ? (
            <AppButton
              title="Open Form"
              variant="outline"
              leftIcon={
                <Ionicons
                  name="eye-outline"
                  size={18}
                  color={Colors.primary}
                />
              }
              style={{ flex: 1 }}
              onPress={viewBlankForm}
              disabled={downloadingForm}
            />
          ) : null}
        </View>
        {formDownloadMessage ? (
          <Text style={styles.successText}>{formDownloadMessage}</Text>
        ) : null}
      </Card>

      {/* Step 2: Upload the required documents */}
      <Text style={styles.stepTitle}>Step 2 — Upload required documents</Text>
      <Card>
        {REQUIRED_SLOTS.map((slot) => {
          const policy = SLOT_POLICY[slot.type];
          const doc = documentsBySlot[slot.type];
          const busy = !!uploading[slot.type] || !!deleting[slot.type];
          return (
            <View key={slot.type} style={styles.slotBlock}>
              <View style={styles.slotHeader}>
                <Text style={styles.slotIcon}>{slot.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotLabel}>{slot.label}</Text>
                  <Text style={styles.slotHelper}>{slot.helper}</Text>
                </View>
                {doc ? (
                  <StatusPill label="Uploaded" tone="success" />
                ) : (
                  <StatusPill label="Required" tone="muted" />
                )}
              </View>
              {doc ? (
                <View style={styles.docRow}>
                  <Text style={styles.docMeta} numberOfLines={1}>
                    {doc.originalName ?? doc.documentType}
                    {" · "}
                    {(doc.sizeBytes / 1024).toFixed(1)} KB
                  </Text>
                  <View style={styles.docActions}>
                    <TouchableOpacity
                      style={styles.docAction}
                      onPress={() => setPreviewDoc(doc)}
                      disabled={busy}
                    >
                      <Ionicons
                        name="eye-outline"
                        size={16}
                        color={Colors.primary}
                      />
                      <Text style={styles.docActionText}>View</Text>
                    </TouchableOpacity>
                    {!isLocked && (
                      <TouchableOpacity
                        style={styles.docAction}
                        onPress={() => handlePickFile(slot.type, policy)}
                        disabled={busy}
                      >
                        <Ionicons
                          name="swap-horizontal-outline"
                          size={16}
                          color={Colors.accent}
                        />
                        <Text style={styles.docActionText}>Replace</Text>
                      </TouchableOpacity>
                    )}
                    {!isLocked && (
                      <TouchableOpacity
                        style={styles.docAction}
                        onPress={() => handleDelete(slot.type, doc.id)}
                        disabled={busy}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color={Colors.danger}
                        />
                        <Text style={[styles.docActionText, { color: Colors.danger }]}>
                          Remove
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ) : (
                <View style={styles.uploadRow}>
                  <AppButton
                    title={
                      busy
                        ? uploading[slot.type]
                          ? "Uploading…"
                          : "Removing…"
                        : policy.buttonLabel
                    }
                    variant="primary"
                    leftIcon={
                      <Ionicons name="cloud-upload-outline" size={18} color="#FFF" />
                    }
                    onPress={() => handlePickFile(slot.type, policy)}
                    disabled={busy || isLocked}
                  />
                </View>
              )}
              {uploadSuccess && doc ? null : null}
            </View>
          );
        })}
        {uploadSuccess ? (
          <Text style={styles.successText}>{uploadSuccess}</Text>
        ) : null}
      </Card>

      {/* Step 3: Submit */}
      <Text style={styles.stepTitle}>Step 3 — Submit your application</Text>
      <Card>
        <Text style={styles.helper}>
          Submitting locks editing and notifies the administrator. You
          will receive an in-app notification when your application has
          been reviewed.
        </Text>
        {isSubmitted && application?.submittedAt ? (
          <View style={styles.submittedBox}>
            <Ionicons
              name="checkmark-circle"
              size={26}
              color={Colors.success}
            />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.submittedTitle}>
                Application submitted
              </Text>
              <Text style={styles.submittedBody}>
                Your application has been submitted successfully. Please
                wait for administrator verification.
              </Text>
            </View>
          </View>
        ) : isApproved ? (
          <View style={styles.submittedBox}>
            <Ionicons
              name="shield-checkmark"
              size={26}
              color={Colors.success}
            />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.submittedTitle}>Approved</Text>
              <Text style={styles.submittedBody}>
                Your rider application has been approved. You can now
                receive delivery orders. Download your official Gas
                Delivery Rider Certificate below.
              </Text>
            </View>
          </View>
        ) : isRejected ? (
          <View style={styles.rejectedBox}>
            <Ionicons
              name="alert-circle"
              size={26}
              color={Colors.danger}
            />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.submittedTitle}>Application rejected</Text>
              <Text style={styles.submittedBody}>
                {application?.rejectionReason
                  ? `Reason: ${application.rejectionReason}.`
                  : "Your application was rejected."}
                {" "}
                You may upload corrected documents and submit a new
                application below.
              </Text>
            </View>
          </View>
        ) : (
          <AppButton
            title={
              actionBusy
                ? "Submitting…"
                : allUploaded
                  ? "Submit Rider Application"
                  : "Upload all required documents first"
            }
            variant="primary"
            leftIcon={<Ionicons name="paper-plane-outline" size={18} color="#FFF" />}
            onPress={handleSubmit}
            disabled={!allUploaded || actionBusy || isLocked}
          />
        )}
      </Card>

      {/* Post-approval: download official certificate */}
      {isApproved ? (
        <>
          <Text style={styles.stepTitle}>
            Step 4 — Download your Rider Certificate
          </Text>
          <Card>
            <View style={styles.certHeaderRow}>
              <View style={styles.certIconWrap}>
                <Ionicons name="ribbon-outline" size={22} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.certTitle}>
                  Gas Delivery Rider Certificate
                </Text>
                <Text style={styles.certSub}>
                  {application.certificateNumber ?? `#${application.id}`}
                </Text>
              </View>
            </View>
            {application.validUntil ? (
              <Text style={styles.certValidUntil}>
                Valid until {application.validUntil}
              </Text>
            ) : null}
            <View style={styles.actionRow}>
              <AppButton
                title={certSavedUri ? "Open Certificate" : "View Certificate"}
                variant="outline"
                leftIcon={
                  <Ionicons
                    name="eye-outline"
                    size={18}
                    color={Colors.primary}
                  />
                }
                style={{ flex: 1 }}
                onPress={viewCertificate}
                disabled={!certSavedUri || downloadingCert}
              />
              <AppButton
                title={
                  downloadingCert
                    ? "Downloading…"
                    : certSavedUri
                      ? "Re-download"
                      : "Download Certificate"
                }
                variant="primary"
                leftIcon={
                  <Ionicons
                    name="download-outline"
                    size={18}
                    color="#FFF"
                  />
                }
                style={{ flex: 1 }}
                onPress={downloadCertificate}
                disabled={downloadingCert}
              />
            </View>
            {downloadingCert ? (
              <View style={styles.certProgressRow}>
                <ActivityIndicator color={Colors.success} size="small" />
                <Text style={styles.certProgressText}>
                  Downloading your certificate…
                </Text>
              </View>
            ) : null}
            {certDownloadMessage && !downloadingCert ? (
              <View style={styles.certSuccessBox}>
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={Colors.success}
                />
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <Text style={styles.certSuccessTitle}>
                    {certDownloadMessage}
                  </Text>
                  {certSavedMethod === "downloads" && Platform.OS === "android" ? (
                    <Text style={styles.certSuccessMeta}>
                      Saved to the Downloads folder on this device.
                    </Text>
                  ) : null}
                  <View style={styles.certSuccessActions}>
                    <AppButton
                      title="Open"
                      variant="outline"
                      leftIcon={
                        <Ionicons
                          name="open-outline"
                          size={16}
                          color={Colors.primary}
                        />
                      }
                      onPress={viewCertificate}
                      disabled={!certSavedUri}
                    />
                    {certSavedMethod === "downloads" &&
                    Platform.OS === "android" ? (
                      <AppButton
                        title="View Downloads"
                        variant="outline"
                        leftIcon={
                          <Ionicons
                            name="folder-open-outline"
                            size={16}
                            color={Colors.primary}
                          />
                        }
                        onPress={openDownloadsFolder}
                      />
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}
            {!downloadingCert && !certDownloadMessage && actionError ? (
              <View style={styles.certRetryBox}>
                <Ionicons
                  name="alert-circle"
                  size={22}
                  color={Colors.danger}
                />
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <Text style={styles.certRetryTitle}>
                    Couldn’t download the certificate.
                  </Text>
                  <Text style={styles.certRetryBody}>{actionError}</Text>
                </View>
                <AppButton
                  title="Retry"
                  variant="primary"
                  leftIcon={
                    <Ionicons
                      name="refresh-outline"
                      size={16}
                      color="#FFF"
                    />
                  }
                  onPress={() => {
                    setActionError(null);
                    downloadCertificate();
                  }}
                />
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      <DocumentPreviewModal
        visible={previewDoc != null}
        onClose={() => setPreviewDoc(null)}
        downloadUrl={previewDoc?.downloadUrl ?? ""}
        contentType={previewDoc?.contentType ?? ""}
        originalName={previewDoc?.originalName ?? previewDoc?.documentType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
    flexShrink: 1,
  },
  stepTitle: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  helper: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginBottom: Spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  summaryCard: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.rider + "33",
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  summaryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.rider + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  summarySub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: "700",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryLabel: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textSecondary,
    flex: 1,
  },
  summaryValue: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
    flex: 1,
    textAlign: "right",
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  successText: {
    color: Colors.success,
    fontSize: FontSize.sm,
    fontWeight: "700",
    marginTop: Spacing.sm,
  },
  slotBlock: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  slotHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  slotIcon: {
    fontSize: 22,
  },
  slotLabel: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  slotHelper: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 14,
  },
  docRow: {
    marginTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  docMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    flex: 1,
  },
  docActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  docAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceMuted,
  },
  docActionText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: "700",
  },
  uploadRow: {
    marginTop: Spacing.sm,
  },
  submittedBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: "#DCFCE7",
    marginTop: Spacing.sm,
  },
  rejectedBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: "#FEE2E2",
    marginTop: Spacing.sm,
  },
  submittedTitle: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "800",
  },
  submittedBody: {
    color: Colors.text,
    fontSize: FontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  certHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  certIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  certTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  certSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  certValidUntil: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: Spacing.md,
  },
  certProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  certProgressText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: "600",
  },
  certSuccessBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#DCFCE7",
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  certSuccessTitle: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "800",
  },
  certSuccessMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  certSuccessActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    flexWrap: "wrap",
  },
  certRetryBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FEE2E2",
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  certRetryTitle: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "800",
  },
  certRetryBody: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
});