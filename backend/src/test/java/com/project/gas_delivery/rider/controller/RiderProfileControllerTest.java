package com.project.gas_delivery.rider.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.GlobalExceptionHandler;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.rider.dto.AssignedSellerDto;
import com.project.gas_delivery.rider.dto.RiderProfileDto;
import com.project.gas_delivery.rider.security.ApprovedRiderGuard;
import com.project.gas_delivery.rider.service.RiderProfileService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the rider self-service endpoints ({@code /api/riders/me}
 * and {@code /api/riders/me/assigned-seller}) enforce role + actor-id
 * resolution correctly, and surface the brief's empty-state behaviour
 * via HTTP 204 when no seller has been assigned yet.
 */
@ExtendWith(MockitoExtension.class)
// LENIENT: the default guard stub in setUp is only used by the
// availability test. The /me* tests don't touch the guard and would
// otherwise trip Mockito's "unnecessary stubbing" check.
@MockitoSettings(strictness = Strictness.LENIENT)
class RiderProfileControllerTest {

    @Mock
    private RiderProfileService riderProfileService;

    @Mock
    private ApprovedRiderGuard approvedRiderGuard;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        // Default stub: when an authenticated rider hits a route that
        // needs the guard, return their actor id. Tests that exercise
        // "no actor" or "non-rider" overrides override this in their
        // own setup or rely on the guard throwing.
        // Default stub: when an authenticated rider hits a route that
        // needs the guard, return their actor id. Tests that exercise
        // "no actor" or "non-rider" override this in their own setup or
        // rely on the guard throwing.
        lenient().when(approvedRiderGuard.requireApprovedRider(any(HttpServletRequest.class)))
                .thenAnswer(invocation -> {
                    HttpServletRequest req = invocation.getArgument(0);
                    Long id = (Long) req.getAttribute(AuthFilter.ATTR_ACTOR_ID);
                    if (id == null) {
                        throw new NotAuthorizedException("Authentication required.");
                    }
                    return id;
                });

