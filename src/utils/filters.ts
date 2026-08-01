/**
 * Template content filters
 *
 * Filters run on the raw text of the main template and of every included
 * file, before any tag is parsed.
 *
 * @module utils/filters
 */

import type { Filter, HTMLTemplateOptions } from '../types.js';

/** A filter as accepted by the `filter` option, before normalization */
type FilterInput = Filter | Filter['sub'];

/**
 * Apply the configured filters to template text.
 *
 * @param source - Template text
 * @param filter - `filter` option value, in any of its accepted shapes
 * @returns Filtered text
 */
export function applyFilters(source: string, filter: HTMLTemplateOptions['filter']): string {
  if (!filter) return source;

  const filters: FilterInput[] = Array.isArray(filter) ? filter : [filter];
  if (filters.length === 0) return source;

  let content: string | string[] = source;

  for (const entry of filters) {
    const sub = typeof entry === 'function' ? entry : entry.sub;
    const format = typeof entry === 'function' ? 'scalar' : (entry.format ?? 'scalar');

    content = format === 'array' ? sub(toLines(content)) : sub(toText(content));
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
