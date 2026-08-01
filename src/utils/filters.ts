/**
 * Template content filters
 *
 * Filters run on the raw text of the main template and of every included
 * file, before any tag is parsed.
 *
 * @module utils/filters
 */

import type { Filter } from '../types.js';

/**
 * Apply the configured filters to template text.
 *
 * @param source - Template text
 * @param filters - Filters to apply, in order
 * @returns Filtered text
 */
export function applyFilters(source: string, filters: readonly Filter[]): string {
  if (filters.length === 0) return source;

  let content: string | string[] = source;

  for (const entry of filters) {
    const format = entry.format ?? 'scalar';

    content = format === 'array' ? entry.sub(toLines(content)) : entry.sub(toText(content));
  }

  return toText(content);
}

/**
 * Coerce filter content to a single string.
 *
 * @param content - Filter content
 * @returns Joined text
 */
function toText(content: string | string[]): string {
  return Array.isArray(content) ? content.join('') : content;
}

/**
 * Coerce filter content to an array of lines, keeping their newlines.
 *
 * @param content - Filter content
 * @returns Lines
 */
function toLines(content: string | string[]): string[] {
  return Array.isArray(content) ? content : content.split(/(?<=\n)/);
}
