package com.flowsave.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "share_tokens")
public class ShareToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "context_snapshot_id", nullable = false)
    private ContextSnapshot contextSnapshot;

    @Column(unique = true, nullable = false)
    private UUID token;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.token == null) {
            this.token = UUID.randomUUID();
        }
        if (this.expiresAt == null) {
            this.expiresAt = LocalDateTime.now().plusDays(7);
        }
    }

    public ShareToken() {}

    // Getters & Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public ContextSnapshot getContextSnapshot() { return contextSnapshot; }
    public void setContextSnapshot(ContextSnapshot contextSnapshot) { this.contextSnapshot = contextSnapshot; }
    public UUID getToken() { return token; }
    public void setToken(UUID token) { this.token = token; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
