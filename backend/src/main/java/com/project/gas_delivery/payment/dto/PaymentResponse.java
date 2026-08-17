package com.project.gas_delivery.payment.dto;

import com.project.gas_delivery.payment.entity.PaymentEntity;
import com.project.gas_delivery.payment.enums.PaymentMethod;
import com.project.gas_delivery.payment.enums.PaymentStatus;

import java.math.BigDecimal;

/**
 * Canonical Payment JSON envelope returned by every Payment Flow endpoint.
 *
 * <p>Mirrors the frontend's wire shape: numeric IDs as {@link String},
 * timestamps as ISO-8601 strings, enums as their lowercase wire form.</p>
 */
public record PaymentResponse(
        String id,
        String orderId,
        String customerId,
        String sellerId,
        BigDecimal amount,
        PaymentMethod method,
        PaymentStatus status,
        String transactionRef,
        String phone,
        String notes,
        String paidAt,
        String refundedAt,
        String createdAt,
        String updatedAt
) {
    public static PaymentResponse from(PaymentEntity e) {
        return new PaymentResponse(
                String.valueOf(e.getId()),
                String.valueOf(e.getOrderId()),
                String.valueOf(e.getCustomerId()),
                String.valueOf(e.getSellerId()),
                e.getAmount(),
                e.getMethod(),
                e.getStatus(),
                e.getTransactionRef(),
                e.getPhone(),
                e.getNotes(),
                e.getPaidAt() == null ? null : e.getPaidAt().toString(),
                e.getRefundedAt() == null ? null : e.getRefundedAt().toString(),
                e.getCreatedAt() == null ? null : e.getCreatedAt().toString(),
                e.getUpdatedAt() == null ? null : e.getUpdatedAt().toString()
        );
    }
}
