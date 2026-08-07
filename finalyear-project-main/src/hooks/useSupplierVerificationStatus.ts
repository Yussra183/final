/**
 * Reads the signed-in supplier's verification status from the live
 * `SupplierApplicationsApi` source so every supplier screen can gate its
 * business actions on the same backend-derived state.
 *
 * Returns `{ status, isApproved, isPending, isRejected, isSubmitted,
 * application, isLoading, reload }`. Callers can pass a `refreshKey` so
 * the hook re-fetches when the supplier re-enters the screen.
 *
 * Status mapping:
 *   - "approved"           → isApproved = true   → supply actions enabled
 *   - "rejected"           → isRejected = true   → supplier must re-submit
 *   - "under_review"       → isPending  = true
 *   - "pending" / "draft"  → isPending  = true   → awaiting admin approval
 *   - null / no row        → isPending  = true   → supplier hasn't started
 *
 * Until the supplier has an application row at all (e.g. signed in for
 * the first time and never opened the Verification screen), the hook
 * treats the state as "pending — please apply". This is the behaviour
 * the brief requires: a newly-registered Supplier can log in but cannot
 * supply gas or receive supply requests until approved by the Admin.
 */
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store/StoreContext";
import { SupplierApplicationsApi } from "../api/endpoints";
import { ApiError } from "../api/errors";
import { SupplierApplication } from "../../constants/types";

export type SupplierVerificationStatus = "approved" | "pending" | "rejected";

export interface SupplierVerificationInfo {
  status: SupplierVerificationStatus;
  isApproved: boolean;
  isPending: boolean;
  isRejected: boolean;
  /** True once the application has been submitted and is awaiting review. */
  isSubmitted: boolean;
  application: SupplierApplication | null;
  isLoading: boolean;
  reload: () => Promise<void>;
}

const DEFAULT_STATUS: SupplierVerificationStatus = "pending";

function normalizeStatus(
  raw: SupplierApplication["status"] | null | undefined,
): SupplierVerificationStatus {
  if (raw === "approved") return "approved";
  if (raw === "rejected") return "rejected";
  // pending / under_review / draft / null / undefined → pending
  return DEFAULT_STATUS;
}

export function useSupplierVerificationStatus(
  refreshKey: unknown = null,
): SupplierVerificationInfo {
  const store = useStore();
  const session = store.session;
  const userId = session?.user?.id;
  const cached = userId ? store.supplierApplications[userId] : undefined;

  const [application, setApplication] = useState<SupplierApplication | null>(
    cached ?? null,
  );
  const [isLoading, setIsLoading] = useState(!cached);

  const reload = useCallback(async () => {
    if (!userId) {
      setApplication(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const next = await SupplierApplicationsApi.myApplicationOrNull();
      setApplication(next);
    } catch (err) {
      // The endpoint should never 500 here, but if it does we fall back
      // to "no application yet" so the rest of the supplier UI keeps
      // working — the gate just stays in the safer "pending" state.
      if (!(err instanceof ApiError)) {
        console.warn("[useSupplierVerificationStatus] reload failed", err);
      }
      setApplication(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const status = normalizeStatus(application?.status);
  return {
    status,
    isApproved: status === "approved",
    isPending: status === "pending",
    isRejected: status === "rejected",
    isSubmitted: status === "pending" && !!application?.submittedAt,
    application,
    isLoading,
    reload,
  };
}
