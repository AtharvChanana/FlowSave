import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ApiClient, OpenFileInfo, AuthenticationError } from './apiClient';

/**
 * Captures the current development context and sends it to the backend.
 *
 * Gathers:
 *  - A user-provided label
 *  - Currently visible editor files + cursor positions
 *  - Git working-tree diff (if the built-in git extension is available)
 *  - Recent terminal history (from a temp file written by a shell hook)
 */
export async function captureContext(
    _context: vscode.ExtensionContext,
    apiClient: ApiClient
): Promise<void> {
    // ── 1. Ask user for a label ─────────────────────────────────────────
    const inputLabel = await vscode.window.showInputBox({
        prompt: 'What are you working on? (Optional - press Enter to skip)',
        placeHolder: 'e.g. Fixing auth middleware bug',
        ignoreFocusOut: true,
    });

    if (inputLabel === undefined) {
        return; // user cancelled (pressed Escape)
    }
    
    const label = inputLabel.trim() || 'Untitled Context';

    try {
        // ── 2. Capture ALL open tabs (not just visible editors) ──────────────
        // vscode.window.visibleTextEditors only returns editors currently on screen.
        // vscode.window.tabGroups.all gives us every open tab across all editor groups.
        const openFiles: OpenFileInfo[] = [];
        const seenPaths = new Set<string>();

        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const input = tab.input as { uri?: vscode.Uri };
                if (input?.uri && input.uri.scheme === 'file') {
                    const filePath = input.uri.fsPath;
                    if (!seenPaths.has(filePath)) {
                        seenPaths.add(filePath);
                        // Try to get current cursor line from visible editors
                        const visibleEditor = vscode.window.visibleTextEditors.find(
                            e => e.document.fileName === filePath
                        );
                        openFiles.push({
                            path: filePath,
                            line: visibleEditor ? visibleEditor.selection.active.line : 0,
                        });
                    }
                }
            }
        }

        // ── 3. Capture git diff ─────────────────────────────────────────
        let gitDiff: string | null = null;
        try {
            const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
            if (gitExtension) {
                const git = gitExtension.isActive
                    ? gitExtension.exports
                    : await gitExtension.activate();
                const api = git.getAPI(1);
                if (api.repositories.length > 0) {
                    const repo = api.repositories[0];
                    const diff = await repo.diff(true); // include staged + working tree
                    gitDiff = diff || null;
                }
            }
        } catch {
            // Git extension not available or errored — continue without diff
        }

        // ── 4. Capture terminal history ─────────────────────────────────
        let terminalHistory: string | null = null;
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const flowsaveHistory = '/tmp/flowsave_global_history.txt';
            const zshHistory = path.join(os.homedir(), '.zsh_history');

            if (fs.existsSync(flowsaveHistory) && workspaceFolder) {
                const raw = fs.readFileSync(flowsaveHistory, 'utf-8');
                const lines = raw.split('\n').filter(l => l.trim().length > 0);
                // Filter lines that belong to this workspace or its subdirectories
                const workspaceLines = lines
                    .filter(l => l.startsWith(workspaceFolder))
                    .map(l => {
                        const parts = l.split('|:|');
                        return parts.length > 1 ? parts.slice(1).join('|:|').trim() : '';
                    })
                    .filter(l => l.length > 0);
                if (workspaceLines.length > 0) {
                    terminalHistory = workspaceLines.slice(-50).join('\n');
                }
            }

            // Fallback: use recent zsh history (global, less accurate)
            if (!terminalHistory && fs.existsSync(zshHistory)) {
                const raw = fs.readFileSync(zshHistory, 'utf-8');
                const lines = raw.split('\n').filter(l => l.trim().length > 0);
                // Strip zsh extended history timestamps: ": 1234567890:0;"
                terminalHistory = '[Note: project-specific tracking not set up. Recent global history:]\n' +
                    lines.slice(-30).map(l => l.replace(/^: \d+:\d+;/, '').trim()).filter(l => l).join('\n');
            }
        } catch (e) {
            console.error('Error reading terminal history:', e);
        }

        // ── 5. Build timestamp ──────────────────────────────────────────
        const timestamp = new Date().toISOString();

        // ── 6. Send to backend ──────────────────────────────────────────
        const result = await apiClient.saveContext({
            label,
            openFiles: JSON.stringify(openFiles),
            gitDiff,
            terminalHistory,
            timestamp,
        });

        vscode.window.showInformationMessage(`✓ Context saved: ${label}`);

        // If the webview is visible, refresh its list
        if (result) {
            vscode.commands.executeCommand('flowsave.list');
        }
    } catch (error) {
        if (error instanceof AuthenticationError) {
            vscode.window.showErrorMessage(
                'FlowSave: Please log in first. Open the FlowSave sidebar to authenticate.'
            );
        } else {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`FlowSave: Failed to save context — ${message}`);
        }
    }
}

// ── Git extension type stubs ────────────────────────────────────────────

interface GitExtension {
    getAPI(version: number): GitAPI;
}

interface GitAPI {
    repositories: GitRepository[];
}

interface GitRepository {
    diff(cached?: boolean): Promise<string>;
}
