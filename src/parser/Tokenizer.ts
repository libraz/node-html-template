/**
 * Template tokenizer
 * Converts a template string into the token stream consumed by the parser
 *
 * Tag recognition follows Perl HTML::Template: a tag is `<TMPL_X ...>` or the
 * HTML comment form `<!-- TMPL_X ... -->`, optionally self-closed with `/>`.
 * Anything shaped like a TMPL tag that does not parse is a fatal error under
 * `strict`, and literal text otherwise.
 *
 * @module parser/Tokenizer
 */

import type { Token } from '../types.js';
import { createError } from '../utils/helpers.js';
import { parseTagAttributes, type TagAttributes, TagSyntaxError } from './attributes.js';
import { createTagPattern } from './tagPattern.js';
import type { ParseContext } from './types.js';

// ============================================================================
// Precompiled Regular Expressions (Module Scope for Maximum Performance)
// ============================================================================

/**
 * Matches any TMPL_* tag, in plain or HTML-comment form.
 * Captures: leading slash, tag name, attribute text.
 */
const TAG_REGEX = createTagPattern();

/**
 * Matches anything that merely looks like a TMPL tag opener, used to tell a
 * malformed tag apart from ordinary markup.
 */
const TAG_LOOKALIKE_REGEX = /<\s*(?:!--\s*)?\/?TMPL_/i;

/**
 * Legacy Vanguard `%NAME%` syntax, using Perl's character class so dotted,
 * hyphenated and path-like names are substituted too.
 */
const VANGUARD_REGEX = /%([-\w/.+]+)%/g;

/** Tags whose NAME attribute is mandatory */
const TAGS_NEEDING_NAME = new Set(['VAR', 'LOOP', 'IF', 'UNLESS', 'INCLUDE']);

// ============================================================================
// Tokenizer Class
// ============================================================================

/**
 * Template tokenizer
 *
 * Converts a template string into a token stream for the parser.
 */
export class Tokenizer {
  private context: ParseContext;

  private vanguardMode: boolean;

  private strict: boolean;

  /** Running position tracker for O(1) amortized line/col calculation */
  private trackedPos = 0;

  private trackedLine = 1;

  private trackedCol = 1;

  /**
   * Create tokenizer
   *
   * @param source - Template source string
   * @param filename - Optional filename for error messages
   * @param vanguardMode - Enable Vanguard %VAR% syntax
   * @param strict - Treat malformed TMPL_* tags as errors
   */
  constructor(source: string, filename?: string, vanguardMode = false, strict = true) {
    this.context = { source, filename };
    this.vanguardMode = vanguardMode;
    this.strict = strict;
  }

  /**
   * Tokenize the entire template.
   *
   * @returns Token array
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];
    const { source } = this.context;

    TAG_REGEX.lastIndex = 0;

    let lastPos = 0;
    let match: RegExpExecArray | null = TAG_REGEX.exec(source);

    while (match !== null) {
      const matchStart = match.index;
      const matchEnd = TAG_REGEX.lastIndex;

      if (matchStart > lastPos) {
        this.addTextTokens(tokens, source.substring(lastPos, matchStart), lastPos);
      }

      const isClosing = match[1] === '/';
      const tagName = match[2]?.toUpperCase() ?? '';
      const attrString = match[3] ?? '';

      const token = this.createTagToken(tagName, attrString, isClosing, matchStart);
      if (token) {
        tokens.push(token);
      } else {
        // Non-strict mode keeps an unparsable tag as literal text, as Perl does.
        tokens.push(this.createTextToken(source.substring(matchStart, matchEnd), matchStart));
      }

      lastPos = matchEnd;
      match = TAG_REGEX.exec(source);
    }

    if (lastPos < source.length) {
      this.addTextTokens(tokens, source.substring(lastPos), lastPos);
    }

    return tokens;
  }

  /**
   * Append literal text, expanding Vanguard `%NAME%` syntax when enabled.
   *
   * @param tokens - Token array to append to
   * @param text - Text content
   * @param startPos - Offset of `text` within the source
   */
  private addTextTokens(tokens: Token[], text: string, startPos: number): void {
    if (text.length === 0) return;

    // Text that still looks like a tag means the tag regex never matched it,
    // which Perl reports as a syntax error rather than passing through.
    if (this.strict && TAG_LOOKALIKE_REGEX.test(text)) {
      throw createError(
        'Syntax error in <TMPL_*> tag: malformed tag',
        this.context.filename,
        this.getPosition(startPos).line
      );
    }

    if (!this.vanguardMode) {
      tokens.push(this.createTextToken(text, startPos));
      return;
    }

    VANGUARD_REGEX.lastIndex = 0;

    let lastPos = 0;
    let match: RegExpExecArray | null = VANGUARD_REGEX.exec(text);

    while (match !== null) {
      const matchStart = match.index;

      if (matchStart > lastPos) {
        tokens.push(this.createTextToken(text.substring(lastPos, matchStart), startPos + lastPos));
      }

      const varName = match[1];
      if (varName) {
        const position = this.getPosition(startPos + matchStart);
        tokens.push({
          type: 'VAR',
          name: varName,
          line: position.line,
          col: position.col
        });
      }

      lastPos = VANGUARD_REGEX.lastIndex;
      match = VANGUARD_REGEX.exec(text);
    }

    if (lastPos < text.length) {
      tokens.push(this.createTextToken(text.substring(lastPos), startPos + lastPos));
    }
  }

