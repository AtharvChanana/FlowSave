package com.flowsave.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "context_snapshots_v2")
public class ContextSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    private String label;

    @Column(columnDefinition = "text")
    private String openFiles;

    @Column(columnDefinition = "text")
    private String gitDiff;

    @Column(columnDefinition = "text")
    private String terminalHistory;

    @Column(columnDefinition = "text", name = "reentry_brief")
    private String reentryBrief;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private boolean deleted = false;

    @Column(name = "auto_saved", nullable = false, columnDefinition = "boolean DEFAULT false")
    private boolean autoSaved = false;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public ContextSnapshot() {}

    public ContextSnapshot(UUID id, User user, String label, String openFiles,
                           String gitDiff, String terminalHistory, String reentryBrief,
                           LocalDateTime createdAt, boolean deleted, boolean autoSaved) {
        this.id = id;
        this.user = user;
        this.label = label;
        this.openFiles = openFiles;
        this.gitDiff = gitDiff;
        this.terminalHistory = terminalHistory;
        this.reentryBrief = reentryBrief;
        this.createdAt = createdAt;
        this.deleted = deleted;
        this.autoSaved = autoSaved;
    }

    // Getters & Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public String getOpenFiles() { return openFiles; }
    public void setOpenFiles(String openFiles) { this.openFiles = openFiles; }
    public String getGitDiff() { return gitDiff; }
    public void setGitDiff(String gitDiff) { this.gitDiff = gitDiff; }
    public String getTerminalHistory() { return terminalHistory; }
    public void setTerminalHistory(String terminalHistory) { this.terminalHistory = terminalHistory; }
    public String getReentryBrief() { return reentryBrief; }
    public void setReentryBrief(String reentryBrief) { this.reentryBrief = reentryBrief; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public boolean isDeleted() { return deleted; }
    public void setDeleted(boolean deleted) { this.deleted = deleted; }
    public boolean isAutoSaved() { return autoSaved; }
    public void setAutoSaved(boolean autoSaved) { this.autoSaved = autoSaved; }

    // Builder
    public static ContextSnapshotBuilder builder() { return new ContextSnapshotBuilder(); }

    public static class ContextSnapshotBuilder {
        private UUID id;
        private User user;
        private String label;
        private String openFiles;
        private String gitDiff;
        private String terminalHistory;
        private String reentryBrief;
        private LocalDateTime createdAt;
        private boolean deleted = false;
        private boolean autoSaved = false;

        public ContextSnapshotBuilder id(UUID id) { this.id = id; return this; }
        public ContextSnapshotBuilder user(User user) { this.user = user; return this; }
        public ContextSnapshotBuilder label(String label) { this.label = label; return this; }
        public ContextSnapshotBuilder openFiles(String openFiles) { this.openFiles = openFiles; return this; }
        public ContextSnapshotBuilder gitDiff(String gitDiff) { this.gitDiff = gitDiff; return this; }
        public ContextSnapshotBuilder terminalHistory(String terminalHistory) { this.terminalHistory = terminalHistory; return this; }
        public ContextSnapshotBuilder reentryBrief(String reentryBrief) { this.reentryBrief = reentryBrief; return this; }
        public ContextSnapshotBuilder createdAt(LocalDateTime createdAt) { this.createdAt = createdAt; return this; }
        public ContextSnapshotBuilder deleted(boolean deleted) { this.deleted = deleted; return this; }
        public ContextSnapshotBuilder autoSaved(boolean autoSaved) { this.autoSaved = autoSaved; return this; }

        public ContextSnapshot build() {
            return new ContextSnapshot(id, user, label, openFiles, gitDiff, terminalHistory, reentryBrief, createdAt, deleted, autoSaved);
        }
    }
}
