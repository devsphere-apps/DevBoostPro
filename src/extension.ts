import * as vscode from 'vscode';
import * as path from 'path';

// Feature imports will go here
import { registerProjectTreeExporter } from './features/projectTreeExporter';
import { registerSnippetManager } from './features/snippetManager';
import { registerTaskRunner } from './features/taskRunner';
import { registerDashboard } from './features/dashboard';

export function activate(context: vscode.ExtensionContext) {
    console.log('DevBoost Pro is now active!');
    
    // Register media files path
    const mediaPath = vscode.Uri.file(path.join(context.extensionPath, 'media'));
    
    // Register features
    registerProjectTreeExporter(context);
    registerSnippetManager(context);
    registerTaskRunner(context);
    registerDashboard(context, mediaPath);
}

export function deactivate() {
    // Cleanup resources when extension is deactivated
} 