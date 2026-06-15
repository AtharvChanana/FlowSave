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
    private static final String GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s";
    private static final int MAX_DIFF_LENGTH = 2000;
    private static final int MAX_TERMINAL_COMMANDS = 10;

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${flowsave.gemini.api-key}")
    private String apiKey;

    @Value("${flowsave.gemini.model}")
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

            String url = String.format(GEMINI_API_URL, model, apiKey);

            Map<String, Object> requestBody = Map.of(
                    "contents", List.of(
                            Map.of("parts", List.of(
                                    Map.of("text", prompt)
                            ))
                    )
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);

            if (response.getBody() != null) {
                JsonNode root = objectMapper.readTree(response.getBody());
                JsonNode textNode = root
                        .path("candidates").path(0)
                        .path("content").path("parts").path(0)
                        .path("text");

                if (!textNode.isMissingNode()) {
                    return textNode.asText();
                }
            }

            logger.warn("Gemini API returned an unexpected response format");
            return fallbackBrief();

        } catch (Exception e) {
            logger.error("Failed to generate re-entry brief from Gemini API: {}", e.getMessage(), e);
            return fallbackBrief();
        }
    }

    private String buildPrompt(String label, String openFiles, String truncatedDiff,
                                String lastCommands, String timestamp) {
        return "You are a developer assistant. A developer is saving their working context " +
                "before switching tasks. Based on the snapshot below, write a concise re-entry brief " +
                "(4-5 lines max) that tells them exactly what they were doing, what files and lines " +
                "they were focused on, what changes they had made, and what the logical next step is " +
                "when they return. Be specific. Reference actual file names and line numbers. " +
                "Be direct, no fluff.\n\n" +
                "Label: " + (label != null ? label : "N/A") + "\n" +
                "Open files: " + (openFiles != null ? openFiles : "N/A") + "\n" +
                "Git diff summary: " + (truncatedDiff != null ? truncatedDiff : "N/A") + "\n" +
                "Recent terminal commands: " + (lastCommands != null ? lastCommands : "N/A") + "\n" +
                "Saved at: " + (timestamp != null ? timestamp : "N/A");
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
}
