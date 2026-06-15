package com.flowsave.controller;

import com.flowsave.model.ContextSnapshot;
import com.flowsave.model.ShareToken;
import com.flowsave.repository.ShareTokenRepository;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Public controller for shared context pages — no authentication required.
 */
@RestController
public class SharedController {

    private final ShareTokenRepository shareTokenRepository;

    public SharedController(ShareTokenRepository shareTokenRepository) {
        this.shareTokenRepository = shareTokenRepository;
    }

    // ── HTML page ─────────────────────────────────────────────────────────

    @GetMapping(value = "/shared/{token}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> viewSharedContext(@PathVariable String token) {
        ShareToken shareToken = resolveToken(token);
        if (shareToken == null) {
            return ResponseEntity.ok(errorPage("This link does not exist or has been removed."));
        }
        if (shareToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            return ResponseEntity.ok(errorPage("This context has expired. Share links are valid for 7 days."));
        }
        return ResponseEntity.ok(buildPage(shareToken.getContextSnapshot(), shareToken.getToken().toString(), shareToken.getExpiresAt()));
    }

    // ── JSON endpoint for VS Code deep-link restore ───────────────────────

    @GetMapping(value = "/api/shared/{token}/context", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getSharedContextJson(@PathVariable String token) {
        ShareToken shareToken = resolveToken(token);
        if (shareToken == null || shareToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            return ResponseEntity.notFound().build();
        }
        ContextSnapshot snapshot = shareToken.getContextSnapshot();
        Map<String, Object> result = Map.of(
                "label", snapshot.getLabel() != null ? snapshot.getLabel() : "Untitled Context",
                "openFiles", snapshot.getOpenFiles() != null ? snapshot.getOpenFiles() : "[]",
                "reentryBrief", snapshot.getReentryBrief() != null ? snapshot.getReentryBrief() : ""
        );
        return ResponseEntity.ok(result);
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private ShareToken resolveToken(String token) {
        try {
            UUID uuid = UUID.fromString(token);
            return shareTokenRepository.findByToken(uuid).orElse(null);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String buildPage(ContextSnapshot snapshot, String token, LocalDateTime expiresAt) {
        String label      = snapshot.getLabel() != null ? escape(snapshot.getLabel()) : "Untitled Context";
        String createdAt  = snapshot.getCreatedAt() != null
                ? snapshot.getCreatedAt().format(DateTimeFormatter.ofPattern("MMM dd, yyyy 'at' HH:mm"))
                : "Unknown";
        String expiresStr = expiresAt.format(DateTimeFormatter.ofPattern("MMM dd, yyyy"));
        String vscodeUri  = "vscode://AtharvChanana.flowsave/restore?token=" + token;

        // Re-entry brief — convert **bold** markers to <strong>
        String briefHtml = "";
        if (snapshot.getReentryBrief() != null && !snapshot.getReentryBrief().isBlank()) {
            briefHtml = Arrays.stream(snapshot.getReentryBrief().split("\n"))
                    .map(line -> {
                        if (line.isBlank()) return "";
                        String escaped = escape(line);
                        // **Header:** → <strong>
                        escaped = escaped.replaceAll("\\*\\*(.+?)\\*\\*", "<strong>$1</strong>");
                        return "<p>" + escaped + "</p>";
                    })
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.joining("\n"));
        }

        // Open files
        StringBuilder fileRows = new StringBuilder();
        try {
            String raw = snapshot.getOpenFiles();
            if (raw != null && !raw.isBlank()) {
                String[] entries = raw.replaceAll("[\\[\\]{}]", "").split(",(?=\"path\")");
                for (String entry : entries) {
                    if (entry.contains("\"path\"")) {
                        String pathVal = entry.replaceAll(".*\"path\"\\s*:\\s*\"([^\"]+)\".*", "$1");
                        String lineVal = entry.replaceAll(".*\"line\"\\s*:\\s*(\\d+).*", "$1");
                        String filename = pathVal.contains("/") ? pathVal.substring(pathVal.lastIndexOf('/') + 1) : pathVal;
                        String dir = pathVal.contains("/") ? pathVal.substring(0, pathVal.lastIndexOf('/')) : "";
                        fileRows.append("<div class=\"file-row\">")
                                .append("<code class=\"file-name\">").append(escape(filename)).append("</code>")
                                .append(dir.isBlank() ? "" : "<span class=\"file-dir\">").append(escape(dir)).append(dir.isBlank() ? "" : "</span>")
                                .append("<span class=\"file-line\">L").append(lineVal).append("</span>")
                                .append("</div>");
                    }
                }
            }
        } catch (Exception ignored) {}
        if (fileRows.length() == 0) fileRows.append("<p class=\"muted\">No files recorded</p>");

        // Terminal history — last 20 commands
        String terminalHtml = "";
        if (snapshot.getTerminalHistory() != null && !snapshot.getTerminalHistory().isBlank()) {
            String[] lines = snapshot.getTerminalHistory().split("\n");
            int start = Math.max(0, lines.length - 20);
            String commands = Arrays.stream(lines, start, lines.length)
                    .filter(l -> !l.isBlank())
                    .map(l -> escape(l.trim()))
                    .collect(Collectors.joining("\n"));
            terminalHtml = "<div class=\"section\">\n" +
                    "<div class=\"section-title\">Terminal commands</div>\n" +
                    "<pre class=\"terminal-block\">" + commands + "</pre>\n" +
                    "</div>";
        }

        return """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>%s — FlowSave</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      background: #111;
      color: #d4d4d4;
      min-height: 100vh;
      padding: 40px 20px 80px;
    }

    a { color: inherit; text-decoration: none; }

    .page { max-width: 680px; margin: 0 auto; }

    /* Brand bar */
    .brand-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 36px;
      padding-bottom: 20px;
      border-bottom: 1px solid #222;
    }
    .brand-icon {
      width: 28px; height: 28px;
      background: #fff;
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
    }
    .brand-icon svg { width: 16px; height: 16px; }
    .brand-name { font-size: 13px; font-weight: 600; color: #fff; letter-spacing: 0.2px; }
    .brand-tag { font-size: 12px; color: #555; margin-left: auto; }

    /* Header */
    .ctx-header { margin-bottom: 28px; }
    .ctx-label {
      font-size: 22px;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.3px;
      margin-bottom: 6px;
      line-height: 1.3;
    }
    .ctx-meta { font-size: 12px; color: #555; display: flex; gap: 16px; flex-wrap: wrap; }

    /* Open in VS Code CTA */
    .open-cta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #fff;
      color: #111;
      font-size: 13px;
      font-weight: 600;
      padding: 9px 18px;
      border-radius: 6px;
      margin: 20px 0 32px;
      cursor: pointer;
      transition: opacity 0.15s;
      border: none;
    }
    .open-cta:hover { opacity: 0.88; }
    .open-cta svg { width: 16px; height: 16px; flex-shrink: 0; }
    .cta-note { font-size: 11px; color: #444; margin-top: -24px; margin-bottom: 28px; }

    /* Sections */
    .section { margin-bottom: 24px; }
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #555;
      margin-bottom: 10px;
    }

    /* Brief */
    .brief-block { font-size: 14px; line-height: 1.75; color: #c8c8c8; }
    .brief-block p { margin-bottom: 6px; }
    .brief-block p:last-child { margin-bottom: 0; }
    .brief-block strong { color: #fff; font-weight: 600; }

    /* Files */
    .file-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 7px 0;
      border-bottom: 1px solid #1e1e1e;
      font-size: 13px;
    }
    .file-row:last-child { border-bottom: none; }
    .file-name {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12.5px;
      color: #e8e8e8;
      background: #1e1e1e;
      padding: 2px 7px;
      border-radius: 4px;
      white-space: nowrap;
    }
    .file-dir { font-size: 11px; color: #444; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-line { font-size: 11px; color: #444; margin-left: auto; flex-shrink: 0; font-family: monospace; }

    /* Terminal */
    .terminal-block {
      background: #141414;
      border: 1px solid #222;
      border-radius: 6px;
      padding: 14px 16px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      line-height: 1.7;
      color: #a0a0a0;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 200px;
      overflow-y: auto;
    }

    /* Divider */
    hr { border: none; border-top: 1px solid #1e1e1e; margin: 28px 0; }

    .muted { color: #444; font-size: 13px; }

    /* Footer */
    .footer { margin-top: 48px; font-size: 11px; color: #383838; }
  </style>
</head>
<body>
  <div class="page">

    <div class="brand-bar">
      <div class="brand-icon">
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="1" width="12" height="14" rx="2" fill="#111"/>
          <path d="M5 5h6M5 8h6M5 11h4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="brand-name">FlowSave</span>
      <span class="brand-tag">Shared context</span>
    </div>

    <div class="ctx-header">
      <div class="ctx-label">%s</div>
      <div class="ctx-meta">
        <span>Saved %s</span>
        <span>Link expires %s</span>
      </div>
    </div>

    <a href="%s" class="open-cta">
      <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M0.5 1.5L6 8L0.5 14.5L2 15.5L8.5 8L2 0.5L0.5 1.5Z"/>
        <path d="M8.5 1.5L14 8L8.5 14.5L10 15.5L16.5 8L10 0.5L8.5 1.5Z" opacity="0.4"/>
      </svg>
      Open in VS Code
    </a>
    <div class="cta-note">Requires FlowSave extension installed. Opens all files and restores context.</div>

    <hr>

    %s

    <div class="section">
      <div class="section-title">Open files</div>
      %s
    </div>

    %s

    <div class="footer">
      Shared via FlowSave &nbsp;·&nbsp; Expires %s
    </div>

  </div>
</body>
</html>
""".formatted(
                label,          // <title>
                label,          // ctx-label
                createdAt,      // saved
                expiresStr,     // expires (meta)
                vscodeUri,      // open-cta href
                briefHtml.isBlank() ? "" : "<div class=\"section\"><div class=\"section-title\">Re-entry brief</div><div class=\"brief-block\">" + briefHtml + "</div></div><hr>",
                fileRows,       // files
                terminalHtml,   // terminal
                expiresStr      // footer
        );
    }

    private String errorPage(String message) {
        return """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>FlowSave</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #111; color: #d4d4d4;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .box { text-align: center; max-width: 360px; }
    .brand { font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 24px; }
    h2 { font-size: 16px; color: #fff; margin-bottom: 8px; }
    p { font-size: 13px; color: #555; }
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
