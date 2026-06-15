package com.flowsave.dto;

public class SaveContextRequest {

    private String label;
    private String openFiles;
    private String gitDiff;
    private String terminalHistory;
    private String timestamp;
    private boolean autoSaved = false;

    public SaveContextRequest() {}

    public SaveContextRequest(String label, String openFiles, String gitDiff, String terminalHistory, String timestamp, boolean autoSaved) {
        this.label = label;
        this.openFiles = openFiles;
        this.gitDiff = gitDiff;
        this.terminalHistory = terminalHistory;
        this.timestamp = timestamp;
        this.autoSaved = autoSaved;
    }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public String getOpenFiles() { return openFiles; }
    public void setOpenFiles(String openFiles) { this.openFiles = openFiles; }
    public String getGitDiff() { return gitDiff; }
    public void setGitDiff(String gitDiff) { this.gitDiff = gitDiff; }
    public String getTerminalHistory() { return terminalHistory; }
    public void setTerminalHistory(String terminalHistory) { this.terminalHistory = terminalHistory; }
    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }
    public boolean isAutoSaved() { return autoSaved; }
    public void setAutoSaved(boolean autoSaved) { this.autoSaved = autoSaved; }
}
