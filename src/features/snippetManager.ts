import * as vscode from 'vscode';
import * as path from 'path';

// Define interfaces for snippet data structure
interface Snippet {
    id: string;
    title: string;
    code: string;
    language: string;
    description: string;
    tags: string[];
    category: string;
    dateCreated: number;
    dateModified: number;
    isFavorite: boolean;
}

interface SnippetCategory {
    name: string;
    snippets: Snippet[];
}

/**
 * Registers the snippet manager functionality
 */
export function registerSnippetManager(context: vscode.ExtensionContext) {
    // Initialize snippet storage
    initializeSnippetStorage(context);
    
    // Register commands
    const manageSnippetsCommand = vscode.commands.registerCommand(
        'devboost-pro.manageSnippets',
        async () => {
            // Create a webview panel for the snippet manager
            const panel = vscode.window.createWebviewPanel(
                'snippetManager',
                'Code Snippet Manager',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.join(context.extensionPath, 'media'))
                    ]
                }
            );
            
            // Set the HTML content
            panel.webview.html = await getSnippetManagerHtml(context, panel.webview);
            
            // Handle messages from the webview
            panel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case 'getSnippets':
                            const snippets = await getAllSnippets(context);
                            panel.webview.postMessage({ command: 'snippetsLoaded', snippets });
                            break;
                            
                        case 'saveSnippet':
                            await saveSnippet(context, message.snippet);
                            panel.webview.postMessage({ command: 'snippetSaved', success: true });
                            break;
                            
                        case 'deleteSnippet':
                            await deleteSnippet(context, message.snippetId);
                            panel.webview.postMessage({ command: 'snippetDeleted', success: true });
                            break;
                            
                        case 'createCategory':
                            await createCategory(context, message.categoryName);
                            panel.webview.postMessage({ command: 'categoryCreated', success: true });
                            break;
                            
                        case 'insertSnippet':
                            insertSnippetToEditor(message.snippet);
                            break;
                            
                        case 'checkActiveEditor':
                            const hasActiveEditor = !!vscode.window.activeTextEditor;
                            if (hasActiveEditor) {
                                panel.webview.postMessage({ command: 'editorAvailable', available: true });
                            } else {
                                panel.webview.postMessage({ command: 'editorAvailable', available: false });
                                vscode.window.showErrorMessage('No active editor found. Open a file first.');
                            }
                            break;
                            
                        case 'moveSnippet':
                            await moveSnippetToCategory(
                                context, 
                                message.snippet, 
                                message.sourceCategory, 
                                message.targetCategory
                            );
                            panel.webview.postMessage({ command: 'snippetMoved', success: true });
                            break;
                    }
                },
                undefined,
                context.subscriptions
            );
        }
    );
    
    // Register command to create a snippet from selection
    const createSnippetCommand = vscode.commands.registerCommand(
        'devboost-pro.createSnippet',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found');
                return;
            }
            
            const selection = editor.selection;
            if (selection.isEmpty) {
                vscode.window.showErrorMessage('No text selected');
                return;
            }
            
            const selectedText = editor.document.getText(selection);
            const language = editor.document.languageId;
            
            // Get snippet details from user
            const title = await vscode.window.showInputBox({
                prompt: 'Enter a title for this snippet',
                placeHolder: 'My Awesome Snippet'
            });
            
            if (!title) return;
            
            const description = await vscode.window.showInputBox({
                prompt: 'Enter a description (optional)',
                placeHolder: 'What this snippet does'
            });
            
            const tagsInput = await vscode.window.showInputBox({
                prompt: 'Enter tags (comma-separated)',
                placeHolder: 'react, component, hook'
            });
            
            const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()) : [];
            
            // Get categories and let user choose or create new
            const categories = await getCategories(context);
            categories.push('+ Create new category');
            
            const categorySelection = await vscode.window.showQuickPick(categories, {
                placeHolder: 'Select a category or create a new one'
            });
            
            if (!categorySelection) return;
            
            let category = categorySelection;
            
            if (categorySelection === '+ Create new category') {
                const newCategory = await vscode.window.showInputBox({
                    prompt: 'Enter a new category name',
                    placeHolder: 'My Category'
                });
                
                if (!newCategory) return;
                
                category = newCategory;
                await createCategory(context, newCategory);
            }
            
            // Create and save the snippet
            const snippet: Snippet = {
                id: generateId(),
                title,
                code: selectedText,
                language,
                description: description || '',
                tags,
                category,
                dateCreated: Date.now(),
                dateModified: Date.now(),
                isFavorite: false
            };
            
            await saveSnippet(context, snippet);
            
            vscode.window.showInformationMessage(`Snippet "${title}" saved successfully!`);
        }
    );
    
    // Register command to insert a snippet
    const insertSnippetCommand = vscode.commands.registerCommand(
        'devboost-pro.insertSnippet',
        async () => {
            const snippets = await getAllSnippets(context);
            const flatSnippets = snippets.flatMap(category => category.snippets);
            
            if (flatSnippets.length === 0) {
                vscode.window.showInformationMessage('No snippets found. Create some first!');
                return;
            }
            
            // Show quick pick with snippet titles
            const snippetItems = flatSnippets.map(snippet => ({
                label: snippet.title,
                description: snippet.category,
                detail: snippet.description,
                snippet
            }));
            
            const selected = await vscode.window.showQuickPick(snippetItems, {
                placeHolder: 'Select a snippet to insert'
            });
            
            if (!selected) return;
            
            insertSnippetToEditor(selected.snippet);
        }
    );
    
    context.subscriptions.push(manageSnippetsCommand, createSnippetCommand, insertSnippetCommand);
}

