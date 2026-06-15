import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function checkAndInstallTerminalHook(): Promise<void> {
    const homeDir = os.homedir();
    
    const hookFileName = '.flowsave_hook';
    const bashHookPath = path.join(homeDir, `${hookFileName}.bash`);
    const zshHookPath = path.join(homeDir, `${hookFileName}.zsh`);
    
    // The actual hook script
    const hookScript = `function _flowsave_precmd() {
    local hist_line=$(fc -ln -1 2>/dev/null | sed -e 's/^[[:space:]]*//' || history 1 | sed 's/^[ ]*[0-9]*[ ]*//')
    if [[ -n "$hist_line" && "$hist_line" != "_flowsave_precmd" ]]; then
        echo "\${PWD}|:|\${hist_line}" >> /tmp/flowsave_global_history.txt
    fi
}
# ZSH hook
if [[ -n "$ZSH_VERSION" ]]; then
    autoload -Uz add-zsh-hook
    add-zsh-hook precmd _flowsave_precmd
fi
# BASH hook
if [[ -n "$BASH_VERSION" ]]; then
    PROMPT_COMMAND="_flowsave_precmd; $PROMPT_COMMAND"
fi
`;

    // 1. Write the hook files to user's home directory if they don't exist
    try {
        if (!fs.existsSync(bashHookPath) || !fs.existsSync(zshHookPath)) {
            fs.writeFileSync(bashHookPath, hookScript, { mode: 0o755 });
            fs.writeFileSync(zshHookPath, hookScript, { mode: 0o755 });
        }
    } catch (error) {
        console.error('Failed to write hook files:', error);
        return; // Silent fail if we can't write to home dir
    }

    // 2. Check if it's already in their rc files
    const zshrcPath = path.join(homeDir, '.zshrc');
    const bashrcPath = path.join(homeDir, '.bashrc');
    
    const zshrcSource = `\n# FlowSave terminal hook\n[[ -f ~/.flowsave_hook.zsh ]] && source ~/.flowsave_hook.zsh\n`;
    const bashrcSource = `\n# FlowSave terminal hook\n[[ -f ~/.flowsave_hook.bash ]] && source ~/.flowsave_hook.bash\n`;

    let needsZsh = fs.existsSync(zshrcPath) && !fs.readFileSync(zshrcPath, 'utf-8').includes('.flowsave_hook');
    let needsBash = fs.existsSync(bashrcPath) && !fs.readFileSync(bashrcPath, 'utf-8').includes('.flowsave_hook');

    // If neither exists, we'll try to create .zshrc as default on mac, or .bashrc on linux
    if (!fs.existsSync(zshrcPath) && !fs.existsSync(bashrcPath)) {
        if (process.platform === 'darwin') { needsZsh = true; }
        else { needsBash = true; }
    }

    if (!needsZsh && !needsBash) {
        return; // Already installed or no configs to update
    }

    // 3. Ask user
    const action = await vscode.window.showInformationMessage(
        'FlowSave: Enable project-specific terminal tracking for better AI context?',
        'Enable Now',
        'Not Now'
    );

    if (action !== 'Enable Now') {
        return;
    }

    // 4. Try to append to rc files
    try {
        if (needsZsh) {
            fs.appendFileSync(zshrcPath, zshrcSource);
        }
        if (needsBash) {
            fs.appendFileSync(bashrcPath, bashrcSource);
        }
        vscode.window.showInformationMessage('FlowSave: Terminal tracking enabled! Please restart your terminal.');
    } catch (error: any) {
        // Handle EACCES (Permission Denied)
        if (error.code === 'EACCES') {
            const manualCmd = `echo '\\n# FlowSave terminal hook\\n[[ -f ~/.flowsave_hook.zsh ]] && source ~/.flowsave_hook.zsh' | sudo tee -a ~/.zshrc`;
            
            const manualAction = await vscode.window.showWarningMessage(
                'FlowSave: We lack permission to update your terminal config automatically (likely owned by root). Please run the command manually.',
                'Copy Command'
            );
            
            if (manualAction === 'Copy Command') {
                vscode.env.clipboard.writeText(manualCmd);
                vscode.window.showInformationMessage('Command copied to clipboard! Paste and run it in your terminal.');
            }
        } else {
            vscode.window.showErrorMessage(`FlowSave: Failed to setup terminal tracking: ${error.message}`);
        }
    }
}
