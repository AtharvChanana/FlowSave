import * as vscode from 'vscode';
import { ApiClient, ContextSnapshot, AuthenticationError } from './apiClient';
import { AuthManager } from './authManager';
import { captureContext } from './contextCapture';
import { restoreContext } from './contextRestore';

/**
 * Sidebar webview provider for FlowSave.
 */
export class FlowSaveWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'flowsave.webview';

    private view?: vscode.WebviewView;

    constructor(
        private readonly extensionContext: vscode.ExtensionContext,
        private readonly apiClient: ApiClient,
        private readonly authManager: AuthManager
    ) {}

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
                    case 'shareContext':
                        await this.handleShareContext(message.id || '');
                        break;
                    case 'exportPR':
                        await this.handleExportPR(message.id || '');
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

    public showScreen(screen: 'list' | 'restore'): void {
        this.postMessage({ type: 'navigate', screen });
    }

    private _branchMonitor?: import('./branchMonitor').BranchMonitor;

    public setBranchMonitor(monitor: import('./branchMonitor').BranchMonitor): void {
        this._branchMonitor = monitor;
    }

    private postMessage(message: Record<string, unknown>): void {
        this.view?.webview.postMessage(message);
    }

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
        await this.handleListContexts();
    }

    private async handleShareContext(id: string): Promise<void> {
        try {
            const result = await this.apiClient.shareContext(id);
            this.postMessage({ type: 'shareResult', id, shareUrl: result.shareUrl });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to share context';
            vscode.window.showErrorMessage(`FlowSave: ${msg}`);
            this.postMessage({ type: 'shareError', id });
        }
    }

    private async handleExportPR(id: string): Promise<void> {
        try {
            const result = await this.apiClient.exportPR(id);
            this.postMessage({ type: 'prDescription', id, prDescription: result.prDescription });
        } catch (error) {
            vscode.window.showErrorMessage('FlowSave: Failed to generate PR description. Try again.');
            this.postMessage({ type: 'prError', id });
        }
    }

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
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
            font-size: 13px;
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background, var(--vscode-editor-background));
            line-height: 1.5;
        }

        .screen { display: none; }
        .screen.active { display: block; }

        /* ── Header ── */
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px 7px;
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border));
            background: var(--vscode-sideBarSectionHeader-background, transparent);
            position: sticky;
            top: 0;
            z-index: 10;
        }
        .header-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            opacity: 0.6;
        }
        .header-actions { display: flex; gap: 1px; }
        .header-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            padding: 3px 7px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            font-family: inherit;
            opacity: 0.55;
        }
        .header-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
        .header-btn:focus-visible { outline: 1px solid var(--vscode-focusBorder); }

        /* ── Buttons ── */
        button {
            font-family: inherit;
            font-size: 12px;
            cursor: pointer;
            border-radius: 2px;
            border: none;
            padding: 5px 12px;
            transition: opacity 0.1s, background 0.1s;
        }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
        button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }

        .btn-danger {
            background: transparent;
            color: var(--vscode-errorForeground, #f48771);
            border: 1px solid currentColor;
            opacity: 0.75;
        }
        .btn-danger:hover:not(:disabled) { opacity: 1; }

        .btn-link {
            background: transparent;
            color: var(--vscode-textLink-foreground);
            padding: 0;
            text-decoration: underline;
            font-size: 12px;
            border: none;
        }

        /* ── Auth ── */
        .auth-wrap { padding: 28px 18px; }
        .auth-logo {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            opacity: 0.4;
            margin-bottom: 18px;
        }
        .auth-heading { font-size: 17px; font-weight: 600; margin-bottom: 4px; }
        .auth-sub { font-size: 12px; opacity: 0.5; margin-bottom: 22px; }

        .form-group { margin-bottom: 11px; }
        .form-group label {
            display: block;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            opacity: 0.55;
            margin-bottom: 4px;
        }
        input[type="email"],
        input[type="password"] {
            width: 100%;
            padding: 6px 8px;
            font-family: inherit;
            font-size: 13px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
            border-radius: 2px;
            outline: none;
        }
        input:focus { border-color: var(--vscode-focusBorder); }

        .btn-block { width: 100%; margin-top: 6px; padding: 7px; }
        .auth-footer { margin-top: 14px; font-size: 12px; opacity: 0.55; }

        .msg-error {
            font-size: 12px;
            color: var(--vscode-inputValidation-errorForeground, #f48771);
            background: var(--vscode-inputValidation-errorBackground, rgba(244,71,71,0.08));
            border: 1px solid var(--vscode-inputValidation-errorBorder, rgba(244,71,71,0.3));
            border-radius: 2px;
            padding: 6px 8px;
            margin-bottom: 10px;
            display: none;
        }
        .msg-error.visible { display: block; }

        /* ── Context list ── */
        .empty-state {
            padding: 44px 18px;
            text-align: center;
        }
        .empty-label { font-size: 12px; opacity: 0.45; margin-bottom: 14px; }

        /* ── Context card ── */
        .ctx-card {
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,0.15));
        }
        .ctx-card:last-child { border-bottom: none; }

        .ctx-summary {
            display: flex;
            align-items: flex-start;
            gap: 9px;
            padding: 10px 12px;
            cursor: pointer;
            user-select: none;
        }
        .ctx-summary:hover { background: var(--vscode-list-hoverBackground); }
        .ctx-card.open .ctx-summary {
            background: var(--vscode-list-inactiveSelectionBackground, rgba(128,128,128,0.08));
        }

        .ctx-bar {
            width: 2px;
            min-height: 38px;
            border-radius: 1px;
            background: var(--vscode-button-background);
            flex-shrink: 0;
            margin-top: 1px;
            opacity: 0;
            transition: opacity 0.15s;
        }
        .ctx-card:hover .ctx-bar,
        .ctx-card.open .ctx-bar { opacity: 1; }

        .ctx-body { flex: 1; min-width: 0; }
        .ctx-label {
            font-size: 13px;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .ctx-meta {
            font-size: 11px;
            opacity: 0.45;
            margin-top: 1px;
        }
        .ctx-preview {
            font-size: 11px;
            opacity: 0.55;
            margin-top: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .ctx-arrow {
            font-size: 9px;
            opacity: 0.3;
            flex-shrink: 0;
            margin-top: 3px;
            transition: transform 0.15s;
        }
        .ctx-card.open .ctx-arrow { transform: rotate(90deg); opacity: 0.6; }

        /* ── Expanded panel ── */
        .ctx-panel {
            display: none;
            padding: 0 12px 14px 23px;
            border-top: 1px solid rgba(128,128,128,0.1);
        }
        .ctx-card.open .ctx-panel { display: block; }

        .section {
            margin-top: 13px;
        }
        .section-heading {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            opacity: 0.4;
            margin-bottom: 6px;
        }

        /* Files */
        .file-list { list-style: none; }
        .file-row {
            display: flex;
            align-items: baseline;
            gap: 7px;
            padding: 2px 0;
        }
        .file-dot {
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: var(--vscode-button-background);
            opacity: 0.5;
            flex-shrink: 0;
            margin-top: 1px;
        }
        .file-name {
            font-size: 12px;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            font-weight: 600;
        }
        .file-parent {
            font-size: 11px;
            opacity: 0.4;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
        }
        .file-line-num {
            font-size: 11px;
            opacity: 0.35;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            margin-left: auto;
            flex-shrink: 0;
        }

        /* Brief */
        .brief-block { font-size: 12px; line-height: 1.65; }
        .brief-h {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            opacity: 0.45;
            margin-top: 9px;
            margin-bottom: 2px;
        }
        .brief-h:first-child { margin-top: 0; }
        .brief-p { opacity: 0.85; }

        /* Terminal */
        .terminal-block {
            background: var(--vscode-terminal-background, var(--vscode-editor-background));
            border: 1px solid rgba(128,128,128,0.15);
            border-radius: 3px;
            padding: 7px 9px;
            font-size: 11px;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            max-height: 110px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
            line-height: 1.5;
            opacity: 0.8;
        }

        /* Diff */
        .diff-block {
            background: var(--vscode-editor-background);
            border: 1px solid rgba(128,128,128,0.15);
            border-radius: 3px;
            padding: 7px 9px;
            font-size: 11px;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            max-height: 90px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
            line-height: 1.5;
            opacity: 0.7;
        }

        .actions {
            display: flex;
            gap: 6px;
            margin-top: 13px;
        }

        /* ── Spinner / Loading ── */
        .spinner {
            display: inline-block;
            width: 11px;
            height: 11px;
            border: 1.5px solid currentColor;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.55s linear infinite;
            vertical-align: middle;
            margin-right: 5px;
            opacity: 0.5;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .loading-row {
            padding: 20px 12px;
            font-size: 12px;
            opacity: 0.45;
            display: flex;
            align-items: center;
        }

        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.25); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.4); }

        /* ── Auto badge (Feature 1) ── */
        .auto-badge {
            display: inline-block;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            background: rgba(128,128,128,0.18);
            color: var(--vscode-foreground);
            opacity: 0.5;
            border-radius: 2px;
            padding: 1px 5px;
            margin-left: 6px;
            vertical-align: middle;
            flex-shrink: 0;
        }

        /* ── Share URL row (Feature 2) ── */
        .share-url-row {
            display: none;
            align-items: center;
            gap: 6px;
            margin-top: 8px;
        }
        .share-url-row.visible { display: flex; }
        .share-url-input {
            flex: 1;
            padding: 4px 7px;
            font-size: 11px;
            font-family: var(--vscode-editor-font-family, monospace);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
            border-radius: 2px;
            outline: none;
            min-width: 0;
        }

        /* ── PR Description screen (Feature 3) ── */
        .pr-wrap { padding: 12px; }
        .pr-heading { font-size: 14px; font-weight: 700; margin-bottom: 3px; }
        .pr-subheading { font-size: 11px; opacity: 0.45; margin-bottom: 14px; }
        .pr-textarea {
            width: 100%;
            min-height: 320px;
            padding: 10px;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            font-size: 12px;
            line-height: 1.6;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            border: 1px solid rgba(128,128,128,0.2);
            border-radius: 3px;
            resize: vertical;
            outline: none;
            margin-bottom: 10px;
        }
        .pr-actions { display: flex; gap: 8px; }
    </style>
