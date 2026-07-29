package com.project.gas_delivery.tracking.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

/**
 * Inbound payload from the rider's mobile client — used by:
 *
 * <ul>
 *   <li>{@code POST /api/orders/{id}/location} — REST POST fallback and
 *       authoritative initial source for the latest-known-position cache.
 *       Used by the rider app on slow networks or when the WebSocket
 *       handshake fails.</li>
 *   <li>The {@code LOCATION_UPDATE} frame on the {@code /ws/tracking}
 *       socket — the normal hot path.</li>
 * </ul>
 *
 * <p>Jakarta Bean Validation enforces sane lat/lng ranges server-side so
 * a buggy client cannot poison the broadcast pipeline with obviously
 * invalid coordinates.</p>
 */
public record LocationUpdateRequest(

        @NotNull
        @DecimalMin(value = "-90.0",  inclusive = true)
        @DecimalMax(value = "90.0",   inclusive = true)
        Double lat,

        @NotNull
        @DecimalMin(value = "-180.0", inclusive = true)
        @DecimalMax(value = "180.0",  inclusive = true)
        Double lng,

        /** Heading in degrees clockwise from north (0..360). Optional. */
        Double headingDeg,

        /** Speed in meters/second. Optional. */
        Double speedMps,

        /** Horizontal GPS accuracy in meters. Optional. */
        Double accuracyM,

        /** Order status at the time of the sample (e.g. {@code "in_transit"}). Optional. */
        String status,

        /** Client-supplied sample timestamp (epoch ms). Optional. */
        Long clientTsMs
) {}