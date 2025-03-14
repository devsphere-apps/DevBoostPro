import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Registers the task runner functionality
 */
export function registerTaskRunner(context: vscode.ExtensionContext) {
    // Register commands
    const runTaskCommand = vscode.commands.registerCommand(
        'devboost-pro.runTask',
        async () => {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }
            
            // Detect available tasks based on project files
            const availableTasks = await detectAvailableTasks(workspaceRoot);
            
            if (availableTasks.length === 0) {
                vscode.window.showInformationMessage('No tasks detected in this project');
                return;
            }
            
            // Show quick pick to select a task
            const selectedTask = await vscode.window.showQuickPick(
                availableTasks.map(task => task.label),
                { placeHolder: 'Select a task to run' }
            );
            
            if (!selectedTask) return;
            
            // Find the selected task
            const task = availableTasks.find(t => t.label === selectedTask);
            if (!task) return;
            
            // Execute the task
            vscode.window.showInformationMessage(`Running task: ${task.label}`);
            // In a real implementation, this would execute the task command
        }
    );
    
    context.subscriptions.push(runTaskCommand);
}

/**
 * Detects available tasks based on project files
 */
async function detectAvailableTasks(workspaceRoot: string): Promise<{ label: string, command: string }[]> {
    const tasks: { label: string, command: string }[] = [];
    
    // Check for package.json (npm/yarn tasks)
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            if (packageJson.scripts) {
                for (const [name, _] of Object.entries(packageJson.scripts)) {
                    tasks.push({
                        label: `npm: ${name}`,
                        command: `npm run ${name}`
                    });
                }
            }
        } catch (error) {
            console.error('Error parsing package.json:', error);
        }
    }
    
    // Add more task detection logic here (e.g., for Python, Java, etc.)
    
    return tasks;
} 