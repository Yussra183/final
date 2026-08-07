/**
 * In-app full-screen preview for a seller's uploaded IMAGE documents.
 *
 * PDFs are routed through the system PDF viewer via `expo-sharing`,
 * which on Android exposes a `content://` URI through a FileProvider
 * (so the viewer process can actually read the file) and on iOS shows
 * the share sheet where the seller can pick a PDF reader. We
 * pre-fetch the bytes with the JWT so the system viewer never has to
 * make an auth'd request and we never leak the token in a URL.
 *
 * Why a data URL for images? `Image` cannot set the `Authorization`
 * header. We pre-fetch the bytes with the JWT, encode them as a base64
 * data URL, and pass the data URL to the consumer. The data URL never
 * leaves the device.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { API_CONFIG } from "../api/config";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { useStore } from "../store/StoreContext";
import * as Sharing from "expo-sharing";

interface Props {
  visible: boolean;
  onClose: () => void;
  /**
   * Server-relative download URL e.g. `/api/permits/documents/12`.
   * The full URL is reconstructed by prepending the API base URL.
   */
  downloadUrl: string;
  /** The MIME type of the document, used to pick the right preview. */
  contentType: string;
  /** The original filename, displayed in the modal title. */
  originalName?: string;
}

const isImage = (ct: string): boolean => ct.toLowerCase().startsWith("image/");
const isPdf = (ct: string): boolean => ct.toLowerCase() === "application/pdf";

