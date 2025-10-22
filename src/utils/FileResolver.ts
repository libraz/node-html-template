/**
 * File resolver
 * Handles template file path resolution compatible with Perl HTML::Template
 *
 * @module utils/FileResolver
 */

import { existsSync, statSync } from 'fs';
import {
  resolve, dirname, isAbsolute, join
} from 'path';
import { createError } from './helpers.js';

/**
 * File resolver options
 */
export interface FileResolverOptions {
  /**
   * Search paths for template files
   */
  path: string[];

  /**
   * Search from top of path array for each include
   * If false, only search relative to current file
   */
  searchPathOnInclude: boolean;

  /**
   * Current file being processed (for relative includes)
   */
  currentFile?: string;
}

/**
 * File resolution result
 */
export interface ResolvedFile {
  /**
   * Absolute path to resolved file
   */
  filepath: string;

  /**
   * File modification time (milliseconds since epoch)
   */
  mtime: number;
}

/**
 * Validate file exists and get its info
 *
 * @param filepath - Absolute file path
 * @returns File info
 * @throws Error if file doesn't exist or is not readable
 */
function validateAndGetFile(filepath: string): ResolvedFile {
  if (!existsSync(filepath)) {
    throw createError(`File not found: ${filepath}`);
  }

  const stats = statSync(filepath);

  if (!stats.isFile()) {
    throw createError(`Not a file: ${filepath}`);
  }

  return {
    filepath,
    mtime: stats.mtimeMs
  };
}

/**
 * Resolve template file path
 * Implements Perl HTML::Template's file resolution algorithm
 *
 * Search order:
 * 1. If absolute path: use directly
 * 2. Relative to current file directory (if currentFile provided)
 * 3. HTML_TEMPLATE_ROOT environment variable
 * 4. Each path in 'path' option array
 * 5. Relative to current working directory
 * 6. HTML_TEMPLATE_ROOT + each path from 'path' option
 *
 * @param filename - Template filename to resolve
 * @param options - Resolution options
 * @returns Resolved file info
 * @throws Error if file not found
 */
export function resolveFile(filename: string, options: FileResolverOptions): ResolvedFile {
  // 1. Absolute path: use directly
  if (isAbsolute(filename)) {
    return validateAndGetFile(filename);
  }

  // Build search paths
  const searchPaths: string[] = [];

  // 2. Relative to current file (for TMPL_INCLUDE)
  if (options.currentFile && !options.searchPathOnInclude) {
    const currentDir = dirname(options.currentFile);
    searchPaths.push(currentDir);
  }

  // 3. HTML_TEMPLATE_ROOT environment variable
  const templateRoot = process.env.HTML_TEMPLATE_ROOT;
  if (templateRoot) {
    searchPaths.push(templateRoot);
  }

  // 4. Each path in 'path' option
  searchPaths.push(...options.path);

  // 5. Current working directory
  searchPaths.push(process.cwd());

  // 6. HTML_TEMPLATE_ROOT + each path from 'path' option
  if (templateRoot) {
    for (const p of options.path) {
      searchPaths.push(join(templateRoot, p));
    }
  }

  // Search each path
  for (const searchPath of searchPaths) {
    const candidatePath = resolve(searchPath, filename);
    if (existsSync(candidatePath)) {
      const stats = statSync(candidatePath);
      if (stats.isFile()) {
        return {
          filepath: candidatePath,
          mtime: stats.mtimeMs
        };
      }
      // Not a file, continue searching
    }
  }

  // File not found
  throw createError(
    `HTML::Template->new() : Cannot open included file ${filename} : file not found`,
    undefined,
    undefined
  );
}

/**
 * Get file modification time
 * Used for cache validation
 *
 * @param filepath - Path to file
 * @returns Modification time in milliseconds, or -1 if file doesn't exist
 */
export function getFileMtime(filepath: string): number {
  try {
    const stats = statSync(filepath);
    return stats.mtimeMs;
  } catch {
    return -1;
  }
}

/**
 * Check if all files in a set are still valid (not modified)
 * Used for cache validation
 *
 * @param mtimes - Map of filepath -> mtime
 * @returns True if all files are unchanged
 */
export function validateMtimes(mtimes: Map<string, number>): boolean {
  for (const [filepath, expectedMtime] of mtimes.entries()) {
    const currentMtime = getFileMtime(filepath);
    if (currentMtime === -1 || currentMtime !== expectedMtime) {
      return false;
    }
  }
  return true;
}

/**
 * Resolve multiple files (main template + includes)
 * Returns map of all resolved files with their mtimes
 *
 * @param mainFile - Main template file
 * @param includes - Array of included filenames
 * @param options - Resolution options
 * @returns Map of filepath -> mtime for all files
 */
export function resolveMultipleFiles(
  mainFile: string,
  includes: string[],
  options: FileResolverOptions
): Map<string, number> {
  const mtimes = new Map<string, number>();

  // Resolve main file
  const main = resolveFile(mainFile, options);
  mtimes.set(main.filepath, main.mtime);

  // Resolve each include
  // If die_on_missing_include is false, errors will be caught upstream
  for (const includeFile of includes) {
    const resolved = resolveFile(includeFile, {
      ...options,
      currentFile: main.filepath
    });
    mtimes.set(resolved.filepath, resolved.mtime);
  }

  return mtimes;
}
