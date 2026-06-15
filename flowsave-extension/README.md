# FlowSave

**Save your flow. Restore your focus. Share it with your team.**

Every interruption costs you 23 minutes of focus. FlowSave gives them back.

When you leave a task, FlowSave captures your entire working context — open files, cursor positions, git diff, terminal history — and uses AI to write a precise re-entry brief. When you return, one click reopens everything exactly where you left off.

---

## The Problem

You're deep in flow. Debugging a race condition in the JWT refresh logic. You finally understand why tokens are invalidating out of order.

Then: a Slack message. A meeting. A production incident.

You come back 30 minutes later. **Blank.** Which file? Which function? What was I even testing?

> *"It takes an average of 23 minutes and 15 seconds to return to a task after an interruption."*
> — Gloria Mark, University of California, Irvine

**This happens to you multiple times every day.** And most tools only solve half of it.

---

## Why FlowSave is Different

Other tools save your file list. FlowSave saves your **mental state** — and then goes further.

| | FlowSave | Dev Checkpoint | FlowSnap |
|---|---|---|---|
| AI-generated re-entry brief | Yes | No (heuristic text) | No |
| Cloud sync across devices | Yes | No (local only) | No |
| Share context with teammates | Yes | No | No |
| Branch-aware auto-save | Yes | No | No |
| Export as PR description | Yes | No | No |
| Works after reinstall | Yes | No | No |
| Open teammate's files in VS Code | Yes | No | No |

---

## The Sidebar

![FlowSave sidebar showing a context card expanded with AI re-entry brief, open files, and action buttons](images/sidebar.png)

Every saved context shows:
- The label — what you were working on
- The AI re-entry brief — **specific to your actual code**, not a generic summary
- Every file you had open with its exact line number
- Restore, Share, and Export PR actions

---

## Features

### AI Re-entry Brief

When you save, FlowSave sends your file list, git diff, and terminal history to an LLM. It comes back with a brief like this:

> *You were fixing a race condition in `auth/middleware.ts` at line 47. The token refresh was triggering before the previous token was properly invalidated. Your git diff shows you started adding a mutex lock. The next step is to finish the lock implementation and test with concurrent requests.*

That's not a heuristic. That's AI that actually read your diff.

---

### Auto-Save on Branch Switch

![FlowSave auto-saving context when switching git branches](images/autosave.png)

When you switch git branches, FlowSave saves your current context silently in the background. When you switch back, you're prompted to restore. No keystrokes required.

Dev Checkpoint auto-captures on idle. That misses the most common interruption pattern: *leaving a branch to fix something urgent on main*.

---

### Share Context with Your Team

![FlowSave shared context page in browser](images/share.png)

Click **Share** on any saved context. You get a public link. Your teammate:
1. Opens the link in their browser — sees your re-entry brief, open files, and terminal commands
2. Clicks **Open in VS Code** — all your files open in their editor at the saved positions

No copy-pasting file names. No "which commit were you on?" No 10-minute catch-up call.

Share links work for 7 days.

---

### Export as PR Description

![FlowSave generating a PR description from context](images/pr.png)

Click **Export PR** on any context. FlowSave uses AI to generate a structured pull request description from your actual changes — what changed, why, and how to test it. Copy it directly into GitHub.

---

### Cloud Sync

Your contexts live in the cloud. Log in from any machine. Your full history is there.

Dev Checkpoint stores everything in `globalStorageUri` on your local machine. Reinstall VS Code, get a new laptop, or hand off to a contractor — and all context is gone.

---

## Getting Started

1. Install FlowSave from the Marketplace
2. Click the FlowSave icon in the Activity Bar
3. Create a free account with your email
4. Press `Cmd+Shift+P` → **FlowSave: Save Context**

That's it. No API keys. No local config files. No setup script to run.

---

## Terminal Command Tracking

To capture recent terminal commands, add a one-time hook to your shell:

**Zsh** — add to `~/.zshrc`:
```bash
preexec() {
  echo "$1" >> /tmp/flowsave_history.txt
  tail -50 /tmp/flowsave_history.txt > /tmp/flowsave_history_tmp.txt && mv /tmp/flowsave_history_tmp.txt /tmp/flowsave_history.txt
}
```
Then `source ~/.zshrc`.

---

## Commands

| Command | Shortcut |
|---|---|
| FlowSave: Save Context | `Cmd+Shift+P` → FlowSave: Save Context |
| FlowSave: Restore Context | `Cmd+Shift+P` → FlowSave: Restore Context |
| FlowSave: Show Saved Contexts | Click the FlowSave icon in the Activity Bar |

---

## What Gets Captured

- Every open file and the exact line your cursor was on
- Your current git diff (staged and unstaged)
- Your recent terminal commands (last 50)
- Timestamp of when you saved
- AI-generated re-entry brief referencing your actual file names, line numbers, and changes

---

## Requirements

- VS Code 1.85 or later
- An internet connection

---

## Privacy

Your context data (file paths, git diffs, terminal history) is stored on a secure backend, encrypted at rest, and only accessible with your account credentials. Share links are opt-in and expire after 7 days. We do not sell or share your data.

---

## License

MIT — [GitHub](https://github.com/AtharvChanana/FlowSave)
