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

import { parseTagAttributes, type TagAttributes, TagSyntaxError, validateTagAttributes } from './attributes.js';
import { type Location, SourceMap, TemplateText, templateError } from './sourceMap.js';
import { scanTags, TAG_LOOKALIKE } from './tagPattern.js';
import type { LocatedToken } from './types.js';

// ============================================================================
// Precompiled Regular Expressions (Module Scope for Maximum Performance)
// ============================================================================

/**
 * Legacy Vanguard `%NAME%` syntax, using Perl's character class so dotted,
 * hyphenated and path-like names are substituted too.
 */
const VANGUARD_REGEX = /%([-\w/.+]+)%/g;

// ============================================================================
// Tokenizer Class
// ============================================================================

/**
 * Template tokenizer
 *
 * Converts a template string into a token stream for the parser.
 */
export class Tokenizer {
  private readonly source: string;

  private readonly map: SourceMap;

  private vanguardMode: boolean;

  private strict: boolean;

  /**
   * Create tokenizer
   *
   * @param source - Template source string
   * @param filename - Optional filename for error messages
   * @param vanguardMode - Enable Vanguard %VAR% syntax
   * @param strict - Treat malformed TMPL_* tags as errors
   * @param map - Where each offset of `source` was written; defaults to
   *   `source` itself, as `filename`
   */
  constructor(source: string, filename?: string, vanguardMode = false, strict = true, map?: SourceMap) {
    this.source = source;
    this.map = map ?? SourceMap.of(TemplateText.verbatim(source, filename));
    this.vanguardMode = vanguardMode;
    this.strict = strict;
  }

  /**
   * Tokenize the entire template.
   *
   * @returns Token array
   */
  tokenize(): LocatedToken[] {
    const tokens: LocatedToken[] = [];
    const source = this.source;

    let lastPos = 0;

    for (const tag of scanTags(source)) {
      if (tag.start > lastPos) {
        this.addTextTokens(tokens, source.substring(lastPos, tag.start), lastPos);
      }

      const token = this.createTagToken(tag.name.toUpperCase(), tag.attributes, tag.closing, tag.start);
      if (token) {
        tokens.push(token);
      } else {
        // Non-strict mode keeps an unparsable tag as literal text, as Perl does.
        tokens.push(this.createTextToken(source.substring(tag.start, tag.end), tag.start));
      }

      lastPos = tag.end;
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
  private addTextTokens(tokens: LocatedToken[], text: string, startPos: number): void {
    if (text.length === 0) return;

    // Text that still looks like a tag means the tag scan never matched it,
    // which Perl reports as a syntax error rather than passing through.
    const lookalike = this.strict ? TAG_LOOKALIKE.exec(text) : null;
    if (lookalike) {
      throw templateError('Syntax error in <TMPL_*> tag: malformed tag', this.map.locate(startPos + lookalike.index));
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
        tokens.push({ type: 'VAR', name: varName, ...this.at(startPos + matchStart) });
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
  private createTextToken(content: string, pos: number): LocatedToken {
    return { type: 'TEXT', content, ...this.at(pos) };
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
  private createTagToken(tagName: string, attrString: string, isClosing: boolean, pos: number): LocatedToken | null {
    const position = this.at(pos);

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

    const validationError = validateTagAttributes(tagName, attrs);
    if (validationError) {
      return this.rejectTag(validationError, position);
    }

    switch (tagName) {
      case 'ELSE':
        return { type: 'ELSE', ...position };
      case 'VAR':
        return {
          type: 'VAR',
          name: attrs.name as string,
          escape: attrs.escape,
          default: attrs.default,
          ...position
        };
      case 'LOOP':
        return { type: 'LOOP', name: attrs.name as string, ...position };
      case 'IF':
        return { type: 'IF', name: attrs.name as string, ...position };
      case 'UNLESS':
        return { type: 'UNLESS', name: attrs.name as string, ...position };
      default:
        return { type: 'INCLUDE', name: attrs.name as string, ...position };
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
  private createClosingToken(tagName: string, position: Location): LocatedToken | null {
    switch (tagName) {
      case 'LOOP':
        return { type: 'ENDLOOP', ...position };
      case 'IF':
      case 'UNLESS':
        return { type: 'ENDIF', closes: tagName, ...position };
      default:
        return this.rejectTag(`TMPL_${tagName} has no closing form`, position);
    }
  }

  /**
   * Handle a tag that does not parse: fatal under `strict`, literal otherwise.
   *
   * @param reason - Human-readable cause
   * @param position - Position for error messages
   * @returns Always null when the error is non-fatal
   */
  private rejectTag(reason: string, position: Location): null {
    if (this.strict) {
      throw templateError(`Syntax error in <TMPL_*> tag: ${reason}`, position);
    }
    return null;
  }

  /**
   * Locate an offset of the source in the template that contains it.
   *
   * @param pos - Offset in the source
   * @returns Line and column, plus the template id when there is one
   */
  private at(pos: number): Location {
    return this.map.locate(pos);
  }
}
