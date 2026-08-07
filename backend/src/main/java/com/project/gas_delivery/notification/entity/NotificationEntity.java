package com.project.gas_delivery.notification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Objects;

/**
 * Persistent notification row. Backs the in-app notification feed consumed
 * by {@code GET /api/notifications} and
 * {@code PATCH /api/notifications/{id}/read}.
 *
 * <p>Shape mirrors the frontend's {@code NotificationItem} interface
 * ({@code constants/types.ts}). The {@code data} column carries optional
 * JSON metadata so the client can deep-link without hard-coding type
 * semantics on the server.</p>
 */
@Entity
@Table(name = "notifications")
public class NotificationEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "type", nullable = false, length = 30)
    private String type;

    @Column(name = "title", nullable = false, length = 160)
    private String title;

    @Column(name = "message", nullable = false, columnDefinition = "TEXT")
    private String message;

    /**
     * JSON metadata blob. The PostgreSQL column is {@code jsonb} (see V4
     * migration). Hibernate must bind the parameter as a JSONB value, not
     * a VARCHAR — otherwise Postgres rejects the insert with
     * {@code ERROR: column "data" is of type jsonb but expression is of
     * type character varying}.
     *
     * <p>{@code @JdbcTypeCode(SqlTypes.JSON)} (Hibernate 6 / Spring Boot
     * 4) tells the JPA layer to map this field through Hibernate's
     * built-in JSON type, which produces a {@code jsonb} parameter type
     * and reads the column back as a JSON string. We keep the Java field
     * as {@code String} so callers (e.g. {@code PermitService}) can keep
     * their existing hand-rolled JSON serialiser; Hibernate's JSON binder
     * handles the {@code ?::jsonb} cast on write and the JSON-to-string
     * unwrap on read.</p>
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "data", columnDefinition = "jsonb")
    private String data;

    @Column(name = "is_read", nullable = false)
    private boolean read = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected NotificationEntity() {
    }

    public NotificationEntity(Long userId, String type, String title, String message, String data) {
        this.userId = userId;
        this.type = type;
        this.title = title;
        this.message = message;
        this.data = data;
    }

    @PrePersist
    void onCreate() {
        if (this.createdAt == null) this.createdAt = Instant.now();
    }

    // --- getters / setters ---

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getType() {
        return type;
    }

    public String getTitle() {
        return title;
    }

    public String getMessage() {
        return message;
    }

    public String getData() {
        return data;
    }

    public void setData(String data) {
        this.data = data;
    }

    public boolean isRead() {
        return read;
    }

    public void setRead(boolean read) {
        this.read = read;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof NotificationEntity other)) return false;
        return id != null && Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
