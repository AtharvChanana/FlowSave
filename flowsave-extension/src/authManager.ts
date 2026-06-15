import * as vscode from 'vscode';

const SECRET_KEY = 'flowsave_jwt';

/**
 * Manages authentication tokens using VS Code's SecretStorage API.
 * Tokens are stored securely in the OS keychain via the secrets API.
 */
export class AuthManager {
    private readonly secrets: vscode.SecretStorage;

    constructor(context: vscode.ExtensionContext) {
        this.secrets = context.secrets;
    }

    /**
     * Retrieve the stored JWT token.
     */
    async getToken(): Promise<string | undefined> {
        return this.secrets.get(SECRET_KEY);
    }

    /**
     * Store a JWT token securely.
     */
    async setToken(token: string): Promise<void> {
        await this.secrets.store(SECRET_KEY, token);
    }

    /**
     * Remove the stored JWT token.
     */
    async clearToken(): Promise<void> {
        await this.secrets.delete(SECRET_KEY);
    }

    /**
     * Check whether a valid token is stored.
     */
    async isAuthenticated(): Promise<boolean> {
        const token = await this.getToken();
        return token !== undefined && token.length > 0;
    }
}
