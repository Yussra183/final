/**
 * Reads the signed-in rider's verification status from the live
 * `RiderPermitsApi` source so every rider screen can gate its
 * delivery actions on the same backend-derived state.
 *
 * Returns `{ status, isApproved, isPending, isRejected, isLoading,
 * reload }`. Callers can pass a `refreshKey` so the hook re-fetches when
 * the rider re-enters the screen (mirrors `useFocusEffect`).
 *
 * Status mapping:
 *   - "approved"           → isApproved = true   → delivery actions enabled
 *   - "rejected"           → isRejected = true   → rider must re-submit
 *   - "under_review"       → isPending  = true
 *   - "pending" / "draft"  → isPending  = true   → awaiting admin review
 *   - null / no row        → isPending  = true   → rider hasn't started
 *
 * Until the rider has an application row at all (e.g. signed in for the
 * first time and never opened the Profile screen), the hook treats the
 * state as "pending — please apply". This is the behaviour the brief
 * requires: "Newly registered Rider can log in but cannot interact with
 * protected features until approved".
 */
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store/StoreContext";
import { RiderPermitsApi } from "../api/endpoints";
import { ApiError } from "../api/errors";
import { RiderPermitSummary } from "../../constants/types";

export type RiderVerificationStatus = "approved" | "pending" | "rejected";

export interface RiderVerificationInfo {
  status: RiderVerificationStatus;
  isApproved: boolean;
  isPending: boolean;
  isRejected: boolean;
  application: RiderPermitSummary | null;
  isLoading: boolean;
  reload: () => Promise<void>;
}

const DEFAULT_STATUS: RiderVerificationStatus = "pending";

function normalizeStatus(
  raw: RiderPermitSummary["status"] | null | undefined,
): RiderVerificationStatus {
  if (raw === "approved") return "approved";
  if (raw === "rejected") return "rejected";
  // pending / under_review / draft / null / undefined → pending
  return DEFAULT_STATUS;
}

export function useRiderVerificationStatus(
  refreshKey: unknown = null,
): RiderVerificationInfo {
  const store = useStore();
  const session = store.session;
  const userId = session?.user?.id;
  const cached = userId ? store.riderPermits[userId] : undefined;

  const [application, setApplication] = useState<RiderPermitSummary | null>(
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
      const next = await RiderPermitsApi.myApplicationOrNull();
      setApplication(next);
    } catch (err) {
      // The endpoint should never 500 here, but if it does we fall back
      // to "no application yet" so the rest of the rider UI keeps
      // working — the gate just stays in the safer "pending" state.
      if (!(err instanceof ApiError)) {
        console.warn("[useRiderVerificationStatus] reload failed", err);
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
    application,
    isLoading,
    reload,
  };
}