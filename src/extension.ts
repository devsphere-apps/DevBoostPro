import * as vscode from 'vscode';
import * as path from 'path';

// Feature imports will go here
import { registerProjectTreeExporter } from './features/projectTreeExporter';
import { registerDashboard } from './features/dashboard';
import { registerTaskRunner } from './features/taskRunner';

export function activate(context: vscode.ExtensionContext) {
    console.log('DevBoost Pro extension is now active!');
    
    // Register media files path
    const mediaPath = vscode.Uri.file(path.join(context.extensionPath, 'media'));
    
    // Register features
    registerProjectTreeExporter(context);
    registerDashboard(context, mediaPath);
    registerTaskRunner(context);
}

export function deactivate() {
    // Cleanup resources when extension is deactivated
} 