/**
 * Initialize snippet storage
 */
async function initializeSnippetStorage(context: vscode.ExtensionContext) {
    const snippets = context.globalState.get<SnippetCategory[]>('devboost-pro.snippets');
    
    if (!snippets) {
        // Initialize with empty categories
        await context.globalState.update('devboost-pro.snippets', [
            { name: 'General', snippets: [] }
        ]);
    }
}

/**
 * Get all snippet categories
 */
async function getCategories(context: vscode.ExtensionContext): Promise<string[]> {
    const snippetCategories = context.globalState.get<SnippetCategory[]>('devboost-pro.snippets') || [];
    return snippetCategories.map(category => category.name);
}

/**
 * Create a new category
 */
async function createCategory(context: vscode.ExtensionContext, categoryName: string): Promise<void> {
    const snippetCategories = context.globalState.get<SnippetCategory[]>('devboost-pro.snippets') || [];
    
    // Check if category already exists
    if (!snippetCategories.some(category => category.name === categoryName)) {
        snippetCategories.push({ name: categoryName, snippets: [] });
        await context.globalState.update('devboost-pro.snippets', snippetCategories);
    }
}

/**
 * Get all snippets organized by category
 */
async function getAllSnippets(context: vscode.ExtensionContext): Promise<SnippetCategory[]> {
    return context.globalState.get<SnippetCategory[]>('devboost-pro.snippets') || [];
}

/**
 * Save a snippet
 */
async function saveSnippet(context: vscode.ExtensionContext, snippet: Snippet): Promise<void> {
    const snippetCategories = context.globalState.get<SnippetCategory[]>('devboost-pro.snippets') || [];
    
    // Find the category
    let categoryIndex = snippetCategories.findIndex(category => category.name === snippet.category);
    
    // If category doesn't exist, create it
    if (categoryIndex === -1) {
        snippetCategories.push({ name: snippet.category, snippets: [] });
        categoryIndex = snippetCategories.length - 1;
    }
    
    // Check if snippet already exists (update) or is new (add)
    const existingSnippetIndex = snippetCategories[categoryIndex].snippets.findIndex(s => s.id === snippet.id);
    
    if (existingSnippetIndex !== -1) {
        // Update existing snippet
        snippet.dateModified = Date.now();
        snippetCategories[categoryIndex].snippets[existingSnippetIndex] = snippet;
    } else {
        // Add new snippet
        snippetCategories[categoryIndex].snippets.push(snippet);
    }
    
    await context.globalState.update('devboost-pro.snippets', snippetCategories);
}

/**
 * Delete a snippet
 */
async function deleteSnippet(context: vscode.ExtensionContext, snippetId: string): Promise<void> {
    const snippetCategories = context.globalState.get<SnippetCategory[]>('devboost-pro.snippets') || [];
    
    // Find and remove the snippet
    for (const category of snippetCategories) {
        const snippetIndex = category.snippets.findIndex(s => s.id === snippetId);
        if (snippetIndex !== -1) {
            category.snippets.splice(snippetIndex, 1);
            break;
        }
    }
    
    await context.globalState.update('devboost-pro.snippets', snippetCategories);
}

