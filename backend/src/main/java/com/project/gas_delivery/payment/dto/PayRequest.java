package com.project.gas_delivery.payment.dto;

import com.project.gas_delivery.payment.enums.PaymentMethod;
import jakarta.validation.constraints.NotNull;

/**
 * Request body for {@code POST /api/payments/pay}.
 *
 * <p>The customer chooses a {@link PaymentMethod} and optionally an
 * M-Pesa phone number. The backend infers the order id and amount from
 * the order itself — we don't trust client-supplied amounts.</p>
 *
 * @param orderId  the order being paid for (required, parsed to Long)
 * @param method   the payment method (required)
 * @param phone    M-Pesa phone number; required when {@code method == MPESA}
 * @param notes    optional free-text note from the customer
 */
public record PayRequest(
        String orderId,
        @NotNull PaymentMethod method,
        String phone,
        String notes
) {}
