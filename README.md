# FlowSave — Context Switching for Developers

FlowSave captures your working state when you need to switch tasks — open files, cursor positions, git diffs, and terminal history — then uses Gemini AI to generate a concise re-entry brief so you know exactly where you left off when you return.

**Save your flow. Restore your focus.**

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Shell Hook Setup](#shell-hook-setup)
- [Backend Setup](#backend-setup)
- [Extension Configuration](#extension-configuration)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Publishing](#publishing)

---

## Features

- **Save Context** — Capture open files, cursor positions, git diffs, and recent terminal commands with one command
- **AI Re-entry Brief** — Gemini 2.0 Flash generates a concise summary of what you were doing and what to do next
- **Restore Context** — Reopen files at exact cursor positions with a single click
- **Sidebar UI** — Clean, dark-themed webview integrated into VS Code's sidebar
- **JWT Auth** — Secure per-user context storage with email/password authentication

---

## Architecture

```
┌─────────────────────┐       ┌─────────────────────┐
│  VS Code Extension  │──────▶│  Spring Boot Backend │
│  (TypeScript)       │ REST  │  (Java 17)           │
│                     │◀──────│                       │
│  • Context Capture  │       │  • JWT Auth           │
│  • File Restore     │       │  • PostgreSQL (JPA)   │
│  • Webview UI       │       │  • Gemini 2.0 Flash   │
└─────────────────────┘       └─────────────────────┘
```

---

## Installation

### VS Code Extension

**From .vsix file (manual install):**

```bash
cd flowsave-extension
npm install
npm run compile
npx vsce package
code --install-extension flowsave-1.0.0.vsix
```

**From VS Code Marketplace** (once published):

Search for "FlowSave" in the Extensions panel and click Install.

---

## Shell Hook Setup

FlowSave captures recent terminal commands by reading from a history file. You need to add a shell hook to write commands to this file.

### Zsh (macOS default)

Add to `~/.zshrc`:

```bash
# FlowSave terminal history hook
preexec() {
  echo "$1" >> /tmp/flowsave_history.txt
  # Keep only last 50 lines
  tail -50 /tmp/flowsave_history.txt > /tmp/flowsave_history_tmp.txt && mv /tmp/flowsave_history_tmp.txt /tmp/flowsave_history.txt
}
```

### Bash

Add to `~/.bashrc`:

```bash
# FlowSave terminal history hook
preexec() {
  echo "$1" >> /tmp/flowsave_history.txt
  tail -50 /tmp/flowsave_history.txt > /tmp/flowsave_history_tmp.txt && mv /tmp/flowsave_history_tmp.txt /tmp/flowsave_history.txt
}

# Bash doesn't have preexec natively — install bash-preexec:
# https://github.com/rcaloras/bash-preexec
# Or use the PROMPT_COMMAND approach:
export PROMPT_COMMAND='history 1 | sed "s/^[ ]*[0-9]*[ ]*//" >> /tmp/flowsave_history.txt; tail -50 /tmp/flowsave_history.txt > /tmp/flowsave_history_tmp.txt && mv /tmp/flowsave_history_tmp.txt /tmp/flowsave_history.txt'
```

Then reload your shell:

```bash
source ~/.zshrc   # or source ~/.bashrc
```

---

## Backend Setup

### Prerequisites

- Java 17+
- Maven 3.8+
- PostgreSQL database (Supabase recommended)
- Gemini API key ([Get one here](https://aistudio.google.com/apikey))

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `SUPABASE_DB_URL` | PostgreSQL JDBC connection URL | `jdbc:postgresql://db.xxx.supabase.co:5432/postgres` |
| `SUPABASE_DB_USERNAME` | Database username | `postgres` |
| `SUPABASE_DB_PASSWORD` | Database password | `your-password` |
| `GEMINI_API_KEY` | Google Gemini API key | `AIza...` |
| `JWT_SECRET` | Secret key for JWT signing (min 32 chars) | `your-very-long-secret-key-here-at-least-32-chars` |
| `JWT_EXPIRY_MS` | JWT token expiry in milliseconds | `604800000` (7 days) |
| `PORT` | Server port (optional, default 8080) | `8080` |

### Run Locally

```bash
cd flowsave-backend

# Set environment variables (or use a .env file with a Spring profile)
export SUPABASE_DB_URL=jdbc:postgresql://localhost:5432/flowsave
export SUPABASE_DB_USERNAME=postgres
export SUPABASE_DB_PASSWORD=postgres
export GEMINI_API_KEY=your-api-key
export JWT_SECRET=your-32-char-minimum-secret-key-here

# Build and run
mvn clean install
mvn spring-boot:run
```

The backend will start at `http://localhost:8080`.

### Deploy to Railway

1. Push the `flowsave-backend` directory to a Git repository
2. Connect the repository to [Railway](https://railway.app)
3. Set all environment variables in Railway's dashboard
4. Railway will auto-detect the Maven project and build it
5. Update `BACKEND_URL` in the extension's `apiClient.ts` to your Railway URL

---

## Extension Configuration

The extension connects to the backend at `http://localhost:8080` by default. To point to a deployed backend:

1. Open `flowsave-extension/src/apiClient.ts`
2. Change the `BACKEND_URL` constant to your Railway deployment URL

Or set the `FLOWSAVE_BACKEND_URL` environment variable before launching VS Code.

---

## Usage

### Save Context

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
2. Type **"FlowSave: Save Context"**
3. Enter a short label describing what you're working on
4. Your context is captured and saved with an AI-generated re-entry brief

### Restore Context

1. Press `Ctrl+Shift+P` → **"FlowSave: Restore Context"**
2. Or click the FlowSave icon in the Activity Bar
3. Browse your saved contexts
4. Click **Restore** on any context
5. Files reopen at the exact cursor positions, and the re-entry brief appears

### View Saved Contexts

1. Press `Ctrl+Shift+P` → **"FlowSave: Show Saved Contexts"**
2. Browse, restore, or delete saved contexts from the sidebar

### First-Time Setup

On first use, the sidebar will show a login/register form. Create an account with your email and password. Your contexts are stored securely on the backend and synced across devices.

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | Register with email + password, returns JWT |
| `POST` | `/api/auth/login` | No | Login with email + password, returns JWT |
| `POST` | `/api/context/save` | JWT | Save a context snapshot |
| `GET` | `/api/context/list` | JWT | List all saved contexts |
| `GET` | `/api/context/{id}` | JWT | Get a specific context with brief |
| `DELETE` | `/api/context/{id}` | JWT | Soft-delete a context |

---

## Publishing

### Package the Extension

```bash
cd flowsave-extension
npm install
npm run compile
npx vsce package
```

This creates `flowsave-1.0.0.vsix`.

### Publish to VS Code Marketplace

```bash
# First time: create a publisher at https://marketplace.visualstudio.com/manage
npx vsce login flowsave
npx vsce publish
```

### Publish Updates

```bash
# Bump version
npx vsce publish minor   # or major, patch
```

---

## Development

### Extension Development

```bash
cd flowsave-extension
npm install
npm run watch    # Compile TypeScript in watch mode
```

Then press `F5` in VS Code to launch the Extension Development Host.

### Backend Development

```bash
cd flowsave-backend
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Dspring.profiles.active=dev"
```

---

## License

MIT
