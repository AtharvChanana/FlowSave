package com.flowsave.repository;

import com.flowsave.model.ContextSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ContextSnapshotRepository extends JpaRepository<ContextSnapshot, UUID> {

    List<ContextSnapshot> findByUserIdAndDeletedFalseOrderByCreatedAtDesc(UUID userId);

    Optional<ContextSnapshot> findByIdAndUserIdAndDeletedFalse(UUID id, UUID userId);
}
