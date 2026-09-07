/**
 * Reusable "Deactivate / Reactivate / Delete" action row used by the
 * admin Sellers, Riders, and Suppliers pages. Renders two to three
 * `AdminButton`s plus three confirm modals, talks to the V23 admin
 * write endpoints in {@link AdminApi}, and surfaces the backend's
 * `409 Conflict` messages (with their `code` field intact) verbatim
 * so the admin sees the precise blocker.
 *
 * <p>The component is intentionally self-contained — each call site
 * just renders it inside a row and passes the user id + a reload
 * callback. No business logic lives here beyond the API plumbing;
 * the page-level state (e.g. the `viewTarget` modal) is untouched.</p>
 */
import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { AdminApi } from "../../api/endpoints";
import type { AdminUser } from "../../../constants/types";
import { ApiError } from "../../api/errors";
import { Colors, Spacing } from "../../../constants/colors";
import { AdminButton } from "./AdminButton";
import { AdminModal } from "./AdminModal";

/**
 * Structural shape required by the action row — accepts
 * {@link AdminUser} (used by the admin Sellers / Suppliers directory)
 * or {@link import("../../../constants/types").AdminRider} (used by
 * the Riders page). Each page passes its own `onChanged` callback so
 * the parent table can refresh after a successful mutation.
 */
export interface AdminUserDeleteActionsUser {
  id: string;
  fullName: string;
  isActive: boolean;
}

export interface AdminUserDeleteActionsProps {
  user: AdminUserDeleteActionsUser;
  onChanged: () => void;
  /**
   * Optional override labels — useful for translations / tests. Keys
   * the component always renders in the same order: [deactivate,
   * reactivate, delete].
   */
  labels?: Partial<Record<"deactivate" | "reactivate" | "delete", string>>;
}

const DEFAULT_LABELS = {
  deactivate: "Deactivate",
  reactivate: "Reactivate",
  delete: "Delete",
};

/**
 * Three-button action row + the three corresponding confirm modals.
 *
 * <ul>
 *   <li><strong>Deactivate</strong> soft-bans the user (sets
 *       {@code isActive = false} and clears live sessions); reversible
 *       with Reactivate.</li>
 *   <li><strong>Reactivate</strong> restores the user so they can log
 *       in again.</li>
 *   <li><strong>Delete</strong> hard-deletes the {@code users} row.
 *       Backend refuses with HTTP 409 if the user still owns in-flight
 *       transactions; the response body's {@code message} is shown
 *       verbatim.</li>
 * </ul>
 */
export function AdminUserDeleteActions(
  props: AdminUserDeleteActionsProps,
): React.ReactElement {
  const { user, onChanged, labels } = props;
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const l = { ...DEFAULT_LABELS, ...(labels ?? {}) };

  const showConflict = (err: unknown) => {
    const apiErr = err as ApiError | undefined;
    const msg = apiErr?.message ?? "Could not perform that action.";
    Alert.alert("Action blocked", msg);
  };

  const handleDeactivate = async () => {
    setBusy(true);
    try {
      await AdminApi.deactivateUser(user.id);
      setConfirmDeactivate(false);
      onChanged();
    } catch (err) {
      showConflict(err);
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async () => {
    setBusy(true);
    try {
      await AdminApi.reactivateUser(user.id);
      onChanged();
    } catch (err) {
      showConflict(err);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await AdminApi.deleteUser(user.id);
      setConfirmDelete(false);
      onChanged();
    } catch (err) {
      showConflict(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={styles.row}>
        {user.isActive ? (
          <AdminButton
            label={l.deactivate}
            size="sm"
            variant="warning"
            loading={busy}
            onPress={() => setConfirmDeactivate(true)}
          />
        ) : (
          <AdminButton
            label={l.reactivate}
            size="sm"
            variant="success"
            loading={busy}
            onPress={handleReactivate}
          />
        )}
        <AdminButton
          label={l.delete}
          size="sm"
          variant="danger"
          loading={busy}
          onPress={() => setConfirmDelete(true)}
        />
      </View>

      <AdminModal
        visible={confirmDeactivate}
        title={`Deactivate ${user.fullName}?`}
        confirmLabel={busy ? "Deactivating…" : "Deactivate"}
        confirmVariant="warning"
        onClose={() => (busy ? null : setConfirmDeactivate(false))}
        onConfirm={handleDeactivate}
      >
        <ConfirmBody
          message={
            "Deactivating this account will prevent the user from logging " +
            "in and remove any active sessions. You can reverse this " +
            "action later with Reactivate."
          }
        />
      </AdminModal>

      <AdminModal
        visible={confirmDelete}
        title={`Delete ${user.fullName}?`}
        confirmLabel={busy ? "Deleting…" : "Delete permanently"}
        confirmVariant="danger"
        onClose={() => (busy ? null : setConfirmDelete(false))}
        onConfirm={handleDelete}
      >
        <ConfirmBody
          message={
            "The user record will be permanently removed. Transaction " +
            "history (orders, payments, deliveries) is preserved. " +
            "If this account still owns in-flight work, the action " +
            "will be refused with details."
          }
        />
      </AdminModal>
    </>
  );
}

/* ------------------------------------------------------------------ */

function ConfirmBody({ message }: { message: string }) {
  return (
    <View style={styles.confirmBody}>
      <Text style={styles.confirmText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: Spacing.xs,
    alignItems: "center",
  },
  confirmBody: {
    paddingVertical: Spacing.sm,
  },
  confirmText: {
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
