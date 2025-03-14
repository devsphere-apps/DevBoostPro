import * as vscode from 'vscode';

// Feature imports will go here
import { registerProjectTreeExporter } from './features/projectTreeExporter';
import { registerSnippetManager } from './features/snippetManager';
import { registerTaskRunner } from './features/taskRunner';
import { registerDashboard } from './features/dashboard';

export function activate(context: vscode.ExtensionContext) {
    console.log('DevBoost Pro is now active!');
    
    // Register features
    registerProjectTreeExporter(context);
    registerSnippetManager(context);
    registerTaskRunner(context);
    registerDashboard(context);
}

export function deactivate() {
    // Cleanup resources when extension is deactivated
} 