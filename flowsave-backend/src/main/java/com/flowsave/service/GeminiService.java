package com.flowsave.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class GeminiService {

    private static final Logger logger = LoggerFactory.getLogger(GeminiService.class);
    private static final String GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
    private static final int MAX_DIFF_LENGTH = 3000;
    private static final int MAX_TERMINAL_COMMANDS = 30;

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${flowsave.groq.api-key}")
    private String apiKey;

    @Value("${flowsave.groq.model}")
    private String model;

    public GeminiService() {
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
    }

    public String generateReentryBrief(String label,
                                        String openFiles,
                                        String gitDiff,
                                        String terminalHistory,
                                        String timestamp) {
        try {
            String truncatedDiff = truncateDiff(gitDiff);
            String lastCommands = extractLastCommands(terminalHistory);

            String prompt = buildPrompt(label, openFiles, truncatedDiff, lastCommands, timestamp);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            Map<String, Object> requestBody = Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "user", "content", prompt)
                    ),
                    "temperature", 0.3,
                    "max_tokens", 500
            );

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(GROQ_API_URL, entity, String.class);

            if (response.getBody() != null) {
                JsonNode root = objectMapper.readTree(response.getBody());
                JsonNode contentNode = root
                        .path("choices").path(0)
                        .path("message").path("content");

                if (!contentNode.isMissingNode()) {
                    return contentNode.asText();
                }
            }

            logger.warn("Groq API returned an unexpected response format");
            return fallbackBrief();

        } catch (Exception e) {
            logger.error("Failed to generate re-entry brief from Groq API: {}", e.getMessage(), e);
            return fallbackBrief();
        }
    }

    private String buildPrompt(String label, String openFiles, String truncatedDiff,
                                String lastCommands, String timestamp) {
        StringBuilder sb = new StringBuilder();
        sb.append("You are a senior developer assistant. A developer just saved their work context before switching tasks.\n");
        sb.append("Write a re-entry brief with EXACTLY these 3 sections (use these headers):\n\n");
        sb.append("**What you were working on:**\n");
        sb.append("1-2 sentences describing the specific task, referencing actual file names.\n\n");
        sb.append("**Terminal activity:**\n");
        sb.append("1-2 sentences summarizing what the terminal commands indicate they were DOING (e.g. starting servers, running tests, installing packages). Do NOT just list commands - interpret what they mean.\n\n");
        sb.append("**Next step when you return:**\n");
        sb.append("1 specific, actionable next step.\n\n");
        sb.append("Be specific. Reference actual file names, line numbers, and command results. No fluff.\n\n");
        sb.append("--- CONTEXT SNAPSHOT ---\n");
        sb.append("Label: ").append(label != null ? label : "N/A").append("\n");
        sb.append("Open files (path, cursor line): ").append(openFiles != null ? openFiles : "N/A").append("\n");
        sb.append("Git diff: ").append(truncatedDiff != null ? truncatedDiff : "No changes").append("\n");
        sb.append("Recent terminal commands:\n").append(lastCommands != null ? lastCommands : "None recorded").append("\n");
        sb.append("Saved at: ").append(timestamp != null ? timestamp : "N/A").append("\n");
        return sb.toString();
    }

    private String truncateDiff(String gitDiff) {
        if (gitDiff == null) {
            return null;
        }
        if (gitDiff.length() <= MAX_DIFF_LENGTH) {
            return gitDiff;
        }
        return gitDiff.substring(0, MAX_DIFF_LENGTH);
    }

    private String extractLastCommands(String terminalHistory) {
        if (terminalHistory == null || terminalHistory.isBlank()) {
            return null;
        }
        String[] lines = terminalHistory.split("\n");
        int start = Math.max(0, lines.length - MAX_TERMINAL_COMMANDS);
        return Arrays.stream(lines, start, lines.length)
                .collect(Collectors.joining("\n"));
    }

    private String fallbackBrief() {
        return "Brief generation failed — your files and diff are saved.";
    }

    // ── Feature 3: PR Description ────────────────────────────────────────

    public String generatePRDescription(String label, String openFiles, String gitDiff,
                                         String terminalHistory, String createdAt) {
        try {
            String truncatedDiff = gitDiff != null
                    ? (gitDiff.length() > 3000 ? gitDiff.substring(0, 3000) : gitDiff)
                    : "No diff available";

            String lastCommands = extractLastCommands(terminalHistory);

            String prompt = "You are a developer assistant. Based on the context snapshot below, generate a professional GitHub Pull Request description in clean markdown. Use exactly this structure and nothing else:\n\n" +
                    "## What does this PR do?\n" +
                    "[2-3 sentences explaining what this PR changes, based on the git diff and files]\n\n" +
                    "## Why?\n" +
                    "[The problem being solved or reason for this change, inferred from the label and diff]\n\n" +
                    "## Changes made\n" +
                    "[Bullet list. One bullet per file changed. Format: `filename` — what changed in that file and why]\n\n" +
                    "## How to test\n" +
                    "[Step by step testing instructions based on what was changed in the diff]\n\n" +
                    "Be specific. Reference actual file names from the snapshot. Use the git diff to identify exactly what changed. Keep it concise and professional. No fluff. No preamble. Start directly with ## What does this PR do?\n\n" +
                    "Developer label: " + (label != null ? label : "N/A") + "\n" +
                    "Open files: " + (openFiles != null ? openFiles : "N/A") + "\n" +
                    "Git diff (first 3000 chars): " + truncatedDiff + "\n" +
                    "Terminal commands: " + (lastCommands != null ? lastCommands : "None") + "\n" +
                    "Saved at: " + (createdAt != null ? createdAt : "N/A");

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            Map<String, Object> requestBody = Map.of(
                    "model", model,
                    "messages", List.of(Map.of("role", "user", "content", prompt)),
                    "temperature", 0.3,
                    "max_tokens", 800
            );

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(GROQ_API_URL, entity, String.class);

            if (response.getBody() != null) {
                JsonNode root = objectMapper.readTree(response.getBody());
                JsonNode contentNode = root.path("choices").path(0).path("message").path("content");
                if (!contentNode.isMissingNode()) {
                    return contentNode.asText();
                }
            }

            return "PR description generation failed — your context is saved.";

        } catch (Exception e) {
            logger.error("Failed to generate PR description: {}", e.getMessage(), e);
            return "PR description generation failed — your context is saved.";
        }
    }
}
