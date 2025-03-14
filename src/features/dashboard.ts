import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Registers the developer dashboard functionality
 */
export function registerDashboard(context: vscode.ExtensionContext, mediaPath: vscode.Uri) {
    // Register commands
    const openDashboardCommand = vscode.commands.registerCommand(
        'devboost-pro.openDashboard',
        async () => {
            vscode.window.showInformationMessage('Opening Developer Dashboard');
            
            // Create a webview panel for the dashboard
            const panel = vscode.window.createWebviewPanel(
                'devDashboard',
                'Developer Dashboard',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [mediaPath]
                }
            );
            
            // Get paths to icons
            const projectTreeIconPath = vscode.Uri.file(
                path.join(mediaPath.fsPath, 'icons', 'project-tree.svg')
            );
            const taskIconPath = vscode.Uri.file(
                path.join(mediaPath.fsPath, 'icons', 'task.svg')
            );
            const dashboardIconPath = vscode.Uri.file(
                path.join(mediaPath.fsPath, 'icons', 'dashboard.svg')
            );
            
            // Replace placeholders in HTML
            let html = getDashboardHtml();
            html = html.replace('{{webview.asWebviewUri(projectTreeIconPath)}}', panel.webview.asWebviewUri(projectTreeIconPath).toString());
            html = html.replace('{{webview.asWebviewUri(gitIconPath)}}', panel.webview.asWebviewUri(dashboardIconPath).toString());
            html = html.replace('{{webview.asWebviewUri(taskIconPath)}}', panel.webview.asWebviewUri(taskIconPath).toString());
            html = html.replace('{{webview.asWebviewUri(actionsIconPath)}}', panel.webview.asWebviewUri(dashboardIconPath).toString());
            
            panel.webview.html = html;
            
            // In a real implementation, we would:
            // 1. Collect project metrics and stats
            // 2. Set up event listeners for dashboard interactions
            // 3. Periodically update the dashboard data
        }
    );
    
    context.subscriptions.push(openDashboardCommand);
}

/**
 * Returns the HTML for the dashboard webview
 */
function getDashboardHtml() {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Developer Dashboard</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .dashboard-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 20px;
                    margin-top: 20px;
                }
                .widget {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 5px;
                    padding: 15px;
                }
                h1, h2 {
                    color: var(--vscode-editor-foreground);
                }
                .widget-header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 10px;
                }
                
                .widget-header img {
                    width: 20px;
                    height: 20px;
                    margin-right: 8px;
                }
            </style>
        </head>
        <body>
            <h1>Developer Dashboard</h1>
            
            <div class="dashboard-grid">
                <div class="widget">
                    <div class="widget-header">
                        <img src="{{webview.asWebviewUri(projectTreeIconPath)}}" alt="Project">
                        <h2>Project Overview</h2>
                    </div>
                    <p>Project: Current Workspace</p>
                    <p>Files: Loading...</p>
                    <p>Lines of Code: Loading...</p>
                </div>
                
                <div class="widget">
                    <div class="widget-header">
                        <img src="{{webview.asWebviewUri(gitIconPath)}}" alt="Git">
                        <h2>Git Status</h2>
                    </div>
                    <p>Branch: Loading...</p>
                    <p>Uncommitted Changes: Loading...</p>
                </div>
                
                <div class="widget">
                    <div class="widget-header">
                        <img src="{{webview.asWebviewUri(taskIconPath)}}" alt="Tasks">
                        <h2>Recent Tasks</h2>
                    </div>
                    <p>No recent tasks</p>
                </div>
                
                <div class="widget">
                    <div class="widget-header">
                        <img src="{{webview.asWebviewUri(actionsIconPath)}}" alt="Actions">
                        <h2>Quick Actions</h2>
                    </div>
                    <button>Export Project Tree</button>
                    <button>Run Task</button>
                </div>
            </div>
        </body>
        </html>
    `;
} 