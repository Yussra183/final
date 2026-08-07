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
import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Reads/writes permit PDF / image bytes on disk.
 *
 * <p>Layout: {@code <app.uploads.dir>/permits/<sellerId>/<type>-<uuid>.<ext>}.
 * The directory tree is created lazily on first write, and the root is
 * ensured to exist when the service is first instantiated; the
 * {@code storage_key} persisted on {@link PermitDocumentEntity} is the
 * relative path under {@code app.uploads.dir} so the property can change
 * without rewriting every row.</p>
 *
 * <p>Per-slot MIME policies are declared in the {@link #ALLOWED_MIME} table
 * so the seller can upload an image for {@code PASSPORT_PHOTO} and
 * {@code NATIONAL_ID} while file-only slots (application form, business
 * licence, admin licence) stay PDF-only. The validator verifies the
 * content-type against the table and then re-checks the magic bytes
 * so a non-PDF renamed to {@code .pdf} (and vice-versa) is still
 * rejected.</p>
 */
@Service
public class PermitDocumentStorageService {

    /**
     * Ensure the configured upload root exists as soon as the service is
     * instantiated. The previous behaviour relied on the first write to
     * create parent directories, which left {@code permit_documents} rows
     * referencing {@code storage_key}s whose root had been wiped (e.g.
     * {@code /tmp} on reboot). Pre-creating the root costs nothing on
     * start-up and prevents the silent regression.
     */
    @jakarta.annotation.PostConstruct
    void ensureRootExists() {
        try {
            java.nio.file.Path root = java.nio.file.Paths.get(properties.getDir())
                    .toAbsolutePath()
                    .normalize();
            java.nio.file.Files.createDirectories(root);
        } catch (java.io.IOException ignored) {
            // First-write path will surface the real failure; bootstrap
            // directory creation must never crash the application.
        }
    }



    /** Permitted content types per slot. */
    private static final Map<PermitDocumentType, Set<String>> ALLOWED_MIME;
    static {
        Map<PermitDocumentType, Set<String>> table = new EnumMap<>(PermitDocumentType.class);
        table.put(PermitDocumentType.APPLICATION_FORM,
                Set.of("application/pdf"));
        table.put(PermitDocumentType.NATIONAL_ID,
                Set.of("application/pdf", "image/jpeg", "image/png"));
        table.put(PermitDocumentType.BUSINESS_LICENSE,
                Set.of("application/pdf"));
        table.put(PermitDocumentType.PASSPORT_PHOTO,
                Set.of("image/jpeg", "image/png"));
        table.put(PermitDocumentType.LICENSE,
                Set.of("application/pdf"));
        ALLOWED_MIME = Collections.unmodifiableMap(table);
    }

    /** Maximum file size — 10 MB matches {@code spring.servlet.multipart.max-file-size}. */
    private static final long MAX_BYTES = 10L * 1024 * 1024;
    /** First four bytes of every PDF file. */
    private static final byte[] PDF_MAGIC = new byte[]{'%', 'P', 'D', 'F'};
    /** First three bytes of every JPEG file. */
    private static final byte[] JPEG_MAGIC = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    /** First eight bytes of every PNG file. */
    private static final byte[] PNG_MAGIC = new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};

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
        validate(type, file);

        // Replace any existing document of the same type — keeps the
        // (permit_id, document_type) UNIQUE constraint happy.
        documentRepository.findByPermitIdAndDocumentType(permit.getId(), type)
                .ifPresent(prior -> {
                    deleteFromDisk(prior.getStorageKey());
                    documentRepository.delete(prior);
                    documentRepository.flush();
                });

        String contentType = file.getContentType();
        String storageKey = writeToDisk(permit.getSellerId(), type, file, contentType);

        PermitDocumentEntity entity = new PermitDocumentEntity(
                permit.getId(),
                type,
                storageKey,
                file.getOriginalFilename(),
                file.getSize(),
                contentType
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

    private String writeToDisk(Long sellerId, PermitDocumentType type,
                               MultipartFile file, String contentType) {
        try {
            Path root = Paths.get(properties.getDir(), "permits", String.valueOf(sellerId))
                    .toAbsolutePath()
                    .normalize();
            Files.createDirectories(root);

            String ext = extensionFor(contentType);
            String safeName = type.name().toLowerCase() + "-" + UUID.randomUUID() + "." + ext;
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

    /**
     * Reject the upload if the file is empty, too large, has a content
     * type that isn't in the slot's allow-list, or doesn't match the
     * magic bytes for its declared MIME family.
     */
    private void validate(PermitDocumentType type, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("Uploaded file is empty.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BadRequestException("File exceeds maximum allowed size of 10 MB.");
        }
        String contentType = file.getContentType();
        String normalised = contentType == null ? "" : contentType.toLowerCase();
        if (!ALLOWED_MIME.getOrDefault(type, Set.of()).contains(normalised)) {
            throw new BadRequestException(
                    "Only " + humanAllowedTypes(type) + " files are accepted for "
                            + humanSlot(type) + ".");
        }
        // Magic-bytes sniff — rejects a file whose bytes don't match the
        // declared MIME family (e.g. a JPEG renamed to .pdf).
        try {
            byte[] head;
            switch (normalised) {
                case "application/pdf" -> head = readHead(file, PDF_MAGIC.length);
                case "image/jpeg" -> head = readHead(file, JPEG_MAGIC.length);
                case "image/png" -> head = readHead(file, PNG_MAGIC.length);
                default -> throw new BadRequestException(
                        "Unsupported file type for " + humanSlot(type) + ".");
            }
            byte[] expected = magicBytesFor(normalised);
            for (int i = 0; i < expected.length; i++) {
                if (head[i] != expected[i]) {
                    throw new BadRequestException(
                            "File is not a valid " + normalised + " (" + humanSlot(type) + ").");
                }
            }
        } catch (IOException e) {
            throw new BadRequestException("Could not read uploaded file.");
        }
    }

    private static byte[] readHead(MultipartFile file, int n) throws IOException {
        byte[] head = new byte[n];
        try (var in = file.getInputStream()) {
            int read = in.read(head);
            if (read != n) {
                throw new BadRequestException("File is not a valid PDF/image.");
            }
        }
        return head;
    }

    private static byte[] magicBytesFor(String contentType) {
        return switch (contentType) {
            case "application/pdf" -> PDF_MAGIC;
            case "image/jpeg" -> JPEG_MAGIC;
            case "image/png" -> PNG_MAGIC;
            default -> new byte[0];
        };
    }

    /**
     * Map a verified MIME type to the file extension used for the on-disk
     * filename. Defaults to {@code .bin} so we never lie about the
     * contents — the download endpoint serves the real MIME.
     */
    private static String extensionFor(String contentType) {
        if (contentType == null) return "bin";
        return switch (contentType.toLowerCase()) {
            case "application/pdf" -> "pdf";
            case "image/jpeg" -> "jpg";
            case "image/png" -> "png";
            default -> "bin";
        };
    }

    private static String humanSlot(PermitDocumentType type) {
        return switch (type) {
            case APPLICATION_FORM -> "the application form";
            case NATIONAL_ID -> "national ID";
            case BUSINESS_LICENSE -> "the business licence";
            case PASSPORT_PHOTO -> "passport photo";
            case LICENSE -> "the licence";
        };
    }

    private static String humanAllowedTypes(PermitDocumentType type) {
        var allowed = ALLOWED_MIME.getOrDefault(type, Set.of());
        if (allowed.size() == 1) {
            return switch (type) {
                case APPLICATION_FORM, BUSINESS_LICENSE, LICENSE -> "PDF";
                default -> "image";
            };
        }
        // Mixed allow-list (national_id).
        return "PDF or image (JPG/PNG)";
    }

    /**
     * Package-private helper exposed for unit tests. Returns the
     * normalised MIME type the storage service will accept for the
     * given slot, or {@code null} when no MIME is declared on the file.
     */
    static String isAllowedMime(PermitDocumentType type, String contentType) {
        if (contentType == null) return null;
        String normalised = contentType.toLowerCase();
        return ALLOWED_MIME.getOrDefault(type, Set.of()).contains(normalised)
                ? normalised
                : null;
    }
}
