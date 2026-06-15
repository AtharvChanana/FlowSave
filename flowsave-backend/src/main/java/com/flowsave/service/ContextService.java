package com.flowsave.service;

import com.flowsave.dto.SaveContextRequest;
import com.flowsave.model.ContextSnapshot;
import com.flowsave.model.User;
import com.flowsave.repository.ContextSnapshotRepository;
import com.flowsave.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ContextService {

    private final ContextSnapshotRepository snapshotRepository;
    private final UserRepository userRepository;
    private final GeminiService geminiService;

    public ContextService(ContextSnapshotRepository snapshotRepository,
                          UserRepository userRepository,
                          GeminiService geminiService) {
        this.snapshotRepository = snapshotRepository;
        this.userRepository = userRepository;
        this.geminiService = geminiService;
    }

    @Transactional
    public Map<String, Object> saveContext(SaveContextRequest request, String userEmail) {
        User user = findUserByEmail(userEmail);

        String brief = geminiService.generateReentryBrief(
                request.getLabel(),
                request.getOpenFiles(),
                request.getGitDiff(),
                request.getTerminalHistory(),
                request.getTimestamp()
        );

        ContextSnapshot snapshot = ContextSnapshot.builder()
                .user(user)
                .label(request.getLabel())
                .openFiles(request.getOpenFiles())
                .gitDiff(request.getGitDiff())
                .terminalHistory(request.getTerminalHistory())
                .reentryBrief(brief)
                .deleted(false)
                .build();

        ContextSnapshot saved = snapshotRepository.save(snapshot);

        return Map.of(
                "id", saved.getId(),
                "brief", brief
        );
    }

    public List<ContextSnapshot> listContexts(String userEmail) {
        User user = findUserByEmail(userEmail);
        return snapshotRepository.findByUserIdAndDeletedFalseOrderByCreatedAtDesc(user.getId());
    }

    public ContextSnapshot getContext(UUID id, String userEmail) {
        User user = findUserByEmail(userEmail);
        return snapshotRepository.findByIdAndUserIdAndDeletedFalse(id, user.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Context snapshot not found: " + id));
    }

    @Transactional
    public void deleteContext(UUID id, String userEmail) {
        ContextSnapshot snapshot = getContext(id, userEmail);
        snapshot.setDeleted(true);
        snapshotRepository.save(snapshot);
    }

    private User findUserByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + email));
    }

    public static class ResourceNotFoundException extends RuntimeException {
        public ResourceNotFoundException(String message) {
            super(message);
        }
    }
}
