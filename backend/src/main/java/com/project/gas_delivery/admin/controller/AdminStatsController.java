package com.project.gas_delivery.admin.controller;

import com.project.gas_delivery.admin.AdminGuard;
import com.project.gas_delivery.admin.dto.AdminReportDto;
import com.project.gas_delivery.admin.dto.AdminStatsDto;
import com.project.gas_delivery.admin.service.AdminReadService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

/**
 * Dashboard counters and reports.
 *
 * <ul>
 *   <li>{@code GET /api/admin/stats}   – every dashboard tile in one call.</li>
 *   <li>{@code GET /api/admin/reports} – order/revenue statistics over a window.</li>
 * </ul>
 *
 * <p>Both are aggregations over live tables. Read-only.</p>
 */
@RestController
@RequestMapping("/api/admin")
public class AdminStatsController {

    private final AdminReadService adminReadService;

    public AdminStatsController(AdminReadService adminReadService) {
        this.adminReadService = adminReadService;
    }

    @GetMapping("/stats")
    public AdminStatsDto stats(HttpServletRequest request) {
        AdminGuard.requireAdmin(request);
        return adminReadService.stats();
    }

    /**
     * @param from  ISO-8601 instant; defaults to 30 days before {@code to}
     * @param to    ISO-8601 instant; defaults to now
     * @param limit how many sellers to rank; defaults to 5
     */
    @GetMapping("/reports")
    public AdminReportDto reports(
            HttpServletRequest request,
            @RequestParam(name = "from", required = false) Instant from,
            @RequestParam(name = "to", required = false) Instant to,
            @RequestParam(name = "limit", required = false, defaultValue = "5") int limit
    ) {
        AdminGuard.requireAdmin(request);
        return adminReadService.report(from, to, limit);
    }
}
