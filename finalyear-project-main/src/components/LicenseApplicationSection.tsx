/**
 * Seller License Application section.
 *
 * A self-contained card that lets a seller download the official License
 * Application Form, upload the required documents (Signed Application
 * Form, National ID, Business Licence, Passport Photo), submit the
 * application for review, track its status, and download the issued
 * Gas Selling Permit once approved.
 *
 * Designed to live on the Seller Profile screen (`app/seller/profile.tsx`).
 *
 * The component talks directly to the live API through the store —
 * {@link useStore} exposes the upload / delete / submit / fetch helpers
 * added with the Seller Permit Verification workflow.
 *
 * File I/O uses `expo-file-system` (bundled separately in Expo SDK 54):
 *  - `File.pickFileAsync()` opens the OS document picker.
 *  - The picked file's `Blob` is appended straight to `FormData` (the
 *    `File` class implements `Blob`, so no extra read step is needed).
 *  - The bundled application form PDF is materialised via `Asset` and
 *    written to a user-accessible location:
 *      * **Android** — the public `Downloads` folder, using the
 *        Storage Access Framework (`expo-file-system/legacy`) so the file
 *        is visible from any PDF reader on the device.
 *      * **iOS / other** — the app's `Paths.document` directory, which is
 *        surfaced by the iOS Files app under the app's name.
 *
 * After the download completes, only a single success message is shown —
 * no internal path, no Open / Print / Overwrite buttons — so the seller
 * can browse to the file in their normal file manager.
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
import { Asset } from "expo-asset";
import { Buffer } from "buffer";
import * as Sharing from "expo-sharing";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "./Card";
import { AppButton } from "./AppButton";
import { StatusPill } from "./StatusPill";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { formatDateTime } from "../utils/format";
import { API_CONFIG } from "../api/config";
import { PermitsApi } from "../api/endpoints";
import { useStore } from "../store/StoreContext";
import type {
  PermitDocument,
  PermitDocumentType,
  SellerPermit,
  User,
} from "../../constants/types";

/**
 * Bundled blank Application Form PDF shipped inside the app at
 * `assets/license-application-form.pdf`. We expose it through `require`
 * (Metro bundles it as a static asset reference) so that it works fully
 * offline — no backend call, no auth, no API dependency.
 */
const APPLICATION_FORM_PDF = require("../../assets/license-application-form.pdf");

/** Filename the seller expects to see on the downloaded file. */
const APPLICATION_FORM_FILENAME = "Gas_Permit_Application_Form.pdf";

/**
 * Per-slot MIME acceptance for the picker hint and client-side guard.
 * Mirrors the server-side policy in
 * `PermitDocumentStorageService.ALLOWED_MIME` — keep both in sync.
 *
 * `mimeHint` is the single MIME type the OS picker pre-filters on
 * (Expo SDK 54's `File.pickFileAsync` only accepts one hint). For the
 * mixed national_id slot we pass the most permissive hint and gate
 * through `allowedMimes` after pick.
 */
type SellerDocType = Exclude<PermitDocumentType, "license">;
const MIME_POLICY: Record<
  SellerDocType,
  { allowedMimes: string[]; mimeHint: string; buttonLabel: string }
> = {
  application_form: {
    allowedMimes: ["application/pdf"],
    mimeHint: "application/pdf",
    buttonLabel: "Pick PDF",
  },
  national_id: {
    allowedMimes: ["application/pdf", "image/jpeg", "image/png"],
    mimeHint: "application/pdf",
    buttonLabel: "Pick file",
  },
  business_license: {
    allowedMimes: ["application/pdf"],
    mimeHint: "application/pdf",
    buttonLabel: "Pick PDF",
  },
  passport_photo: {
    allowedMimes: ["image/jpeg", "image/png"],
    mimeHint: "image/*",
    buttonLabel: "Pick image",
  },
};

/**
 * Map a verified MIME type to the file extension used in the upload's
 * Content-Disposition filename. Mirrors the server-side
 * `extensionFor(...)` table.
 */
function extensionForMime(mime: string | null | undefined): string {
  if (!mime) return "pdf";
  const m = mime.toLowerCase();
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "application/pdf") return "pdf";
  return "bin";
}

/**
 * Four documents the seller must attach before submission. The literal
 * tuple keeps iteration order matching the visual order in the UI.
 *
 * `documentType` is the lowercase form the backend expects on the
 * multipart `type` field. `label` / `helper` / `icon` are display only.
 *
 * The Gas Selling Permit is NOT a required upload — it is the document
 * issued by the administrator once the application is approved.
 */