        mockMvc = MockMvcBuilders
                .standaloneSetup(new RiderProfileController(riderProfileService, approvedRiderGuard))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void meWithoutAuthenticationReturnsForbiddenWithoutCallingService() throws Exception {
        mockMvc.perform(get("/api/riders/me"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NOT_AUTHORIZED"));
        verifyNoInteractions(riderProfileService);
    }

    @Test
    void meWithNonRiderActorReturnsForbiddenWithoutCallingService() throws Exception {
        mockMvc.perform(get("/api/riders/me")
                        .requestAttr(AuthFilter.ATTR_ACTOR_ID, 2L)
                        .requestAttr(AuthFilter.ATTR_ACTOR_ROLE, Role.SELLER))
                .andExpect(status().isForbidden());
        verifyNoInteractions(riderProfileService);
    }

    @Test
    void meWithRiderActorReturnsProfilePayload() throws Exception {
        RiderProfileDto profile = new RiderProfileDto(
                "11", "Hassan Rider", "rider@example.com", "hassan",
                "+255700000004",
                "Dar es Salaam", "Kariakoo", "Kariakoo Road",
                "19900101-00001-00001-0",
                "TZ-RD-001", "motorcycle", "T 100 ABC", "Honda CG125",
                true, true, -6.8235, 39.2695
        );
        when(riderProfileService.getMe(11L)).thenReturn(profile);

        mockMvc.perform(get("/api/riders/me")
                        .requestAttr(AuthFilter.ATTR_ACTOR_ID, 11L)
                        .requestAttr(AuthFilter.ATTR_ACTOR_ROLE, Role.RIDER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("11"))
                .andExpect(jsonPath("$.fullName").value("Hassan Rider"))
                .andExpect(jsonPath("$.email").value("rider@example.com"))
                .andExpect(jsonPath("$.vehiclePlate").value("T 100 ABC"))
                .andExpect(jsonPath("$.nationalId").value("19900101-00001-00001-0"));

        verify(riderProfileService).getMe(11L);
    }

    @Test
    void assignedSellerWhenUnassignedReturnsNoContent() throws Exception {
        when(riderProfileService.getAssignedSeller(11L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/riders/me/assigned-seller")
                        .requestAttr(AuthFilter.ATTR_ACTOR_ID, 11L)
                        .requestAttr(AuthFilter.ATTR_ACTOR_ROLE, Role.RIDER))
                .andExpect(status().isNoContent());

        verify(riderProfileService).getAssignedSeller(11L);
    }

    @Test
    void assignedSellerWhenAssignedReturnsSellerPayload() throws Exception {
        AssignedSellerDto seller = new AssignedSellerDto(
                "2", "John Gas Seller", "GasPro Supplies",
                "+255700000002", "Kariakoo Market, Block D, Dar es Salaam",
                "Kariakoo", "Dar es Salaam");
        when(riderProfileService.getAssignedSeller(11L)).thenReturn(Optional.of(seller));

        mockMvc.perform(get("/api/riders/me/assigned-seller")
                        .requestAttr(AuthFilter.ATTR_ACTOR_ID, 11L)
                        .requestAttr(AuthFilter.ATTR_ACTOR_ROLE, Role.RIDER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sellerId").value("2"))
                .andExpect(jsonPath("$.sellerName").value("John Gas Seller"))
                .andExpect(jsonPath("$.businessName").value("GasPro Supplies"))
                .andExpect(jsonPath("$.phone").value("+255700000002"))
                .andExpect(jsonPath("$.district").value("Kariakoo"));

        verify(riderProfileService).getAssignedSeller(11L);
    }

    @Test
    void assignedSellerWithoutAuthenticationReturnsForbidden() throws Exception {
        mockMvc.perform(get("/api/riders/me/assigned-seller"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NOT_AUTHORIZED"));
        verifyNoInteractions(riderProfileService);
    }

    /**
     * The availability endpoint is the gating gap fixed by
     * {@code ApprovedRiderGuard}: a pending rider must NOT be able to
     * flip their availability on. The guard throws
     * {@link NotAuthorizedException} → HTTP 403. The rider profile
     * service must remain untouched (otherwise a guard failure would
     * silently mutate the database).
     */
    @Test
    void setAvailabilityForPendingRiderReturnsForbidden() throws Exception {
        // Override the default guard stub to simulate a pending rider.
        // `requireApprovedRider` is what the controller calls first —
        // a pending rider's id won't be in the APPROVED set, so the
        // guard throws.
        when(approvedRiderGuard.requireApprovedRider(any(HttpServletRequest.class)))
                .thenThrow(new NotAuthorizedException(
                        "Your rider application is pending admin approval."));

        mockMvc.perform(patch("/api/riders/{riderId}/availability", 11L)
                        .requestAttr(AuthFilter.ATTR_ACTOR_ID, 11L)
                        .requestAttr(AuthFilter.ATTR_ACTOR_ROLE, Role.RIDER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"available\":true}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NOT_AUTHORIZED"));

        verifyNoInteractions(riderProfileService);
    }

    /**
     * The happy path: an approved rider can still toggle their
     * availability. The guard returns the actor id, the controller
     * hands off to the service.
     */
    @Test
    void setAvailabilityForApprovedRiderDelegatesToService() throws Exception {
        RiderProfileDto updated = new RiderProfileDto(
                "11", "Hassan Rider", "rider@example.com", "hassan",
                "+255700000004",
                "Dar es Salaam", "Kariakoo", "Kariakoo Road",
                "19900101-00001-00001-0",
                "TZ-RD-001", "motorcycle", "T 100 ABC", "Honda CG125",
                true, true, -6.8235, 39.2695
        );
        when(riderProfileService.setAvailability(anyLong(), anyLong(), anyBoolean()))
                .thenReturn(updated);

        mockMvc.perform(patch("/api/riders/{riderId}/availability", 11L)
                        .requestAttr(AuthFilter.ATTR_ACTOR_ID, 11L)
                        .requestAttr(AuthFilter.ATTR_ACTOR_ROLE, Role.RIDER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"available\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("11"));

        verify(riderProfileService).setAvailability(11L, 11L, true);
    }
}