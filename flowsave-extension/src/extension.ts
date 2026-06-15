import * as vscode from 'vscode';
import { AuthManager } from './authManager';
import { ApiClient } from './apiClient';
import { captureContext } from './contextCapture';
import { restoreContext } from './contextRestore';
import { FlowSaveWebviewProvider } from './webviewPanel';
import { checkAndInstallTerminalHook } from './terminalSetup';
import { BranchMonitor } from './branchMonitor';

let webviewProvider: FlowSaveWebviewProvider;

export function activate(context: vscode.ExtensionContext) {
    const authManager = new AuthManager(context);
    const apiClient = new ApiClient(authManager);

    // Register the webview provider for the sidebar
    webviewProvider = new FlowSaveWebviewProvider(context, apiClient, authManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            FlowSaveWebviewProvider.viewType,
            webviewProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Command: Save Context
    const saveCmd = vscode.commands.registerCommand('flowsave.save', async () => {
        await captureContext(context, apiClient);
    });

    // Command: Restore Context (opens sidebar with list for selection)
    const restoreCmd = vscode.commands.registerCommand('flowsave.restore', async () => {
        await vscode.commands.executeCommand('flowsave.webview.focus');
        webviewProvider.showScreen('restore');
    });

    // Command: Show Saved Contexts (opens sidebar with list)
    const listCmd = vscode.commands.registerCommand('flowsave.list', async () => {
        await vscode.commands.executeCommand('flowsave.webview.focus');
        webviewProvider.showScreen('list');
    });

    context.subscriptions.push(saveCmd, restoreCmd, listCmd);

    // ── Feature 1: Start branch monitor ─────────────────────────────────
    const branchMonitor = new BranchMonitor(context, apiClient);
    branchMonitor.start().catch(console.error);
    webviewProvider.setBranchMonitor(branchMonitor);

    // ── Deep-link URI handler: vscode://AtharvChanana.flowsave/restore?token=... ──
    const uriHandler = vscode.window.registerUriHandler({
        async handleUri(uri: vscode.Uri) {
            if (uri.path !== '/restore') { return; }

            const params = new URLSearchParams(uri.query);
            const token = params.get('token');
            if (!token) { return; }

            vscode.window.showInformationMessage('FlowSave: Fetching shared context...');

            try {
                const data = await apiClient.getSharedContext(token);

                // Parse open files
                let openFiles: Array<{ path: string; line: number }> = [];
                try { openFiles = JSON.parse(data.openFiles); } catch { /* ignore */ }

                if (openFiles.length === 0) {
                    vscode.window.showWarningMessage('FlowSave: No files to restore in this shared context.');
                    return;
                }

                // Open all files
                let restoredCount = 0;
                for (const file of openFiles) {
                    try {
                        const uri = vscode.Uri.file(file.path);
                        const doc = await vscode.workspace.openTextDocument(uri);
                        const editor = await vscode.window.showTextDocument(doc, { preview: false });
                        if (typeof file.line === 'number') {
                            const pos = new vscode.Position(file.line, 0);
                            editor.selection = new vscode.Selection(pos, pos);
                            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                        }
                        restoredCount++;
                    } catch {
                        // File might not exist on this machine — skip silently
                    }
                }

                if (restoredCount > 0) {
                    vscode.window.showInformationMessage(
                        `FlowSave: Restored "${data.label}" — ${restoredCount} file${restoredCount !== 1 ? 's' : ''} opened.`
                    );
                } else {
                    vscode.window.showWarningMessage(
                        'FlowSave: Context restored but no matching files were found on this machine. ' +
                        'Make sure you have the same project folder open.'
                    );
                }

            } catch (error) {
                vscode.window.showErrorMessage(
                    'FlowSave: Could not restore shared context. The link may have expired.'
                );
            }
        }
    });
    context.subscriptions.push(uriHandler);

    // Check and setup terminal tracking
    setTimeout(() => {
        checkAndInstallTerminalHook().catch(console.error);
    }, 3000);

    console.log('FlowSave extension activated');
}

export function deactivate() {
    // Cleanup if needed
}
