package com.project.gas_delivery.bootstrap.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Bootstrap list endpoints backing the frontend's {@code refresh()}
 * pipeline after login. Each frontend store slice is fetched
 * independently with {@code Promise.allSettled}; any endpoint that
 * returns HTTP 500 makes the store surface "Couldn't refresh data".
 *
 * <p>The Order Flow / Permit / Seller / Rider / Notification modules
 * all have full CRUD already. The three list endpoints below (Users,
 * Restock requests, Complaints) are not yet implemented as full flows
 * — they exist so the bulk refresh completes cleanly. Each endpoint
 * returns an empty list with a stable JSON shape that matches the
 * frontend's TypeScript interface, and a {@code 200 OK} so the
 * refresh pipeline treats it as a successful empty payload.</p>
 *
 * <p>The shape is intentionally minimal — every writable flow (create /
 * update / status transitions) is still routed through the existing
 * modules. This controller does not own a table; it just unblocks the
 * post-login bootstrap while those modules are being implemented.</p>
 */
@RestController
public class RefreshBootstrapController {

    /**
     * Lists every user record. The frontend's admin screens iterate
     * this slice for username / role lookups; the auth module exposes
     * a single-row GET, so this is the missing bulk read. Returns an
     * empty list for now — the admin user-management UI is not in
     * scope of the Order Flow milestone.
     */
    @GetMapping("/api/users")
    public List<UserSummaryDto> listUsers() {
        return List.of();
    }

    /**
     * Lists every restock request. The Order Flow does not yet persist
     * restock requests (the seed migration ships a few rows that the
     * frontend mock branch reads from), so the live API returns an
     * empty list. The endpoint shape matches
     * {@code constants/types.ts} → {@code RestockRequest}.
     */
    @GetMapping("/api/restock")
    public List<RestockSummaryDto> listRestock() {
        return List.of();
    }

    /**
     * Lists every complaint. Mirrors
     * {@code constants/types.ts} → {@code Complaint}. Empty until the
     * complaint module lands.
     */
    @GetMapping("/api/complaints")
    public List<ComplaintSummaryDto> listComplaints() {
        return List.of();
    }

    /**
     * Wire shape for {@code GET /api/users}. Mirrors the relevant
     * subset of the frontend's {@code User} interface — every field is
     * nullable today because the list is empty; the full
     * {@code auth.dto.UserDto} can replace this when the user-list
     * module ships.
     */
    public record UserSummaryDto(
            String id,
            String fullName,
            String username,
            String email,
            String phone,
            String role,
            String createdAt
    ) {}

    /**
     * Wire shape for {@code GET /api/restock}. Field set matches
     * {@code constants/types.ts} → {@code RestockRequest}.
     */
    public record RestockSummaryDto(
            String id,
            String sellerId,
            String sellerName,
            String supplierId,
            String supplierName,
            String productName,
            String size,
            Integer quantity,
            String status,
            String createdAt
    ) {}

    /**
     * Wire shape for {@code GET /api/complaints}. Field set matches
     * {@code constants/types.ts} → {@code Complaint}.
     */
    public record ComplaintSummaryDto(
            String id,
            String userId,
            String userName,
            String subject,
            String message,
            String status,
            String createdAt
    ) {}
}