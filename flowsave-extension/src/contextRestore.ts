import * as vscode from 'vscode';
import { OpenFileInfo } from './apiClient';

/**
 * Restores a previously saved context snapshot.
 *
 * Opens ALL saved files as tabs (using the tabGroups-aware approach),
 * then moves focus to the first/primary file with its cursor position.
 *
 * @param snapshot - A context snapshot object containing at least `openFiles` (JSON string).
 * @returns An object with the count of successfully restored files and any skipped files.
 */
export async function restoreContext(
    snapshot: { openFiles: string }
): Promise<{ restored: number; skipped: string[] }> {
    let files: OpenFileInfo[];

    try {
        files = JSON.parse(snapshot.openFiles) as OpenFileInfo[];
    } catch {
        vscode.window.showErrorMessage('FlowSave: Could not parse saved file list.');
        return { restored: 0, skipped: [] };
    }

    if (!Array.isArray(files) || files.length === 0) {
        vscode.window.showInformationMessage('FlowSave: No files to restore.');
        return { restored: 0, skipped: [] };
    }

    let restored = 0;
    const skipped: string[] = [];

    // ── Step 1: Open every file as a background tab ─────────────────────
    // We open all files with preserveFocus=true so they all become tabs
    // without switching focus each time. This replicates the user's open tab set.
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isLast = i === files.length - 1;

        try {
            const doc = await vscode.workspace.openTextDocument(file.path);

            if (isLast) {
                // ── Step 2: Focus the LAST file (or primary file) with cursor ──
                // Open the last file with focus so the user lands on it
                const editor = await vscode.window.showTextDocument(doc, {
                    preview: false,
                    preserveFocus: false, // Give this one focus
                });
                const line = Math.max(0, file.line);
                const position = new vscode.Position(line, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );
            } else {
                // Open in background — preserveFocus keeps current focus
                await vscode.window.showTextDocument(doc, {
                    preview: false,
                    preserveFocus: true,
                });
            }

            restored++;
        } catch {
            skipped.push(file.path);
        }
    }

    if (skipped.length > 0) {
        vscode.window.showWarningMessage(
            `FlowSave: Restored ${restored} file(s). ${skipped.length} file(s) could not be opened.`
        );
    } else {
        vscode.window.showInformationMessage(
            `✓ FlowSave: Restored ${restored} file(s) successfully.`
        );
    }

    return { restored, skipped };
}
