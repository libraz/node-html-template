/**
 * Parser internal types
 * Types used only within the parser implementation
 *
 * @module parser/types
 */

/**
 * The text a tokenizer is working through, plus where it came from.
 */
export interface ParseContext {
  /** Source template string */
  source: string;

  /** Template filename, when the source came from disk */
  filename?: string;
}
