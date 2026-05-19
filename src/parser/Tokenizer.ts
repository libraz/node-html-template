/**
 * High-speed template tokenizer
 * Converts template string into tokens for parsing
 *
 * Performance optimizations:
 * - Precompiled regexes at module scope
 * - Zero-copy tokenization using indices
 * - Single-pass processing
 * - Fast attribute parsing
 *
 * @module parser/Tokenizer
 */

import type { EscapeType, Token } from '../types.js';
import { createError } from '../utils/helpers.js';
import type { AttributeMap, ParseContext } from './types.js';

// ============================================================================
// Precompiled Regular Expressions (Module Scope for Maximum Performance)
// ============================================================================

/**
 * Main tag regex - matches TMPL_* tags including HTML comment form
 * Captures: tag name, attributes, closing
 *
 * Matches:
 * - <TMPL_VAR NAME="foo">
 * - <TMPL_LOOP NAME="items">
 * - </TMPL_LOOP>
 * - <!-- TMPL_VAR NAME="foo" -->
 * - <TMPL_VAR NAME=foo> (without quotes)
 */
const TAG_REGEX = /<\s*(?:!--\s*)?(\/?)TMPL_(\w+)\s*([^>]*?)\s*(?:--\s*)?>/gi;

/**
 * Attribute regex - matches NAME="value" or NAME=value
 * Captures: attribute name, value (with or without quotes)
 */
const ATTR_REGEX = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/gi;

/**
 * Vanguard syntax regex - matches %NAME% (legacy syntax)
 * Only used when vanguard_compatibility_mode is enabled
 */
const VANGUARD_REGEX = /%(\w+)%/gi;

// ============================================================================
// Tokenizer Class
// ============================================================================

/**
 * High-performance template tokenizer
 *
 * Converts template string into token stream for parser
 */
export class Tokenizer {
  private context: ParseContext;

  private vanguardMode: boolean;
  private strict: boolean;

  /** Running position tracker for O(1) line/col calculation */
  private trackedPos = 0;
  private trackedLine = 1;
  private trackedCol = 1;

  /**
   * Create tokenizer
   *
   * @param source - Template source string
   * @param filename - Optional filename for error messages
   * @param vanguardMode - Enable Vanguard %VAR% syntax
   */
  constructor(source: string, filename?: string, vanguardMode = false, strict = true) {
    this.context = {
      line: 1,
      col: 1,
      pos: 0,
      source,
      filename
    };
    this.vanguardMode = vanguardMode;
    this.strict = strict;
  }

  /**
   * Tokenize entire template
   * Returns array of tokens
   *
   * @returns Token array
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];
    const { source } = this.context;

    // Reset regex state
    TAG_REGEX.lastIndex = 0;

    let lastPos = 0;
    let match: RegExpExecArray | null;

    // Main tokenization loop - single pass through template
    match = TAG_REGEX.exec(source);
    while (match !== null) {
      const matchStart = match.index;
      const matchEnd = TAG_REGEX.lastIndex;

      // Add text token for content before this tag
      if (matchStart > lastPos) {
        const textContent = source.substring(lastPos, matchStart);
        if (textContent.length > 0) {
          // Process Vanguard syntax if enabled
          if (this.vanguardMode) {
            this.addVanguardTokens(tokens, textContent, lastPos);
          } else {
            tokens.push(this.createTextToken(textContent, lastPos));
          }
        }
      }

      // Parse tag
      const isClosing = match[1] === '/';
      const tagName = match[2]?.toUpperCase() ?? '';
      const attrString = match[3] ?? '';

      // Create token based on tag type
      const token = this.createTagToken(tagName, attrString, isClosing, matchStart);
      if (token) {
        tokens.push(token);
      }

      lastPos = matchEnd;
      match = TAG_REGEX.exec(source);
    }

    // Add final text token if there's remaining content
    if (lastPos < source.length) {
      const textContent = source.substring(lastPos);
      if (textContent.length > 0) {
        // Process Vanguard syntax if enabled
        if (this.vanguardMode) {
          this.addVanguardTokens(tokens, textContent, lastPos);
        } else {
          tokens.push(this.createTextToken(textContent, lastPos));
        }
      }
    }

    return tokens;
  }

  /**
   * Process text for Vanguard %VAR% syntax
   * Adds TEXT and VAR tokens as appropriate
   *
   * @param tokens - Token array to append to
   * @param text - Text content to process
   * @param startPos - Starting position in source
   */
  private addVanguardTokens(tokens: Token[], text: string, startPos: number): void {
    VANGUARD_REGEX.lastIndex = 0;

    let lastPos = 0;
    let match: RegExpExecArray | null;

    match = VANGUARD_REGEX.exec(text);
    while (match !== null) {
      const matchStart = match.index;
      const matchEnd = VANGUARD_REGEX.lastIndex;

      // Add text before this %VAR%
      if (matchStart > lastPos) {
        const textContent = text.substring(lastPos, matchStart);
        tokens.push(this.createTextToken(textContent, startPos + lastPos));
      }

      // Add VAR token for %NAME%
      const varName = match[1];
      if (varName) {
        tokens.push({
          type: 'VAR',
          name: varName,
          escape: 'none',
          line: this.context.line
        });
      }

      lastPos = matchEnd;
      match = VANGUARD_REGEX.exec(text);
    }

    // Add remaining text
    if (lastPos < text.length) {
      const textContent = text.substring(lastPos);
      tokens.push(this.createTextToken(textContent, startPos + lastPos));
    }
  }

