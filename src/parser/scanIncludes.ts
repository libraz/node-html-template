/**
 * Include scanning
 *
 * Locating includes and substituting them are separate steps: a scan returns
 * offsets, which the expander can fill in later and in any order. Doing both
 * at once — as a replace callback must — is what forces the whole pipeline to
 * be synchronous.
 *
 * @module parser/scanIncludes
 */

import { createError } from '../utils/helpers.js';
import { parseTagAttributes, TagSyntaxError } from './attributes.js';
import { createIncludePattern } from './tagPattern.js';

/**
 * One TMPL_INCLUDE tag found in a template.
 */
export interface IncludeRef {
  /** Offset of the tag's first character */
  start: number;

  /** Offset just past the tag's last character */
  end: number;

  /** Template name from the tag's NAME attribute */
  name: string;
}

/**
 * Find every include tag in a template.
 *
 * @param text - Template text
 * @returns Includes in source order
 * @throws Error when a tag is malformed or carries no NAME
 */
export function scanIncludes(text: string): IncludeRef[] {
  const pattern = createIncludePattern();
  const refs: IncludeRef[] = [];

  let match = pattern.exec(text);
  while (match !== null) {
    refs.push({
      start: match.index,
      end: match.index + match[0].length,
      name: parseIncludeName(match[1] ?? '')
    });
    match = pattern.exec(text);
  }

  return refs;
}

/**
 * Extract the NAME of an include tag.
 *
 * @param attributes - Attribute text from the tag
 * @returns Template name
 * @throws Error when the tag has no usable NAME
 */
function parseIncludeName(attributes: string): string {
  let name: string | undefined;

  try {
    name = parseTagAttributes(attributes).name;
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