  /**
   * Create a text token.
   *
   * @param content - Text content
   * @param pos - Position in source
   * @returns Text token
   */
  private createTextToken(content: string, pos: number): Token {
    const position = this.getPosition(pos);

    return {
      type: 'TEXT',
      content,
      line: position.line,
      col: position.col
    };
  }

  /**
   * Build a token for one TMPL_* tag.
   *
   * @param tagName - Uppercased tag name
   * @param attrString - Raw attribute text
   * @param isClosing - Whether the tag had a leading slash
   * @param pos - Position in source
   * @returns Token, or null when a malformed tag should become literal text
   */
  private createTagToken(tagName: string, attrString: string, isClosing: boolean, pos: number): Token | null {
    const position = this.getPosition(pos);

    switch (tagName) {
      case 'VAR':
      case 'LOOP':
      case 'IF':
      case 'UNLESS':
      case 'INCLUDE':
      case 'ELSE':
        break;
      default:
        return this.rejectTag(`unknown TMPL tag TMPL_${tagName}`, position);
    }

    let attrs: TagAttributes;
    try {
      attrs = parseTagAttributes(attrString);
    } catch (error) {
      if (error instanceof TagSyntaxError) {
        return this.rejectTag(error.message, position);
      }
      throw error;
    }

    if (isClosing) {
      return this.createClosingToken(tagName, position);
    }

    const validationError = Tokenizer.validateAttributes(tagName, attrs);
    if (validationError) {
      return this.rejectTag(validationError, position);
    }

    switch (tagName) {
      case 'ELSE':
        return { type: 'ELSE', line: position.line, col: position.col };
      case 'VAR':
        return {
          type: 'VAR',
          name: attrs.name as string,
          escape: attrs.escape,
          default: attrs.default,
          line: position.line,
          col: position.col
        };
      case 'LOOP':
        return { type: 'LOOP', name: attrs.name as string, line: position.line, col: position.col };
      case 'IF':
        return { type: 'IF', name: attrs.name as string, line: position.line, col: position.col };
      case 'UNLESS':
        return { type: 'UNLESS', name: attrs.name as string, line: position.line, col: position.col };
      default:
        return { type: 'INCLUDE', name: attrs.name as string, line: position.line, col: position.col };
    }
  }

  /**
   * Build a token for a closing tag.
   *
   * `</TMPL_UNLESS>` and `</TMPL_IF>` produce the same token type but record
   * which spelling was used so the parser can reject a mismatched pair.
   *
   * @param tagName - Uppercased tag name
   * @param position - Position for error messages
   * @returns Closing token, or null when the tag cannot close anything
   */
  private createClosingToken(tagName: string, position: { line: number; col: number }): Token | null {
    switch (tagName) {
      case 'LOOP':
        return { type: 'ENDLOOP', line: position.line, col: position.col };
      case 'IF':
      case 'UNLESS':
        return { type: 'ENDIF', closes: tagName, line: position.line, col: position.col };
      default:
        return this.rejectTag(`TMPL_${tagName} has no closing form`, position);
    }
  }

  /**
   * Check attributes against the rules Perl enforces per tag.
   *
   * @param tagName - Uppercased tag name
   * @param attrs - Parsed attributes
   * @returns Error message, or undefined when valid
   */
  private static validateAttributes(tagName: string, attrs: TagAttributes): string | undefined {
    if (tagName !== 'VAR') {
      if (attrs.escape !== undefined) {
        return `ESCAPE option invalid in a TMPL_${tagName} tag`;
      }
      if (attrs.default !== undefined) {
        return `DEFAULT option invalid in a TMPL_${tagName} tag`;
      }
    }

    if (TAGS_NEEDING_NAME.has(tagName) && !attrs.name) {
      return `No NAME given to a TMPL_${tagName} tag`;
    }

    // Perl ignores a stray NAME on TMPL_ELSE rather than rejecting it.
    return undefined;
  }

  /**
   * Handle a tag that does not parse: fatal under `strict`, literal otherwise.
   *
   * @param reason - Human-readable cause
   * @param position - Position for error messages
   * @returns Always null when the error is non-fatal
   */
  private rejectTag(reason: string, position: { line: number; col: number }): null {
    if (this.strict) {
      throw createError(`Syntax error in <TMPL_*> tag: ${reason}`, this.context.filename, position.line);
    }
    return null;
  }

  /**
   * Convert an absolute source offset to a 1-indexed line and column.
   * Uses running counters, so sequential calls are O(1) amortized.
   *
   * @param pos - Absolute position in the source string
   * @returns Line and column
   */
  private getPosition(pos: number): { line: number; col: number } {
    const { source } = this.context;

    for (let i = this.trackedPos; i < pos && i < source.length; i++) {
      if (source[i] === '\n') {
        this.trackedLine++;
        this.trackedCol = 1;
      } else {
        this.trackedCol++;
      }
    }
    this.trackedPos = pos;

    return { line: this.trackedLine, col: this.trackedCol };
  }
}
