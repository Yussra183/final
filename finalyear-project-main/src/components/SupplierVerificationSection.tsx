/**
 * Supplier Verification Application — self-contained card rendered on
 * the Supplier Verification screen.
 *
 * Mirrors `RiderVerificationSection` (rider flow) end-to-end:
 *   Step 1: Download the blank application form PDF.
 *   Step 2: Upload the required documents (PDF / image). Suppliers
 *           represent registered companies, so the required documents are:
 *           Application Form, Company Registration ID, Business
 *           Registration Certificate, TIN, and Business Licence. Each
 *           slot supports upload / replace / view / remove.
 *   Step 3: Submit (enabled only when every slot is filled AND status
 *           is still PENDING without a submittedAt). Editing is locked
 *           afterwards.
 *   Post-approval: the supplier's official Gas Supplier Certificate
 *           download section appears with View + Download actions. The
 *           certificate is NOT available before approval — the backend
 *           returns HTTP 409.
 *   Post-rejection: status pill flips to "Rejected" with the
 *           supplier-facing reason; the supplier can re-upload corrected
 *           docs and re-submit (which re-flips status to PENDING).
 *
 * Talks directly to the live API via {@link useStore} so the parent
 * doesn't need to wire any data fetching.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { SupplierApplicationsApi } from "../api/endpoints";
import {
  SupplierApplication,
  SupplierApplicationDocument,
  SupplierApplicationDocumentType,
} from "../../constants/types";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

// ============================================================================
// Slot catalogue
// ============================================================================

/** Every slot the supplier can upload to. Passport Size Photo has
 *  been removed from the supplier workflow (suppliers represent
 *  registered companies, not individuals), so it is excluded even
 *  though the enum still defines the value for backward compatibility
 *  with already-stored documents. The admin-managed certificate slot
 *  is also excluded. */
type UploadableSlot = Exclude<
  SupplierApplicationDocumentType,
  "supplier_certificate" | "supplier_passport_photo"
>;

/**
 * The supplier-facing slots the brief requires. Suppliers represent
 * registered companies, not individuals, so the required documents are:
 * completed application form, Company Registration ID, Business
 * Registration Certificate, TIN, and Business Licence. National ID
 * (an individual identifier) and Passport Size Photo are NOT required.
 */
const REQUIRED_SLOTS: Array<{
  type: UploadableSlot;
  label: string;
  helper: string;
  icon: string;
}> = [
  {
    type: "supplier_application_form",
    label: "Completed Supplier Application Form",
    helper:
      "Download the form below, print, complete, sign, scan back, and upload the signed PDF.",
    icon: "📄",
  },
  {
    type: "supplier_national_id",
    label: "Company Registration ID",
    helper:
      "Upload a clear PDF or image (JPG/PNG) of your company's official Company Registration ID / Registration Number.",
    icon: "🆔",
  },
  {
    type: "supplier_business_registration",
    label: "Business Registration Certificate",
    helper: "Upload a PDF copy of your business registration certificate.",
    icon: "🏢",
  },
  {
    type: "supplier_tin_certificate",
    label: "Tax Identification Certificate (TIN)",
    helper: "Upload a PDF copy of your TIN certificate.",
    icon: "🧾",
  },
  {
    type: "supplier_business_licence",
    label: "Business Licence",
    helper: "Upload a PDF copy of your current business licence.",
    icon: "📜",
  },
];

interface SlotPolicy {
  allowedMimes: string[];
  mimeHint: string;
  buttonLabel: string;
}

/**
 * Per-slot MIME policy — mirrors the server-side
 * `SupplierApplicationDocumentStorageService.ALLOWED_MIME` table so the
 * OS picker hint matches what the backend will accept.
 */