</head>
<body>

<!-- AUTH -->
<div id="screen-auth" class="screen">
    <div class="auth-wrap">
        <div class="auth-logo">FlowSave</div>
        <div class="auth-heading" id="auth-heading">Sign in</div>
        <div class="auth-sub">Save and restore your development context</div>
        <form id="auth-form">
            <div id="auth-error" class="msg-error"></div>
            <div class="form-group">
                <label for="auth-email">Email</label>
                <input type="email" id="auth-email" placeholder="you@example.com" required />
            </div>
            <div class="form-group">
                <label for="auth-password">Password</label>
                <input type="password" id="auth-password" placeholder="Password" required />
            </div>
            <button type="submit" class="btn-primary btn-block" id="auth-submit">Sign in</button>
        </form>
        <div class="auth-footer">
            <span id="auth-toggle-text">Don't have an account?</span>
            <button type="button" class="btn-link" id="auth-toggle-btn" style="margin-left:5px;">Register</button>
        </div>
    </div>
</div>

<!-- LIST -->
<div id="screen-list" class="screen">
    <div class="header">
        <span class="header-title">FlowSave</span>
        <div class="header-actions">
            <button class="header-btn" id="btn-save">Save</button>
            <button class="header-btn" id="btn-refresh">Refresh</button>
            <button class="header-btn" id="btn-logout">Logout</button>
        </div>
    </div>
    <div id="list-error" class="msg-error" style="margin:8px 12px;"></div>
    <div id="context-list"></div>
