package com.project.gas_delivery.rider.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.GlobalExceptionHandler;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.rider.dto.AssignedSellerDto;
import com.project.gas_delivery.rider.dto.RiderProfileDto;
import com.project.gas_delivery.rider.service.RiderProfileService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the rider self-service endpoints ({@code /api/riders/me}
 * and {@code /api/riders/me/assigned-seller}) enforce role + actor-id
 * resolution correctly, and surface the brief's empty-state behaviour
 * via HTTP 204 when no seller has been assigned yet.
 */
@ExtendWith(MockitoExtension.class)
class RiderProfileControllerTest {

    @Mock
    private RiderProfileService riderProfileService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
                .standaloneSetup(new RiderProfileController(riderProfileService))
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
}