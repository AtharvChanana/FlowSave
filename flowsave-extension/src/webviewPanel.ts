import * as vscode from 'vscode';
import { ApiClient, ContextSnapshot, AuthenticationError } from './apiClient';
import { AuthManager } from './authManager';
import { captureContext } from './contextCapture';
import { restoreContext } from './contextRestore';

/**
 * Sidebar webview provider for FlowSave.
 *
 * Renders three screens:
 *  1. Login / Register form
 *  2. Saved context list
 *  3. Restore detail / re-entry brief view
 */
export class FlowSaveWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'flowsave.webview';

    private view?: vscode.WebviewView;

    constructor(
        private readonly extensionContext: vscode.ExtensionContext,
        private readonly apiClient: ApiClient,
        private readonly authManager: AuthManager
    ) {}

    /**
     * Called by VS Code when the sidebar webview becomes visible.
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _resolveContext: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionContext.extensionUri],
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // ── Handle messages from the webview ────────────────────────────
        webviewView.webview.onDidReceiveMessage(
            async (message: WebviewMessage) => {
                switch (message.type) {
                    case 'login':
                        await this.handleLogin(message.email || '', message.password || '');
                        break;
                    case 'register':
                        await this.handleRegister(message.email || '', message.password || '');
                        break;
                    case 'logout':
                        await this.handleLogout();
                        break;
                    case 'listContexts':
                        await this.handleListContexts();
                        break;
                    case 'restoreContext':
                        await this.handleRestoreContext(message.id || '');
                        break;
                    case 'deleteContext':
                        await this.handleDeleteContext(message.id || '');
                        break;
                    case 'saveContext':
                        await this.handleSaveContext();
                        break;
                    case 'checkAuth':
                        await this.handleCheckAuth();
                        break;
                }
            },
            undefined,
            this.extensionContext.subscriptions
        );
    }

    /**
     * Programmatically navigate the webview to a specific screen.
     */
    public showScreen(screen: 'list' | 'restore'): void {
        this.postMessage({ type: 'navigate', screen });
    }

    // ── Message helpers ─────────────────────────────────────────────────

    private postMessage(message: Record<string, unknown>): void {
        this.view?.webview.postMessage(message);
    }

    // ── Handlers ────────────────────────────────────────────────────────

    private async handleCheckAuth(): Promise<void> {
        const authenticated = await this.authManager.isAuthenticated();
        this.postMessage({ type: 'authStatus', authenticated });
    }

    private async handleLogin(email: string, password: string): Promise<void> {
        try {
            await this.apiClient.login(email, password);
            this.postMessage({ type: 'authSuccess' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Login failed';
            this.postMessage({ type: 'authError', message: msg });
        }
    }

    private async handleRegister(email: string, password: string): Promise<void> {
        try {
            await this.apiClient.register(email, password);
            this.postMessage({ type: 'authSuccess' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Registration failed';
            this.postMessage({ type: 'authError', message: msg });
        }
    }

    private async handleLogout(): Promise<void> {
        await this.authManager.clearToken();
        this.postMessage({ type: 'loggedOut' });
    }

    private async handleListContexts(): Promise<void> {
        try {
            const contexts = await this.apiClient.listContexts();
            this.postMessage({ type: 'contextsList', contexts });
        } catch (error) {
            if (error instanceof AuthenticationError) {
                this.postMessage({ type: 'loggedOut' });
            } else {
                const msg = error instanceof Error ? error.message : 'Failed to load contexts';
                this.postMessage({ type: 'error', message: msg });
            }
        }
    }

    private async handleRestoreContext(id: string): Promise<void> {
        try {
            const snapshot = await this.apiClient.getContext(id);
            const result = await restoreContext(snapshot);
            this.postMessage({
                type: 'contextRestored',
                snapshot,
                restored: result.restored,
                skipped: result.skipped,
            });
        } catch (error) {
            if (error instanceof AuthenticationError) {
                this.postMessage({ type: 'loggedOut' });
            } else {
                const msg = error instanceof Error ? error.message : 'Failed to restore context';
                this.postMessage({ type: 'error', message: msg });
            }
        }
    }

    private async handleDeleteContext(id: string): Promise<void> {
        try {
            await this.apiClient.deleteContext(id);
            this.postMessage({ type: 'contextDeleted', id });
            // Refresh list
            await this.handleListContexts();
        } catch (error) {
            if (error instanceof AuthenticationError) {
                this.postMessage({ type: 'loggedOut' });
            } else {
                const msg = error instanceof Error ? error.message : 'Failed to delete context';
                this.postMessage({ type: 'error', message: msg });
            }
        }
    }

    private async handleSaveContext(): Promise<void> {
        await captureContext(this.extensionContext, this.apiClient);
        // After save, refresh the list
        await this.handleListContexts();
    }

    // ── HTML generation ─────────────────────────────────────────────────

    private getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none';
                   style-src ${webview.cspSource} 'nonce-${nonce}';
                   script-src 'nonce-${nonce}';" />
    <title>FlowSave</title>
    <style nonce="${nonce}">
        /* ── Reset & Base ────────────────────────────────────────── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            line-height: 1.5;
            overflow-x: hidden;
        }

        /* ── Screen container ────────────────────────────────────── */
        .screen {
            display: none;
            opacity: 0;
            transform: translateY(8px);
            transition: opacity 0.25s ease, transform 0.25s ease;
            padding: 16px 12px;
            min-height: 100vh;
        }
        .screen.active {
            display: block;
        }
        .screen.visible {
            opacity: 1;
            transform: translateY(0);
        }

        /* ── Header bar ──────────────────────────────────────────── */
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
        }
        .header h1 {
            font-size: 15px;
            font-weight: 600;
            letter-spacing: 0.3px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .header h1 .icon { font-size: 18px; }
        .header-actions { display: flex; gap: 6px; }

        /* ── Buttons ─────────────────────────────────────────────── */
        button {
            font-family: inherit;
            font-size: var(--vscode-font-size, 13px);
            cursor: pointer;
            border: none;
            border-radius: 4px;
            padding: 6px 14px;
            transition: background 0.15s ease, opacity 0.15s ease;
        }
        button:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 1px;
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background: transparent;
            color: var(--vscode-editor-foreground);
            border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.12));
        }
        .btn-secondary:hover:not(:disabled) {
            background: rgba(255,255,255,0.06);
        }

        .btn-danger {
            background: transparent;
            color: var(--vscode-errorForeground);
            border: 1px solid var(--vscode-errorForeground);
            font-size: 11px;
            padding: 4px 10px;
        }
        .btn-danger:hover:not(:disabled) {
            background: rgba(244,67,54,0.12);
        }

        .btn-icon {
            background: transparent;
            color: var(--vscode-editor-foreground);
            padding: 4px 8px;
            font-size: 16px;
            border-radius: 4px;
        }
        .btn-icon:hover:not(:disabled) {
            background: rgba(255,255,255,0.08);
        }

        .btn-link {
            background: none;
            color: var(--vscode-textLink-foreground);
            padding: 0;
            font-size: 12px;
            text-decoration: underline;
        }
        .btn-link:hover { opacity: 0.8; }

        .btn-full { width: 100%; }

        /* ── Inputs ──────────────────────────────────────────────── */
        .form-group {
            margin-bottom: 14px;
        }
        .form-group label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }
        input[type="text"],
        input[type="email"],
        input[type="password"] {
            width: 100%;
            padding: 7px 10px;
            font-family: inherit;
            font-size: var(--vscode-font-size, 13px);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.12));
            border-radius: 4px;
            outline: none;
            transition: border-color 0.15s ease;
        }
        input:focus {
            border-color: var(--vscode-focusBorder);
        }

        /* ── Cards ───────────────────────────────────────────────── */
        .card {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
            border-radius: 6px;
            padding: 14px;
            margin-bottom: 10px;
            transition: border-color 0.15s ease;
        }
        .card:hover {
            border-color: var(--vscode-focusBorder);
        }
        .card-label {
            font-weight: 600;
            font-size: 13px;
            margin-bottom: 4px;
            word-break: break-word;
        }
        .card-time {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }
        .card-brief {
            font-size: 12px;
            font-style: italic;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .card-actions {
            display: flex;
            gap: 8px;
        }

        /* ── Auth screen ─────────────────────────────────────────── */
        .auth-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            padding: 0 8px;
        }
        .auth-logo {
            font-size: 36px;
            margin-bottom: 8px;
        }
        .auth-title {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 4px;
        }
        .auth-subtitle {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 24px;
        }
        .auth-form {
            width: 100%;
            max-width: 320px;
        }
        .auth-toggle {
            text-align: center;
            margin-top: 16px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        /* ── Error / info messages ───────────────────────────────── */
        .msg-error {
            color: var(--vscode-errorForeground);
            font-size: 12px;
            margin-bottom: 10px;
            padding: 8px 10px;
            background: rgba(244,67,54,0.08);
            border-radius: 4px;
            display: none;
        }
        .msg-error.visible { display: block; }

        .msg-success {
            color: #4caf50;
            font-size: 12px;
            margin-bottom: 10px;
            padding: 8px 10px;
            background: rgba(76,175,80,0.08);
            border-radius: 4px;
        }

        /* ── Empty state ─────────────────────────────────────────── */
        .empty-state {
            text-align: center;
            padding: 40px 16px;
            color: var(--vscode-descriptionForeground);
        }
        .empty-state .empty-icon { font-size: 40px; margin-bottom: 12px; }
        .empty-state p { font-size: 12px; margin-bottom: 16px; }

        /* ── Detail / Brief screen ───────────────────────────────── */
        .detail-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 16px;
        }
        .detail-label {
            font-size: 15px;
            font-weight: 600;
        }
        .detail-time {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 16px;
        }
        .brief-section {
            margin-bottom: 16px;
        }
        .brief-section h3 {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }
        .brief-content {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
            border-radius: 6px;
            padding: 14px;
            font-size: 13px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .restore-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: var(--vscode-badge-background, rgba(76,175,80,0.15));
            color: #4caf50;
            font-size: 12px;
            font-weight: 500;
            padding: 4px 10px;
            border-radius: 12px;
            margin-bottom: 16px;
        }

        /* ── Spinner ─────────────────────────────────────────────── */
        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid var(--vscode-descriptionForeground);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
            vertical-align: middle;
            margin-right: 6px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .loading-overlay {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px 0;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        /* ── Scrollbar styling ───────────────────────────────────── */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
    </style>
</head>
<body>

    <!-- ═══════════════ AUTH SCREEN ═══════════════ -->
    <div id="screen-auth" class="screen">
        <div class="auth-container">
            <div class="auth-logo">🔖</div>
            <div class="auth-title">FlowSave</div>
            <div class="auth-subtitle">Save &amp; restore your dev context</div>

            <form class="auth-form" id="auth-form">
                <div id="auth-error" class="msg-error"></div>

                <div class="form-group">
                    <label for="auth-email">Email</label>
                    <input type="email" id="auth-email" placeholder="you@example.com" required />
                </div>

                <div class="form-group">
                    <label for="auth-password">Password</label>
                    <input type="password" id="auth-password" placeholder="••••••••" required minlength="6" />
                </div>

                <button type="submit" class="btn-primary btn-full" id="auth-submit">
                    Log In
                </button>
            </form>

            <div class="auth-toggle">
                <span id="auth-toggle-text">Don't have an account?</span>
                <button type="button" class="btn-link" id="auth-toggle-btn">Register</button>
            </div>
        </div>
    </div>

    <!-- ═══════════════ LIST SCREEN ═══════════════ -->
    <div id="screen-list" class="screen">
        <div class="header">
            <h1><span class="icon">🔖</span> FlowSave</h1>
            <div class="header-actions">
                <button class="btn-icon" id="btn-save" title="Save current context">💾</button>
                <button class="btn-icon" id="btn-refresh" title="Refresh list">🔄</button>
                <button class="btn-icon" id="btn-logout" title="Log out">⏻</button>
            </div>
        </div>
        <div id="list-error" class="msg-error"></div>
        <div id="list-loading" class="loading-overlay" style="display:none;">
            <span class="spinner"></span> Loading contexts…
        </div>
        <div id="context-list"></div>
    </div>

    <!-- ═══════════════ DETAIL SCREEN ═══════════════ -->
    <div id="screen-detail" class="screen">
        <div class="detail-header">
            <button class="btn-icon" id="btn-back" title="Back to list">←</button>
            <span class="detail-label" id="detail-label"></span>
        </div>
        <div class="detail-time" id="detail-time"></div>
        <div id="detail-restore-badge"></div>

        <div class="brief-section">
            <h3>Re-entry Brief</h3>
            <div class="brief-content" id="detail-brief"></div>
        </div>

        <div class="brief-section" id="detail-diff-section" style="display:none;">
            <h3>Git Diff Summary</h3>
            <div class="brief-content" id="detail-diff"></div>
        </div>

        <div class="brief-section" id="detail-files-section" style="display:none;">
            <h3>Open Files</h3>
            <div class="brief-content" id="detail-files"></div>
        </div>
    </div>

    <!-- ═══════════════ SCRIPT ═══════════════ -->
    <script nonce="${nonce}">
    (function() {
        const vscode = acquireVsCodeApi();

        // ── State ───────────────────────────────────────────────────
        let authMode = 'login'; // 'login' | 'register'
        let contexts = [];
        let currentSnapshot = null;

        // ── DOM refs ────────────────────────────────────────────────
        const screenAuth   = document.getElementById('screen-auth');
        const screenList   = document.getElementById('screen-list');
        const screenDetail = document.getElementById('screen-detail');
        const screens = [screenAuth, screenList, screenDetail];

        const authForm      = document.getElementById('auth-form');
        const authEmail     = document.getElementById('auth-email');
        const authPassword  = document.getElementById('auth-password');
        const authSubmit    = document.getElementById('auth-submit');
        const authError     = document.getElementById('auth-error');
        const authToggleBtn = document.getElementById('auth-toggle-btn');
        const authToggleText= document.getElementById('auth-toggle-text');

        const contextList = document.getElementById('context-list');
        const listLoading = document.getElementById('list-loading');
        const listError   = document.getElementById('list-error');

        const detailLabel = document.getElementById('detail-label');
        const detailTime  = document.getElementById('detail-time');
        const detailBrief = document.getElementById('detail-brief');
        const detailDiff  = document.getElementById('detail-diff');
        const detailDiffSection = document.getElementById('detail-diff-section');
        const detailFiles = document.getElementById('detail-files');
        const detailFilesSection = document.getElementById('detail-files-section');
        const detailRestoreBadge = document.getElementById('detail-restore-badge');

        // ── Screen management ───────────────────────────────────────
        function showScreen(id) {
            screens.forEach(s => {
                s.classList.remove('active', 'visible');
            });
            const target = document.getElementById('screen-' + id);
            target.classList.add('active');
            // trigger reflow for animation
            void target.offsetWidth;
            requestAnimationFrame(() => target.classList.add('visible'));
        }

        // ── Auth toggle ─────────────────────────────────────────────
        authToggleBtn.addEventListener('click', () => {
            authMode = authMode === 'login' ? 'register' : 'login';
            authSubmit.textContent = authMode === 'login' ? 'Log In' : 'Create Account';
            authToggleBtn.textContent = authMode === 'login' ? 'Register' : 'Log In';
            authToggleText.textContent = authMode === 'login'
                ? "Don't have an account?"
                : 'Already have an account?';
            hideError(authError);
        });

        // ── Auth form submit ────────────────────────────────────────
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = authEmail.value.trim();
            const password = authPassword.value;
            if (!email || !password) return;

            setLoading(authSubmit, true);
            hideError(authError);

            vscode.postMessage({
                type: authMode,
                email,
                password,
            });
        });

        // ── List actions ────────────────────────────────────────────
        document.getElementById('btn-save').addEventListener('click', () => {
            vscode.postMessage({ type: 'saveContext' });
        });
        document.getElementById('btn-refresh').addEventListener('click', () => {
            loadContexts();
        });
        document.getElementById('btn-logout').addEventListener('click', () => {
            vscode.postMessage({ type: 'logout' });
        });
        document.getElementById('btn-back').addEventListener('click', () => {
            showScreen('list');
        });

        // ── Render context cards ────────────────────────────────────
        function renderContexts(list) {
            contexts = list;
            contextList.innerHTML = '';
            listLoading.style.display = 'none';

            if (!list || list.length === 0) {
                contextList.innerHTML =
                    '<div class="empty-state">' +
                        '<div class="empty-icon">📂</div>' +
                        '<p>No saved contexts yet.<br/>Click 💾 to save your first context.</p>' +
                        '<button class="btn-primary" id="btn-empty-save">Save Context</button>' +
                    '</div>';
                const emptyBtn = document.getElementById('btn-empty-save');
                if (emptyBtn) {
                    emptyBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'saveContext' });
                    });
                }
                return;
            }

            list.forEach((ctx) => {
                const card = document.createElement('div');
                card.className = 'card';

                const briefPreview = ctx.brief
                    ? ctx.brief.split('\\n')[0].substring(0, 120)
                    : 'No brief available';

                card.innerHTML =
                    '<div class="card-label">' + escapeHtml(ctx.label) + '</div>' +
                    '<div class="card-time">' + formatTime(ctx.timestamp) + '</div>' +
                    '<div class="card-brief">' + escapeHtml(briefPreview) + '</div>' +
                    '<div class="card-actions">' +
                        '<button class="btn-primary btn-restore" data-id="' + escapeAttr(ctx.id) + '">Restore</button>' +
                        '<button class="btn-danger btn-delete" data-id="' + escapeAttr(ctx.id) + '">Delete</button>' +
                    '</div>';

                contextList.appendChild(card);
            });

            // Attach event listeners
            contextList.querySelectorAll('.btn-restore').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    btn.disabled = true;
                    btn.textContent = '⏳';
                    vscode.postMessage({ type: 'restoreContext', id });
                });
            });
            contextList.querySelectorAll('.btn-delete').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    btn.disabled = true;
                    btn.textContent = '…';
                    vscode.postMessage({ type: 'deleteContext', id });
                });
            });
        }

        // ── Show detail screen ──────────────────────────────────────
        function showDetail(snapshot, restored, skipped) {
            currentSnapshot = snapshot;
            detailLabel.textContent = snapshot.label;
            detailTime.textContent = formatTime(snapshot.timestamp);
            detailBrief.textContent = snapshot.brief || 'No re-entry brief generated.';

            // Restore badge
            if (restored !== undefined) {
                detailRestoreBadge.innerHTML =
                    '<div class="restore-badge">✓ ' + restored + ' file(s) restored' +
                    (skipped && skipped.length > 0 ? ', ' + skipped.length + ' skipped' : '') +
                    '</div>';
            } else {
                detailRestoreBadge.innerHTML = '';
            }

            // Git diff
            if (snapshot.gitDiff) {
                detailDiffSection.style.display = 'block';
                detailDiff.textContent = snapshot.gitDiff.substring(0, 3000);
            } else {
                detailDiffSection.style.display = 'none';
            }

            // Open files
            try {
                const files = JSON.parse(snapshot.openFiles);
                if (files && files.length > 0) {
                    detailFilesSection.style.display = 'block';
                    detailFiles.textContent = files.map(f =>
                        f.path.split('/').pop() + ' (line ' + f.line + ')'
                    ).join('\\n');
                } else {
                    detailFilesSection.style.display = 'none';
                }
            } catch(e) {
                detailFilesSection.style.display = 'none';
            }

            showScreen('detail');
        }

        // ── Load contexts ───────────────────────────────────────────
        function loadContexts() {
            hideError(listError);
            contextList.innerHTML = '';
            listLoading.style.display = 'flex';
            vscode.postMessage({ type: 'listContexts' });
        }

        // ── Utilities ───────────────────────────────────────────────
        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
        function escapeAttr(str) {
            return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
        function formatTime(iso) {
            try {
                const d = new Date(iso);
                return d.toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric'
                }) + ' at ' + d.toLocaleTimeString(undefined, {
                    hour: '2-digit', minute: '2-digit'
                });
            } catch(e) {
                return iso;
            }
        }
        function setLoading(btn, loading) {
            btn.disabled = loading;
            if (loading) {
                btn.dataset.originalText = btn.textContent;
                btn.innerHTML = '<span class="spinner"></span> ' + btn.dataset.originalText;
            } else {
                btn.textContent = btn.dataset.originalText || btn.textContent;
            }
        }
        function showError(el, msg) {
            el.textContent = msg;
            el.classList.add('visible');
        }
        function hideError(el) {
            el.textContent = '';
            el.classList.remove('visible');
        }

        // ── Handle messages from extension ──────────────────────────
        window.addEventListener('message', (event) => {
            const msg = event.data;

            switch(msg.type) {
                case 'authStatus':
                    if (msg.authenticated) {
                        showScreen('list');
                        loadContexts();
                    } else {
                        showScreen('auth');
                    }
                    break;

                case 'authSuccess':
                    setLoading(authSubmit, false);
                    hideError(authError);
                    authForm.reset();
                    showScreen('list');
                    loadContexts();
                    break;

                case 'authError':
                    setLoading(authSubmit, false);
                    showError(authError, msg.message);
                    break;

                case 'loggedOut':
                    showScreen('auth');
                    break;

                case 'contextsList':
                    renderContexts(msg.contexts);
                    break;

                case 'contextRestored':
                    showDetail(msg.snapshot, msg.restored, msg.skipped);
                    break;

                case 'contextDeleted':
                    // list will be refreshed by extension
                    break;

                case 'error':
                    listLoading.style.display = 'none';
                    showError(listError, msg.message);
                    break;

                case 'navigate':
                    if (msg.screen === 'list') {
                        showScreen('list');
                        loadContexts();
                    } else if (msg.screen === 'restore') {
                        showScreen('list');
                        loadContexts();
                    }
                    break;
            }
        });

        // ── Init: check auth status on load ─────────────────────────
        vscode.postMessage({ type: 'checkAuth' });

    })();
    </script>
</body>
</html>`;
    }
}

// ── Message types ───────────────────────────────────────────────────────

interface WebviewMessage {
    type: string;
    email?: string;
    password?: string;
    id?: string;
    [key: string]: unknown;
}

// ── Utilities ───────────────────────────────────────────────────────────

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