const REQUIRED_DOCS: Array<{
  documentType: SellerDocType;
  label: string;
  helper: string;
  icon: string;
}> = [
  {
    documentType: "application_form",
    label: "Completed Signed Application Form",
    helper:
      "Download the form below, print it, complete it, sign it, scan it back, and upload the signed PDF.",
    icon: "📄",
  },
  {
    documentType: "national_id",
    label: "National ID Copy",
    helper:
      "Upload a clear PDF or image (JPG/PNG) of your government-issued National ID.",
    icon: "🆔",
  },
  {
    documentType: "business_license",
    label: "Business License",
    helper: "Upload a PDF copy of your valid business licence.",
    icon: "📜",
  },
  {
    documentType: "passport_photo",
    label: "Passport Photo",
    helper: "Upload a JPG or PNG of your recent passport-size photograph.",
    icon: "🖼️",
  },
];

/** Maximum PDF size the backend will accept (10 MB). */
const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  user: User;
  /** Optional pre-fetched permit. When absent we look it up in the store. */
  permit?: SellerPermit | null;
}

export function LicenseApplicationSection({ user, permit: permitProp }: Props) {
  const store = useStore();
  const storePermit = store.sellerPermits[user.id];
  const permit: SellerPermit | null | undefined = permitProp ?? storePermit;

  // ---- State -----------------------------------------------------------
  /** Slot-keyed upload status — `true` while the request is in flight. */
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  /** Inline error message surfaced at the bottom of the card. */
  const [actionError, setActionError] = useState<string | null>(null);
  /** Local "just submitted" flag — drives the Under Verification pill. */
  const [justSubmitted, setJustSubmitted] = useState(false);
  /** Inline confirmation surfaced immediately after a successful download. */
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  /** `true` while `downloadApplicationForm` is on the fly. */
  const [downloadingForm, setDownloadingForm] = useState(false);
  /** `true` while the official Gas Selling Permit Certificate is being
   *  streamed from the server. Drives the Step 4 button's busy state so
   *  the seller can't fire two concurrent downloads. */
  const [downloadingLicense, setDownloadingLicense] = useState(false);
  /**
   * URI of the most recently downloaded Gas Selling Permit Certificate,
   * persisted to a USER-VISIBLE location (Downloads on Android, the
   * app's Documents folder on iOS). When non-null, the Step 4 section
   * exposes a "View PDF" affordance that hands the URI to the system
   * PDF viewer via `expo-sharing`. Cleared when the seller starts a
   * fresh download so the banner always reflects the latest state.
   */
  const [licenseSavedUri, setLicenseSavedUri] = useState<string | null>(null);
  /**
   * Transient confirmation surfaced immediately after a successful
   * upload — mirrors {@link downloadSuccess}. Auto-cleared after a few
   * seconds so the seller sees positive feedback without leaving a
   * fixed banner on screen.
   */
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  /**
   * Document the seller asked to preview. `null` means the preview
   * modal is closed. PDFs are handed to the system viewer by the
   * modal itself; images are rendered as a base64 data URL inline.
   */
  const [viewDoc, setViewDoc] = useState<PermitDocument | null>(null);
  /**
   * SAF directory URI granted by the user for the public Downloads folder
   * on Android. Persisted in component state — once granted, Android keeps
   * the permission live across launches; the user is not re-prompted on
   * subsequent downloads.
   */
  const [downloadsSafUri, setDownloadsSafUri] = useState<string | null>(null);
  /**
   * Force a fresh `GET /api/permits/me` on mount so the document list is
   * always sourced from the live backend — even if the store's bootstrap
   * (`StoreContext.refresh`) hasn't fired yet for this session. Without
   * this effect a seller opening the Profile screen before the bootstrap
   * promise resolved would see "no documents uploaded" until they pulled
   * to refresh. Silent on failure — the existing toast surface covers
   * network errors so we don't double-alert.
   */
  useEffect(() => {
    if (permitProp) return; // Caller already supplied a permit; skip.
    store.fetchMyPermit().catch(() => {
      // Best-effort — the store's `error` slice carries the failure.
    });
    // Only on mount; subsequent fetches happen via upload / submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!justSubmitted) return;
    const t = setTimeout(() => setJustSubmitted(false), 2000);
    return () => clearTimeout(t);
  }, [justSubmitted]);
  useEffect(() => {
    if (!uploadSuccess) return;
    const t = setTimeout(() => setUploadSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [uploadSuccess]);

  // ---- Derived ---------------------------------------------------------
  /**
   * Server-side presence map — `true` for every required slot that has a
   * stored document. The previous filename-only local state is gone;
   * everything is computed from the server response so reloading the
   * screen restores the same state as the device the seller uploaded
   * from.
   */
  const presentSlots = useMemo(() => {
    const map: Record<string, PermitDocument> = {};
    if (permit?.documents) {
      for (const doc of permit.documents) {
        if (doc.documentType !== "license") {
          map[doc.documentType] = doc;
        }
      }
    }
    return map;
  }, [permit]);

  const uploadedCount = REQUIRED_DOCS.filter(
    (d) => !!presentSlots[d.documentType],
  ).length;
  const allUploaded = uploadedCount === REQUIRED_DOCS.length;

  const statusLabel = useMemo(() => {
    if (!permit) return "Not Submitted";
    switch (permit.status) {
      case "approved":
        return "Approved";
      case "rejected":
        return "Rejected";
      case "under_review":
        return "Under Review";
      case "pending":
        return justSubmitted ? "Under Verification" : "Pending Review";
      default:
        return "Pending Review";
    }
  }, [permit, justSubmitted]);

  const statusTone = useMemo<
    "primary" | "success" | "warning" | "danger" | "info" | "muted"
  >(() => {
    if (!permit) return "muted";
    if (permit.status === "approved") return "success";
    if (permit.status === "rejected") return "danger";
    return "warning";
  }, [permit]);

  const submittedAt = permit?.submittedAt ? formatDateTime(permit.submittedAt) : null;

  // ---- Helpers ---------------------------------------------------------
  /**
   * Pick a file for the given slot. We let `expo-file-system` open the
   * OS picker; the returned `File` is a `Blob`, so we hand it straight
   * to the store's `uploadPermitDocument`. The picker is per-slot MIME
   * hinted ({@link MIME_POLICY}) and a client-side check rejects a
   * mismatched type before the upload leaves the device.
   */
  const handlePickFile = async (
    documentType: SellerDocType,
  ) => {
    setActionError(null);
    setUploadSuccess(null);
    const policy = MIME_POLICY[documentType];
    console.info(
      "[LicenseApplicationSection] pickFile",
      JSON.stringify({ documentType, mimeHint: policy.mimeHint }),
    );
    try {
      const result = await File.pickFileAsync(policy.mimeHint);
      // The SDK can return either a single `File` or an array of `File`s.
      // We always take the first entry — the seller only needs one file
      // per slot.
      const picked = Array.isArray(result) ? result[0] : result;
      if (!picked) {
        console.info("[LicenseApplicationSection] pickFile cancelled");
        return;
      }
      // The picker returns a `File` whose `.size` we can read to enforce
      // the backend's 10 MB ceiling client-side. The backend re-validates.
      if (typeof picked.size === "number" && picked.size > MAX_BYTES) {
        Alert.alert(
          "File too large",
          "The selected file is larger than the 10 MB limit. Please compress it and try again.",
        );
        return;
      }
      // The picker-returned `File` exposes `name`, `size`, `type`, and
      // `uri` at runtime but the type declarations don't include them
      // in the visible namespace, so we read them through `any`.
      const pickedAny = picked as unknown as {
        name?: string;
        size?: number;
        type?: string;
        uri?: string;
      };
      const pickedType = (pickedAny.type ?? "").toLowerCase();
      console.info(
        "[LicenseApplicationSection] picked",
        JSON.stringify({
          documentType,
          name: pickedAny.name,
          size: pickedAny.size,
          type: pickedAny.type,
          uri: pickedAny.uri,
        }),
      );
      // Client-side MIME gate. The OS picker hint is best-effort and
      // varies by platform — explicitly reject a clearly wrong type
      // before paying the round-trip cost of a multipart upload.
      if (pickedType && !policy.allowedMimes.includes(pickedType)) {
        Alert.alert(
          "Wrong file type",
          `This slot only accepts ${humanAllowedTypes(policy.allowedMimes)}. The picked file is "${pickedType || "unknown"}".`,
        );
        return;
      }
      setUploading((prev) => ({ ...prev, [documentType]: true }));
      const fallbackExt = extensionForMime(pickedType || policy.allowedMimes[0]);
      const fallbackName = pickedAny.name ?? `${documentType}.${fallbackExt}`;
      // React Native's multipart encoder inspects the second argument
      // and handles either a real `Blob` (Expo `File` subclass) or a
      // `{ uri, name, type }` triple. We pass the triple — it survives
      // every RN release and any platform-specific BLOB quirks.
      const filePart = {
        uri: pickedAny.uri ?? "",
        name: fallbackName,
        type: pickedType || policy.allowedMimes[0] || "application/octet-stream",
      };
      await store.uploadPermitDocument(documentType, filePart, fallbackName);
      const humanLabel =
        REQUIRED_DOCS.find((d) => d.documentType === documentType)?.label ??
        documentType;
      setUploadSuccess(
        `✅ ${humanLabel} uploaded successfully — ${fallbackName}`,
      );
      setActionError(null);
    } catch (err) {
      console.error(
        "[LicenseApplicationSection] pickFile error",
        (err as Error)?.message,
      );
      const rawMessage = (err as Error)?.message ?? "";
      // Translate the cryptic RN "Network request failed" into an
      // actionable hint. The seller is almost always on a different
      // network than the laptop running the Spring Boot backend, or
      // the backend isn't running yet on the dev machine.
      const isNetworkFailure =
        rawMessage.toLowerCase().includes("network request failed") ||
        (err as { code?: string })?.code === "NETWORK";
      const friendly = isNetworkFailure
        ? "Cannot reach the server. Make sure your phone is on the same Wi-Fi as the laptop running the backend, then try again."
        : rawMessage ||
          "Could not upload the selected file. Please try again.";
      setActionError(friendly);
    } finally {
      setUploading((prev) => ({ ...prev, [documentType]: false }));
    }
  };

  /** Render a list of allowed MIME types in the error message. */
  const humanAllowedTypes = (allowed: string[]): string => {
    const set = new Set(allowed.map((m) => m.toLowerCase()));
    const hasPdf = set.has("application/pdf");
    const hasImage = set.has("image/jpeg") || set.has("image/png");
    if (hasPdf && !hasImage) return "PDF";
    if (!hasPdf && hasImage) return "image files (JPG/PNG)";
    if (hasPdf && hasImage) return "PDF or image (JPG/PNG)";
    return allowed.join(", ");
  };

  const handleRemove = async (documentType: string) => {
    const doc = presentSlots[documentType];
    if (!doc) return;
    setActionError(null);
    setUploadSuccess(null);
    const humanLabel =
      REQUIRED_DOCS.find((d) => d.documentType === documentType)?.label ??
      documentType;
    Alert.alert(
      "Remove document?",
      `Are you sure you want to remove this document?\n\n${humanLabel} — ${doc.originalName || doc.documentType}`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            console.info(
              "[LicenseApplicationSection] removing",
              JSON.stringify({ documentType, documentId: doc.id }),
            );
            setUploading((prev) => ({ ...prev, [documentType]: true }));
            try {
              await store.deletePermitDocument(doc.id);
              setUploadSuccess(
                `✅ ${humanLabel} removed successfully.`,
              );
              setActionError(null);
            } catch (err) {
              console.error(
                "[LicenseApplicationSection] remove error",
                (err as Error)?.message,
              );
              setActionError(
                (err as Error)?.message ??
                  "Could not remove the file. Please try again.",
              );
            } finally {
              setUploading((prev) => ({ ...prev, [documentType]: false }));
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  /**
   * Same handler as upload but surfaces a "replaced" success message
   * so the seller sees the difference between the first upload and a
   * subsequent re-upload of the same slot.
   */
  const handleReplace = async (documentType: SellerDocType) => {
    setActionError(null);
    setUploadSuccess(null);
    console.info(
      "[LicenseApplicationSection] replace",
      JSON.stringify({ documentType }),
    );
    // Reuse the upload flow by directly calling handlePickFile, but
    // override the success message after completion.
    await handlePickFile(documentType);
    // handlePickFile already sets `uploadSuccess`; we replace it.
    const doc = presentSlots[documentType];
    if (doc) {
      const humanLabel =
        REQUIRED_DOCS.find((d) => d.documentType === documentType)?.label ??
        documentType;
      setUploadSuccess(`🔁 ${humanLabel} replaced successfully.`);
    }
  };

  /**
   * Open the in-app preview for a document. PDFs are handed off to
   * the system viewer by the modal itself; images render inline.
   */
  const handleView = (doc: PermitDocument) => {
    console.info(
      "[LicenseApplicationSection] view",
      JSON.stringify({
        documentType: doc.documentType,
        contentType: doc.contentType,
        downloadUrl: doc.downloadUrl,
      }),
    );
    setViewDoc(doc);
  };

  const handleSubmit = async () => {
    if (!allUploaded) {
      Alert.alert(
        "Missing documents",
        "Please attach all required documents before submitting for verification.",
      );
      return;
    }
    setActionError(null);
    try {
      await store.submitMyPermit(`${user.fullName}'s Gas Business`);
      setJustSubmitted(true);
    } catch (err) {
      setActionError(
        (err as Error)?.message ??
          "Submission failed. Please try again in a moment.",
      );
    }
  };

  /**
   * Resolve a SAF (Storage Access Framework) URI for the system Downloads
   * folder on Android. On the very first call the user sees a system
   * dialog asking them to grant the app access to the folder; once
   * granted, Android remembers the permission and this returns silently
   * on every subsequent download.
   */
  const ensureDownloadsSafUri = async (): Promise<string | null> => {
    if (downloadsSafUri) return downloadsSafUri;
    const { StorageAccessFramework } = FileSystemLegacy;
    const rootUri = StorageAccessFramework.getUriForDirectoryInRoot("Download");
    if (!rootUri) return null;
    const result = await StorageAccessFramework.requestDirectoryPermissionsAsync(rootUri);
    if (!result.granted) return null;
    setDownloadsSafUri(result.directoryUri);
    return result.directoryUri;
  };

  /**
   * Replace (or create) a file inside the SAF-managed directory using
   * base64-encoded bytes. SAF `createFileAsync` refuses to overwrite an
   * existing entry, so we delete first when the file is already there.
   */
  const writeBytesToSaf = async (
    parentUri: string,
    fileName: string,
    mimeType: string,
    bytes: Uint8Array,
  ): Promise<void> => {
    const { StorageAccessFramework } = FileSystemLegacy;
    const existing = await StorageAccessFramework.readDirectoryAsync(parentUri);
    for (const entry of existing) {
      if (decodeURIComponent(entry).endsWith("/" + fileName)) {
        await StorageAccessFramework.deleteAsync(entry, { idempotent: true });
        break;
      }
    }
    const createdUri = await StorageAccessFramework.createFileAsync(
      parentUri,
      fileName,
      mimeType,
    );
    const base64 = Buffer.from(bytes).toString("base64");
    await StorageAccessFramework.writeAsStringAsync(createdUri, base64, {
      encoding: FileSystemLegacy.EncodingType.Base64,
    });
  };

  /**
   * Make the bundled blank application form available offline to the
   * seller. The PDF is shipped inside the app at
   * `assets/license-application-form.pdf`; we copy its bytes into a
   * user-accessible location:
   *
   *   * Android — the public `Downloads` folder via the Storage Access
   *     Framework. The file is visible in any file manager / PDF reader
   *     without sharing prompts or dev URLs.
   *   * iOS / other — `Paths.document` (the app's Documents directory),
   *     which surfaces under the app's name in the iOS Files app.
   *
   * After the bytes land we surface ONLY a single success message — no
   * internal path, no Open / Print / Overwrite buttons. Repeated taps
   * silently overwrite the existing copy.
   */
  const downloadApplicationForm = async () => {
    setActionError(null);
    setDownloadSuccess(null);
    setDownloadingForm(true);
    try {
      // 1. Materialise the bundled asset to a real on-disk file via the
      //    SDK 54 canonical API. Metro rewrites the `require(...)` to an
      //    asset reference; `Asset.fromModule(...).downloadAsync()`
      //    resolves it to a `file://` URI we can copy from. This works
      //    fully offline — no backend call, no auth, no API dependency.
      const asset = Asset.fromModule(APPLICATION_FORM_PDF);
      const downloaded = await asset.downloadAsync();
      const sourceUri = downloaded.localUri ?? asset.localUri ?? asset.uri;
      if (!sourceUri) {
        throw new Error(
          "Bundled application form PDF could not be located inside the app.",
        );
      }

      const source = new File(sourceUri);
      if (!source.exists || (source.size ?? 0) <= 0) {
        throw new Error(
          "Bundled application form PDF is missing or empty.",
        );
      }

      // Read the bytes once up front so we can hand them to both the
      // Android SAF write path and the iOS / fallback file write path.
      const sourceBytes = source.bytesSync();
      if (!sourceBytes || sourceBytes.length <= 0) {
        throw new Error(
          "Bundled application form PDF could not be read. Please try again.",
        );
      }

      // Magic-header sanity check: a valid PDF starts with `%PDF-`.
      const head = sourceBytes.slice(0, 5);
      const header = String.fromCharCode(...head);
      if (header !== "%PDF-") {
        throw new Error(
          "Bundled application form PDF is corrupt. Please reinstall the app.",
        );
      }

      // 2. Save to a user-accessible location. On Android this is the
      //    public Downloads folder; on iOS it is the app's Documents
      //    directory which the iOS Files app surfaces under the app's
      //    name. In every case we overwrite any prior copy automatically.
      if (Platform.OS === "android") {
        const safUri = await ensureDownloadsSafUri();
        if (!safUri) {
          throw new Error(
            "Downloads folder access was not granted. Please try again and allow access to your Downloads folder.",
          );
        }
        await writeBytesToSaf(safUri, APPLICATION_FORM_FILENAME, "application/pdf", sourceBytes);
      } else {
        const destDir = new Directory(Paths.document, "forms");
        if (!destDir.exists) destDir.create();
        const target = new File(destDir, APPLICATION_FORM_FILENAME);
        if (target.exists) target.delete();
        target.write(sourceBytes);
        if (!target.exists || (target.size ?? 0) <= 0) {
          throw new Error(
            "Saved application form is empty. Please try again.",
          );
        }
      }

      // 3. Show only a single, simple success line — no path, no buttons.
      setDownloadSuccess("✅ Application Form downloaded successfully.");
    } catch (err) {
      // Surface the real exception in the console so it can be debugged
      // from `adb logcat` / Metro, and show the seller a clear error.
      const failure = err instanceof Error ? err : new Error(String(err));
      console.error(
        "[downloadApplicationForm] failed",
        failure.name,
        failure.message,
        failure.stack,
      );
      setDownloadSuccess(null);
      Alert.alert(
        "Download failed",
        failure.message ||
          "Could not save the Application Form. Please try again.",
      );
      setActionError(
        failure.message || "Could not save the Application Form. Please try again.",
      );
    } finally {
      setDownloadingForm(false);
    }
  };

  const downloadApprovedLicense = async () => {
    setActionError(null);
    if (!permit || permit.status !== "approved") return;

    // The backend always regenerates the official Gas Selling Permit on
    // demand at `GET /api/permits/me/license` for any approved seller —
    // independent of whether the admin attached a separate licence file
    // at approval time. We hit that endpoint (NOT the seller-uploaded
    // `license` document row, which may not exist) so the seller can
    // always obtain the official PDF once their permit is APPROVED.
    const licenceUrl = PermitsApi.licenseUrl();
    const filename = `Gas_Selling_Permit_Certificate-${user.id}.pdf`;
    // Holds the URI the user can hand to the system viewer — kept at
    // module scope (via component state) so the success banner can offer
    // a "View PDF" affordance without re-running the download.
    let viewableUri: string | null = null;

    setDownloadingLicense(true);
    try {
      // 1. Stream the PDF into a temp file with downloadAsync — this
      //    avoids the `Blob.arrayBuffer is not a function` trap of the
      //    previous fetch + arrayBuffer pipeline.
      const tempDir = new Directory(Paths.cache, "licenses");
      if (!tempDir.exists) tempDir.create();
      const tempTarget = new File(tempDir, filename);
      if (tempTarget.exists) tempTarget.delete();

      const result = await FileSystemLegacy.downloadAsync(
        `${API_CONFIG.BASE_URL}${licenceUrl}`,
        tempTarget.uri,
        {
          headers: {
            Accept: "application/pdf",
            "X-Api-Version": API_CONFIG.API_VERSION,
            // The api client manages the bearer token through
            // setTokenProvider; for this background download we re-read
            // session.token from store.session which is the same source.
            ...(store.session?.token
              ? { Authorization: `Bearer ${store.session.token}` }
              : {}),
          },
        },
      );
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Server returned ${result.status}`);
      }
      if (!tempTarget.exists || (tempTarget.size ?? 0) <= 0) {
        throw new Error(
          result.status === 200
            ? "Saved permit is empty. Please try again."
            : `Server returned ${result.status}`,
        );
      }

      // 2. Read the bytes once so we can hand them to either the Android
      //    SAF (Storage Access Framework) write path or the iOS
      //    Paths.document write path. Reading once up front keeps the
      //    SAF and iOS branches symmetric and avoids re-issuing the
      //    HTTP request when both paths need the bytes.
      const tempBytes = tempTarget.bytesSync();
      if (!tempBytes || tempBytes.length <= 0) {
        throw new Error("Saved permit is empty. Please try again.");
      }
      // Magic-header sanity check — a valid PDF starts with "%PDF-".
      const head = tempBytes.slice(0, 5);
      const header = String.fromCharCode(...head);
      if (header !== "%PDF-") {
        throw new Error(
          "Downloaded certificate is not a valid PDF. Please try again.",
        );
      }

      // 3. Persist the certificate in TWO places on Android, ONE place on
      //    other platforms:
      //
      //    a. Always: a `file://` copy under Paths.document/licenses/ —
      //       this is what `expo-sharing`'s `Sharing.shareAsync` will
      //       hand to the system viewer. The previous implementation
      //       tried to pass the SAF `content://` URI directly, but
      //       expo-sharing rejects any URI whose scheme is not `file`
      //       (the bundled FileProvider inside expo-sharing only
      //       covers the app's own directories). Same scheme as the
      //       working DocumentPreviewModal flow.
      //    b. Android only: an additional copy in the public Downloads
      //       folder via the Storage Access Framework, so the seller
      //       can browse to the PDF from any file manager / reader
      //       and the file survives reinstalls / cache clears.
      //
      //    iOS already routes Paths.document through the system Files
      //    app under the app's name, so no second copy is needed.
      const docDir = new Directory(Paths.document, "licenses");
      if (!docDir.exists) docDir.create();
      const docTarget = new File(docDir, filename);
      if (docTarget.exists) docTarget.delete();
      docTarget.write(tempBytes);
      if (!docTarget.exists || (docTarget.size ?? 0) <= 0) {
        throw new Error("Saved permit is empty. Please try again.");
      }
      viewableUri = docTarget.uri;

      if (Platform.OS === "android") {
        try {
          const safUri = await ensureDownloadsSafUri();
          if (!safUri) {
            // The seller declined the SAF permission dialog. The file
            // is still saved under Paths.document and the View button
            // still works — only the secondary "visible in Downloads"
            // copy is skipped.
            console.info(
              "[downloadApprovedLicense] SAF permission declined — " +
                "skipping the Downloads-folder copy.",
            );
          } else {
            await writeBytesToSaf(
              safUri,
              filename,
              "application/pdf",
              tempBytes,
            );
          }
        } catch (safErr) {
          // SAF is a best-effort secondary location; never fail the
          // whole download because of it. The View button still
          // works against the Paths.document copy.
          console.warn(
            "[downloadApprovedLicense] SAF write failed (non-fatal):",
            (safErr as Error)?.message,
          );
        }
      }

      // 4. Surface the saved location the same way the application form
      //    does — a single green success line — and keep the file URI
      //    in component state so the View button can re-open it.
      setLicenseSavedUri(viewableUri);
      setDownloadSuccess(
        Platform.OS === "android"
          ? "✅ Gas Selling Permit Certificate saved. Tap View Certificate to open it, or look in your Downloads folder."
          : "✅ Gas Selling Permit Certificate saved to the app's Documents folder.",
      );
    } catch (err) {
      const failure = err instanceof Error ? err : new Error(String(err));
      console.error(
        "[downloadApprovedLicense] failed",
        failure.name,
        failure.message,
      );
      setDownloadSuccess(null);
      setLicenseSavedUri(null);
      Alert.alert(
        "Download failed",
        failure.message ||
          "Could not save the Gas Selling Permit Certificate. Please try again.",
      );
      setActionError(
        failure.message ||
          "Could not save the Gas Selling Permit Certificate. Please try again.",
      );
    } finally {
      setDownloadingLicense(false);
    }
  };

  /**
   * Open the just-downloaded certificate in the system PDF viewer.
   * Hands the `file://` URI (under Paths.document/licenses) to
   * `expo-sharing`, which routes it through a FileProvider on Android
   * so the system PDF viewer (Files, Drive, Adobe, …) can read it and
   * through `UIActivityViewController` on iOS. Earlier we tried
   * passing the Android SAF `content://` URI of the Downloads-folder
   * copy, but expo-sharing rejects any non-`file://` scheme with
   * "Only local file URLs are supported (expected scheme to be
   * 'file', got 'content')" — the bundled FileProvider only covers
   * the app's own directories.
   */
  const openSavedLicense = async () => {
    if (!licenseSavedUri) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert(
          "Open not supported",
          "Your device does not expose a PDF viewer. Look in your Downloads folder for the certificate.",
        );
        return;
      }
      await Sharing.shareAsync(licenseSavedUri, {
        mimeType: "application/pdf",
        dialogTitle: "Gas Selling Permit Certificate",
        UTI: "com.adobe.pdf",
      });
    } catch (err) {
      const failure = err instanceof Error ? err : new Error(String(err));
      console.error(
        "[openSavedLicense] failed",
        failure.name,
        failure.message,
      );
      Alert.alert(
        "Could not open the certificate",
        failure.message ||
          "Please open the certificate from your Downloads folder manually.",
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
        {permit?.status === "rejected" && permit.rejectionReason ? (
          <View style={styles.reviewNote}>
            <Text style={styles.reviewNoteText}>{permit.rejectionReason}</Text>
          </View>
        ) : null}
      </View>

      {/* Step 1 — Download form */}
      <View style={styles.step}>
        <View style={styles.stepHead}>
          <Text style={styles.stepNumber}>1</Text>
          <Text style={styles.stepTitle}>Download Seller Application Form</Text>
        </View>
        <Text style={styles.stepHelper}>
          Download the official Gas Seller Registration Application Form.
          Print it, complete every section by hand, sign and date the
          declaration, and scan it back to PDF before continuing.
        </Text>
        <AppButton
          title={
            downloadingForm
              ? "Downloading…"
              : downloadSuccess
                ? "Re-download Application Form"
                : "Download Application Form"
          }
          variant="outline"
          fullWidth
          disabled={downloadingForm}
          leftIcon={
            downloadingForm ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={styles.btnEmoji}>⬇️</Text>
            )
          }
          onPress={downloadApplicationForm}
        />
        {downloadSuccess ? (
          <Text style={styles.downloadSuccessText}>{downloadSuccess}</Text>
        ) : null}
      </View>

      {/* Step 2 — Upload documents */}
      <View style={styles.step}>
        <View style={styles.stepHead}>
          <Text style={styles.stepNumber}>2</Text>
          <Text style={styles.stepTitle}>
            Upload Completed Application &amp; Required Documents
          </Text>
          <Text style={styles.stepCount}>
            {uploadedCount}/{REQUIRED_DOCS.length} attached
          </Text>
        </View>

        {REQUIRED_DOCS.map((doc) => {
          const value = presentSlots[doc.documentType];
          const isUploading = !!uploading[doc.documentType];
          return (
            <View key={doc.documentType} style={styles.docRow}>
              <View style={styles.docIcon}>
                <Text style={styles.docIconText}>{doc.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.docLabel}>{doc.label}</Text>
                {isUploading ? (
                  <View style={styles.uploadingRow}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.uploadingText}>
                      Uploading {doc.label}…
                    </Text>
                  </View>
                ) : null}
                {value ? (
                  <View style={styles.docFilled}>
                    <View style={styles.docFilledHeader}>
                      <Text style={styles.docValue} numberOfLines={1}>
                        📎 {value.originalName || value.documentType}
                      </Text>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>✓ Uploaded</Text>
                      </View>
                    </View>
                    <Text style={styles.docSize}>
                      {(value.sizeBytes / 1024).toFixed(1)} KB ·{" "}
                      {value.contentType || "unknown"} · uploaded{" "}
                      {formatDateTime(value.uploadedAt)}
                    </Text>
                    <View style={styles.docActions}>
                      <TouchableOpacity
                        onPress={() => handleView(value)}
                        style={styles.docLinkBtn}
                        disabled={isUploading}
                      >
                        <Text style={styles.docLink}>View</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleReplace(doc.documentType)}
                        style={styles.docLinkBtn}
                        disabled={isUploading}
                      >
                        <Text style={styles.docLink}>Replace</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleRemove(doc.documentType)}
                        style={styles.docLinkBtn}
                        disabled={isUploading}
                      >
                        <Text
                          style={[styles.docLink, styles.docLinkDanger]}
                        >
                          Remove
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.docEmpty}>
                    <Text style={styles.docHelper}>{doc.helper}</Text>
                    {!isUploading ? (
                      <AppButton
                        title={MIME_POLICY[doc.documentType].buttonLabel}
                        variant="primary"
                        leftIcon={
                          <Ionicons
                            name="cloud-upload-outline"
                            size={16}
                            color="#FFF"
                          />
                        }
                        onPress={() => handlePickFile(doc.documentType)}
                        style={styles.docBtn}
                      />
                    ) : null}
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
          Once all required documents are attached, submit your application.
          The admin will review it and notify you when a decision is made.
        </Text>
        <AppButton
          title={
            permit && permit.status !== "approved"
              ? "Resubmit Application"
              : "Submit for Verification"
          }
          variant="primary"
          fullWidth
          disabled={!allUploaded || (permit?.status === "approved")}
          leftIcon={<Text style={styles.btnEmoji}>📨</Text>}
          onPress={handleSubmit}
        />
        {!allUploaded ? (
          <Text style={styles.validation}>
            Attach all {REQUIRED_DOCS.length} required documents to enable
            submission. {REQUIRED_DOCS.length - uploadedCount} remaining.
          </Text>
        ) : null}
        {permit?.status === "approved" ? (
          <Text style={styles.validation}>
            Your permit is approved — no further submissions are needed.
          </Text>
        ) : null}
      </View>

      {/* Step 4 — Download approved Gas Selling Permit Certificate */}
      <View style={[styles.step, styles.stepLast]}>
        <View style={styles.stepHead}>
          <Text style={styles.stepNumber}>4</Text>
          <Text style={styles.stepTitle}>
            Download Gas Selling Permit Certificate
          </Text>
        </View>
        {permit?.status === "approved" ? (
          <>
            <Text style={styles.stepHelper}>
              Congratulations! Your application has been approved. Download
              your official Gas Selling Permit Certificate below — a
              landscape A4 PDF with your certificate number, validity
              window, official seal and a verification QR code, ready
              for printing and framing.
            </Text>
            <AppButton
              title={
                downloadingLicense
                  ? "Downloading certificate…"
                  : "Download Gas Selling Permit Certificate"
              }
              variant="primary"
              fullWidth
              disabled={downloadingLicense}
              leftIcon={
                downloadingLicense ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.btnEmoji}>⬇️</Text>
                )
              }
              onPress={downloadApprovedLicense}
            />
            {licenseSavedUri ? (
              <AppButton
                title="View Certificate"
                variant="secondary"
                fullWidth
                leftIcon={<Text style={styles.btnEmoji}>👁️</Text>}
                onPress={openSavedLicense}
                style={{ marginTop: 10 }}
              />
            ) : null}
          </>
        ) : (
          <Text style={styles.pending}>
            The Gas Selling Permit Certificate download is only available
            once your application is Approved. While your status is
            Pending, Under Review or Rejected the certificate cannot be
            downloaded.
          </Text>
        )}
      </View>

      {uploadSuccess ? (
        <Text style={styles.uploadSuccessText}>{uploadSuccess}</Text>
      ) : null}
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      <DocumentPreviewModal
        visible={viewDoc != null}
        onClose={() => setViewDoc(null)}
        downloadUrl={viewDoc?.downloadUrl ?? ""}
        contentType={viewDoc?.contentType ?? ""}
        originalName={viewDoc?.originalName ?? viewDoc?.documentType}
      />
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
  docSize: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  docEmpty: {
    marginTop: 4,
  },
  docFilled: {
    marginTop: 4,
  },
  docFilledHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.success ?? "#10B981",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
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
  uploadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  uploadingText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
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
  downloadSuccessText: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "600",
  },
  uploadSuccessText: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.success ?? Colors.primary,
    fontWeight: "700",
  },
});
