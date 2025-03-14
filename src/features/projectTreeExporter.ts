import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function registerProjectTreeExporter(context: vscode.ExtensionContext) {
    // Register commands
    const exportTreeCommand = vscode.commands.registerCommand(
        'devboost-pro.exportProjectTree',
        async () => {
            const format = await vscode.window.showQuickPick(
                ['JSON', 'Markdown', 'Tree'],
                { placeHolder: 'Select export format' }
            );
            
            if (!format) return;
            
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }
            
            try {
                const tree = await generateProjectTree(workspaceRoot);
                const output = formatProjectTree(tree, format);
                
                // Copy to clipboard or save to file
                await vscode.env.clipboard.writeText(output);
                vscode.window.showInformationMessage(`Project tree copied to clipboard in ${format} format`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to export project tree: ${error}`);
            }
        }
    );
    
    context.subscriptions.push(exportTreeCommand);
}

// Define interfaces for the tree structure
interface FileItem {
    name: string;
    type: 'file';
    path: string;
}

interface DirectoryItem {
    name: string;
    type: 'directory';
    path: string;
    children: TreeItem[];
}

type TreeItem = FileItem | DirectoryItem;

async function generateProjectTree(rootPath: string, depth = Infinity): Promise<TreeItem> {
    const stats = await fs.promises.stat(rootPath);
    const name = path.basename(rootPath);
    
    if (!stats.isDirectory()) {
        return { name, type: 'file', path: rootPath };
    }
    
    // It's a directory, so scan its contents
    const children: TreeItem[] = [];
    
    if (depth > 0) {
        try {
            const files = await fs.promises.readdir(rootPath);
            
            // Get configuration for exclusions
            const config = vscode.workspace.getConfiguration('devboost-pro');
            const excludePatterns = config.get<string[]>('projectTree.excludePatterns') || ['node_modules', '.git'];
            
            for (const file of files) {
                const filePath = path.join(rootPath, file);
                
                // Skip excluded files/directories
                if (excludePatterns.some(pattern => file === pattern || file.match(pattern))) {
                    continue;
                }
                
                const childItem = await generateProjectTree(filePath, depth - 1);
                children.push(childItem);
            }
            
            // Sort: directories first, then files alphabetically
            children.sort((a, b) => {
                if (a.type === 'directory' && b.type === 'file') return -1;
                if (a.type === 'file' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });
        } catch (error) {
            console.error(`Error reading directory ${rootPath}:`, error);
        }
    }
    
    return { name, type: 'directory', path: rootPath, children };
}

function formatProjectTree(tree: any, format: string): string {
    switch (format) {
        case 'JSON':
            return JSON.stringify(tree, null, 2);
        case 'Markdown':
            return convertTreeToMarkdown(tree);
        case 'Tree':
            return convertTreeToAsciiTree(tree);
        default:
            return JSON.stringify(tree, null, 2);
    }
}

function convertTreeToMarkdown(tree: any, level = 0): string {
    const indent = '  '.repeat(level);
    let result = level === 0 ? '# Project Structure\n\n' : '';
    
    if (tree.type === 'directory') {
        result += `${indent}- 📁 **${tree.name}**/\n`;
        if (tree.children && tree.children.length > 0) {
            for (const child of tree.children) {
                result += convertTreeToMarkdown(child, level + 1);
            }
        }
    } else {
        result += `${indent}- 📄 ${tree.name}\n`;
    }
    
    return result;
}

function convertTreeToAsciiTree(tree: any, prefix = ''): string {
    let result = '';
    
    if (prefix === '') {
        // Root node
        result = `${tree.name}\n`;
    } else {
        result = `${prefix}${tree.name}\n`;
    }
    
    if (tree.type === 'directory' && tree.children && tree.children.length > 0) {
        const childCount = tree.children.length;
        
        for (let i = 0; i < childCount; i++) {
            const child = tree.children[i];
            const isLast = i === childCount - 1;
            
            if (isLast) {
                result += convertTreeToAsciiTree(
                    child, 
                    `${prefix.replace('├── ', '│   ').replace('└── ', '    ')}└── `
                );
            } else {
                result += convertTreeToAsciiTree(
                    child, 
                    `${prefix.replace('├── ', '│   ').replace('└── ', '    ')}├── `
                );
            }
        }
    }
    
    return result;
} 