package com.project.gas_delivery.admin.controller;

import com.project.gas_delivery.admin.AdminGuard;
import com.project.gas_delivery.admin.dto.AdminNotificationDto;
import com.project.gas_delivery.admin.dto.AdminOrderDto;
import com.project.gas_delivery.admin.dto.AdminProductDto;
import com.project.gas_delivery.admin.service.AdminReadService;
import com.project.gas_delivery.order.dto.OrderResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

/**
 * System-wide reads across the catalogue, the order book and the
 * notification log — the three things an admin inspects but doesn't own.
 *
 * <p>The role-scoped list endpoints ({@code /api/products},
 * {@code /api/orders}) narrow their results to the caller. These
 * unrestricted equivalents exist so an admin can see everything without
 * relaxing the guards on those endpoints.</p>
 *
 * <p>Read-only. Order state changes stay in {@code OrderController}, where
 * the transition rules live.</p>
 */
@RestController
@RequestMapping("/api/admin")
public class AdminCatalogController {

    private final AdminReadService adminReadService;

    public AdminCatalogController(AdminReadService adminReadService) {
        this.adminReadService = adminReadService;
    }

    // ---- products ------------------------------------------------------

    @GetMapping("/products")
    public List<AdminProductDto> products(
            HttpServletRequest request,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "sellerId", required = false) String sellerId,
            @RequestParam(name = "active", required = false) Boolean active,
            @RequestParam(name = "category", required = false) String category
    ) {
        AdminGuard.requireAdmin(request);
        return adminReadService.products(q, sellerId, active, category);
    }

    // ---- orders --------------------------------------------------------

    @GetMapping("/orders")
    public List<AdminOrderDto> orders(
            HttpServletRequest request,
            @RequestParam(name = "status", required = false) String status,
            @RequestParam(name = "customerId", required = false) String customerId,
            @RequestParam(name = "sellerId", required = false) String sellerId,
            @RequestParam(name = "riderId", required = false) String riderId,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "from", required = false) Instant from,
            @RequestParam(name = "to", required = false) Instant to
    ) {
        AdminGuard.requireAdmin(request);
        return adminReadService.orders(status, customerId, sellerId, riderId, q, from, to);
    }

    /** Full order detail, including line items, in the canonical shape. */
    @GetMapping("/orders/{id}")
    public OrderResponse order(HttpServletRequest request, @PathVariable(name = "id") Long id) {
        AdminGuard.requireAdmin(request);
        return adminReadService.order(id);
    }

    // ---- notifications -------------------------------------------------

    @GetMapping("/notifications")
    public List<AdminNotificationDto> notifications(
            HttpServletRequest request,
            @RequestParam(name = "userId", required = false) String userId,
            @RequestParam(name = "type", required = false) String type,
            @RequestParam(name = "read", required = false) Boolean read
    ) {
        AdminGuard.requireAdmin(request);
        return adminReadService.notifications(userId, type, read);
    }
}
