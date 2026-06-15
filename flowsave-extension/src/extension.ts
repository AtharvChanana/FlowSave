import * as vscode from 'vscode';
import { AuthManager } from './authManager';
import { ApiClient } from './apiClient';
import { captureContext } from './contextCapture';
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

    // Feature 1: Start branch monitor
    const branchMonitor = new BranchMonitor(context, apiClient);
    branchMonitor.start().catch(console.error);

    // Expose branchMonitor on webviewProvider so contextCapture can update the map
    webviewProvider.setBranchMonitor(branchMonitor);

    // Check and setup terminal tracking
    setTimeout(() => {
        checkAndInstallTerminalHook().catch(console.error);
    }, 3000);

    console.log('FlowSave extension activated');
}

export function deactivate() {
    // Cleanup if needed
}
