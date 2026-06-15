package com.flowsave.controller;

import com.flowsave.model.ContextSnapshot;
import com.flowsave.model.ShareToken;
import com.flowsave.repository.ShareTokenRepository;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

/**
 * Public controller for shared context pages — no authentication required.
 * Renders a simple HTML page showing the context details.
 */
@RestController
public class SharedController {

    private final ShareTokenRepository shareTokenRepository;

    public SharedController(ShareTokenRepository shareTokenRepository) {
        this.shareTokenRepository = shareTokenRepository;
    }

    @GetMapping(value = "/shared/{token}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> viewSharedContext(@PathVariable String token) {
        UUID tokenUuid;
        try {
            tokenUuid = UUID.fromString(token);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.ok(errorPage("Invalid share link."));
        }

        ShareToken shareToken = shareTokenRepository.findByToken(tokenUuid).orElse(null);

        if (shareToken == null) {
            return ResponseEntity.ok(errorPage("This link does not exist or has been removed."));
        }

        if (shareToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            return ResponseEntity.ok(errorPage("This context has expired. Share links are valid for 7 days."));
        }

        ContextSnapshot snapshot = shareToken.getContextSnapshot();
        return ResponseEntity.ok(buildPage(snapshot, shareToken.getExpiresAt()));
    }

    private String buildPage(ContextSnapshot snapshot, LocalDateTime expiresAt) {
        String label = snapshot.getLabel() != null ? escape(snapshot.getLabel()) : "Untitled Context";
        String brief = snapshot.getReentryBrief() != null ? escape(snapshot.getReentryBrief()).replace("\n", "<br>") : "No brief available.";
        String createdAt = snapshot.getCreatedAt() != null
                ? snapshot.getCreatedAt().format(DateTimeFormatter.ofPattern("MMM dd, yyyy 'at' HH:mm"))
                : "Unknown";
        String expiresStr = expiresAt.format(DateTimeFormatter.ofPattern("MMM dd, yyyy"));

        // Parse open files JSON into a list
        StringBuilder filesList = new StringBuilder();
        try {
            String openFilesJson = snapshot.getOpenFiles();
            if (openFilesJson != null && !openFilesJson.isBlank()) {
                // Simple extraction without full JSON parsing dependency
                String[] entries = openFilesJson.replaceAll("[\\[\\]{}]", "").split(",(?=\"path\")");
                for (String entry : entries) {
                    if (entry.contains("\"path\"")) {
                        String pathVal = entry.replaceAll(".*\"path\"\\s*:\\s*\"([^\"]+)\".*", "$1");
                        String lineVal = entry.replaceAll(".*\"line\"\\s*:\\s*(\\d+).*", "$1");
                        String filename = pathVal.contains("/") ? pathVal.substring(pathVal.lastIndexOf('/') + 1) : pathVal;
                        filesList.append("<li><code>").append(escape(filename))
                                .append("</code> <span class='line'>line ").append(lineVal).append("</span></li>");
                    }
                }
            }
        } catch (Exception ignored) {}

        if (filesList.length() == 0) {
            filesList.append("<li>No files recorded</li>");
        }

        return """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FlowSave — %s</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; padding: 40px 20px; }
    .container { max-width: 720px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
    .logo { width: 36px; height: 36px; background: linear-gradient(135deg, #4fc3f7, #0288d1); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
    .brand { font-size: 20px; font-weight: 700; color: #4fc3f7; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 28px; margin-bottom: 20px; }
    .label { font-size: 22px; font-weight: 700; color: #e6edf3; margin-bottom: 8px; }
    .meta { font-size: 13px; color: #8b949e; margin-bottom: 24px; }
    .meta span { margin-right: 16px; }
    .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: #8b949e; margin-bottom: 10px; }
    .brief { font-size: 14px; line-height: 1.7; color: #c9d1d9; background: #0d1117; border-radius: 8px; padding: 16px; border-left: 3px solid #4fc3f7; }
    .files-list { list-style: none; }
    .files-list li { padding: 8px 0; border-bottom: 1px solid #21262d; font-size: 14px; color: #c9d1d9; display: flex; align-items: center; gap: 8px; }
    .files-list li:last-child { border-bottom: none; }
    code { background: #21262d; padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 13px; color: #79c0ff; }
    .line { color: #8b949e; font-size: 12px; }
    .expire-note { text-align: center; font-size: 12px; color: #8b949e; margin-top: 24px; }
    .badge { display: inline-block; background: #21262d; color: #8b949e; font-size: 11px; padding: 2px 8px; border-radius: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">&#9646;</div>
      <span class="brand">FlowSave</span>
    </div>

    <div class="card">
      <div class="label">%s</div>
      <div class="meta">
        <span>Saved on %s</span>
        <span class="badge">Shared Context</span>
      </div>

      <div class="section-title" style="margin-top:20px">Re-entry Brief</div>
      <div class="brief">%s</div>
    </div>

    <div class="card">
      <div class="section-title">Open Files</div>
      <ul class="files-list">
        %s
      </ul>
    </div>

    <div class="expire-note">This link expires on %s &nbsp;·&nbsp; Shared via <strong>FlowSave</strong></div>
  </div>
</body>
</html>
""".formatted(label, label, createdAt, brief, filesList, expiresStr);
    }

    private String errorPage(String message) {
        return """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>FlowSave — Link Unavailable</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0d1117; color: #e6edf3; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .box { text-align: center; }
    h2 { color: #8b949e; font-size: 18px; margin-bottom: 8px; }
    p { color: #8b949e; font-size: 14px; }
    .brand { color: #4fc3f7; font-size: 20px; font-weight: 700; margin-bottom: 24px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="brand">FlowSave</div>
    <h2>%s</h2>
    <p>Ask the sender to generate a new share link.</p>
  </div>
</body>
</html>
""".formatted(message);
    }

    private String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
