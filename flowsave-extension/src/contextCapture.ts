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
    const label = await vscode.window.showInputBox({
        prompt: 'What are you working on?',
        placeHolder: 'e.g. Fixing auth middleware bug',
        ignoreFocusOut: true,
    });

    if (!label) {
        return; // user cancelled
    }

    try {
        // ── 2. Capture open files ───────────────────────────────────────
        const openFiles: OpenFileInfo[] = vscode.window.visibleTextEditors.map((editor) => ({
            path: editor.document.fileName,
            line: editor.selection.active.line,
        }));

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
            const historyPath = path.join(os.tmpdir(), 'flowsave_history.txt');
            if (fs.existsSync(historyPath)) {
                const raw = fs.readFileSync(historyPath, 'utf-8');
                const lines = raw.split('\n');
                terminalHistory = lines.slice(-50).join('\n') || null;
            }
        } catch {
            // History file not available — continue without it
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
