package com.project.gas_delivery.common.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Storage configuration for permit PDFs.
 *
 * <p>Bound from {@code application.properties}:
 * <pre>
 *   app.uploads.dir=${UPLOADS_DIR:/tmp/gas-delivery-uploads}
 * </pre>
 *
 * The directory is created on demand by
 * {@link com.project.gas_delivery.permit.service.PermitDocumentStorageService}.
 */
@ConfigurationProperties(prefix = "app.uploads")
public class FileStorageProperties {

    /** Root directory for all uploaded files. */
    private String dir = "/tmp/gas-delivery-uploads";

    public String getDir() {
        return dir;
    }

    public void setDir(String dir) {
        this.dir = dir;
    }
}
