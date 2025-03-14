import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function registerProjectTreeExporter(context: vscode.ExtensionContext) {
    // Register commands
    const exportTreeCommand = vscode.commands.registerCommand(
        'devboost-pro.exportProjectTree',
        async () => {
            const templates = await getExportTemplates(context);
            templates.push({ name: 'Custom export', isCustom: true });

            const templateSelection = await vscode.window.showQuickPick(
                templates.map(t => t.name),
                { placeHolder: 'Select export template or create custom export' }
            );

            if (!templateSelection) return;

            const selectedTemplate = templates.find(t => t.name === templateSelection);
            if (!selectedTemplate) return;

            if (selectedTemplate.isCustom) {
                // Proceed with all the custom options as before
                const format = await vscode.window.showQuickPick(
                    ['JSON', 'Markdown', 'Tree', 'YAML', 'HTML', 'XML'],
                    { placeHolder: 'Select export format' }
                );
                
                if (!format) return;
                
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
                if (!workspaceRoot) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }
                
                // After format selection but before depth
                const includeMetadata = await vscode.window.showQuickPick(
                    ['Basic structure only', 'Include file sizes', 'Include full metadata'],
                    { placeHolder: 'Select detail level' }
                );

                let showSizes = false;
                let showMetadata = false;

                if (includeMetadata === 'Include file sizes') {
                    showSizes = true;
                } else if (includeMetadata === 'Include full metadata') {
                    showSizes = true;
                    showMetadata = true;
                }
                
                // After format selection
                const depthOptions = ['No limit', '1 level', '2 levels', '3 levels', '5 levels', '10 levels'];
                const depthSelection = await vscode.window.showQuickPick(
                    depthOptions,
                    { placeHolder: 'Select depth limit' }
                );

                // Convert selection to a number
                let depth = Infinity;
                if (depthSelection && depthSelection !== 'No limit') {
                    depth = parseInt(depthSelection.split(' ')[0], 10);
                }
                
                // After depth selection
                const useCustomFilters = await vscode.window.showQuickPick(
                    ['Use default filters', 'Customize filters'],
                    { placeHolder: 'Filter options' }
                );

                let excludePatterns: string[] = [];
                let includePatterns: string[] = [];

                if (useCustomFilters === 'Customize filters') {
                    // Get the default exclude patterns from settings
                    const config = vscode.workspace.getConfiguration('devboost-pro');
                    const defaultExcludePatterns = config.get<string[]>('projectTree.excludePatterns') || ['node_modules', '.git'];
                    
                    // Allow user to modify exclude patterns
                    const excludeInput = await vscode.window.showInputBox({
                        prompt: 'Enter patterns to exclude (comma-separated)',
                        value: defaultExcludePatterns.join(', ')
                    });
                    
                    if (excludeInput) {
                        excludePatterns = excludeInput.split(',').map(p => p.trim()).filter(p => p);
                    }
                    
                    // Allow user to specify include patterns
                    const includeInput = await vscode.window.showInputBox({
                        prompt: 'Enter patterns to include (comma-separated, leave empty to include all)',
                    });
                    
                    if (includeInput) {
                        includePatterns = includeInput.split(',').map(p => p.trim()).filter(p => p);
                    }
                }
                
                try {
                    const tree = await generateProjectTree(workspaceRoot, depth, excludePatterns, includePatterns, showSizes, showMetadata);
                    const output = formatProjectTree(tree, format);
                    
                    // After generating the output
                    const outputOptions = ['Copy to clipboard', 'Save to file', 'Open in editor'];
                    const outputSelection = await vscode.window.showQuickPick(
                        outputOptions,
                        { placeHolder: 'What would you like to do with the output?' }
                    );

                    switch (outputSelection) {
                        case 'Copy to clipboard':
                            await vscode.env.clipboard.writeText(output);
                            vscode.window.showInformationMessage(`Project tree copied to clipboard in ${format} format`);
                            break;
                        case 'Save to file':
                            const fileExtension = getFileExtensionForFormat(format);
                            const uri = await vscode.window.showSaveDialog({
                                defaultUri: vscode.Uri.file(`project-structure.${fileExtension}`),
                                filters: { 'All Files': ['*'] }
                            });
                            if (uri) {
                                await vscode.workspace.fs.writeFile(uri, Buffer.from(output));
                                vscode.window.showInformationMessage(`Project tree saved to ${uri.fsPath}`);
                            }
                            break;
                        case 'Open in editor':
                            const document = await vscode.workspace.openTextDocument({
                                content: output,
                                language: getLanguageIdForFormat(format)
                            });
                            await vscode.window.showTextDocument(document);
                            break;
                    }

                    // At the end, offer to save this as a template
                    const saveName = await vscode.window.showInputBox({
                        prompt: 'Save these settings as a template? (Leave empty to skip)',
                        placeHolder: 'Template name'
                    });
                    
                    if (saveName) {
                        await saveExportTemplate(context, {
                            name: saveName,
                            format,
                            depth,
                            excludePatterns,
                            includePatterns,
                            showSizes,
                            showMetadata,
                            outputOption: outputSelection
                        });
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to export project tree: ${error}`);
                }
            } else {
                // Use the template settings
                const { format, depth, excludePatterns, includePatterns, showSizes, showMetadata, outputOption } = selectedTemplate;
                
                // Generate tree with these settings
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
                if (!workspaceRoot) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }
                
                try {
                    const tree = await generateProjectTree(workspaceRoot, depth, excludePatterns, includePatterns, showSizes, showMetadata);
                    const output = formatProjectTree(tree, format);
                    
                    // After generating the output
                    const outputSelection = outputOption;

                    switch (outputSelection) {
                        case 'Copy to clipboard':
                            await vscode.env.clipboard.writeText(output);
                            vscode.window.showInformationMessage(`Project tree copied to clipboard in ${format} format`);
                            break;
                        case 'Save to file':
                            const fileExtension = getFileExtensionForFormat(format);
                            const uri = await vscode.window.showSaveDialog({
                                defaultUri: vscode.Uri.file(`project-structure.${fileExtension}`),
                                filters: { 'All Files': ['*'] }
                            });
                            if (uri) {
                                await vscode.workspace.fs.writeFile(uri, Buffer.from(output));
                                vscode.window.showInformationMessage(`Project tree saved to ${uri.fsPath}`);
                            }
                            break;
                        case 'Open in editor':
                            const document = await vscode.workspace.openTextDocument({
                                content: output,
                                language: getLanguageIdForFormat(format)
                            });
                            await vscode.window.showTextDocument(document);
                            break;
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to export project tree: ${error}`);
                }
            }
        }
    );
    
    context.subscriptions.push(exportTreeCommand);
}

