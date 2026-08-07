package com.project.gas_delivery.supplier.dto;

import com.project.gas_delivery.supplier.entity.SupplierVehicleEntity;

/**
 * Wire form of a supplier vehicle. Mirrors the frontend's {@code Vehicle}
 * interface in {@code constants/types.ts}: {@code id} (string), plate,
 * model, capacityKg, active.
 */
public record SupplierVehicleDto(
        String id,
        String plate,
        String model,
        int capacityKg,
        boolean active
) {

    public static SupplierVehicleDto from(SupplierVehicleEntity e) {
        return new SupplierVehicleDto(
                String.valueOf(e.getId()),
                e.getPlate(),
                e.getModel(),
                e.getCapacityKg(),
                e.isActive()
        );
    }
}