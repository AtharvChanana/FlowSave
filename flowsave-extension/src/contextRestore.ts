import * as vscode from 'vscode';
import { OpenFileInfo } from './apiClient';

/**
 * Restores a previously saved context snapshot.
 *
 * Opens each saved file and moves the cursor to the saved line position.
 * Files that no longer exist are silently skipped.
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

    for (const file of files) {
        try {
            const doc = await vscode.workspace.openTextDocument(file.path);
            const editor = await vscode.window.showTextDocument(doc, {
                preview: false,
                preserveFocus: true,
            });

            const line = Math.max(0, file.line);
            const position = new vscode.Position(line, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );

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
            `FlowSave: Restored ${restored} file(s) successfully.`
        );
    }

    return { restored, skipped };
}