// Define interfaces for the tree structure
interface BaseItem {
    name: string;
    path: string;
    size?: number;
    sizeFormatted?: string;
    created?: Date;
    modified?: Date;
    permissions?: string;
}

interface FileItem extends BaseItem {
    type: 'file';
}

interface DirectoryItem extends BaseItem {
    type: 'directory';
    children: TreeItem[];
}

type TreeItem = FileItem | DirectoryItem;

async function generateProjectTree(rootPath: string, depth = Infinity, excludePatterns: string[] = [], includePatterns: string[] = [], showSizes = false, showMetadata = false): Promise<TreeItem> {
    const stats = await fs.promises.stat(rootPath);
    const name = path.basename(rootPath);
    
    const item: Partial<TreeItem> = {
        name,
        path: rootPath,
    };
    
    if (showSizes) {
        item.size = stats.size;
        item.sizeFormatted = formatFileSize(stats.size);
    }
    
    if (showMetadata) {
        item.created = stats.birthtime;
        item.modified = stats.mtime;
        item.permissions = stats.mode.toString(8).slice(-3);
    }
    
    if (!stats.isDirectory()) {
        return { name, type: 'file', path: rootPath };
    }
    
    // It's a directory, so scan its contents
    const children: TreeItem[] = [];
    
    if (depth > 0) {
        try {
            const files = await fs.promises.readdir(rootPath);
            
            for (const file of files) {
                const filePath = path.join(rootPath, file);
                
                // Skip excluded files/directories
                if (excludePatterns.some(pattern => file === pattern || file.match(pattern))) {
                    continue;
                }
                
                const childItem = await generateProjectTree(filePath, depth - 1, excludePatterns, includePatterns, showSizes, showMetadata);
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
        case 'YAML':
            return convertTreeToYAML(tree);
        case 'HTML':
            return convertTreeToHTML(tree);
        case 'XML':
            return convertTreeToXML(tree);
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

function convertTreeToYAML(tree: any, indent = 0): string {
    let result = '';
    let spaces = '  '.repeat(indent);
    
    if (indent === 0) {
        result += 'project:\n';
        spaces = '  ';
    }
    
    if (tree.type === 'directory') {
        result += `${spaces}${tree.name}:\n`;
        if (tree.children && tree.children.length > 0) {
            result += `${spaces}  items:\n`;
            for (const child of tree.children) {
                result += convertTreeToYAML(child, indent + 2);
            }
        }
    } else {
        result += `${spaces}- ${tree.name}\n`;
    }
    
    return result;
}

function convertTreeToHTML(tree: any): string {
    let result = `<!DOCTYPE html>
<html>
<head>
    <title>Project Structure</title>
    <style>
        .directory { font-weight: bold; }
        .file { margin-left: 20px; }
        ul { list-style-type: none; }
    </style>
</head>
<body>
    <h1>Project Structure</h1>
    <ul>
`;
    
    function buildHtmlTree(item: any, indent = 1): string {
        const spaces = '    '.repeat(indent);
        let html = '';
        
        if (item.type === 'directory') {
            html += `${spaces}<li class="directory">📁 ${item.name}/</li>\n`;
            if (item.children && item.children.length > 0) {
                html += `${spaces}<ul>\n`;
                for (const child of item.children) {
                    html += buildHtmlTree(child, indent + 1);
                }
                html += `${spaces}</ul>\n`;
            }
        } else {
            html += `${spaces}<li class="file">📄 ${item.name}</li>\n`;
        }
        
        return html;
    }
    
    result += buildHtmlTree(tree);
    result += `    </ul>
</body>
</html>`;
    
    return result;
}

function convertTreeToXML(tree: any): string {
    let result = '<?xml version="1.0" encoding="UTF-8"?>\n<project>\n';
    
    function buildXmlTree(item: any, indent = 1): string {
        const spaces = '  '.repeat(indent);
        let xml = '';
        
        if (item.type === 'directory') {
            xml += `${spaces}<directory name="${item.name}">\n`;
            if (item.children && item.children.length > 0) {
                for (const child of item.children) {
                    xml += buildXmlTree(child, indent + 1);
                }
            }
            xml += `${spaces}</directory>\n`;
        } else {
            xml += `${spaces}<file name="${item.name}" />\n`;
        }
        
        return xml;
    }
    
    result += buildXmlTree(tree);
    result += '</project>';
    
    return result;
}

// Helper function to get file extension
function getFileExtensionForFormat(format: string): string {
    switch (format) {
        case 'JSON': return 'json';
        case 'Markdown': return 'md';
        case 'Tree': return 'txt';
        case 'YAML': return 'yaml';
        case 'HTML': return 'html';
        case 'XML': return 'xml';
        default: return 'txt';
    }
}

// Helper function to get language ID
function getLanguageIdForFormat(format: string): string {
    switch (format) {
        case 'JSON': return 'json';
        case 'Markdown': return 'markdown';
        case 'YAML': return 'yaml';
        case 'HTML': return 'html';
        case 'XML': return 'xml';
        default: return 'plaintext';
    }
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    const mb = kb / 1024;
    if (mb < 1024) return mb.toFixed(1) + ' MB';
    const gb = mb / 1024;
    return gb.toFixed(1) + ' GB';
}

// Helper functions to manage templates
async function getExportTemplates(context: vscode.ExtensionContext): Promise<any[]> {
    return context.globalState.get('exportTemplates', []);
}

async function saveExportTemplate(context: vscode.ExtensionContext, template: any): Promise<void> {
    const templates = await getExportTemplates(context);
    templates.push(template);
    await context.globalState.update('exportTemplates', templates);
} 