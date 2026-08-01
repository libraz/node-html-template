/**
 * TMPL_COMMENT / TMPL_NOTE block removal
 *
 * These blocks are an extension: Perl HTML::Template 2.98 ships the feature as
 * an unimplemented test, and rejects the tag as a syntax error. Everything
 * between the opening and closing tag is dropped before parsing, so the block
 * may contain arbitrary text and tags.
 *
 * @module parser/comments
 */

const COMMENT_BLOCK_REGEX =
  /<\s*(?:!--\s*)?TMPL_(?:COMMENT|NOTE)\b[^>]*(?:--\s*)?>[\s\S]*?<\s*(?:!--\s*)?\/TMPL_(?:COMMENT|NOTE)\s*(?:--\s*)?>/gi;

/**
 * Remove every TMPL_COMMENT / TMPL_NOTE block from template text.
 *
 * @param source - Template text
 * @returns Text with comment blocks removed
 */
export function stripComments(source: string): string {
  return source.replace(COMMENT_BLOCK_REGEX, '');
}
