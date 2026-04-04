/**
 * Include processor
 * Handles TMPL_INCLUDE tag expansion before parsing
 *
 * Features:
 * - Recursive include processing
 * - Circular include detection
 * - max_includes depth limiting
 * - die_on_missing_include support
 *
 * @module parser/IncludeProcessor
 */

// processIncludesRecursive and loadIncludeFile are mutually recursive

import { readFileSync } from 'node:fs';
import type { HTMLTemplateOptions } from '../types.js';
import { resolveFile } from '../utils/FileResolver.js';
import { readFileWithEncoding } from '../utils/encoding.js';
import { createError } from '../utils/helpers.js';

/**
 * Include tag regex pattern
 * Matches: <TMPL_INCLUDE NAME="filename"> or <!-- TMPL_INCLUDE NAME="filename" -->
 * Note: Not using /g flag - we create new regex instances for each call
 */
const INCLUDE_PATTERN = /<\s*(?:!--\s*)?TMPL_INCLUDE\s+NAME\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*(?:--\s*)?>/i;

/**
 * Include processing context
 */
interface IncludeContext {
  /**
   * Current include depth
   */
  depth: number;

  /**
   * Set of files being processed (for circular detection)
   */
  processing: Set<string>;

  /**
   * Map of all included files and their mtimes
   */
  mtimes: Map<string, number>;

  /**
   * Template options
   */
  options: HTMLTemplateOptions;

  /**
   * Current file being processed
   */
  currentFile?: string;
}

/**
 * Process TMPL_INCLUDE tags in template
 * Recursively expands includes before parsing
 *
 * @param source - Template source with INCLUDE tags
 * @param options - Template options
 * @param currentFile - Current file path (for relative includes)
 * @returns Processed template source and file mtimes
 */
export function processIncludes(
  source: string,
  options: HTMLTemplateOptions,
  currentFile?: string
): { source: string; mtimes: Map<string, number> } {
  // If includes disabled, return as-is
  if (options.no_includes) {
    return { source, mtimes: new Map() };
  }

  const context: IncludeContext = {
    depth: 0,
    processing: new Set(),
    mtimes: new Map(),
    options,
    currentFile
  };

  const processed = processIncludesRecursive(source, context);

  return { source: processed, mtimes: context.mtimes };
}

/**
 * Recursively process includes in source
 *
 * @param source - Template source
 * @param context - Include context
 * @returns Processed source
 */
function processIncludesRecursive(source: string, context: IncludeContext): string {
  // Check depth limit
  const maxIncludes = context.options.max_includes ?? 10;
  if (maxIncludes > 0 && context.depth >= maxIncludes) {
    throw createError(`TMPL_INCLUDE recursion depth exceeded (max: ${maxIncludes})`);
  }

  // Use String.replace() to find and replace all includes
  // This approach avoids issues with shared regex state during recursion
  let result = source;

  // Keep processing until no more includes found
  // Create new regex instance for each iteration to avoid state issues
  const includeRegex = new RegExp(INCLUDE_PATTERN, 'g');

  result = result.replace(includeRegex, (_match, quoted1, quoted2, unquoted) => {
    // Get filename from match (can be in quoted1, quoted2, or unquoted)
    const filename = quoted1 ?? quoted2 ?? unquoted ?? '';

    if (!filename) {
      throw createError('TMPL_INCLUDE requires NAME attribute');
    }

    // Process this include
    try {
      const includedContent = loadIncludeFile(filename, context);
      return includedContent;
    } catch (error) {
      if (context.options.die_on_missing_include ?? true) {
        throw error;
      }
      // If die_on_missing_include is false, skip the include silently
      return '';
    }
  });

  return result;
}

/**
 * Load and process include file
 *
 * @param filename - Include filename
 * @param context - Include context
 * @returns Processed include content
 */
function loadIncludeFile(filename: string, context: IncludeContext): string {
  // Resolve file path
  const resolved = resolveFile(filename, {
    path: context.options.path ?? [],
    searchPathOnInclude: context.options.search_path_on_include ?? false,
    currentFile: context.currentFile
  });

  const { filepath, mtime } = resolved;

  // Check for circular includes
  if (context.processing.has(filepath)) {
    throw createError(`Circular TMPL_INCLUDE detected: ${filepath}`);
  }

  // Add to processing set
  context.processing.add(filepath);

  // Add mtime to tracking
  context.mtimes.set(filepath, mtime);

  // Read file
  let content: string;
  if (context.options.utf8) {
    content = readFileWithEncoding(filepath, 'utf-8');
  } else if (context.options.open_mode) {
    content = readFileWithEncoding(filepath, context.options.open_mode);
  } else {
    content = readFileSync(filepath, 'utf-8');
  }

  // Process nested includes
  const prevFile = context.currentFile;
  context.currentFile = filepath;
  context.depth += 1;

  const processed = processIncludesRecursive(content, context);

  context.depth -= 1;
  context.currentFile = prevFile;

  // Remove from processing set
  context.processing.delete(filepath);

  return processed;
}
