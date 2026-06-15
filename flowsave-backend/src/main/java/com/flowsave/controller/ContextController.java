package com.flowsave.controller;

import com.flowsave.dto.RestoreContextResponse;
import com.flowsave.dto.SaveContextRequest;
import com.flowsave.model.ContextSnapshot;
import com.flowsave.service.ContextService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/context")
public class ContextController {

    private final ContextService contextService;

    public ContextController(ContextService contextService) {
        this.contextService = contextService;
    }

    @PostMapping("/save")
    public ResponseEntity<Map<String, Object>> saveContext(@RequestBody SaveContextRequest request,
                                                           Authentication authentication) {
        String email = authentication.getName();
        Map<String, Object> result = contextService.saveContext(request, email);
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    @GetMapping("/list")
    public ResponseEntity<List<RestoreContextResponse>> listContexts(Authentication authentication) {
        String email = authentication.getName();
        List<ContextSnapshot> snapshots = contextService.listContexts(email);

        List<RestoreContextResponse> response = snapshots.stream()
                .map(this::toResponse)
                .collect(Collectors.toList());

        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<RestoreContextResponse> getContext(@PathVariable UUID id,
                                                              Authentication authentication) {
        String email = authentication.getName();
        ContextSnapshot snapshot = contextService.getContext(id, email);
        return ResponseEntity.ok(toResponse(snapshot));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteContext(@PathVariable UUID id,
                                               Authentication authentication) {
        String email = authentication.getName();
        contextService.deleteContext(id, email);
        return ResponseEntity.noContent().build();
    }

    private RestoreContextResponse toResponse(ContextSnapshot snapshot) {
        return RestoreContextResponse.builder()
                .id(snapshot.getId())
                .label(snapshot.getLabel())
                .openFiles(snapshot.getOpenFiles())
                .gitDiff(snapshot.getGitDiff())
                .terminalHistory(snapshot.getTerminalHistory())
                .reentryBrief(snapshot.getReentryBrief())
                .createdAt(snapshot.getCreatedAt())
                .build();
    }
}
