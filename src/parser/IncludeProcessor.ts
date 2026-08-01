/**
 * Include processor
 *
 * Expands TMPL_INCLUDE tags into the template text before tokenization, so
 * the parser only ever sees a single flattened source.
 *
 * @module parser/IncludeProcessor
 */

import { readTemplateFile } from '../loader/source.js';
import type { HTMLTemplateOptions } from '../types.js';
import { resolveFile } from '../utils/FileResolver.js';
import { applyFilters } from '../utils/filters.js';
import { createError } from '../utils/helpers.js';
import { parseTagAttributes, TagSyntaxError } from './attributes.js';
import { stripComments } from './comments.js';
import { createIncludePattern } from './tagPattern.js';

/**
 * Matches a TMPL_INCLUDE tag, capturing its attribute text.
 */
const INCLUDE_REGEX = createIncludePattern();

/**
 * Result of expanding every include in a template.
 */
export interface IncludeResult {
  /** Template text with all includes expanded */
  source: string;

  /** Modification time of each included file, for cache validation */
  mtimes: Map<string, number>;
}

/**
 * State threaded through recursive include expansion.
 */
interface IncludeContext {
  /** Current nesting depth */
  depth: number;

  /** Files on the current include chain, for cycle detection */
  processing: Set<string>;

  /** Modification times collected so far */
  mtimes: Map<string, number>;

  /** Template options */
  options: HTMLTemplateOptions;

  /** File the current text came from, for relative resolution */
  currentFile?: string;
}

/**
 * Expand every TMPL_INCLUDE in a template.
 *
 * @param source - Template text
 * @param options - Template options
 * @param currentFile - Path of the template, for relative include resolution
 * @returns Expanded text and the modification times of included files
 */
export function processIncludes(source: string, options: HTMLTemplateOptions, currentFile?: string): IncludeResult {
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

  return { source: expand(source, context), mtimes: context.mtimes };
}

/**
 * Replace every include tag in one file's text.
 *
 * @param source - Template text
 * @param context - Include state
 * @returns Text with this level's includes expanded
 */
function expand(source: string, context: IncludeContext): string {
  const maxIncludes = context.options.max_includes ?? 10;
  if (maxIncludes > 0 && context.depth >= maxIncludes) {
    throw createError(
      `HTML::Template->new() : likely recursive includes - parsed ${maxIncludes} files deep and giving up (set max_includes higher to allow deeper recursion).`
    );
  }

  // A fresh regex per call keeps recursive expansion from sharing lastIndex.
  const regex = new RegExp(INCLUDE_REGEX.source, INCLUDE_REGEX.flags);

  return source.replace(regex, (_match, attrString: string) => {
    const filename = parseIncludeName(attrString);

    try {
      return loadInclude(filename, context);
    } catch (error) {
      if (context.options.die_on_missing_include ?? true) {
        throw error;
      }
      return '';
    }
  });
}

/**
 * Extract the NAME of an include tag.
 *
 * @param attrString - Attribute text from the tag
 * @returns Include filename
 * @throws Error when the tag has no usable NAME
 */
function parseIncludeName(attrString: string): string {
  let name: string | undefined;

  try {
    name = parseTagAttributes(attrString).name;
  } catch (error) {
    if (error instanceof TagSyntaxError) {
      throw createError(`Syntax error in <TMPL_INCLUDE> tag: ${error.message}`);
    }
    throw error;
  }

  if (!name) {
    throw createError('HTML::Template->new() : No NAME given to a TMPL_INCLUDE tag');
  }

  return name;
}

/**
 * Read one included file and expand its own includes.
 *
 * @param filename - Include filename as written in the template
 * @param context - Include state
 * @returns Fully expanded contents of the included file
 * @throws Error when the file cannot be found or the chain is circular
 */
function loadInclude(filename: string, context: IncludeContext): string {
  const { filepath, mtime } = resolveFile(filename, {
    path: context.options.path ?? [],
    searchPathOnInclude: context.options.search_path_on_include ?? false,
    currentFile: context.currentFile
  });

  if (context.processing.has(filepath)) {
    throw createError(
      `HTML::Template->new() : likely recursive includes - ${filepath} includes itself directly or indirectly.`
    );
  }

  context.processing.add(filepath);
  context.mtimes.set(filepath, mtime);

  // Included text goes through the same preprocessing as the main template.
  let content = applyFilters(readTemplateFile(filepath, context.options), context.options.filter);
  content = stripComments(content);

  const previousFile = context.currentFile;
  context.currentFile = filepath;
  context.depth += 1;

  const expanded = expand(content, context);

  context.depth -= 1;
  context.currentFile = previousFile;
  context.processing.delete(filepath);

  return expanded;
}
