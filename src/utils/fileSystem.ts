import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads directory contents recursively
 */
export async function readDirectoryRecursive(
    dirPath: string, 
    options: { 
        maxDepth?: number, 
        exclude?: string[], 
        includeOnly?: string[] 
    } = {}
): Promise<string[]> {
    const { maxDepth = Infinity, exclude = [], includeOnly = [] } = options;
    let results: string[] = [];
    
    // Check if we've reached the maximum depth
    if (maxDepth <= 0) {
        return results;
    }
    
    try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            // Check if this path should be excluded
            if (shouldExcludePath(fullPath, exclude)) {
                continue;
            }
            
            // Check if we should only include specific patterns
            if (includeOnly.length > 0 && !includeOnly.some(pattern => 
                entry.name === pattern || entry.name.match(pattern)
            )) {
                continue;
            }
            
            // Add this path to results
            results.push(fullPath);
            
            // If it's a directory, recursively scan it
            if (entry.isDirectory()) {
                const subDirResults = await readDirectoryRecursive(fullPath, {
                    maxDepth: maxDepth - 1,
                    exclude,
                    includeOnly
                });
                results = results.concat(subDirResults);
            }
        }
    } catch (error) {
        console.error(`Error reading directory ${dirPath}:`, error);
    }
    
    return results;
}

/**
 * Checks if a path should be excluded based on patterns
 */
export function shouldExcludePath(filePath: string, patterns: string[]): boolean {
    const fileName = path.basename(filePath);
    
    for (const pattern of patterns) {
        // Exact match
        if (fileName === pattern) {
            return true;
        }
        
        // Simple wildcard matching (e.g., *.js)
        if (pattern.startsWith('*') && fileName.endsWith(pattern.substring(1))) {
            return true;
        }
        
        // Regex pattern
        try {
            const regex = new RegExp(pattern);
            if (regex.test(fileName)) {
                return true;
            }
        } catch (error) {
            // Invalid regex, ignore
        }
    }
    
    return false;
}

/**
 * Gets the relative path from workspace root
 */
export function getRelativePath(absolutePath: string): string | null {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) return null;
    
    return path.relative(workspaceRoot, absolutePath);
} 