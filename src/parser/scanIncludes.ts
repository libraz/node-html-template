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

import { parseTagAttributes, type TagAttributes, TagSyntaxError, validateTagAttributes } from './attributes.js';
import { type TemplateText, templateError } from './sourceMap.js';
import { scanTags } from './tagPattern.js';

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
 * @param template - Prepared template text
 * @returns Includes in source order, with offsets into `template.text`
 * @throws Error naming the template and line when a tag is malformed or
 *   carries no NAME
 */
export function scanIncludes(template: TemplateText): IncludeRef[] {
  const refs: IncludeRef[] = [];

  for (const tag of scanTags(template.text)) {
    if (tag.closing || tag.name.toUpperCase() !== 'INCLUDE') continue;

    refs.push({ start: tag.start, end: tag.end, name: parseIncludeName(tag.attributes, template, tag.start) });
  }

  return refs;
}

/**
 * Extract the NAME of an include tag.
 *
 * @param attributes - Attribute text from the tag
 * @param template - Template the tag appears in
 * @param offset - Offset of the tag in the prepared text
 * @returns Template name
 * @throws Error when the tag has no usable NAME
 */
function parseIncludeName(attributes: string, template: TemplateText, offset: number): string {
  let attrs: TagAttributes;

  try {
    attrs = parseTagAttributes(attributes);
  } catch (error) {
    if (!(error instanceof TagSyntaxError)) throw error;
    throw templateError(`Syntax error in <TMPL_INCLUDE> tag: ${error.message}`, template.locate(offset));
  }

  if (!attrs.name) {
    throw templateError('HTML::Template->new() : No NAME given to a TMPL_INCLUDE tag', template.locate(offset));
  }

  const invalid = validateTagAttributes('INCLUDE', attrs);
  if (invalid) {
    throw templateError(`Syntax error in <TMPL_INCLUDE> tag: ${invalid}`, template.locate(offset));
  }

  return attrs.name;
}