/**
 * Insert a snippet into the active editor
 */
function insertSnippetToEditor(snippet: Snippet): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }
    
    editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, snippet.code);
    });
    
    vscode.window.showInformationMessage(`Inserted snippet: ${snippet.title}`);
}

/**
 * Generate a unique ID for snippets
 */
function generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Move a snippet from one category to another
 */
async function moveSnippetToCategory(
    context: vscode.ExtensionContext, 
    snippet: Snippet, 
    sourceCategory: string, 
    targetCategory: string
): Promise<void> {
    const snippetCategories = context.globalState.get<SnippetCategory[]>('devboost-pro.snippets') || [];
    
    // Find the source category
    const sourceCategoryObj = snippetCategories.find(cat => cat.name === sourceCategory);
    if (!sourceCategoryObj) return;
    
    // Find the target category
    let targetCategoryObj = snippetCategories.find(cat => cat.name === targetCategory);
    if (!targetCategoryObj) {
        // Create the target category if it doesn't exist
        targetCategoryObj = { name: targetCategory, snippets: [] };
        snippetCategories.push(targetCategoryObj);
    }
    
    // Remove the snippet from the source category
    const snippetIndex = sourceCategoryObj.snippets.findIndex(s => s.id === snippet.id);
    if (snippetIndex !== -1) {
        sourceCategoryObj.snippets.splice(snippetIndex, 1);
    }
    
    // Add the snippet to the target category
    targetCategoryObj.snippets.push(snippet);
    
    // Update the storage
    await context.globalState.update('devboost-pro.snippets', snippetCategories);
}

/**
 * Returns the HTML for the snippet manager webview
 */
