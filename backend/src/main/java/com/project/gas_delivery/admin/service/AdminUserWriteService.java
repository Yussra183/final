package com.project.gas_delivery.admin.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.auth.exception.ConflictException;
import com.project.gas_delivery.auth.exception.ResourceNotFoundException;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.auth.service.SessionService;
import com.project.gas_delivery.order.repository.OrderRepository;
import com.project.gas_delivery.payment.repository.PaymentRepository;
import com.project.gas_delivery.supplier.repository.DeliveryTripRepository;
import com.project.gas_delivery.supply.repository.SupplyOrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Admin-only user write surface — deactivate, reactivate, hard-delete.
 *
 * <p>This is intentionally the only path in the system that flips
 * {@code users.is_active} on already-active rows or issues a hard
 * {@code DELETE FROM users}. The regular permit flow leaves that flag
 * alone (it sets it false at registration and the admin flips it back
 * via the permit approval path).</p>
 *
 * <h2>Two-tier deletion model</h2>
 * <ul>
 *   <li>{@link #deactivate} — soft-deactivate the account. The user
 *       cannot log in but their history is preserved. Reversible via
 *       {@link #reactivate}.</li>
 *   <li>{@link #delete} — hard-delete the {@code users} row after
 *       pre-flighting the {@code orders}, {@code payments},
 *       {@code supply_orders}, and {@code delivery_trips} tables for
 *       active references. The DB-level {@code ON DELETE} constraint
 *       on {@code seller_profiles.user_id} (RESTRICT) and
 *       {@code rider_applications.user_id} (CASCADE for the
 *       application row, RESTRICT for the documents) blocks the
 *       delete when a non-cleared dependency still points at the row
 *       — we surface that as a 409 too rather than letting the SQL
 *       exception bubble up as an opaque 500.</li>
 * </ul>
 *
 * <h2>Role gate</h2>
 * <p>Only {@link Role#SELLER}, {@link Role#RIDER}, {@link Role#SUPPLIER}
 * may be deactivated or deleted. {@link Role#ADMIN} and
 * {@link Role#CUSTOMER} are rejected with HTTP 400 — the controller
 * itself enforces this at the boundary, but the service repeats the
 * check so any future caller (e.g. a CLI / batch) can't bypass it.</p>
 */
@Service
public class AdminUserWriteService {

    private static final Logger log = LoggerFactory.getLogger(AdminUserWriteService.class);

    private final UserRepository userRepository;
    private final SessionService sessionService;
    private final OrderRepository orderRepository;
    private final PaymentRepository paymentRepository;
    private final SupplyOrderRepository supplyOrderRepository;
    private final DeliveryTripRepository deliveryTripRepository;

    public AdminUserWriteService(UserRepository userRepository,
                                 SessionService sessionService,
                                 OrderRepository orderRepository,
                                 PaymentRepository paymentRepository,
                                 SupplyOrderRepository supplyOrderRepository,
                                 DeliveryTripRepository deliveryTripRepository) {
        this.userRepository = userRepository;
        this.sessionService = sessionService;
        this.orderRepository = orderRepository;
        this.paymentRepository = paymentRepository;
        this.supplyOrderRepository = supplyOrderRepository;
        this.deliveryTripRepository = deliveryTripRepository;
    }

    /**
     * Soft-deactivate a Seller / Rider / Supplier. Records
     * {@code deactivated_at}, {@code deactivated_by}, and an optional
     * reason so the action is auditable, then clears any live sessions
     * so a logged-in user is logged out immediately (without waiting
     * for the token's natural expiry).
     *
     * @throws ConflictException        if the user still owns in-flight
     *                                   transactions that forbid
     *                                   deactivation, or if the user is
     *                                   referenced by a permanent table
     *                                   (e.g. {@code blacklist_entries})
     *                                   that does not cascade on delete.
     * @throws ResourceNotFoundException if the user id does not exist.
     * @throws BadRequestException       if the role is not SELLER /
     *                                   RIDER / SUPPLIER.
     */
    @Transactional
    public void deactivate(Long targetId, Long adminId, String reason) {
        User user = loadAndAuthoriseRole(targetId);

        if (user.getDeactivatedAt() != null) {
            // Idempotent: already deactivated, nothing to do.
            return;
        }

        // Active-operations guard — same set that forbids hard-delete,
        // because either action removes the user from the active
        // workforce. Detailed breakdown per role so the admin gets a
        // specific code, not a generic "blocked".
        enforceActiveOperationsGuard(user);

        Instant now = Instant.now();
        user.setDeactivatedAt(now);
        user.setDeactivatedBy(adminId);
        user.setDeactivationReason(truncate(reason, 500));
        // Mirror the V11 legacy "disabled" path so the existing
        // login gate's `is_active` check still rejects the user on
        // older code paths that haven't been migrated to read
        // `deactivated_at` yet.
        user.setActive(false);
        userRepository.save(user);

        // Kill any live sessions so the user is locked out immediately
        // rather than waiting for token expiry. Safe to call even if
        // there is no live session — SessionService does the
        // graceful null/empty handling.
        sessionService.invalidateAll(user.getId());

        log.info("admin_deactivate admin_id={} target_id={} target_role={}",
                adminId, user.getId(), user.getRole());
    }

    /**
     * Reverse a {@link #deactivate}. The user immediately becomes
     * able to log in again; existing sessions are NOT restored (the
     * original bearer tokens were invalidated at deactivation time).
     *
     * @throws ConflictException if the target is an ADMIN or CUSTOMER.
     */
    @Transactional
    public void reactivate(Long targetId, Long adminId) {
        User user = loadAndAuthoriseRole(targetId);

        if (user.getDeactivatedAt() == null) {
            // Already active (or never deactivated). Idempotent no-op.
            return;
        }

        user.setDeactivatedAt(null);
        user.setDeactivatedBy(null);
        user.setDeactivationReason(null);
        user.setActive(true);
        userRepository.save(user);

        log.info("admin_reactivate admin_id={} target_id={} target_role={}",
                adminId, user.getId(), user.getRole());
    }

    /**
     * Hard-delete a Seller / Rider / Supplier. Two pre-flights in
     * order:
     * <ol>
     *   <li>Role gate (throws {@link BadRequestException} on
     *       CUSTOMER / ADMIN).</li>
     *   <li>Active-operations guard across orders, payments, supply
     *       orders, and delivery trips. Throws
     *       {@link ConflictException} with a specific code on any
     *       non-zero count.</li>
     * </ol>
     * The DB-level FK constraints then handle the rest: a row that
     * cannot be safely deleted because of a NON-ON-DELETE-CASCADE
     * reference (e.g. {@code blacklist_entries.user_id}) will throw
     * a {@code DataIntegrityViolationException} which the
     * {@code GlobalExceptionHandler} remaps to a 409.
     *
     * @throws ConflictException         if active references exist.
     * @throws ResourceNotFoundException if the user id does not exist.
     * @throws BadRequestException       on disallowed role.
     */
    @Transactional
    public void delete(Long targetId, Long adminId) {
        User user = loadAndAuthoriseRole(targetId);

        // Pre-flight the active operations. We do this in the service
        // (rather than relying purely on the DB FK constraint) so the
        // caller gets a clear 409 with a specific code, not a generic
        // "could not execute statement" 500.
        enforceActiveOperationsGuard(user);

        // Sessions go first — even if the DB delete fails further down
        // (e.g. because of a RESTRICT FK we didn't catch), the user
        // is locked out in the meantime.
        sessionService.invalidateAll(user.getId());

        Long removedId = user.getId();
        Role removedRole = user.getRole();
        userRepository.delete(user);

        log.info("admin_delete admin_id={} target_id={} target_role={}",
                adminId, removedId, removedRole);
    }

    // --- helpers ----------------------------------------------------

    /**
     * Load the user, throw {@link ResourceNotFoundException} if missing,
     * throw {@link BadRequestException} if the role is not SELLER,
     * RIDER, or SUPPLIER. Centralised so all three write paths agree.
     */
    private User loadAndAuthoriseRole(Long targetId) {
        User user = userRepository.findById(targetId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "User " + targetId + " not found"));
        Role role = user.getRole();
        if (role != Role.SELLER
                && role != Role.RIDER
                && role != Role.SUPPLIER) {
            throw new BadRequestException(
                    "Only Seller / Rider / Supplier accounts can be deactivated or deleted.");
        }
        return user;
    }

    /**
     * Per-role block: throws {@link ConflictException} with a specific
     * code if the user still owns a non-terminal transaction. We do not
     * attempt to delete history — project rule says transaction
     * history must survive user deletion, so the admin must wait for
     * the work to finish first.
     *
     * <p>The mapping is intentionally narrow: each blocker gets its
     * own code so the frontend can render a precise message rather
     * than a generic "blocked".</p>
     */
    private void enforceActiveOperationsGuard(User user) {
        Role role = user.getRole();
        Long id = user.getId();

        if (role == Role.SELLER) {
            long activeOrders = orderRepository.countActiveBySellerId(id);
            if (activeOrders > 0) {
                throw new ConflictException(
                        "ACTIVE_ORDERS",
                        "Seller has " + activeOrders + " in-flight order(s). "
                                + "Wait until all orders are completed before deleting the account.");
            }
            long pendingPay = paymentRepository.countPendingBySellerId(id);
            if (pendingPay > 0) {
                throw new ConflictException(
                        "ACTIVE_PAYMENTS",
                        "Seller has " + pendingPay + " pending payment(s). "
                                + "Complete or cancel the payments before deleting the account.");
            }
        } else if (role == Role.RIDER) {
            long activeOrders = orderRepository.countActiveByRiderId(id);
            if (activeOrders > 0) {
                throw new ConflictException(
                        "ACTIVE_DELIVERIES",
                        "Rider has " + activeOrders + " in-flight delivery(s). "
                                + "Reassign or complete them before deleting the account.");
            }
            long activeTrips = deliveryTripRepository.countActiveByRiderId(id);
            if (activeTrips > 0) {
                throw new ConflictException(
                        "ACTIVE_DELIVERY_TRIPS",
                        "Rider has " + activeTrips + " active supplier trip(s). "
                                + "Reassign or complete them before deleting the account.");
            }
        } else if (role == Role.SUPPLIER) {
            long activeSupplyOrders = supplyOrderRepository.countActiveBySupplierId(id);
            if (activeSupplyOrders > 0) {
                throw new ConflictException(
                        "ACTIVE_SUPPLY_ORDERS",
                        "Supplier has " + activeSupplyOrders + " in-flight restock request(s). "
                                + "Complete or cancel them before deleting the account.");
            }
            long activeTrips = deliveryTripRepository.countActiveBySupplierId(id);
            if (activeTrips > 0) {
                throw new ConflictException(
                        "ACTIVE_DELIVERY_TRIPS",
                        "Supplier has " + activeTrips + " delivery trip(s) in progress. "
                                + "Complete or cancel them before deleting the account.");
            }
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return null;
        }
        String trimmed = s.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }
}
