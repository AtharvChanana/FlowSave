#!/bin/bash

# ── Local development only ────────────────────────────────────────────────────
# Copy this file to run.local.sh, fill in your values, and run that instead.
# run.local.sh is in .gitignore so secrets never reach GitHub.
# On Render, set these as Environment Variables in the dashboard.

export SUPABASE_DB_URL="jdbc:postgresql://<host>:5432/postgres"
export SUPABASE_DB_USERNAME="<username>"
export SUPABASE_DB_PASSWORD="<password>"

export JWT_SECRET="<your-random-64-char-secret>"

export GROQ_API_KEY="<your-groq-api-key>"

# Start the Spring Boot Application
echo "Starting FlowSave Backend..."
mvn spring-boot:run
