package com.project.gas_delivery.order.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.GlobalExceptionHandler;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.service.OrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class OrderControllerAuthenticationTest {

    @Mock
    private OrderService orderService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
                .standaloneSetup(new OrderController(orderService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void listWithoutAuthenticationReturnsUnauthorizedWithoutCallingService() throws Exception {
        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.error").value("Unauthorized"))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        verifyNoInteractions(orderService);
    }

    @Test
    void availableWithoutAuthenticationReturnsUnauthorizedWithoutCallingService() throws Exception {
        mockMvc.perform(get("/api/orders/dispatch/available"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        verifyNoInteractions(orderService);
    }

    @Test
    void listWithAuthenticatedActorKeepsExistingServicePath() throws Exception {
        when(orderService.list(11L, Role.RIDER, null, null, null)).thenReturn(List.of());

        mockMvc.perform(get("/api/orders")
                        .requestAttr(AuthFilter.ATTR_ACTOR_ID, 11L)
                        .requestAttr(AuthFilter.ATTR_ACTOR_ROLE, Role.RIDER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());

        verify(orderService).list(11L, Role.RIDER, null, null, null);
    }
}