/**
 * Convert a raw `ArrayBuffer` to a base64 string in a way that works
 * on both iOS, Android, and web. `btoa` is only available on web so
 * we always go through the manual `String.fromCharCode` path on RN.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as number[],
    );
  }
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(binary);
  }
  // Manual base64 encode — only used in odd environments.
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < binary.length; i += 3) {
    const c1 = binary.charCodeAt(i) & 0xff;
    const c2 =
      i + 1 < binary.length ? binary.charCodeAt(i + 1) & 0xff : 0;
    const c3 =
      i + 2 < binary.length ? binary.charCodeAt(i + 2) & 0xff : 0;
    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (c2 >> 4);
    const e3 = ((c2 & 15) << 2) | (c3 >> 6);
    const e4 = c3 & 63;
    output +=
      chars.charAt(e1) +
      chars.charAt(e2) +
      (i + 1 < binary.length ? chars.charAt(e3) : "=") +
      (i + 2 < binary.length ? chars.charAt(e4) : "=");
  }
  return output;
}

export function DocumentPreviewModal({
  visible,
  onClose,
  downloadUrl,
  contentType,
  originalName,
}: Props) {
  const store = useStore();
  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * Monotonic counter for the latest open-PDF request. The PDF effect
   * captures the value at invocation time and only writes state if
   * it's still the latest when the async work completes. This stops a
   * stale request from racing the latest one and clobbering the modal
   * state with a "Another share request is being processed now."
   * error from `expo-sharing`.
   */
  const pdfRequestId = React.useRef(0);
  /**
   * Flag flipped to `true` while a PDF handoff is in flight. Used to
   * prevent a second `Sharing.shareAsync` call from racing the first
   * (the underlying `UIActivityViewController` on iOS and the
   * `ACTION_SEND` intent on Android both reject a second call while a
   * share is still active).
   */
  const pdfInFlight = React.useRef(false);

  // Reset state every time the modal opens or the URL changes.
  useEffect(() => {
    if (!visible) {
      setImageDataUri(null);
      setLoadError(null);
      setLoading(false);
      // Bump the request id so any in-flight PDF fetch for a previous
      // document discards its result instead of touching state.
      ++pdfRequestId.current;
      // Drop the share-in-flight flag so the next open is unblocked.
      // The system share sheet is dismissed by the time the modal
      // becomes invisible, so this is safe.
      pdfInFlight.current = false;
    }
  }, [visible, downloadUrl, contentType]);

  // When the user opens a PDF, download the bytes with the JWT and
  // hand off a local URI to the system viewer via `expo-sharing`. We
  // can't open the API URL directly because `Linking.openURL` carries
  // no `Authorization` header — the server would 403 the request and
  // the browser tab would show a raw JSON error.
  //
  // On Android `expo-sharing` routes the URI through a FileProvider so
  // the system PDF viewer (Drive, Adobe, etc.) receives a `content://`
  // URI it can read. A direct `file://` URI throws
  // "exposed beyond app through Intent.getData()" on Android 7+ and
  // simply fails on iOS.
  useEffect(() => {
    if (!visible) return;
    if (!isPdf(contentType)) return;
    // Bump the request id and remember the value for this run. If a
    // later request arrives (or this effect re-fires for any reason),
    // we'll detect the mismatch and bail.
    const myRequestId = ++pdfRequestId.current;
    // Reject the call outright if a previous share is still active —
    // `expo-sharing` throws "Another share request is being processed
    // now." when a second shareAsync lands before the first resolves.
    if (pdfInFlight.current) {
      console.info(
        "[DocumentPreviewModal] PDF handoff skipped — previous share still in flight",
      );
      return;
    }
    pdfInFlight.current = true;

    const openPdf = async () => {
      try {
        // 1. Authenticated download via fetch — same pattern the
        //    approved-licence download uses.
        const url = `${API_CONFIG.BASE_URL}${downloadUrl}`;
        const res = await fetch(url, {
          headers: store.session?.token
            ? { Authorization: `Bearer ${store.session.token}` }
            : {},
        });
        if (!res.ok) {
          throw new Error(
            `Server returned ${res.status} while loading the PDF.`,
          );
        }
        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // 2. Persist to a per-document path under `Paths.cache`.
        const { File, Directory, Paths } = require("expo-file-system");
        const cacheDir = new Directory(Paths.cache, "previews");
        if (!cacheDir.exists) cacheDir.create();
        const safeName =
          (originalName ?? "document").replace(/[^A-Za-z0-9._-]/g, "_");
        const target = new File(
          cacheDir,
          `preview-${Date.now()}-${safeName}`,
        );
        if (target.exists) target.delete();
        target.write(bytes);

        // 3. Hand the local URI to the system via expo-sharing. On
        //    Android this opens the system "Open with" picker (which
        //    is the device's PDF viewer); on iOS this opens the share
        //    sheet where the user can pick the PDF viewer.
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          // Fall back to a plain Alert when sharing isn't supported
          // (e.g. on a web build or in a future platform we don't
          // cover yet). Tell the seller where the bytes are.
          throw new Error(
            "No PDF viewer is available on this device. The file was saved to " +
              target.uri,
          );
        }
        await Sharing.shareAsync(target.uri, {
          mimeType: "application/pdf",
          // On iOS this is the share-sheet title; on Android the
          // intent extra is what the system viewer shows.
          dialogTitle: originalName ?? "Open PDF",
        });
        // Auto-close the modal once the share sheet / viewer is up.
        if (pdfRequestId.current === myRequestId) {
          onClose();
        }
      } catch (err) {
        console.error(
          "[DocumentPreviewModal] PDF handoff failed",
          (err as Error)?.message,
        );
        if (pdfRequestId.current === myRequestId) {
          setLoadError(
            (err as Error)?.message ?? "Could not open the PDF.",
          );
        }
      } finally {
        // Only release the in-flight lock if THIS request is still the
        // latest — otherwise the latest request will manage its own
        // release in its own finally block.
        if (pdfRequestId.current === myRequestId) {
          pdfInFlight.current = false;
        }
      }
    };
    openPdf();
  }, [visible, contentType, downloadUrl, onClose, originalName, store.session?.token]);

  // For images, pre-fetch the bytes so we can render the base64 data
  // URL without the OS doing a second auth round-trip.
  useEffect(() => {
    if (!visible) return;
    if (!isImage(contentType)) return;
    setLoading(true);
    setLoadError(null);
    const url = `${API_CONFIG.BASE_URL}${downloadUrl}`;
    fetch(url, {
      headers: store.session?.token
        ? { Authorization: `Bearer ${store.session.token}` }
        : {},
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            `Server returned ${res.status} while loading the document.`,
          );
        }
        const buffer = await res.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        setImageDataUri(`data:${contentType};base64,${base64}`);
      })
      .catch((err) => {
        console.error(
          "[DocumentPreviewModal] failed to load image",
          (err as Error)?.message,
        );
        setLoadError(
          (err as Error)?.message ?? "Could not load the document.",
        );
      })
      .finally(() => setLoading(false));
  }, [visible, downloadUrl, contentType, store.session?.token]);

  const title = useMemo(
    () => originalName ?? "Document preview",
    [originalName],
  );

  // PDFs are handed to the system viewer as soon as the modal opens —
  // we still render the modal in the meantime so the seller gets
  // feedback (and a Close button to fall back on).
  const showPdfHandoff = isPdf(contentType);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.subtitle}>{contentType}</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close document preview"
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {loadError ? (
            <View style={styles.center}>
              <Text style={styles.errorTitle}>Could not open document</Text>
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.fallbackBtn}
                accessibilityRole="button"
              >
                <Text style={styles.fallbackBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : showPdfHandoff ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.centerText}>
                Opening PDF in your system viewer…
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.fallbackBtn}
                accessibilityRole="button"
              >
                <Text style={styles.fallbackBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.centerText}>Loading image…</Text>
            </View>
          ) : imageDataUri ? (
            <Image
              source={{ uri: imageDataUri }}
              style={styles.imageFill}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.center}>
              <Text style={styles.centerText}>
                Preview not available for {contentType}.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === "ios" ? Spacing.xl : Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: "#111",
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  title: {
    color: "#fff",
    fontSize: FontSize.md,
    fontWeight: "700",
  },
  subtitle: {
    color: "#aaa",
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  closeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: "#222",
  },
  closeBtnText: {
    color: "#fff",
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  body: {
    flex: 1,
  },
  imageFill: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  centerText: {
    marginTop: Spacing.md,
    color: "#ccc",
    fontSize: FontSize.sm,
    textAlign: "center",
  },
  fallbackBtn: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: "#222",
    borderRadius: Radius.md,
  },
  fallbackBtnText: {
    color: "#fff",
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  errorTitle: {
    color: "#fff",
    fontSize: FontSize.md,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  errorText: {
    color: "#ffb3b3",
    fontSize: FontSize.sm,
    textAlign: "center",
  },
});
