package com.flowsave.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public class RestoreContextResponse {

    private UUID id;
    private String label;
    private String openFiles;
    private String gitDiff;
    private String terminalHistory;
    private String reentryBrief;
    private LocalDateTime createdAt;
    private boolean autoSaved;

    public RestoreContextResponse() {}

    public RestoreContextResponse(UUID id, String label, String openFiles, String gitDiff,
                                  String terminalHistory, String reentryBrief, LocalDateTime createdAt, boolean autoSaved) {
        this.id = id;
        this.label = label;
        this.openFiles = openFiles;
        this.gitDiff = gitDiff;
        this.terminalHistory = terminalHistory;
        this.reentryBrief = reentryBrief;
        this.createdAt = createdAt;
        this.autoSaved = autoSaved;
    }

    // Getters & Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
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
    public boolean isAutoSaved() { return autoSaved; }
    public void setAutoSaved(boolean autoSaved) { this.autoSaved = autoSaved; }

    // Builder
    public static RestoreContextResponseBuilder builder() { return new RestoreContextResponseBuilder(); }

    public static class RestoreContextResponseBuilder {
        private UUID id;
        private String label;
        private String openFiles;
        private String gitDiff;
        private String terminalHistory;
        private String reentryBrief;
        private LocalDateTime createdAt;
        private boolean autoSaved;

        public RestoreContextResponseBuilder id(UUID id) { this.id = id; return this; }
        public RestoreContextResponseBuilder label(String label) { this.label = label; return this; }
        public RestoreContextResponseBuilder openFiles(String openFiles) { this.openFiles = openFiles; return this; }
        public RestoreContextResponseBuilder gitDiff(String gitDiff) { this.gitDiff = gitDiff; return this; }
        public RestoreContextResponseBuilder terminalHistory(String terminalHistory) { this.terminalHistory = terminalHistory; return this; }
        public RestoreContextResponseBuilder reentryBrief(String reentryBrief) { this.reentryBrief = reentryBrief; return this; }
        public RestoreContextResponseBuilder createdAt(LocalDateTime createdAt) { this.createdAt = createdAt; return this; }
        public RestoreContextResponseBuilder autoSaved(boolean autoSaved) { this.autoSaved = autoSaved; return this; }

        public RestoreContextResponse build() {
            return new RestoreContextResponse(id, label, openFiles, gitDiff, terminalHistory, reentryBrief, createdAt, autoSaved);
        }
    }
}
