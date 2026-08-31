/**
 * Translate any thrown value into a user-friendly permit-upload failure
 * message. Recognises the React Native `Network request failed` string
 * (thrown by the multipart upload path when the device can't reach the
 * Spring Boot backend) and any `code === "NETWORK"` shape, and falls
 * back to the raw message — or a generic string — otherwise. Used by
 * the seller (`LicenseApplicationSection`), rider
 * (`RiderVerificationSection`), and supplier
 * (`SupplierVerificationSection`) permit upload catch blocks so they all
 * surface the same actionable hint instead of the cryptic raw error.
 */
export function friendlyUploadError(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  const code = (err as { code?: string } | null)?.code;
  const isNetwork =
    message.toLowerCase().includes("network request failed") ||
    code === "NETWORK";
  if (isNetwork) {
    return "Cannot reach the server. Make sure your phone is on the same Wi-Fi as the laptop running the backend, then try again.";
  }
  return message || "Could not upload the selected file. Please try again.";
}
