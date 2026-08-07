package com.project.gas_delivery.seller.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.seller.dto.SellerProfileDto;
import com.project.gas_delivery.seller.service.SellerProfileService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.lang.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Public read endpoints for seller profiles, plus the seller-facing
 * profile upsert used by the dashboard.
 *
 * <p>{@code GET /api/sellers} backs the customer "Nearby Sellers"
 * pipeline. {@code GET /api/sellers/me} and
 * {@code POST /api/sellers/me} back the seller's own profile page —
 * authentication required, role must be {@code SELLER}.</p>
 */
@RestController
@RequestMapping("/api/sellers")
public class SellerProfileController {

    private final SellerProfileService sellerProfileService;

    public SellerProfileController(SellerProfileService sellerProfileService) {
        this.sellerProfileService = sellerProfileService;
    }

    @GetMapping
    public List<SellerProfileDto> list(
            @RequestParam(value = "lat", required = false) @Nullable Double lat,
            @RequestParam(value = "lng", required = false) @Nullable Double lng,
            @RequestParam(value = "radiusKm", required = false) @Nullable Double radiusKm
    ) {
        // Customer-facing "Nearby Sellers" pipeline. When the caller
        // supplies lat/lng the service filters to the supplied radius
        // (default 25 km) and sorts nearest-first. Without coordinates
        // every approved+active seller is returned, alphabetised by
        // business name — preserves the prior admin / debug behaviour.
        if (lat != null && lng != null) {
            return sellerProfileService.listAllNear(lat, lng, radiusKm);
        }
        return sellerProfileService.listAll();
    }

    @GetMapping("/me")
    public SellerProfileDto me(HttpServletRequest request) {
        return sellerProfileService.me(requireSeller(request));
    }

    @PostMapping("/me")
    public SellerProfileDto upsertMe(
            HttpServletRequest request,
            @RequestBody SellerProfileDto patch
    ) {
        return sellerProfileService.upsertMe(requireSeller(request), patch);
    }

    private static Long requireSeller(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        if (role != Role.SELLER) {
            throw new NotAuthorizedException("Only sellers can manage their own profile.");
        }
        return actorId;
    }
}