  /**
   * Create text token
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
   * Create tag token based on tag name and attributes
   *
   * @param tagName - Tag name (uppercase)
   * @param attrString - Attribute string
   * @param isClosing - Whether this is a closing tag
   * @param pos - Position in source
   * @returns Token or null if invalid
   */
  private createTagToken(tagName: string, attrString: string, isClosing: boolean, pos: number): Token | null {
    const position = this.getPosition(pos);
    const attrs = Tokenizer.parseAttributes(attrString);

    switch (tagName) {
      case 'VAR':
        return this.createVarToken(attrs, position);

      case 'LOOP':
        if (isClosing) {
          return { type: 'ENDLOOP', line: position.line, col: position.col };
        }
        return this.createLoopToken(attrs, position);

      case 'IF':
        if (isClosing) {
          return { type: 'ENDIF', line: position.line, col: position.col };
        }
        return this.createIfToken(attrs, position);

      case 'UNLESS':
        if (isClosing) {
          return { type: 'ENDIF', line: position.line, col: position.col };
        }
        return this.createUnlessToken(attrs, position);

      case 'ELSE':
        return { type: 'ELSE', line: position.line, col: position.col };

      case 'INCLUDE':
        return this.createIncludeToken(attrs, position);

      default:
        if (this.strict) {
          throw createError(`Syntax error: unknown TMPL tag TMPL_${tagName}`, this.context.filename, position.line);
        }
        return null;
    }
  }

  /**
   * Create TMPL_VAR token
   */
  private createVarToken(attrs: AttributeMap, position: { line: number; col: number }): Token {
    const name = this.getRequiredAttr(attrs, 'NAME', position);
    const escapeType = Tokenizer.getEscapeType(attrs);
    const defaultValue = attrs.get('default');

    return {
      type: 'VAR',
      name,
      escape: escapeType,
      default: defaultValue,
      line: position.line,
      col: position.col
    };
  }

  /**
   * Create TMPL_LOOP token
   */
  private createLoopToken(attrs: AttributeMap, position: { line: number; col: number }): Token {
    const name = this.getRequiredAttr(attrs, 'NAME', position);

    // Check for invalid attributes on LOOP
    if (attrs.has('escape')) {
      throw createError('ESCAPE option invalid in TMPL_LOOP tag!', this.context.filename, position.line);
    }
    if (attrs.has('default')) {
      throw createError('DEFAULT option invalid in TMPL_LOOP tag!', this.context.filename, position.line);
    }

    return {
      type: 'LOOP',
      name,
      line: position.line,
      col: position.col
    };
  }

  /**
   * Create TMPL_IF token
   */
  private createIfToken(attrs: AttributeMap, position: { line: number; col: number }): Token {
    const name = this.getRequiredAttr(attrs, 'NAME', position);

    return {
      type: 'IF',
      name,
      line: position.line,
      col: position.col
    };
  }

  /**
   * Create TMPL_UNLESS token
   */
  private createUnlessToken(attrs: AttributeMap, position: { line: number; col: number }): Token {
    const name = this.getRequiredAttr(attrs, 'NAME', position);

    return {
      type: 'UNLESS',
      name,
      line: position.line,
      col: position.col
    };
  }

  /**
   * Create TMPL_INCLUDE token
   */
  private createIncludeToken(attrs: AttributeMap, position: { line: number; col: number }): Token {
    const name = this.getRequiredAttr(attrs, 'NAME', position);

    return {
      type: 'INCLUDE',
      name,
      line: position.line,
      col: position.col
    };
  }

  /**
   * Parse attributes from attribute string
   * Returns Map of attribute name (lowercase) -> value
   *
   * @param attrString - Attribute string from tag
   * @returns Attribute map
   */
  private static parseAttributes(attrString: string): AttributeMap {
    const attrs = new Map<string, string>();

    // Reset regex state
    ATTR_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null = ATTR_REGEX.exec(attrString);

    while (match !== null) {
      const attrName = match[1]?.toLowerCase() ?? '';
      // Value can be in match[2] (double quotes), match[3] (single quotes), or match[4] (no quotes)
      const attrValue = match[2] ?? match[3] ?? match[4] ?? '';

      attrs.set(attrName, attrValue);
      match = ATTR_REGEX.exec(attrString);
    }

    // Special case: if no attributes found, try to parse as single word NAME attribute
    // Supports: <TMPL_VAR foo> as shorthand for <TMPL_VAR NAME="foo">
    if (attrs.size === 0 && attrString.trim().length > 0) {
      const trimmed = attrString.trim();
      // Check if it's a simple word (no spaces, no special chars)
      if (/^\w+$/.test(trimmed)) {
        attrs.set('name', trimmed);
      }
    }

    return attrs;
  }

  /**
   * Get required attribute value
   * Throws error if attribute is missing
   *
   * @param attrs - Attribute map
   * @param name - Attribute name
   * @param position - Position for error message
   * @returns Attribute value
   */
  private getRequiredAttr(attrs: AttributeMap, name: string, position: { line: number; col: number }): string {
    const value = attrs.get(name.toLowerCase());
    if (value === undefined) {
      throw createError(`${name} attribute required in TMPL_* tag`, this.context.filename, position.line);
    }
    return value;
  }

  /**
   * Get escape type from attributes
   * Defaults to 'none' if not specified
   *
   * @param attrs - Attribute map
   * @returns Escape type
   */
  private static getEscapeType(attrs: AttributeMap): EscapeType {
    const escapeAttr = attrs.get('escape')?.toLowerCase();

    switch (escapeAttr) {
      case 'html':
      case '1':
        return 'html';
      case 'js':
      case 'javascript':
        return 'js';
      case 'url':
        return 'url';
      case 'none':
      case '0':
      case undefined:
        return 'none';
      default:
        return 'none';
    }
  }

  /**
   * Get line/column position from absolute position in source.
   * Uses running counters for O(1) amortized performance.
   *
   * @param pos - Absolute position in source string
   * @returns Line and column (1-indexed)
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