const SLOT_POLICY: Record<UploadableSlot, SlotPolicy> = {
  supplier_application_form: {
    allowedMimes: ["application/pdf"],
    mimeHint: "application/pdf",
    buttonLabel: "Pick PDF",
  },
  supplier_national_id: {
    allowedMimes: ["application/pdf", "image/jpeg", "image/png"],
    mimeHint: "application/pdf",
    buttonLabel: "Pick file",
  },
  supplier_business_registration: {
    allowedMimes: ["application/pdf"],
    mimeHint: "application/pdf",
    buttonLabel: "Pick PDF",
  },
  supplier_tin_certificate: {
    allowedMimes: ["application/pdf"],
    mimeHint: "application/pdf",
    buttonLabel: "Pick PDF",
  },
  supplier_business_licence: {
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

function statusLabel(status: SupplierApplication["status"]): string {
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
      return "Pending";
  }
}

function statusTone(
  status: SupplierApplication["status"],
): "primary" | "success" | "warning" | "danger" | "info" | "muted" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "under_review") return "info";
  return "warning";
}

// ============================================================================
// Component
// ============================================================================

interface Props {
  /** Notifies the parent screen when the application state changes. */
  onApplicationChange?: (application: SupplierApplication | null) => void;
}

export function SupplierVerificationSection({ onApplicationChange }: Props) {
  const store = useStore();
  const session = store.session;
  const user = session?.user;
  const cachedApplication = user
    ? store.supplierApplications[user.id]
    : undefined;

  // ---- Live state ------------------------------------------------------
  const [application, setApplication] = useState<SupplierApplication | null>(
    cachedApplication ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // ---- Per-slot busy state --------------------------------------------
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  // ---- Application form PDF download ----------------------------------
  const [downloadingForm, setDownloadingForm] = useState(false);
  const [formSavedUri, setFormSavedUri] = useState<string | null>(null);
  const [formDownloadMessage, setFormDownloadMessage] = useState<string | null>(
    null,
  );

  // ---- Certificate PDF download ---------------------------------------
  const [downloadingCert, setDownloadingCert] = useState(false);
  const [certSavedUri, setCertSavedUri] = useState<string | null>(null);
  const [certDownloadMessage, setCertDownloadMessage] = useState<string | null>(
    null,
  );

  // ---- Document preview ------------------------------------------------
  const [previewDoc, setPreviewDoc] =
    useState<SupplierApplicationDocument | null>(null);

  /** Single place that pushes new application state up to the parent. */
  const applyApplication = (next: SupplierApplication | null) => {
    setApplication(next);
    onApplicationChange?.(next);
  };

  // ---- Initial fetch ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const fetched = await store.fetchMySupplierApplication();
        if (!cancelled) {
          setApplication(fetched);
          onApplicationChange?.(fetched);
        }
      } catch (err) {
        if (!cancelled) {
          setActionError(
            (err as Error)?.message ?? "Couldn't load supplier application.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // ---- Transient message auto-clear ------------------------------------
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
    const map: Partial<Record<UploadableSlot, SupplierApplicationDocument>> = {};
    application?.documents?.forEach((d) => {
      if (d.documentType !== "supplier_certificate") {
        map[d.documentType as UploadableSlot] = d;
      }
    });
    return map;
  }, [application]);

  const uploadedCount = REQUIRED_SLOTS.filter(
    (s) => !!documentsBySlot[s.type],
  ).length;
  const allUploaded = uploadedCount === REQUIRED_SLOTS.length;

  // Editing is locked once submitted (PENDING with submittedAt set),
  // under review, or approved. Rejections re-enable editing so the
  // supplier can upload corrected documents.
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
    slotType: UploadableSlot,
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
      await store.uploadSupplierApplicationDocument(
        slotType,
        filePart,
        fallbackName,
      );
      // Re-pull the cached application so the docs list updates.
      const refreshed = await store.fetchMySupplierApplication();
      applyApplication(refreshed);
      const humanLabel =
        REQUIRED_SLOTS.find((s) => s.type === slotType)?.label ?? slotType;
      setUploadSuccess(`✅ ${humanLabel} uploaded successfully.`);
    } catch (err) {
      console.error("[SupplierVerificationSection] upload error", err);
      setActionError(
        (err as Error)?.message ?? "Could not upload the document.",
      );
    } finally {
      setUploading((prev) => ({ ...prev, [slotType]: false }));
    }
  };

  const handleDelete = async (
    slotType: UploadableSlot,
    documentId: string,
  ) => {
    Alert.alert(
      "Remove document",
      "Remove the uploaded document for this slot? You can re-upload at any time before submission.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setActionError(null);
            setDeleting((prev) => ({ ...prev, [slotType]: true }));
            try {
              await store.deleteSupplierApplicationDocument(documentId);
              const refreshed = await store.fetchMySupplierApplication();
              applyApplication(refreshed);
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
      const submitted = await store.submitSupplierApplication();
      applyApplication(submitted);
      Alert.alert(
        "Application submitted",
        "Your application has been submitted successfully. Please wait for administrator approval.",
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
   * Fetch the blank Supplier Application Form from the backend and save
   * it onto the device. The bytes come from the live
   * `GET /api/supplier-applications/me/application-form` endpoint —
   * never a bundled or mock file.
   *
   * The download lands in the public Downloads folder on Android; if the
   * user declines the folder grant we fall back to the native Save/Share
   * sheet so they can still place the file themselves. Either way an
   * app-local copy is retained so "Open Form" works offline afterwards.
   */
  const downloadBlankForm = async () => {
    setFormDownloadMessage(null);
    setActionError(null);
    const url = `${API_CONFIG.BASE_URL}${SupplierApplicationsApi.applicationFormUrl()}`;
    const filename = "Supplier_Application_Form.pdf";
    setDownloadingForm(true);
    try {
      const tempDir = new Directory(Paths.cache, "supplier-application-forms");
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
        "supplier-application-forms",
        "Save Supplier Application Form",
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
      await openSavedPdf(formSavedUri, "Supplier Application Form");
    } catch (err) {
      Alert.alert(
        "Could not open form",
        (err as Error)?.message ?? "No PDF viewer was found on this device.",
      );
    }
  };

  // ---- Download official supplier certificate -------------------------
  /**
   * Fetch the supplier certificate PDF and save it to the device.
   * The bytes come from `GET /api/supplier-applications/me/certificate`
   * (404 / 409 when not approved). After download we route the file
   * through {@link savePdfToDevice} so the supplier gets a real
   * download: on Android the file lands in the public Downloads
   * folder (via SAF), on iOS it lands in the app's Documents folder
   * (the Save/Share sheet is offered as a fallback so the supplier can
   * still place it themselves).
   *
   * The brief requires "Certificate downloaded successfully." after
   * download — that message replaces the previous ad-hoc copy.
   */
  const downloadCertificate = async () => {
    if (!application || application.status !== "approved") return;
    setCertDownloadMessage(null);
    setActionError(null);
    const url = `${API_CONFIG.BASE_URL}${SupplierApplicationsApi.certificateUrl()}`;
    const safeId = (user?.id ?? "me").toString().replace(/[^a-zA-Z0-9_-]/g, "");
    const filename = `Supplier_Certificate-${safeId}.pdf`;
    setDownloadingCert(true);
    try {
      const tempDir = new Directory(Paths.cache, "supplier-certificates");
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
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Server returned ${result.status}`);
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
        "supplier-certificates",
        "Save Gas Supplier Certificate",
      );
      tempTarget.delete();

      setCertSavedUri(saved.localUri);
      setCertDownloadMessage(
        saved.method === "downloads"
          ? "Certificate downloaded successfully."
          : saved.method === "shared"
            ? "Certificate downloaded successfully."
            : "Certificate downloaded successfully.",
      );
    } catch (err) {
      setActionError(
        (err as Error)?.message ??
          "Could not download the certificate. Please try again.",
      );
    } finally {
      setDownloadingCert(false);
    }
  };

  const viewCertificate = async () => {
    if (!certSavedUri) return;
    try {
      await openSavedPdf(certSavedUri, "Gas Supplier Certificate");
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
              color={Colors.supplier}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>
              Supplier Verification Application
            </Text>
            <Text style={styles.headerSub}>
              {isApproved
                ? "Your application is approved. You can now supply gas to sellers."
                : isSubmitted
                  ? "Your application has been submitted and is awaiting administrator approval."
                  : isRejected
                    ? "Your application was rejected. Please review the reason and re-submit."
                    : "Upload the required documents and submit for administrator approval."}
            </Text>
          </View>
          {application ? (
            <StatusPill
              label={statusLabel(application.status)}
              tone={statusTone(application.status)}
            />
          ) : null}
        </View>

        {loading && !application ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Colors.supplier} />
            <Text style={styles.loadingText}>Loading your application…</Text>
          </View>
        ) : null}

        {actionError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{actionError}</Text>
          </View>
        ) : null}
      </Card>

      {/* Step 1: Download the blank application form */}
      <Text style={styles.stepTitle}>Step 1 — Download the application form</Text>
      <Card>
        <Text style={styles.helper}>
          Download the official Supplier Application Form, print or fill it
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
                <Ionicons name="eye-outline" size={18} color={Colors.primary} />
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
      <Text style={styles.stepTitle}>
        Step 2 — Upload required documents ({uploadedCount}/
        {REQUIRED_SLOTS.length})
      </Text>
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
                        <Text
                          style={[
                            styles.docActionText,
                            { color: Colors.danger },
                          ]}
                        >
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
                      <Ionicons
                        name="cloud-upload-outline"
                        size={18}
                        color="#FFF"
                      />
                    }
                    onPress={() => handlePickFile(slot.type, policy)}
                    disabled={busy || isLocked}
                  />
                </View>
              )}
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
          Submitting locks editing and notifies the administrator. You will
          receive an in-app notification when your application has been
          reviewed.
        </Text>
        {isSubmitted ? (
          <View style={styles.submittedBox}>
            <Ionicons name="checkmark-circle" size={26} color={Colors.success} />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.submittedTitle}>Application submitted</Text>
              <Text style={styles.submittedBody}>
                Your application has been submitted successfully. Please wait
                for administrator approval.
              </Text>
            </View>
          </View>
        ) : isApproved ? (
          <View style={styles.submittedBox}>
            <Ionicons name="shield-checkmark" size={26} color={Colors.success} />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.submittedTitle}>Approved</Text>
              <Text style={styles.submittedBody}>
                Your supplier application has been approved. You can now supply
                gas to sellers and receive supply requests. Download your
                official Gas Supplier Certificate below.
              </Text>
            </View>
          </View>
        ) : isRejected ? (
          <View style={styles.rejectedBox}>
            <Ionicons name="alert-circle" size={26} color={Colors.danger} />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.submittedTitle}>Application rejected</Text>
              <Text style={styles.submittedBody}>
                {application?.rejectionReason
                  ? `Reason: ${application.rejectionReason}.`
                  : "Your application was rejected."}{" "}
                You may upload corrected documents and submit a new application
                below.
              </Text>
            </View>
          </View>
        ) : null}
        {!isSubmitted && !isApproved ? (
          <AppButton
            title={
              actionBusy
                ? "Submitting…"
                : allUploaded
                  ? "Submit Supplier Application"
                  : "Upload all required documents first"
            }
            variant="primary"
            leftIcon={
              <Ionicons name="paper-plane-outline" size={18} color="#FFF" />
            }
            onPress={handleSubmit}
            disabled={!allUploaded || actionBusy || isLocked}
            style={isRejected ? { marginTop: Spacing.md } : undefined}
          />
        ) : null}
      </Card>

      {/* Post-approval: download official certificate */}
      {isApproved ? (
        <>
          <Text style={styles.stepTitle}>
            Step 4 — Download your Supplier Certificate
          </Text>
          <Card>
            <View style={styles.certHeaderRow}>
              <View style={styles.certIconWrap}>
                <Ionicons name="ribbon-outline" size={22} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.certTitle}>Gas Supplier Certificate</Text>
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
                  <Ionicons name="eye-outline" size={18} color={Colors.primary} />
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
                  <Ionicons name="download-outline" size={18} color="#FFF" />
                }
                style={{ flex: 1 }}
                onPress={downloadCertificate}
                disabled={downloadingCert}
              />
            </View>
            {certDownloadMessage ? (
              <Text style={styles.successText}>{certDownloadMessage}</Text>
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
    backgroundColor: "#E0E7FF",
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
});
