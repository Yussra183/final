/**
 * Shared "save a PDF onto the user's device" helper.
 *
 * The app previously only ever *viewed* downloaded PDFs: bytes landed in
 * the app-private sandbox (`Paths.document`) and were handed straight to
 * `Sharing.shareAsync`, which opens a preview/share sheet. Nothing was
 * ever written somewhere the user could browse to afterwards, so the file
 * did not survive as a "download" in any meaningful sense.
 *
 * This helper performs a real download-to-device:
 *
 *   1. Always keeps an app-local copy so the file can be re-opened later
 *      from inside the app without re-hitting the network.
 *   2. On Android, writes the bytes into the *public* Downloads folder via
 *      the Storage Access Framework (SAF). Scoped storage (Android 10+)
 *      forbids direct writes to shared storage, so SAF's one-time folder
 *      grant is the supported route and needs no manifest permission.
 *   3. If the user declines the folder grant — or the platform has no
 *      public Downloads concept, as on iOS — falls back to the native
 *      Save/Share sheet so the user can still choose a destination
 *      ("Save to Files", Drive, etc.).
 *
 * Only the file-persistence concern lives here. Fetching, auth headers and
 * validation stay with the caller.
 */
import { Platform } from "react-native";
import { File, Directory, Paths } from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

/** How the bytes ultimately reached the user. */
export type SaveMethod =
  /** Written into the public Downloads folder (Android, SAF grant given). */
  | "downloads"
  /** Handed to the native Save/Share sheet for the user to place. */
  | "shared"
  /** Kept in the app's own Documents folder only. */
  | "documents";

export interface SavePdfResult {
  method: SaveMethod;
  /** App-local copy — always present, used for "open it later". */
  localUri: string;
}

/**
 * Cached SAF grant for the Downloads folder. Android persists the grant
 * itself, but the resulting tree URI is not re-discoverable through the
 * Expo API, so we hold it for the lifetime of the JS context to avoid
 * re-prompting on every download.
 */
let cachedDownloadsSafUri: string | null = null;

/**
 * Ask for (or reuse) write access to the system Downloads folder.
 * Returns `null` when the user declines — callers should degrade to the
 * share sheet rather than treating this as a hard failure.
 */
async function ensureDownloadsSafUri(): Promise<string | null> {
  if (cachedDownloadsSafUri) return cachedDownloadsSafUri;
  const { StorageAccessFramework } = FileSystemLegacy;
  const initial = StorageAccessFramework.getUriForDirectoryInRoot("Download");
  const result =
    await StorageAccessFramework.requestDirectoryPermissionsAsync(initial);
  if (!result.granted) return null;
  cachedDownloadsSafUri = result.directoryUri;
  return cachedDownloadsSafUri;
}

/**
 * Create (or replace) `fileName` inside a SAF tree. SAF refuses to
 * overwrite, and silently uniquifies names like `form (1).pdf`, so any
 * previous copy is deleted first to keep repeat downloads idempotent.
 */
async function writeBase64ToSaf(
  parentUri: string,
  fileName: string,
  mimeType: string,
  base64: string,
): Promise<void> {
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
  await StorageAccessFramework.writeAsStringAsync(createdUri, base64, {
    encoding: FileSystemLegacy.EncodingType.Base64,
  });
}

/**
 * Persist an already-downloaded PDF onto the device.
 *
 * @param sourceFile A readable file holding the PDF bytes (typically the
 *                   freshly downloaded copy in the cache directory).
 * @param fileName   The name to save as, including the `.pdf` extension.
 * @param folder     Sub-folder of the app's Documents dir for the local copy.
 * @param dialogTitle Title shown on the native Save/Share sheet fallback.
 */
export async function savePdfToDevice(
  sourceFile: File,
  fileName: string,
  folder: string,
  dialogTitle: string,
): Promise<SavePdfResult> {
  // ---- 1. App-local copy, so the file can be re-opened later ----------
  const docDir = new Directory(Paths.document, folder);
  if (!docDir.exists) docDir.create({ intermediates: true, idempotent: true });
  const localTarget = new File(docDir, fileName);
  if (localTarget.exists) localTarget.delete();
  sourceFile.copy(localTarget);
  if (!localTarget.exists || (localTarget.size ?? 0) <= 0) {
    throw new Error(
      "The downloaded file could not be saved to device storage. Please check your available storage space and try again.",
    );
  }
  const localUri = localTarget.uri;

  // ---- 2. Android: write into the public Downloads folder -------------
  if (Platform.OS === "android") {
    let safUri: string | null = null;
    try {
      safUri = await ensureDownloadsSafUri();
    } catch {
      // Treat any SAF error as "not granted" and fall through to sharing.
      safUri = null;
    }
    if (safUri) {
      try {
        await writeBase64ToSaf(
          safUri,
          fileName,
          "application/pdf",
          localTarget.base64Sync(),
        );
        return { method: "downloads", localUri };
      } catch {
        // A stale/revoked grant makes the write fail. Drop the cached URI
        // so the next attempt re-prompts, and fall back to the share sheet.
        cachedDownloadsSafUri = null;
      }
    }
  }

  // ---- 3. Fallback: native Save/Share sheet ---------------------------
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(localUri, {
      mimeType: "application/pdf",
      dialogTitle,
      UTI: "com.adobe.pdf",
    });
    return { method: "shared", localUri };
  }

  // Nothing else available — the app-local copy is still on disk.
  return { method: "documents", localUri };
}

/** Open a previously saved local file with the device's PDF viewer. */
export async function openSavedPdf(
  localUri: string,
  dialogTitle: string,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("No app on this device can open PDF files.");
  }
  await Sharing.shareAsync(localUri, {
    mimeType: "application/pdf",
    dialogTitle,
    UTI: "com.adobe.pdf",
  });
}
