/**
 * Shared tag grammar
 *
 * The tokenizer and the include expander must agree on exactly what counts as
 * a TMPL tag: an include the expander misses would reach the tokenizer as an
 * unresolved tag, and one it matches too eagerly would swallow markup. Both
 * locate tags through {@link scanTags} so the two cannot drift.
 *
 * A tag opens as Perl splits the template: `<` immediately followed by
 * `TMPL_`, or by the HTML comment form `<!--`. It ends at the first `>`.
 *
 * @module parser/tagPattern
 */

/** Opening delimiter: `<`, optionally the HTML comment form `<!--`. */
export const TAG_OPEN = String.raw`<(?:!--\s*)?`;

/** Tag head: opening delimiter, optional slash and the tag name. */
const TAG_HEAD = `${TAG_OPEN}(\\/?)TMPL_(\\w+)`;

/**
 * Matches anything that merely looks like a TMPL tag opener, used to tell a
 * malformed tag apart from ordinary markup.
 */
export const TAG_LOOKALIKE = new RegExp(`${TAG_OPEN}\\/?TMPL_`, 'i');

/**
 * One TMPL_* tag found in a text.
 */
export interface TagMatch {
  /** Offset of the tag's `<` */
  start: number;

  /** Offset just past the tag's `>` */
  end: number;

  /** Whether the tag name carried a leading slash */
  closing: boolean;

  /** Tag name after `TMPL_`, as written */
  name: string;

  /** Attribute text, without the closing `--` or self-closing slash */
  attributes: string;
}

/**
 * Find every TMPL_* tag in a text, in source order.
 *
 * Runs in time linear in the text length. Once a tag head has no `>` after
 * it, no later head can have one either, so the scan stops rather than
 * retrying from every remaining position.
 *
 * @param text - Template text
 * @returns Tags in source order
 */
export function scanTags(text: string): TagMatch[] {
  const head = new RegExp(TAG_HEAD, 'gi');
  const tags: TagMatch[] = [];

  for (let match = head.exec(text); match !== null; match = head.exec(text)) {
    const close = text.indexOf('>', head.lastIndex);
    if (close === -1) break;

    tags.push({
      start: match.index,
      end: close + 1,
      closing: match[1] === '/',
      name: match[2] ?? '',
      attributes: attributeText(text.slice(head.lastIndex, close))
    });

    head.lastIndex = close + 1;
  }

  return tags;
}

/**
 * Strip the closing delimiter's optional parts from raw attribute text.
 *
 * Mirrors the closing grammar `\s*(?:--\s*)?\/?\s*>` without a regex whose
 * adjacent quantifiers would backtrack over long whitespace runs.
 *
 * @param raw - Text between the tag name and the closing `>`
 * @returns Attribute text
 */
function attributeText(raw: string): string {
  let text = raw.trim();

  if (text.endsWith('/')) text = text.slice(0, -1).trimEnd();
  if (text.endsWith('--')) text = text.slice(0, -2).trimEnd();

  return text;
}
