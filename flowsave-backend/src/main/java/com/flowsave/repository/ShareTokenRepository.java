package com.flowsave.repository;

import com.flowsave.model.ShareToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface ShareTokenRepository extends JpaRepository<ShareToken, UUID> {
    Optional<ShareToken> findByToken(UUID token);
}
