/**
 * Parser internal types
 * Types used only within the parser implementation
 *
 * @module parser/types
 */

import type { Token } from '../types.js';

/**
 * A token, plus the template that physically contains it.
 *
 * Line and column are positions in that template, so the parser reports an
 * error inside an include against the included file.
 */
export interface LocatedToken extends Token {
  /** Template id, when the template has one */
  file?: string;
}
