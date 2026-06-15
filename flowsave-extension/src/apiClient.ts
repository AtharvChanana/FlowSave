import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import * as vscode from 'vscode';
import { AuthManager } from './authManager';

const PRODUCTION_URL = 'https://flowsave.onrender.com';

function getBackendUrl(): string {
    const config = vscode.workspace.getConfiguration('flowsave');
    const override = config.get<string>('backendUrl');
    return (override && override.trim()) ? override.trim() : PRODUCTION_URL;
}

// ── Interfaces ──────────────────────────────────────────────────────────

export interface OpenFileInfo {
    path: string;
    line: number;
}

export interface SaveContextPayload {
    label: string;
    openFiles: string;
    gitDiff: string | null;
    terminalHistory: string | null;
    timestamp: string;
    autoSaved?: boolean;
}

export interface ContextSnapshot {
    id: string;
    label: string;
    openFiles: string;
    gitDiff: string | null;
    terminalHistory: string | null;
    createdAt: string;
    reentryBrief: string | null;
    autoSaved?: boolean;
}

// ── Error types ─────────────────────────────────────────────────────────

export class AuthenticationError extends Error {
    constructor(message = 'Authentication required') {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class ApiError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
    }
}

// ── API Client ──────────────────────────────────────────────────────────

export class ApiClient {
    constructor(private authManager: AuthManager) {}

    private async request<T>(
        method: string,
        path: string,
        body?: Record<string, unknown>
    ): Promise<T> {
        const url = new URL(path, getBackendUrl());
        const isHttps = url.protocol === 'https:';
        const transport = isHttps ? https : http;

        const token = await this.authManager.getToken();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const payload = body ? JSON.stringify(body) : undefined;
        if (payload) {
            headers['Content-Length'] = Buffer.byteLength(payload).toString();
        }

        return new Promise<T>((resolve, reject) => {
            const req = transport.request(
                {
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname + url.search,
                    method: method.toUpperCase(),
                    headers,
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => chunks.push(chunk));
                    res.on('end', async () => {
                        const rawBody = Buffer.concat(chunks).toString('utf-8');
                        const statusCode = res.statusCode ?? 500;

                        if (statusCode === 401) {
                            await this.authManager.clearToken();
                            reject(new AuthenticationError());
                            return;
                        }

                        if (statusCode < 200 || statusCode >= 300) {
                            let message = `Request failed with status ${statusCode}`;
                            try {
                                const parsed = JSON.parse(rawBody);
                                if (parsed.message) { message = parsed.message; }
                                else if (parsed.error) { message = parsed.error; }
                            } catch { /* use default */ }
                            reject(new ApiError(message, statusCode));
                            return;
                        }

                        if (statusCode === 204 || rawBody.length === 0) {
                            resolve(undefined as unknown as T);
                            return;
                        }

                        try {
                            resolve(JSON.parse(rawBody) as T);
                        } catch {
                            reject(new ApiError('Invalid JSON response from server', statusCode));
                        }
                    });
                }
            );

            req.on('error', (err) => reject(new ApiError(`Network error: ${err.message}`, 0)));
            req.setTimeout(30000, () => { req.destroy(); reject(new ApiError('Request timed out', 0)); });
            if (payload) { req.write(payload); }
            req.end();
        });
    }

    // ── Auth ────────────────────────────────────────────────────────────

    async register(email: string, password: string): Promise<string> {
        const res = await this.request<{ token: string }>('POST', '/api/auth/register', { email, password });
        await this.authManager.setToken(res.token);
        return res.token;
    }

    async login(email: string, password: string): Promise<string> {
        const res = await this.request<{ token: string }>('POST', '/api/auth/login', { email, password });
        await this.authManager.setToken(res.token);
        return res.token;
    }

    // ── Context ─────────────────────────────────────────────────────────

    async saveContext(data: SaveContextPayload): Promise<{ id: string; brief: string }> {
        return this.request<{ id: string; brief: string }>('POST', '/api/context/save', data as unknown as Record<string, unknown>);
    }

    async listContexts(): Promise<ContextSnapshot[]> {
        return this.request<ContextSnapshot[]>('GET', '/api/context/list');
    }

    async getContext(id: string): Promise<ContextSnapshot> {
        return this.request<ContextSnapshot>('GET', `/api/context/${encodeURIComponent(id)}`);
    }

    async deleteContext(id: string): Promise<void> {
        return this.request<void>('DELETE', `/api/context/${encodeURIComponent(id)}`);
    }

    // ── Feature 2: Share ────────────────────────────────────────────────

    async shareContext(id: string): Promise<{ shareUrl: string }> {
        return this.request<{ shareUrl: string }>('POST', `/api/context/${encodeURIComponent(id)}/share`);
    }

    // ── Feature 3: Export PR ────────────────────────────────────────────

    async exportPR(id: string): Promise<{ prDescription: string }> {
        return this.request<{ prDescription: string }>('POST', `/api/context/${encodeURIComponent(id)}/export-pr`);
    }

    // ── Public shared context (no auth required) ────────────────────────

    async getSharedContext(token: string): Promise<{ label: string; openFiles: string; reentryBrief: string }> {
        return this.request<{ label: string; openFiles: string; reentryBrief: string }>(
            'GET',
            `/api/shared/${encodeURIComponent(token)}/context`
        );
    }
}
