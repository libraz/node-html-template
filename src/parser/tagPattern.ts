/**
 * Shared tag grammar
 *
 * The tokenizer and the include expander must agree on exactly what counts as
 * a TMPL tag: an include the expander misses would reach the tokenizer as an
 * unresolved tag, and one it matches too eagerly would swallow markup. Both
 * derive their pattern from the fragments here so the two cannot drift.
 *
 * @module parser/tagPattern
 */

/** Opening delimiter: `<`, optionally the HTML comment form `<!--`. */
const OPEN = String.raw`<\s*(?:!--\s*)?`;

/** Attribute text, captured lazily so the closing delimiter wins. */
const ATTRIBUTES = String.raw`\s*([^>]*?)`;

/** Closing delimiter, allowing `-->` and a self-closing slash. */
const CLOSE = String.raw`\s*(?:--\s*)?\/?\s*>`;

/**
 * Build a pattern matching any TMPL_* tag.
 *
 * Captures the leading slash, the tag name and the attribute text. A fresh
 * instance is returned per call because the pattern is global and therefore
 * carries `lastIndex` between uses.
 *
 * @returns Global, case-insensitive tag pattern
 */
export function createTagPattern(): RegExp {
  return new RegExp(`${OPEN}(\\/?)TMPL_(\\w+)${ATTRIBUTES}${CLOSE}`, 'gi');
}

/**
 * Build a pattern matching a TMPL_INCLUDE tag, capturing its attribute text.
 *
 * @returns Global, case-insensitive include pattern
 */
export function createIncludePattern(): RegExp {
  return new RegExp(`${OPEN}TMPL_INCLUDE${ATTRIBUTES}${CLOSE}`, 'gi');
}
