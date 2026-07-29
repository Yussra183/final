package com.project.gas_delivery.permit.service;

import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.common.storage.FileStorageProperties;
import com.project.gas_delivery.permit.entity.PermitDocumentEntity;
import com.project.gas_delivery.permit.entity.SellerPermitEntity;
import com.project.gas_delivery.permit.enums.PermitDocumentType;
import com.project.gas_delivery.permit.repository.PermitDocumentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

/**
 * Reads/writes permit PDF bytes on disk.
 *
 * <p>Layout: {@code <app.uploads.dir>/permits/<sellerId>/<type>-<uuid>.pdf}.
 * The directory tree is created lazily on first write; the
 * {@code storage_key} persisted on {@link PermitDocumentEntity} is the
 * relative path under {@code app.uploads.dir} so the property can change
 * without rewriting every row.</p>
 *
 * <p>Only PDFs are accepted — the MIME check is intentionally strict so a
 * non-PDF renamed to {@code .pdf} still gets rejected via the magic-bytes
 * sniff below.</p>
 */
@Service
public class PermitDocumentStorageService {

    /** Permitted content types (case-insensitive). */
    private static final String CONTENT_TYPE_PDF = "application/pdf";
    /** Maximum file size — 10 MB matches {@code spring.servlet.multipart.max-file-size}. */
    private static final long MAX_BYTES = 10L * 1024 * 1024;
    /** First four bytes of every PDF file. */
    private static final byte[] PDF_MAGIC = new byte[]{'%', 'P', 'D', 'F'};

    private final FileStorageProperties properties;
    private final PermitDocumentRepository documentRepository;

    public PermitDocumentStorageService(FileStorageProperties properties,
                                         PermitDocumentRepository documentRepository) {
        this.properties = properties;
        this.documentRepository = documentRepository;
    }

    /**
     * Persist {@code file} as the {@code type} document for {@code permit}.
     * If a document of the same type already exists the prior file on disk
     * is removed and the row is overwritten in-place.
     *
     * @return the freshly persisted {@link PermitDocumentEntity}
     */
    @Transactional
    public PermitDocumentEntity store(SellerPermitEntity permit,
                                      PermitDocumentType type,
                                      MultipartFile file) {
        validate(file);

        // Replace any existing document of the same type — keeps the
        // (permit_id, document_type) UNIQUE constraint happy.
        documentRepository.findByPermitIdAndDocumentType(permit.getId(), type)
                .ifPresent(prior -> {
                    deleteFromDisk(prior.getStorageKey());
                    documentRepository.delete(prior);
                    documentRepository.flush();
                });

        String storageKey = writeToDisk(permit.getSellerId(), type, file);

        PermitDocumentEntity entity = new PermitDocumentEntity(
                permit.getId(),
                type,
                storageKey,
                file.getOriginalFilename(),
                file.getSize(),
                CONTENT_TYPE_PDF
        );
        return documentRepository.save(entity);
    }

    /**
     * Resolve a stored relative key to an absolute {@link Path}. Throws if
     * the file is missing on disk (shouldn't happen — V4 migration only
     * stores metadata, and writes always land on disk first).
     */
    public Path resolve(String storageKey) {
        Path root = Paths.get(properties.getDir()).toAbsolutePath().normalize();
        Path resolved = root.resolve(storageKey).normalize();
        if (!resolved.startsWith(root)) {
            throw new BadRequestException("Invalid storage key.");
        }
        if (!Files.exists(resolved)) {
            throw new BadRequestException("File not found on disk: " + storageKey);
        }
        return resolved;
    }

    /**
     * Delete a document and its backing file. Used by the seller to remove
     * a doc before submission, and on permit replacement.
     */
    @Transactional
    public void delete(PermitDocumentEntity document) {
        deleteFromDisk(document.getStorageKey());
        documentRepository.delete(document);
    }

    // ---- helpers --------------------------------------------------------

    private String writeToDisk(Long sellerId, PermitDocumentType type, MultipartFile file) {
        try {
            Path root = Paths.get(properties.getDir(), "permits", String.valueOf(sellerId))
                    .toAbsolutePath()
                    .normalize();
            Files.createDirectories(root);

            String safeName = type.name().toLowerCase() + "-" + UUID.randomUUID() + ".pdf";
            Path target = root.resolve(safeName);
            file.transferTo(target.toFile());
            return "permits/" + sellerId + "/" + safeName;
        } catch (IOException e) {
            throw new RuntimeException("Failed to store upload: " + e.getMessage(), e);
        }
    }

    private void deleteFromDisk(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) return;
        try {
            Path root = Paths.get(properties.getDir()).toAbsolutePath().normalize();
            Path target = root.resolve(storageKey).normalize();
            if (target.startsWith(root)) {
                Files.deleteIfExists(target);
            }
        } catch (IOException ignored) {
            // Best-effort delete — leftover files are cleaned up by an
            // operator task; never fail the request because of a stale file.
        }
    }

    private void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("Uploaded file is empty.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BadRequestException("File exceeds maximum allowed size of 10 MB.");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.toLowerCase().contains("pdf")) {
            throw new BadRequestException("Only PDF files are accepted.");
        }
        // Magic-bytes sniff — rejects a non-PDF renamed to `.pdf`.
        try {
            byte[] head = new byte[4];
            try (var in = file.getInputStream()) {
                int read = in.read(head);
                if (read != 4) {
                    throw new BadRequestException("File is not a valid PDF.");
                }
            }
            for (int i = 0; i < PDF_MAGIC.length; i++) {
                if (head[i] != PDF_MAGIC[i]) {
                    throw new BadRequestException("File is not a valid PDF.");
                }
            }
        } catch (IOException e) {
            throw new BadRequestException("Could not read uploaded file.");
        }
    }
}
