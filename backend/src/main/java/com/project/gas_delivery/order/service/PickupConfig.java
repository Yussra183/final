package com.project.gas_delivery.order.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Tunables for the Rider → Seller pickup workflow.
 *
 * <p>{@code pickupHoldMinutes} controls the maximum wall-clock window a
 * rider has to reach the seller after claiming an order. After that
 * window the {@code PickupHoldExpirationTask} reverts the row to
 * {@code accepted} so other eligible riders can pick it up.</p>
 *
 * <p>Defaults to 15 minutes so the default matches the brief. Operators
 * can override via the standard {@code -D…} / env-var mechanism:</p>
 *
 * <pre>
 *   -Dgas.pickup.hold-minutes=10
 * </pre>
 */
@Component
public class PickupConfig {

    private final long holdMinutes;

    public PickupConfig(
            @Value("${gas.pickup.hold-minutes:15}") long holdMinutes
    ) {
        if (holdMinutes <= 0) {
            // Defensive — never let an operator accidentally set a
            // non-positive hold window.
            this.holdMinutes = 15L;
        } else {
            this.holdMinutes = holdMinutes;
        }
    }

    /** Wall-clock window a rider has to reach the seller. */
    public Duration holdDuration() {
        return Duration.ofMinutes(holdMinutes);
    }
}