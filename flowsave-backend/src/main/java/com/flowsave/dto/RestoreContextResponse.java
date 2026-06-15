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

    public RestoreContextResponse() {}

    public RestoreContextResponse(UUID id, String label, String openFiles, String gitDiff,
                                  String terminalHistory, String reentryBrief, LocalDateTime createdAt) {
        this.id = id;
        this.label = label;
        this.openFiles = openFiles;
        this.gitDiff = gitDiff;
        this.terminalHistory = terminalHistory;
        this.reentryBrief = reentryBrief;
        this.createdAt = createdAt;
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

        public RestoreContextResponseBuilder id(UUID id) { this.id = id; return this; }
        public RestoreContextResponseBuilder label(String label) { this.label = label; return this; }
        public RestoreContextResponseBuilder openFiles(String openFiles) { this.openFiles = openFiles; return this; }
        public RestoreContextResponseBuilder gitDiff(String gitDiff) { this.gitDiff = gitDiff; return this; }
        public RestoreContextResponseBuilder terminalHistory(String terminalHistory) { this.terminalHistory = terminalHistory; return this; }
        public RestoreContextResponseBuilder reentryBrief(String reentryBrief) { this.reentryBrief = reentryBrief; return this; }
        public RestoreContextResponseBuilder createdAt(LocalDateTime createdAt) { this.createdAt = createdAt; return this; }

        public RestoreContextResponse build() {
            return new RestoreContextResponse(id, label, openFiles, gitDiff, terminalHistory, reentryBrief, createdAt);
        }
    }
}
