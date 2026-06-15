import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { AuthManager } from './authManager';

const BACKEND_URL = process.env.FLOWSAVE_BACKEND_URL || 'http://localhost:8080';

// ── Interfaces ──────────────────────────────────────────────────────────

export interface OpenFileInfo {
    path: string;
    line: number;
}

export interface SaveContextPayload {
    label: string;
    openFiles: string; // JSON-stringified OpenFileInfo[]
    gitDiff: string | null;
    terminalHistory: string | null;
    timestamp: string;
}

export interface ContextSnapshot {
    id: string;
    label: string;
    openFiles: string; // JSON-stringified OpenFileInfo[]
    gitDiff: string | null;
    terminalHistory: string | null;
    timestamp: string;
    brief: string; // AI-generated re-entry brief
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

    /**
     * Core request helper using native Node.js http/https modules.
     */
    private async request<T>(
        method: string,
        path: string,
        body?: Record<string, unknown>
    ): Promise<T> {
        const url = new URL(path, BACKEND_URL);
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
                                if (parsed.message) {
                                    message = parsed.message;
                                } else if (parsed.error) {
                                    message = parsed.error;
                                }
                            } catch {
                                // use default message
                            }
                            reject(new ApiError(message, statusCode));
                            return;
                        }

                        // Handle 204 No Content
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

            req.on('error', (err) => {
                reject(new ApiError(`Network error: ${err.message}`, 0));
            });

            req.setTimeout(15000, () => {
                req.destroy();
                reject(new ApiError('Request timed out', 0));
            });

            if (payload) {
                req.write(payload);
            }
            req.end();
        });
    }

    // ── Auth endpoints ─────────────────────────────────────────────────

    /**
     * Register a new user. Returns the JWT token.
     */
    async register(email: string, password: string): Promise<string> {
        const res = await this.request<{ token: string }>('POST', '/api/auth/register', {
            email,
            password,
        });
        await this.authManager.setToken(res.token);
        return res.token;
    }

    /**
     * Login an existing user. Returns the JWT token.
     */
    async login(email: string, password: string): Promise<string> {
        const res = await this.request<{ token: string }>('POST', '/api/auth/login', {
            email,
            password,
        });
        await this.authManager.setToken(res.token);
        return res.token;
    }

    // ── Context endpoints ──────────────────────────────────────────────

    /**
     * Save a context snapshot. Returns the created id and AI-generated brief.
     */
    async saveContext(data: SaveContextPayload): Promise<{ id: string; brief: string }> {
        return this.request<{ id: string; brief: string }>('POST', '/api/context/save', data as unknown as Record<string, unknown>);
    }

    /**
     * List all saved context snapshots for the authenticated user.
     */
    async listContexts(): Promise<ContextSnapshot[]> {
        return this.request<ContextSnapshot[]>('GET', '/api/context/list');
    }

    /**
     * Get a single context snapshot by ID.
     */
    async getContext(id: string): Promise<ContextSnapshot> {
        return this.request<ContextSnapshot>('GET', `/api/context/${encodeURIComponent(id)}`);
    }

    /**
     * Delete a context snapshot by ID.
     */
    async deleteContext(id: string): Promise<void> {
        return this.request<void>('DELETE', `/api/context/${encodeURIComponent(id)}`);
    }
}
