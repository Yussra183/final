package com.project.gas_delivery.admin.controller;

import com.project.gas_delivery.admin.AdminGuard;
import com.project.gas_delivery.admin.dto.AdminAssignmentDto;
import com.project.gas_delivery.admin.dto.AdminCustomerDto;
import com.project.gas_delivery.admin.dto.AdminOrderDto;
import com.project.gas_delivery.admin.dto.AdminRiderDto;
import com.project.gas_delivery.admin.dto.AdminSellerDto;
import com.project.gas_delivery.admin.dto.AdminUserDto;
import com.project.gas_delivery.admin.service.AdminReadService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The admin people directory: users, and the four role-scoped views over
 * them (customers, sellers, riders, suppliers) enriched with the
 * aggregates each screen displays.
 *
 * <p>All roles live in one {@code users} table — "supplier" and "customer"
 * are {@code role} values, not separate entities — so these endpoints are
 * projections of the same rows with different joins attached.</p>
 *
 * <p>Every handler takes an optional {@code q} free-text filter and an
 * {@code active} flag. Read-only.</p>
 */
@RestController
@RequestMapping("/api/admin")
public class AdminDirectoryController {

    private final AdminReadService adminReadService;

    public AdminDirectoryController(AdminReadService adminReadService) {
        this.adminReadService = adminReadService;
    }

    // ---- users ---------------------------------------------------------

    @GetMapping("/users")
    public List<AdminUserDto> users(
            HttpServletRequest request,
            @RequestParam(name = "role", required = false) String role,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "active", required = false) Boolean active
    ) {
        AdminGuard.requireAdmin(request);
        return adminReadService.users(role, q, active);
    }

    @GetMapping("/users/{id}")
    public AdminUserDto user(HttpServletRequest request, @PathVariable(name = "id") Long id) {
        AdminGuard.requireAdmin(request);
        return adminReadService.user(id);
    }

    // ---- customers -----------------------------------------------------

    @GetMapping("/customers")
    public List<AdminCustomerDto> customers(
            HttpServletRequest request,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "active", required = false) Boolean active
    ) {
        AdminGuard.requireAdmin(request);
        return adminReadService.customers(q, active);
    }

    @GetMapping("/customers/{id}/orders")
    public List<AdminOrderDto> customerOrders(HttpServletRequest request, @PathVariable(name = "id") Long id) {
        AdminGuard.requireAdmin(request);
        return adminReadService.customerOrders(id);
    }

    // ---- sellers -------------------------------------------------------

    @GetMapping("/sellers")
    public List<AdminSellerDto> sellers(
            HttpServletRequest request,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "permitStatus", required = false) String permitStatus,
            @RequestParam(name = "active", required = false) Boolean active
    ) {
        AdminGuard.requireAdmin(request);
        return adminReadService.sellers(q, permitStatus, active);
    }

    // ---- riders --------------------------------------------------------

    @GetMapping("/riders")
    public List<AdminRiderDto> riders(
            HttpServletRequest request,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "available", required = false) Boolean available,
            @RequestParam(name = "active", required = false) Boolean active
    ) {
        AdminGuard.requireAdmin(request);
        return adminReadService.riders(q, available, active);
    }

    @GetMapping("/riders/{id}/orders")
    public List<AdminOrderDto> riderOrders(HttpServletRequest request, @PathVariable(name = "id") Long id) {
        AdminGuard.requireAdmin(request);
        return adminReadService.riderOrders(id);
    }

    /** Seller↔rider pairings from {@code seller_riders}. */
    @GetMapping("/assignments")
    public List<AdminAssignmentDto> assignments(HttpServletRequest request) {
        AdminGuard.requireAdmin(request);
        return adminReadService.assignments();
    }

    // ---- suppliers -----------------------------------------------------

    /**
     * Suppliers are users with {@code role = SUPPLIER}. There is no
     * supplier profile table, so only user-level fields are available.
     */
    @GetMapping("/suppliers")
    public List<AdminUserDto> suppliers(
            HttpServletRequest request,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "active", required = false) Boolean active
    ) {
        AdminGuard.requireAdmin(request);
        return adminReadService.suppliers(q, active);
    }
}
