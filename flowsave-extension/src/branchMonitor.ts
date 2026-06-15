import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ApiClient, OpenFileInfo, AuthenticationError } from './apiClient';

/**
 * Monitors git branch changes in the workspace and auto-saves/restores context.
 *
 * Feature 1: Auto-Save on Branch Switch
 * - On branch switch away: silently saves context with label "Auto: {branch} — {date}"
 * - On branch switch to: checks branchContextMap and offers to restore if found
 */
export class BranchMonitor {
    private currentBranch: string | null = null;
    private readonly BRANCH_MAP_KEY = 'branchContextMap';

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly apiClient: ApiClient
    ) {}

    /**
     * Starts watching the git HEAD file for branch changes.
     */
    public async start(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) { return; }

        const repoRoot = workspaceFolders[0].uri.fsPath;
        const gitHeadPath = path.join(repoRoot, '.git', 'HEAD');

        if (!fs.existsSync(gitHeadPath)) { return; } // Not a git repo

        // Read initial branch
        this.currentBranch = this.readBranch(gitHeadPath);

        // Watch the .git/HEAD file — it changes on every branch switch
        const watcher = fs.watch(gitHeadPath, async () => {
            const newBranch = this.readBranch(gitHeadPath);
            if (newBranch && newBranch !== this.currentBranch) {
                const oldBranch = this.currentBranch;
                this.currentBranch = newBranch;
                await this.onBranchSwitch(oldBranch, newBranch);
            }
        });

        this.context.subscriptions.push({ dispose: () => watcher.close() });
    }

    private readBranch(headPath: string): string | null {
        try {
            const content = fs.readFileSync(headPath, 'utf-8').trim();
            // Format: "ref: refs/heads/main"
            if (content.startsWith('ref: refs/heads/')) {
                return content.replace('ref: refs/heads/', '');
            }
            return content.substring(0, 8); // detached HEAD — use short commit hash
        } catch {
            return null;
        }
    }

    private async onBranchSwitch(fromBranch: string | null, toBranch: string): Promise<void> {
        // ── Step 1: Auto-save context for the branch we're leaving ──────────
        if (fromBranch) {
            await this.autoSaveForBranch(fromBranch);
        }

        // ── Step 2: Check if there's a saved context for the branch we're entering ──
        await this.offerRestoreForBranch(toBranch);
    }

    private async autoSaveForBranch(branchName: string): Promise<void> {
        try {
            const isAuthenticated = await this.apiClient['authManager'].getToken();
            if (!isAuthenticated) { return; } // silently skip if not logged in

            const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const label = `Auto: ${branchName} — ${dateStr}`;

            // Gather open files
            const openFiles: OpenFileInfo[] = [];
            const seenPaths = new Set<string>();
            for (const group of vscode.window.tabGroups.all) {
                for (const tab of group.tabs) {
                    const input = tab.input as { uri?: vscode.Uri };
                    if (input?.uri && input.uri.scheme === 'file') {
                        const filePath = input.uri.fsPath;
                        if (!seenPaths.has(filePath)) {
                            seenPaths.add(filePath);
                            const visibleEditor = vscode.window.visibleTextEditors.find(e => e.document.fileName === filePath);
                            openFiles.push({ path: filePath, line: visibleEditor ? visibleEditor.selection.active.line : 0 });
                        }
                    }
                }
            }

            // Gather terminal history
            let terminalHistory: string | null = null;
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                const flowsaveHistory = '/tmp/flowsave_global_history.txt';
                if (fs.existsSync(flowsaveHistory) && workspaceFolder) {
                    const raw = fs.readFileSync(flowsaveHistory, 'utf-8');
                    const lines = raw.split('\n').filter(l => l.trim().length > 0);
                    const workspaceLines = lines
                        .filter(l => l.startsWith(workspaceFolder))
                        .map(l => { const parts = l.split('|:|'); return parts.length > 1 ? parts.slice(1).join('|:|').trim() : ''; })
                        .filter(l => l.length > 0);
                    if (workspaceLines.length > 0) { terminalHistory = workspaceLines.slice(-50).join('\n'); }
                }
            } catch { /* ignore */ }

            // Gather git diff
            let gitDiff: string | null = null;
            try {
                const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
                if (gitExtension) {
                    const git = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
                    const api = git.getAPI(1);
                    if (api.repositories.length > 0) {
                        gitDiff = await api.repositories[0].diff(true) || null;
                    }
                }
            } catch { /* ignore */ }

            const result = await this.apiClient.saveContext({
                label,
                openFiles: JSON.stringify(openFiles),
                gitDiff,
                terminalHistory,
                timestamp: new Date().toISOString(),
                autoSaved: true,
            });

            // Update branch context map
            const map = this.getBranchMap();
            map[branchName] = result.id;
            await this.context.globalState.update(this.BRANCH_MAP_KEY, JSON.stringify(map));

            // Silent status bar notification — no popup
            const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
            statusBar.text = `FlowSave: Context auto-saved for ${branchName}`;
            statusBar.show();
            setTimeout(() => { statusBar.dispose(); }, 3000);

        } catch (error) {
            if (error instanceof AuthenticationError) { return; } // not logged in, skip silently
            console.error('FlowSave auto-save failed:', error);
        }
    }

    private async offerRestoreForBranch(branchName: string): Promise<void> {
        try {
            const map = this.getBranchMap();
            const contextId = map[branchName];
            if (!contextId) { return; }

            const action = await vscode.window.showInformationMessage(
                `FlowSave: Restore context for ${branchName}?`,
                'Restore',
                'Dismiss'
            );

            if (action === 'Restore') {
                const { restoreContext } = await import('./contextRestore');
                const snapshot = await this.apiClient.getContext(contextId);
                await restoreContext(snapshot);
            }
        } catch (error) {
            console.error('FlowSave restore offer failed:', error);
        }
    }

    /**
     * Updates the branch context map after a manual save.
     * Called from contextCapture when the user manually saves.
     */
    public async updateBranchMap(contextId: string): Promise<void> {
        if (!this.currentBranch) { return; }
        const map = this.getBranchMap();
        map[this.currentBranch] = contextId;
        await this.context.globalState.update(this.BRANCH_MAP_KEY, JSON.stringify(map));
    }

    private getBranchMap(): Record<string, string> {
        try {
            const raw = this.context.globalState.get<string>(this.BRANCH_MAP_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
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
