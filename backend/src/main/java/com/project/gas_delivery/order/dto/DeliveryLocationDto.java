package com.project.gas_delivery.order.dto;

/**
 * Delivery address + optional map coordinates.
 *
 * <p>Mirrors the frontend's {@code DeliveryLocation} interface:
 * {@code { address: string, lat?: number, lng?: number }}. Both
 * {@code lat} and {@code lng} are nullable on the wire.</p>
 */
public record DeliveryLocationDto(String address, Double lat, Double lng) {
}