async function getSnippetManagerHtml(_context: vscode.ExtensionContext, _webview: vscode.Webview): Promise<string> {
    // Get paths to icons
    const snippetIconPath = vscode.Uri.file(
        path.join(_context.extensionPath, 'media', 'icons', 'snippet.svg')
    );
    const categoryIconPath = vscode.Uri.file(
        path.join(_context.extensionPath, 'media', 'icons', 'category.svg')
    );
    const favoriteIconPath = vscode.Uri.file(
        path.join(_context.extensionPath, 'media', 'icons', 'favorite.svg')
    );
    
    // Convert to webview URIs
    const snippetIconUri = _webview.asWebviewUri(snippetIconPath);
    const categoryIconUri = _webview.asWebviewUri(categoryIconPath);
    const favoriteIconUri = _webview.asWebviewUri(favoriteIconPath);
    
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Code Snippet Manager</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                    margin: 0;
                }
                
                .container {
                    display: grid;
                    grid-template-columns: 250px 1fr;
                    gap: 20px;
                    height: calc(100vh - 40px);
                }
                
                .sidebar {
                    border-right: 1px solid var(--vscode-panel-border);
                    padding-right: 15px;
                    overflow-y: auto;
                }
                
                .main-content {
                    overflow-y: auto;
                    padding-right: 15px;
                }
                
                .toolbar {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 15px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .search-box {
                    width: 100%;
                    padding: 5px;
                    margin-bottom: 15px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 5px 10px;
                    cursor: pointer;
                    margin-right: 5px;
                }
                
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .category {
                    margin-bottom: 10px;
                }
                
                .category-header {
                    font-weight: bold;
                    cursor: pointer;
                    padding: 5px;
                    background-color: var(--vscode-sideBar-background);
                    display: flex;
                    align-items: center;
                }
                
                .category-header img {
                    margin-right: 5px;
                    width: 16px;
                    height: 16px;
                }
                
                .category-header:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                .snippet-list {
                    margin-left: 10px;
                }
                
                .snippet-item {
                    padding: 5px;
                    cursor: pointer;
                    border-radius: 3px;
                    margin: 2px 0;
                    display: flex;
                    align-items: center;
                    user-select: none; /* Prevent text selection during drag */
                }
                
                .snippet-item img {
                    margin-right: 5px;
                    width: 16px;
                    height: 16px;
                }
                
                .snippet-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                .snippet-item.active {
                    background-color: var(--vscode-list-activeSelectionBackground);
                    color: var(--vscode-list-activeSelectionForeground);
                }
                
                .snippet-item.favorite {
                    color: var(--vscode-terminal-ansiYellow);
                }
                
                .snippet-item.dragging {
                    opacity: 0.5;
                    background-color: var(--vscode-editor-selectionBackground);
                }
                
                .category-drop-zone {
                    border: 2px dashed transparent;
                    border-radius: 4px;
                    margin: 5px 0;
                    padding: 5px;
                    transition: border-color 0.2s;
                }
                
                .category-drop-zone.drag-over {
                    border-color: var(--vscode-focusBorder);
                }
                
                .form-group {
                    margin-bottom: 15px;
                }
                
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                
                input, select, textarea {
                    width: 100%;
                    padding: 5px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                
                .code-editor {
                    width: 100%;
                    min-height: 200px;
                    padding: 10px;
                    font-family: monospace;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    border: 1px solid var(--vscode-input-border);
                    white-space: pre;
                    overflow: auto;
                }
                
                .no-snippets {
                    text-align: center;
                    padding: 50px 0;
                    color: var(--vscode-descriptionForeground);
                }
                
                .action-buttons {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="sidebar">
                    <div class="toolbar">
                        <button id="new-category-btn">New Category</button>
                        <button id="new-snippet-btn">New Snippet</button>
                    </div>
                    
                    <input type="text" class="search-box" id="search" placeholder="Search snippets...">
                    
                    <div id="categories-list">
                        <!-- Categories will be populated here -->
                        <div class="no-snippets">Loading snippets...</div>
                    </div>
                </div>
                
                <div class="main-content">
                    <div class="toolbar">
                        <h2>Snippet Details</h2>
                        <div>
                            <button id="insert-btn">Insert</button>
                            <button id="save-btn">Save</button>
                            <button id="delete-btn">Delete</button>
                        </div>
                    </div>
                    
                    <div id="snippet-form" style="display: none;">
                        <div class="form-group">
                            <label for="title">Title</label>
                            <input type="text" id="title" placeholder="Snippet title">
                        </div>
                        
                        <div class="form-group">
                            <label for="description">Description</label>
                            <textarea id="description" placeholder="What this snippet does"></textarea>
                        </div>
                        
                        <div class="form-group">
                            <label for="code">Code</label>
                            <div class="code-editor" id="code" contenteditable="true"></div>
                        </div>
                        
                        <div class="form-group">
                            <label for="language">Language</label>
                            <select id="language">
                                <option value="javascript">JavaScript</option>
                                <option value="typescript">TypeScript</option>
                                <option value="html">HTML</option>
                                <option value="css">CSS</option>
                                <option value="python">Python</option>
                                <option value="java">Java</option>
                                <option value="csharp">C#</option>
                                <option value="php">PHP</option>
                                <option value="ruby">Ruby</option>
                                <option value="go">Go</option>
                                <option value="rust">Rust</option>
                                <option value="swift">Swift</option>
                                <option value="kotlin">Kotlin</option>
                                <option value="plaintext">Plain Text</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="category">Category</label>
                            <select id="category">
                                <!-- Categories will be populated here -->
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="tags">Tags (comma-separated)</label>
                            <input type="text" id="tags" placeholder="react, component, hook">
                        </div>
                        
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="favorite"> Mark as favorite
                            </label>
                        </div>
                    </div>
                    
                    <div id="empty-state" class="no-snippets">
                        <h2>No snippet selected</h2>
                        <p>Select a snippet from the sidebar or create a new one</p>
                    </div>
                </div>
            </div>
            
            <script>
                (function() {
                    // State
                    let snippets = [];
                    let currentSnippet = null;
                    let isNewSnippet = false;
                    
                    // Elements
                    const categoriesList = document.getElementById('categories-list');
                    const snippetForm = document.getElementById('snippet-form');
                    const emptyState = document.getElementById('empty-state');
                    const titleInput = document.getElementById('title');
                    const descriptionInput = document.getElementById('description');
                    const codeEditor = document.getElementById('code');
                    const languageSelect = document.getElementById('language');
                    const categorySelect = document.getElementById('category');
                    const tagsInput = document.getElementById('tags');
                    const favoriteCheckbox = document.getElementById('favorite');
                    const searchInput = document.getElementById('search');
                    
                    // Buttons
                    const newCategoryBtn = document.getElementById('new-category-btn');
                    const newSnippetBtn = document.getElementById('new-snippet-btn');
                    const insertBtn = document.getElementById('insert-btn');
                    const saveBtn = document.getElementById('save-btn');
                    const deleteBtn = document.getElementById('delete-btn');
                    
                    // Initialize
                    const vscode = acquireVsCodeApi();
                    
                    // Load snippets
                    vscode.postMessage({ command: 'getSnippets' });
                    
                    // Event listeners
                    newCategoryBtn.addEventListener('click', () => {
                        createNewCategory();
                    });
                    newSnippetBtn.addEventListener('click', createNewSnippet);
                    insertBtn.addEventListener('click', insertSnippet);
                    saveBtn.addEventListener('click', saveSnippet);
                    deleteBtn.addEventListener('click', deleteSnippet);
                    searchInput.addEventListener('input', filterSnippets);
                    
                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.command) {
                            case 'snippetsLoaded':
                                snippets = message.snippets;
                                renderCategories();
                                break;
                                
                            case 'snippetSaved':
                                vscode.postMessage({ command: 'getSnippets' });
                                break;
                                
                            case 'snippetDeleted':
                                if (message.success) {
                                    // Refresh the snippets list
                                    vscode.postMessage({ command: 'getSnippets' });
                                }
                                break;
                                
                            case 'categoryCreated':
                                vscode.postMessage({ command: 'getSnippets' });
                                break;
                            
                            case 'editorAvailable':
                                if (message.available && pendingInsertSnippet) {
                                    vscode.postMessage({ command: 'insertSnippet', snippet: pendingInsertSnippet });
                                    pendingInsertSnippet = null;
                                }
                                break;
                            
                            case 'snippetMoved':
                                if (message.success) {
                                    // Refresh the snippets list
                                    vscode.postMessage({ command: 'getSnippets' });
                                }
                                break;
                        }
                    });
                    
                    // Functions
                    function renderCategories() {
                        if (snippets.length === 0) {
                            categoriesList.innerHTML = '<div class="no-snippets">No snippets found</div>';
                            return;
                        }
                        
                        categoriesList.innerHTML = '';
                        categorySelect.innerHTML = '';
                        
                        snippets.forEach(category => {
                            // Add to category dropdown
                            const option = document.createElement('option');
                            option.value = category.name;
                            option.textContent = category.name;
                            categorySelect.appendChild(option);
                            
                            // Add to sidebar
                            const categoryEl = document.createElement('div');
                            categoryEl.className = 'category';
                            categoryEl.dataset.categoryName = category.name;
                            
                            const header = document.createElement('div');
                            header.className = 'category-header';
                            
                            // Add category icon
                            const categoryIcon = document.createElement('img');
                            categoryIcon.src = '${categoryIconUri}';
                            categoryIcon.alt = 'Category';
                            header.appendChild(categoryIcon);
                            
                            const headerText = document.createElement('span');
                            headerText.textContent = \`\${category.name} (\${category.snippets.length})\`;
                            header.appendChild(headerText);
                            
                            header.addEventListener('click', () => {
                                const list = categoryEl.querySelector('.snippet-list');
                                list.style.display = list.style.display === 'none' ? 'block' : 'none';
                            });
                            
                            const snippetList = document.createElement('div');
                            snippetList.className = 'snippet-list';
                            
                            // Add drop zone for this category
                            const dropZone = document.createElement('div');
                            dropZone.className = 'category-drop-zone';
                            dropZone.dataset.categoryName = category.name;
                            dropZone.textContent = 'Drop snippet here';
                            dropZone.style.display = 'none'; // Hide initially
                            
                            // Add drop zone event listeners
                            dropZone.addEventListener('dragover', (e) => {
                                e.preventDefault();
                                dropZone.classList.add('drag-over');
                            });
                            
                            dropZone.addEventListener('dragleave', () => {
                                dropZone.classList.remove('drag-over');
                            });
                            
                            dropZone.addEventListener('drop', (e) => {
                                e.preventDefault();
                                dropZone.classList.remove('drag-over');
                                
                                // Get the snippet ID and source category from the drag data
                                const snippetId = e.dataTransfer.getData('snippetId');
                                const sourceCategory = e.dataTransfer.getData('sourceCategory');
                                const targetCategory = category.name;
                                
                                // Only move if dropping to a different category
                                if (sourceCategory !== targetCategory) {
                                    moveSnippetToCategory(snippetId, sourceCategory, targetCategory);
                                }
                                
                                // Hide all drop zones
                                document.querySelectorAll('.category-drop-zone').forEach(zone => {
                                    zone.style.display = 'none';
                                });
                            });
                            
                            snippetList.appendChild(dropZone);
                            
                            category.snippets.forEach(snippet => {
                                const snippetItem = document.createElement('div');
                                snippetItem.className = 'snippet-item';
                                snippetItem.draggable = true;
                                snippetItem.dataset.snippetId = snippet.id;
                                snippetItem.dataset.categoryName = category.name;
                                
                                // Add drag event listeners
                                snippetItem.addEventListener('dragstart', (e) => {
                                    e.dataTransfer.setData('snippetId', snippet.id);
                                    e.dataTransfer.setData('sourceCategory', category.name);
                                    snippetItem.classList.add('dragging');
                                    
                                    // Show all drop zones except in this category
                                    document.querySelectorAll('.category-drop-zone').forEach(zone => {
                                        if (zone.dataset.categoryName !== category.name) {
                                            zone.style.display = 'block';
                                        }
                                    });
                                });
                                
                                snippetItem.addEventListener('dragend', () => {
                                    snippetItem.classList.remove('dragging');
                                    
                                    // Hide all drop zones
                                    document.querySelectorAll('.category-drop-zone').forEach(zone => {
                                        zone.style.display = 'none';
                                    });
                                });
                                
                                // Add snippet icon
                                const snippetIcon = document.createElement('img');
                                snippetIcon.src = '${snippetIconUri}';
                                snippetIcon.alt = 'Snippet';
                                snippetItem.appendChild(snippetIcon);
                                
                                const snippetText = document.createElement('span');
                                snippetText.textContent = snippet.title;
                                
                                if (snippet.isFavorite) {
                                    // Add favorite icon
                                    const favoriteIcon = document.createElement('img');
                                    favoriteIcon.src = '${favoriteIconUri}';
                                    favoriteIcon.alt = 'Favorite';
                                    favoriteIcon.style.marginLeft = 'auto';
                                    snippetItem.appendChild(snippetText);
                                    snippetItem.appendChild(favoriteIcon);
                                    snippetItem.classList.add('favorite');
                                } else {
                                    snippetItem.appendChild(snippetText);
                                }
                                
                                snippetItem.addEventListener('click', () => {
                                    selectSnippet(snippet);
                                });
                                
                                snippetList.appendChild(snippetItem);
                            });
                            
                            categoryEl.appendChild(header);
                            categoryEl.appendChild(snippetList);
                            categoriesList.appendChild(categoryEl);
                        });
                        
                        // Apply search filter if there's a search term
                        if (searchInput.value) {
                            filterSnippets();
                        }
                    }
                    
                    function selectSnippet(snippet) {
                        currentSnippet = snippet;
                        isNewSnippet = false;
                        
                        // Update form
                        titleInput.value = snippet.title;
                        descriptionInput.value = snippet.description;
                        codeEditor.textContent = snippet.code;
                        languageSelect.value = snippet.language;
                        categorySelect.value = snippet.category;
                        tagsInput.value = snippet.tags.join(', ');
                        favoriteCheckbox.checked = snippet.isFavorite;
                        
                        // Show form, hide empty state
                        snippetForm.style.display = 'block';
                        emptyState.style.display = 'none';
                        
                        // Update active state in sidebar
                        document.querySelectorAll('.snippet-item').forEach(item => {
                            item.classList.remove('active');
                            if (item.textContent.includes(snippet.title)) {
                                item.classList.add('active');
                            }
                        });
                    }
                    
                    function createNewSnippet() {
                        isNewSnippet = true;
                        
                        // Clear form
                        titleInput.value = '';
                        descriptionInput.value = '';
                        codeEditor.textContent = '';
                        languageSelect.value = 'javascript';
                        tagsInput.value = '';
                        favoriteCheckbox.checked = false;
                        
                        // Select first category if available
                        if (categorySelect.options.length > 0) {
                            categorySelect.selectedIndex = 0;
                        }
                        
                        // Show form, hide empty state
                        snippetForm.style.display = 'block';
                        emptyState.style.display = 'none';
                        
                        // Remove active state in sidebar
                        document.querySelectorAll('.snippet-item').forEach(item => {
                            item.classList.remove('active');
                        });
                    }
                    
                    function saveSnippet() {
                        const title = titleInput.value.trim();
                        if (!title) {
                            alert('Title is required');
                            return;
                        }
                        
                        const code = codeEditor.textContent.trim();
                        if (!code) {
                            alert('Code is required');
                            return;
                        }
                        
                        const snippet = {
                            id: isNewSnippet ? generateId() : currentSnippet.id,
                            title,
                            description: descriptionInput.value.trim(),
                            code,
                            language: languageSelect.value,
                            category: categorySelect.value,
                            tags: tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag),
                            dateCreated: isNewSnippet ? Date.now() : currentSnippet.dateCreated,
                            dateModified: Date.now(),
                            isFavorite: favoriteCheckbox.checked
                        };
                        
                        vscode.postMessage({ command: 'saveSnippet', snippet });
                        
                        // Clear form if it's a new snippet
                        if (isNewSnippet) {
                            clearForm();
                        }
                    }
                    
                    function deleteSnippet() {
                        if (!currentSnippet) return;
                        
                        if (confirm(\`Are you sure you want to delete "\${currentSnippet.title}"?\`)) {
                            vscode.postMessage({ command: 'deleteSnippet', snippetId: currentSnippet.id });
                            
                            // Clear the form after deletion
                            clearForm();
                            showEmptyState();
                        }
                    }
                    
                    function insertSnippet() {
                        if (!currentSnippet && !isNewSnippet) return;
                        
                        const code = codeEditor.textContent.trim();
                        if (!code) {
                            alert('No code to insert');
                            return;
                        }
                        
                        const snippet = isNewSnippet ? {
                            code,
                            title: titleInput.value.trim() || 'Untitled'
                        } : currentSnippet;
                        
                        // First check if we can insert, then try to insert
                        vscode.postMessage({ command: 'checkActiveEditor' });
                        
                        // Store the snippet to insert when we get confirmation
                        pendingInsertSnippet = snippet;
                    }
                    
                    function createNewCategory() {
                        const categoryName = prompt('Enter a new category name:');
                        if (categoryName && categoryName.trim()) {
                            vscode.postMessage({ command: 'createCategory', categoryName: categoryName.trim() });
                        }
                    }
                    
                    function filterSnippets() {
                        const searchTerm = searchInput.value.toLowerCase();
                        
                        document.querySelectorAll('.category').forEach(categoryEl => {
                            const snippetItems = categoryEl.querySelectorAll('.snippet-item');
                            let visibleCount = 0;
                            
                            snippetItems.forEach(item => {
                                const snippetTitle = item.textContent.toLowerCase();
                                if (snippetTitle.includes(searchTerm)) {
                                    item.style.display = 'block';
                                    visibleCount++;
                                } else {
                                    item.style.display = 'none';
                                }
                            });
                            
                            // Show/hide category based on whether it has visible snippets
                            categoryEl.style.display = visibleCount > 0 ? 'block' : 'none';
                            
                            // Update category header count
                            const header = categoryEl.querySelector('.category-header');
                            const categoryName = header.textContent.split(' (')[0];
                            header.textContent = \`\${categoryName} (\${visibleCount})\`;
                        });
                    }
                    
                    function showEmptyState() {
                        snippetForm.style.display = 'none';
                        emptyState.style.display = 'block';
                    }
                    
                    function generateId() {
                        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                    }
                    
                    function clearForm() {
                        titleInput.value = '';
                        descriptionInput.value = '';
                        codeEditor.textContent = '';
                        tagsInput.value = '';
                        favoriteCheckbox.checked = false;
                        // Don't reset language and category as they're likely to be reused
                    }
                    
                    function moveSnippetToCategory(snippetId, sourceCategory, targetCategory) {
                        // Find the snippet in the source category
                        const sourceCategoryObj = snippets.find(cat => cat.name === sourceCategory);
                        if (!sourceCategoryObj) return;
                        
                        const snippetIndex = sourceCategoryObj.snippets.findIndex(s => s.id === snippetId);
                        if (snippetIndex === -1) return;
                        
                        // Get the snippet object
                        const snippet = sourceCategoryObj.snippets[snippetIndex];
                        
                        // Update the category
                        snippet.category = targetCategory;
                        
                        // Send message to update the snippet
                        vscode.postMessage({ 
                            command: 'moveSnippet', 
                            snippet,
                            sourceCategory,
                            targetCategory
                        });
                    }
                })();
            </script>
        </body>
        </html>
    `;
} 