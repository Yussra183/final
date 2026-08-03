package com.project.gas_delivery.common.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Storage configuration for permit PDFs.
 *
 * <p>Bound from {@code application.properties}:
 * <pre>
 *   app.uploads.dir=${UPLOADS_DIR:${user.home}/gas-delivery-uploads}
 * </pre>
 *
 * <p>The default resolves to the running user's home directory rather
 * than {@code /tmp}, so PC restarts and {@code systemd-tmpfiles} cleanups
 * do not orphan {@code permit_documents.storage_key} rows. The directory
 * is created on demand by
 * {@link com.project.gas_delivery.permit.service.PermitDocumentStorageService}.</p>
 */
@ConfigurationProperties(prefix = "app.uploads")
public class FileStorageProperties {

    /**
     * Root directory for all uploaded files. Overridable at startup via
     * the {@code UPLOADS_DIR} environment variable. Defaults to
     * {@code ${user.home}/gas-delivery-uploads} so artefacts survive
     * reboots on developer machines; production deployments should
     * export {@code UPLOADS_DIR} explicitly to a persistent mount.
     */
    private String dir = System.getProperty("user.home") + "/gas-delivery-uploads";

    public String getDir() {
        return dir;
    }

    public void setDir(String dir) {
        this.dir = dir;
    }
}
