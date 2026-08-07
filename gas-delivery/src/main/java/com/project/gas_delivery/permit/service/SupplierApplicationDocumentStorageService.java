package com.project.gas_delivery.permit.service;

import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.common.storage.FileStorageProperties;
import com.project.gas_delivery.permit.entity.SupplierApplicationDocumentEntity;
import com.project.gas_delivery.permit.entity.SupplierApplicationEntity;
import com.project.gas_delivery.permit.enums.SupplierApplicationDocumentType;
import com.project.gas_delivery.permit.repository.SupplierApplicationDocumentRepository;
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
 * Reads/writes supplier application PDF / image bytes on disk.
 *
 * <p>Layout:
 * {@code <app.uploads.dir>/supplier-applications/<supplierId>/<type>-<uuid>.<ext>}.
 * The directory tree is created lazily on first write, and the root is
 * ensured to exist when the service is first instantiated.</p>
 *
 * <p>Per-slot MIME policies are declared in the {@link #ALLOWED_MIME}
 * table so the supplier can upload an image for
 * {@code SUPPLIER_PASSPORT_PHOTO} and {@code SUPPLIER_NATIONAL_ID} while
 * the business-document slots (application form, business registration,
 * TIN certificate, business licence) stay PDF-only. The validator
 * verifies the content-type against the table and then re-checks the
 * magic bytes so a non-PDF renamed to {@code .pdf} (and vice-versa) is
 * still rejected.</p>
 */
@Service
public class SupplierApplicationDocumentStorageService {

    /**
     * Ensure the configured upload root exists as soon as the service is
     * instantiated. Mirrors the seller/rider pattern so PC restarts and
     * {@code /tmp} cleanups never orphan uploaded files.
     */
    @jakarta.annotation.PostConstruct
    void ensureRootExists() {
        try {
            Path root = Paths.get(properties.getDir()).toAbsolutePath().normalize();
            Files.createDirectories(root);
        } catch (IOException ignored) {
            // First-write path will surface the real failure.
        }
    }

    /** Permitted content types per supplier slot. */
    private static final Map<SupplierApplicationDocumentType, Set<String>> ALLOWED_MIME;
    static {
        Map<SupplierApplicationDocumentType, Set<String>> table =
                new EnumMap<>(SupplierApplicationDocumentType.class);
        table.put(SupplierApplicationDocumentType.SUPPLIER_APPLICATION_FORM,
                Set.of("application/pdf"));
        table.put(SupplierApplicationDocumentType.SUPPLIER_NATIONAL_ID,
                Set.of("application/pdf", "image/jpeg", "image/png"));
        table.put(SupplierApplicationDocumentType.SUPPLIER_BUSINESS_REGISTRATION,
                Set.of("application/pdf"));
        table.put(SupplierApplicationDocumentType.SUPPLIER_TIN_CERTIFICATE,
                Set.of("application/pdf"));
        table.put(SupplierApplicationDocumentType.SUPPLIER_BUSINESS_LICENCE,
                Set.of("application/pdf"));
        table.put(SupplierApplicationDocumentType.SUPPLIER_PASSPORT_PHOTO,
                Set.of("application/pdf", "image/jpeg", "image/png"));
        table.put(SupplierApplicationDocumentType.SUPPLIER_CERTIFICATE,
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
    private static final byte[] PNG_MAGIC =
            new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};

    private final FileStorageProperties properties;
    private final SupplierApplicationDocumentRepository documentRepository;

    public SupplierApplicationDocumentStorageService(
            FileStorageProperties properties,
            SupplierApplicationDocumentRepository documentRepository
    ) {
        this.properties = properties;
        this.documentRepository = documentRepository;
    }

    /**
     * Persist {@code file} as the {@code type} document for
     * {@code application}. If a document of the same type already exists
     * the prior file on disk is removed and the row is overwritten
     * in-place.
     */
    @Transactional
    public SupplierApplicationDocumentEntity store(
            SupplierApplicationEntity application,
            SupplierApplicationDocumentType type,
            MultipartFile file
    ) {
        validate(type, file);

        // Replace any existing document of the same type — keeps the
        // (supplier_application_id, document_type) UNIQUE constraint happy.
        documentRepository
                .findBySupplierApplicationIdAndDocumentType(application.getId(), type)
                .ifPresent(prior -> {
                    deleteFromDisk(prior.getStorageKey());
                    documentRepository.delete(prior);
                    documentRepository.flush();
                });

        String contentType = file.getContentType();
        String storageKey = writeToDisk(application.getSupplierId(), type, file, contentType);

        SupplierApplicationDocumentEntity entity = new SupplierApplicationDocumentEntity(
                application.getId(),
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
     * the file is missing on disk or the key escapes the upload root.
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
     * Delete a document and its backing file. Used by the supplier to
     * remove a doc before submission, and on document replacement.
     */
    @Transactional
    public void delete(SupplierApplicationDocumentEntity document) {
        deleteFromDisk(document.getStorageKey());
        documentRepository.delete(document);
    }

    // ---- helpers --------------------------------------------------------

    private String writeToDisk(Long supplierId, SupplierApplicationDocumentType type,
                               MultipartFile file, String contentType) {
        try {
            Path root = Paths
                    .get(properties.getDir(), "supplier-applications", String.valueOf(supplierId))
                    .toAbsolutePath()
                    .normalize();
            Files.createDirectories(root);

            String ext = extensionFor(contentType);
            String safeName = type.name().toLowerCase() + "-" + UUID.randomUUID() + "." + ext;
            Path target = root.resolve(safeName);
            file.transferTo(target.toFile());
            return "supplier-applications/" + supplierId + "/" + safeName;
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
            // Best-effort delete.
        }
    }

    /**
     * Reject the upload if the file is empty, too large, has a content
     * type that isn't in the slot's allow-list, or doesn't match the
     * magic bytes for its declared MIME family.
     */
    private void validate(SupplierApplicationDocumentType type, MultipartFile file) {
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

    private static String extensionFor(String contentType) {
        if (contentType == null) return "bin";
        return switch (contentType.toLowerCase()) {
            case "application/pdf" -> "pdf";
            case "image/jpeg" -> "jpg";
            case "image/png" -> "png";
            default -> "bin";
        };
    }

    private static String humanSlot(SupplierApplicationDocumentType type) {
        return switch (type) {
            case SUPPLIER_APPLICATION_FORM -> "the application form";
            case SUPPLIER_NATIONAL_ID -> "national ID";
            case SUPPLIER_BUSINESS_REGISTRATION -> "the business registration certificate";
            case SUPPLIER_TIN_CERTIFICATE -> "the tax identification certificate";
            case SUPPLIER_BUSINESS_LICENCE -> "the business licence";
            case SUPPLIER_PASSPORT_PHOTO -> "passport photo";
            case SUPPLIER_CERTIFICATE -> "the supplier certificate";
        };
    }

    private static String humanAllowedTypes(SupplierApplicationDocumentType type) {
        var allowed = ALLOWED_MIME.getOrDefault(type, Set.of());
        if (allowed.size() == 1) {
            return "PDF";
        }
        return "PDF or image (JPG/PNG)";
    }
}