</div>

<!-- PR DESCRIPTION (Feature 3) -->
<div id="screen-pr" class="screen">
    <div class="header">
        <span class="header-title">PR Description</span>
        <div class="header-actions">
            <button class="header-btn" id="btn-pr-back">Back</button>
        </div>
    </div>
    <div class="pr-wrap">
        <div class="pr-subheading" id="pr-subheading">Generated from: —</div>
        <textarea class="pr-textarea" id="pr-textarea" readonly></textarea>
        <div class="pr-actions">
            <button class="btn-primary" id="btn-pr-copy">Copy to Clipboard</button>
        </div>
    </div>
</div>

<script nonce="${nonce}">
(function() {
    const vscode = acquireVsCodeApi();
    let authMode = 'login';
    let prContextLabel = '';

    const screenAuth    = document.getElementById('screen-auth');
    const screenList    = document.getElementById('screen-list');
    const screenPr      = document.getElementById('screen-pr');
    const authForm      = document.getElementById('auth-form');
    const authEmail     = document.getElementById('auth-email');
    const authPassword  = document.getElementById('auth-password');
    const authSubmit    = document.getElementById('auth-submit');
    const authError     = document.getElementById('auth-error');
    const authHeading   = document.getElementById('auth-heading');
    const authToggleBtn = document.getElementById('auth-toggle-btn');
    const authToggleText= document.getElementById('auth-toggle-text');
    const contextList   = document.getElementById('context-list');
    const listError     = document.getElementById('list-error');
    const prTextarea    = document.getElementById('pr-textarea');
    const prSubheading  = document.getElementById('pr-subheading');
    const btnPrCopy     = document.getElementById('btn-pr-copy');
    const btnPrBack     = document.getElementById('btn-pr-back');

    btnPrBack.addEventListener('click', () => showScreen('list'));
    btnPrCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(prTextarea.value).catch(() => {});
        btnPrCopy.textContent = 'Copied';
        setTimeout(() => { btnPrCopy.textContent = 'Copy to Clipboard'; }, 2000);
    });

    function showScreen(id) {
        [screenAuth, screenList, screenPr].forEach(s => s.classList.remove('active'));
        document.getElementById('screen-' + id).classList.add('active');
    }

    // Auth toggle
    authToggleBtn.addEventListener('click', () => {
        authMode = authMode === 'login' ? 'register' : 'login';
        authHeading.textContent    = authMode === 'login' ? 'Sign in' : 'Create account';
        authSubmit.textContent     = authMode === 'login' ? 'Sign in' : 'Create account';
        authToggleBtn.textContent  = authMode === 'login' ? 'Register' : 'Sign in';
        authToggleText.textContent = authMode === 'login' ? "Don't have an account?" : 'Already have an account?';
        hideErr(authError);
    });

    authForm.addEventListener('submit', e => {
        e.preventDefault();
        const email    = authEmail.value.trim();
        const password = authPassword.value;
        if (!email || !password) { return; }
        setLoading(authSubmit, true);
        hideErr(authError);
        vscode.postMessage({ type: authMode, email, password });
    });

    document.getElementById('btn-save').addEventListener('click', () => vscode.postMessage({ type: 'saveContext' }));
    document.getElementById('btn-refresh').addEventListener('click', loadContexts);
    document.getElementById('btn-logout').addEventListener('click', () => vscode.postMessage({ type: 'logout' }));

    // ── Render contexts ──────────────────────────────────────────
    function renderContexts(list) {
        contextList.innerHTML = '';
        hideErr(listError);

        if (!list || list.length === 0) {
            contextList.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-label">No saved contexts yet.</div>' +
                    '<button class="btn-primary" id="btn-save-empty">Save current context</button>' +
                '</div>';
            const b = document.getElementById('btn-save-empty');
            if (b) { b.addEventListener('click', () => vscode.postMessage({ type: 'saveContext' })); }
            return;
        }

        list.forEach(ctx => {
            const card = document.createElement('div');
            card.className = 'ctx-card';

            // ── Compute data ──
            let fileCount = 0, fileRows = '';
            try {
                const files = JSON.parse(ctx.openFiles || '[]');
                fileCount = files.length;
                fileRows = files.map(f => {
                    const segs = f.path.split('/');
                    const name   = segs.pop() || f.path;
                    const parent = segs.pop() || '';
                    const lineNum = f.line ? 'L' + (f.line + 1) : '';
                    return '<li class="file-row">' +
                        '<span class="file-dot"></span>' +
                        '<span class="file-name">' + esc(name) + '</span>' +
                        (parent ? '<span class="file-parent">' + esc(parent) + '</span>' : '') +
                        (lineNum ? '<span class="file-line-num">' + lineNum + '</span>' : '') +
                    '</li>';
                }).join('');
            } catch(e) {}

            // Brief: parse **Section:** markers
            let briefHtml = '';
            if (ctx.reentryBrief) {
                // Split into lines; detect **Header:** lines
                const rawBrief = ctx.reentryBrief.replace(/\\n/g, '\\n');
                const lines = rawBrief.split(/\\n|\\\\n/);
                let html = '';
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed) { return; }
                    const hMatch = trimmed.match(/^\\*\\*(.+?)\\*\\*:?\\s*(.*)/);
                    if (hMatch) {
                        html += '<div class="brief-h">' + esc(hMatch[1]) + '</div>';
                        if (hMatch[2]) { html += '<div class="brief-p">' + esc(hMatch[2]) + '</div>'; }
                    } else {
                        html += '<div class="brief-p">' + esc(trimmed) + '</div>';
                    }
                });
                briefHtml = html;
            }

            // Preview: strip markdown
            const previewText = ctx.reentryBrief
                ? ctx.reentryBrief.replace(/\\*\\*[^*]+\\*\\*/g, '').replace(/\\n|\\\\n/g, ' ').trim().substring(0, 85)
                : '';

            // Terminal section
            const terminalHtml = ctx.terminalHistory
                ? '<div class="section">' +
                    '<div class="section-heading">Terminal commands</div>' +
                    '<div class="terminal-block">' + esc(ctx.terminalHistory) + '</div>' +
                  '</div>'
                : '';

            // Diff section
            const diffHtml = ctx.gitDiff
                ? '<div class="section">' +
                    '<div class="section-heading">Git diff</div>' +
                    '<div class="diff-block">' + esc(ctx.gitDiff.substring(0, 500)) + (ctx.gitDiff.length > 500 ? '\\n...' : '') + '</div>' +
                  '</div>'
                : '';

            card.innerHTML =
                '<div class="ctx-summary">' +
                    '<div class="ctx-bar"></div>' +
                    '<div class="ctx-body">' +
                        '<div class="ctx-label">' + esc(ctx.label) +
                            (ctx.autoSaved ? '<span class="auto-badge">Auto</span>' : '') +
                        '</div>' +
                        '<div class="ctx-meta">' + fmtTime(ctx.createdAt) + '  &middot;  ' + fileCount + ' file' + (fileCount !== 1 ? 's' : '') + '</div>' +
                        (previewText ? '<div class="ctx-preview">' + esc(previewText) + '</div>' : '') +
                    '</div>' +
                    '<div class="ctx-arrow">&#9658;</div>' +
                '</div>' +
                '<div class="ctx-panel">' +
                    // Open files
                    '<div class="section">' +
                        '<div class="section-heading">Open files</div>' +
                        '<ul class="file-list">' + fileRows + '</ul>' +
                    '</div>' +
                    // Re-entry brief
                    (briefHtml ? '<div class="section"><div class="section-heading">Re-entry brief</div><div class="brief-block">' + briefHtml + '</div></div>' : '') +
                    // Terminal
                    terminalHtml +
                    // Diff
                    diffHtml +
                    // Actions
                    '<div class="actions">' +
                        '<button class="btn-primary btn-restore" data-id="' + ctx.id + '">Restore</button>' +
                        '<button class="btn-secondary btn-share" data-id="' + ctx.id + '">Share</button>' +
                        '<button class="btn-danger btn-delete" data-id="' + ctx.id + '">Delete</button>' +
                    '</div>' +
                    // Share URL row (hidden until share clicked)
                    '<div class="share-url-row" id="share-row-' + ctx.id + '">' +
                        '<input class="share-url-input" id="share-input-' + ctx.id + '" readonly />' +
                        '<button class="btn-secondary btn-copy-link" data-id="' + ctx.id + '">Copy Link</button>' +
                    '</div>' +
                    // Export PR button
                    '<div class="actions" style="margin-top:6px;">' +
                        '<button class="btn-secondary btn-export-pr" data-id="' + ctx.id + '" data-label="' + esc(ctx.label) + '">Export PR</button>' +
                    '</div>' +
                '</div>';

            // Toggle open/close
            card.querySelector('.ctx-summary').addEventListener('click', () => {
                const isOpen = card.classList.contains('open');
                document.querySelectorAll('.ctx-card.open').forEach(c => c.classList.remove('open'));
                if (!isOpen) { card.classList.add('open'); }
            });

            contextList.appendChild(card);
        });

        // Restore buttons
        contextList.querySelectorAll('.btn-restore').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner"></span>Restoring...';
                vscode.postMessage({ type: 'restoreContext', id: btn.getAttribute('data-id') });
            });
        });
        // Delete buttons
        contextList.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                btn.disabled = true;
                btn.textContent = 'Deleting...';
                vscode.postMessage({ type: 'deleteContext', id: btn.getAttribute('data-id') });
            });
        });
        // Share buttons (Feature 2)
        contextList.querySelectorAll('.btn-share').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner"></span>Sharing...';
                vscode.postMessage({ type: 'shareContext', id: btn.getAttribute('data-id') });
            });
        });
        // Copy link buttons (Feature 2)
        contextList.querySelectorAll('.btn-copy-link').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const input = document.getElementById('share-input-' + id);
                if (input) {
                    navigator.clipboard.writeText(input.value).catch(() => {});
                    btn.textContent = 'Copied';
                    setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
                }
            });
        });
        // Export PR buttons (Feature 3)
        contextList.querySelectorAll('.btn-export-pr').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner"></span>Generating...';
                vscode.postMessage({ type: 'exportPR', id: btn.getAttribute('data-id') });
                prContextLabel = btn.getAttribute('data-label') || '';
            });
        });
    }

    function loadContexts() {
        contextList.innerHTML = '<div class="loading-row"><span class="spinner"></span>Loading contexts...</div>';
        hideErr(listError);
        vscode.postMessage({ type: 'listContexts' });
    }

    // ── Utilities ────────────────────────────────────────────────
    function esc(str) {
        if (!str) { return ''; }
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
    function fmtTime(iso) {
        try {
            const d = new Date(iso);
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
                   ' at ' +
                   d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        } catch(e) { return iso || ''; }
    }
    function setLoading(btn, on) {
        btn.disabled = on;
        if (on) {
            btn.dataset.txt = btn.textContent;
            btn.innerHTML = '<span class="spinner"></span>' + btn.dataset.txt;
        } else {
            btn.textContent = btn.dataset.txt || btn.textContent;
        }
    }
    function showErr(el, msg) { if (!el) { return; } el.textContent = msg; el.classList.add('visible'); }
    function hideErr(el) { if (!el) { return; } el.textContent = ''; el.classList.remove('visible'); }

    // ── Message handler ──────────────────────────────────────────
    window.addEventListener('message', ev => {
        const msg = ev.data;
        switch (msg.type) {
            case 'authStatus':
                if (msg.authenticated) { showScreen('list'); loadContexts(); }
                else { showScreen('auth'); }
                break;
            case 'authSuccess':
                setLoading(authSubmit, false);
                hideErr(authError);
                authForm.reset();
                showScreen('list');
                loadContexts();
                break;
            case 'authError':
                setLoading(authSubmit, false);
                showErr(authError, msg.message);
                break;
            case 'loggedOut':
                showScreen('auth');
                break;
            case 'contextsList':
                renderContexts(msg.contexts);
                break;
            case 'contextRestored':
                loadContexts();
                break;
            case 'error':
                contextList.innerHTML = '';
                showErr(listError, msg.message);
                break;
            // Feature 2: Share result
            case 'shareResult': {
                const shareBtn = contextList.querySelector('.btn-share[data-id="' + msg.id + '"]');
                if (shareBtn) { shareBtn.disabled = false; shareBtn.textContent = 'Share'; }
                const row = document.getElementById('share-row-' + msg.id);
                const inp = document.getElementById('share-input-' + msg.id);
                if (row && inp) { inp.value = msg.shareUrl; row.classList.add('visible'); }
                break;
            }
            case 'shareError': {
                const shareBtn2 = contextList.querySelector('.btn-share[data-id="' + msg.id + '"]');
                if (shareBtn2) { shareBtn2.disabled = false; shareBtn2.textContent = 'Share'; }
                break;
            }
            // Feature 3: PR description result
            case 'prDescription': {
                const prBtn = contextList.querySelector('.btn-export-pr[data-id="' + msg.id + '"]');
                if (prBtn) { prBtn.disabled = false; prBtn.textContent = 'Export PR'; }
                prTextarea.value = msg.prDescription;
                prSubheading.textContent = 'Generated from: ' + (prContextLabel || 'context');
                showScreen('pr');
                break;
            }
            case 'prError': {
                const prBtn2 = contextList.querySelector('.btn-export-pr[data-id="' + msg.id + '"]');
                if (prBtn2) { prBtn2.disabled = false; prBtn2.textContent = 'Export PR'; }
                break;
            }
        }
    });

    vscode.postMessage({ type: 'checkAuth' });
})();
</script>
</body>
</html>`;
    }
}

interface WebviewMessage {
    type: string;
    id?: string;
    email?: string;
    password?: string;
    shareUrl?: string;
    prDescription?: string;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
