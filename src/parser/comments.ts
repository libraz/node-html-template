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

import { TAG_OPEN } from './tagPattern.js';

/** Opening tag up to its name; the tag ends at the next `>`. */
const COMMENT_OPEN = new RegExp(`${TAG_OPEN}TMPL_(?:COMMENT|NOTE)\\b`, 'gi');

/** Closing tag. */
const COMMENT_CLOSE = new RegExp(`${TAG_OPEN}\\/TMPL_(?:COMMENT|NOTE)\\s*(?:--\\s*)?>`, 'gi');

/**
 * One removed comment block.
 */
export interface CommentCut {
  /** Offset in the stripped text where the block stood */
  at: number;

  /** Length of the removed block */
  removed: number;
}

/**
 * Remove every TMPL_COMMENT / TMPL_NOTE block from template text.
 *
 * Runs in time linear in the text length: a block without a closing tag means
 * no later block has one either, so the scan stops there.
 *
 * @param source - Template text
 * @returns Text with comment blocks removed, and where each block was cut
 */
export function stripComments(source: string): { text: string; cuts: CommentCut[] } {
  const open = new RegExp(COMMENT_OPEN);
  const close = new RegExp(COMMENT_CLOSE);
  const parts: string[] = [];
  const cuts: CommentCut[] = [];
  let cursor = 0;
  let length = 0;

  for (let match = open.exec(source); match !== null; match = open.exec(source)) {
    const openEnd = source.indexOf('>', open.lastIndex);
    if (openEnd === -1) break;

    close.lastIndex = openEnd + 1;
    const end = close.exec(source);
    if (end === null) break;

    const kept = source.slice(cursor, match.index);
    parts.push(kept);
    length += kept.length;

    cursor = end.index + end[0].length;
    cuts.push({ at: length, removed: cursor - match.index });
    open.lastIndex = cursor;
  }

  if (cuts.length === 0) return { text: source, cuts };

  parts.push(source.slice(cursor));
  return { text: parts.join(''), cuts };
}
