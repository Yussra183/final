package com.project.gas_delivery.supplier.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * One seller stop on a {@link DeliveryTripEntity} — a <em>snapshot</em> of
 * the corresponding {@link DeliveryRouteStopEntity} taken when the trip
 * started.
 *
 * <p>The copy is the whole point: a supplier may reorder or remove
 * sellers on "Tunguu Route" while a Tunguu delivery is already on the
 * road. The running operation must keep serving the sellers it departed
 * with, so it owns its own rows rather than joining the live route.</p>
 *
 * <p>{@code status} mirrors the frontend's {@code StopStatus} union
 * ("scheduled" | "started" | "on_the_way" | "near_shop" | "delivered")
 * and is stored lowercase to match it directly.</p>
 */
@Entity
@Table(name = "delivery_trip_stops")
public class DeliveryTripStopEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "trip_id", nullable = false)
    private Long tripId;

    @Column(nullable = false)
    private Integer sequence;

    @Column(name = "seller_id")
    private Long sellerId;

    @Column(name = "seller_name", nullable = false, length = 120)
    private String sellerName;

    @Column(nullable = false, length = 255)
    private String address;

    @Column(nullable = false)
    private Double lat;

    @Column(nullable = false)
    private Double lng;

    @Column(nullable = false, length = 16)
    private String status = "scheduled";

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getTripId() { return tripId; }
    public void setTripId(Long tripId) { this.tripId = tripId; }
    public Integer getSequence() { return sequence; }
    public void setSequence(Integer sequence) { this.sequence = sequence; }
    public Long getSellerId() { return sellerId; }
    public void setSellerId(Long sellerId) { this.sellerId = sellerId; }
    public String getSellerName() { return sellerName; }
    public void setSellerName(String sellerName) { this.sellerName = sellerName; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public Double getLat() { return lat; }
    public void setLat(Double lat) { this.lat = lat; }
    public Double getLng() { return lng; }
    public void setLng(Double lng) { this.lng = lng; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getDeliveredAt() { return deliveredAt; }
    public void setDeliveredAt(Instant deliveredAt) { this.deliveredAt = deliveredAt; }
}
