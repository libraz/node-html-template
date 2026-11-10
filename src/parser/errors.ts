/**
 * Template source errors
 *
 * @module parser/errors
 */

/**
 * The template text itself is wrong: a malformed tag, a misnested block, or a
 * tag the compile settings reject.
 *
 * Carries where the problem was written so a tool can point at it without
 * parsing the message. For a tag inside an included template, `file` and
 * `line` name the included template and its own line.
 */
export class TemplateSyntaxError extends Error {
  override readonly name = 'TemplateSyntaxError';

  /** Template id of the file containing the problem, when it has one */
  readonly file: string | undefined;

  /** 1-based line, when known */
  readonly line: number | undefined;

  /** 1-based column, when known */
  readonly col: number | undefined;

  /**
   * @param message - Full message, location included
   * @param location - Where the problem was written
   */
  constructor(message: string, location: { file?: string; line?: number; col?: number } = {}) {
    super(message);
    this.file = location.file;
    this.line = location.line;
    this.col = location.col;
  }
}
