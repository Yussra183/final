package com.project.gas_delivery.admin.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.project.gas_delivery.order.enums.OrderStatus;

import java.util.Map;

/**
 * Order headcount broken down by lifecycle status.
 *
 * <p>The two multi-word keys carry {@link JsonProperty} overrides so the
 * JSON matches the frontend's {@code OrderStatus} literals
 * ({@code "picked_up"}, {@code "in_transit"}) rather than the camelCase
 * record component names.</p>
 */
public record OrderStatusCountsDto(
        long pending,
        long accepted,
        long assigned,
        @JsonProperty("picked_up") long pickedUp,
        @JsonProperty("in_transit") long inTransit,
        long delivered,
        long cancelled,
        long rejected
) {

    /** Builds the DTO from a status→count map, defaulting absent statuses to 0. */
    public static OrderStatusCountsDto from(Map<OrderStatus, Long> counts) {
        return new OrderStatusCountsDto(
                counts.getOrDefault(OrderStatus.PENDING, 0L),
                counts.getOrDefault(OrderStatus.ACCEPTED, 0L),
                counts.getOrDefault(OrderStatus.ASSIGNED, 0L),
                counts.getOrDefault(OrderStatus.PICKED_UP, 0L),
                counts.getOrDefault(OrderStatus.IN_TRANSIT, 0L),
                counts.getOrDefault(OrderStatus.DELIVERED, 0L),
                counts.getOrDefault(OrderStatus.CANCELLED, 0L),
                counts.getOrDefault(OrderStatus.REJECTED, 0L)
        );
    }

    /** Orders still moving through the pipeline — neither delivered nor closed. */
    public long active() {
        return pending + accepted + assigned + pickedUp + inTransit;
    }
}
