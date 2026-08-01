/**
 * TMPL_* tag attribute scanner
 *
 * Implements the attribute grammar of Perl HTML::Template's master tag regex:
 * DEFAULT, ESCAPE and NAME may appear in any order, NAME may be written
 * without the `NAME=` prefix (quoted or bare), and quoted values may not
 * contain `>`.
 *
 * @module parser/attributes
 */

import type { EscapeType } from '../types.js';

/**
 * Attributes recognised on a TMPL_* tag
 */
export interface TagAttributes {
  /** NAME attribute, from `NAME="x"`, `NAME=x` or a bare `x` / `"x"` */
  name?: string;

  /** ESCAPE attribute; `undefined` means the attribute was absent */
  escape?: EscapeType;

  /** DEFAULT attribute value */
  default?: string;
}

/**
 * Raised when an attribute string does not match the tag grammar.
 * Callers decide whether this is fatal (strict) or the tag should be
 * emitted as literal text (non-strict), mirroring Perl's behaviour.
 */
export class TagSyntaxError extends Error {}

/**
 * ESCAPE values accepted by Perl HTML::Template, mapped to their effect.
 * `0` and `none` disable escaping; `1` is a synonym for `html`.
 */
const ESCAPE_VALUES: Record<string, EscapeType> = {
  '0': 'none',
  '1': 'html',
  none: 'none',
  html: 'html',
  url: 'url',
  js: 'js'
};

/** Attribute keywords that require an `=` and a value */
const KEYWORDS = new Set(['name', 'escape', 'default']);

const WHITESPACE = /\s/;

/**
 * Parse the attribute section of a TMPL_* tag.
 *
 * @param attrString - Text between the tag name and the closing `>`
 * @returns Recognised attributes
 * @throws TagSyntaxError when the text does not match the grammar
 */
export function parseTagAttributes(attrString: string): TagAttributes {
  const scanner = new AttributeScanner(attrString);
  return scanner.parse();
}

/**
 * Resolve an ESCAPE attribute value to an escape type.
 *
 * @param raw - Raw attribute value, optionally quoted by the caller
 * @returns Escape type
 * @throws TagSyntaxError for values Perl's regex would not match
 */
export function resolveEscapeType(raw: string): EscapeType {
  const escapeType = ESCAPE_VALUES[raw.toLowerCase()];
  if (escapeType === undefined) {
    throw new TagSyntaxError(`invalid ESCAPE value '${raw}'`);
  }
  return escapeType;
}

/**
 * Single-pass scanner over a tag's attribute text.
 *
 * The grammar is a sequence of items separated by whitespace, where each
 * item is either `keyword = value` or a standalone value that binds to NAME.
 */
class AttributeScanner {
  private pos = 0;

  private readonly source: string;

  private readonly attrs: TagAttributes = {};

  private sawEscape = false;

  private sawDefault = false;

  private sawName = false;

  constructor(source: string) {
    // A self-closing slash is part of the tag terminator, not an attribute.
    this.source = source.replace(/\s*\/\s*$/, '');
  }

  /**
   * Scan the whole attribute string.
   *
   * @returns Recognised attributes
   */
  parse(): TagAttributes {
    while (true) {
      this.skipWhitespace();
      if (this.pos >= this.source.length) break;
      this.parseItem();
    }
    return this.attrs;
  }

  /**
   * Scan one `keyword = value` pair or one standalone NAME value.
   */
  private parseItem(): void {
    // A quoted item can only ever be a value, so it binds to NAME.
    const quoted = this.tryReadQuoted();
    if (quoted !== undefined) {
      this.assignName(quoted);
      return;
    }

    const word = this.readBareWord();
    if (word.length === 0) {
      throw new TagSyntaxError(`unexpected character '${this.source[this.pos]}'`);
    }

    const keyword = word.toLowerCase();
    if (KEYWORDS.has(keyword) && this.consumeEquals()) {
      this.assignKeyword(keyword, this.readValue());
      return;
    }

    // A bare word not followed by `=` is the NAME, so `<TMPL_VAR name>`
    // declares a variable called "name" just as it does in Perl.
    this.assignName(word);
  }

  /**
   * Store a `keyword = value` pair, rejecting duplicates.
   *
   * @param keyword - Lowercased attribute keyword
   * @param value - Attribute value
   */
  private assignKeyword(keyword: string, value: string): void {
    if (keyword === 'name') {
      this.assignName(value);
      return;
    }

    if (keyword === 'escape') {
      if (this.sawEscape) {
        throw new TagSyntaxError('duplicate ESCAPE attribute');
      }
      this.sawEscape = true;
      this.attrs.escape = resolveEscapeType(value);
      return;
    }

    if (this.sawDefault) {
      throw new TagSyntaxError('duplicate DEFAULT attribute');
    }
    this.sawDefault = true;
    this.attrs.default = value;
  }

  /**
   * Store the NAME attribute, rejecting a second one.
   *
   * @param value - Attribute value
   */
  private assignName(value: string): void {
    if (this.sawName) {
      throw new TagSyntaxError('duplicate NAME attribute');
    }
    this.sawName = true;
    this.attrs.name = value;
  }

  /**
   * Read the value after an `=`, quoted or bare.
   *
   * @returns Value text
   */
  private readValue(): string {
    return this.tryReadQuoted() ?? this.readBareWord();
  }

  /**
   * Read a quoted value if one starts here and is properly closed.
   *
   * An unterminated quote is not an error: Perl's unquoted alternative
   * `[^\s=>]*` accepts quote characters, so `NAME="a>b">` degrades to the
   * unquoted value `"a` rather than failing to parse.
   *
   * @returns Value without quotes, or undefined when this is not a quoted value
   */
  private tryReadQuoted(): string | undefined {
    const quote = this.source[this.pos];
    if (quote !== '"' && quote !== "'") return undefined;

    const end = this.source.indexOf(quote, this.pos + 1);
    if (end === -1) return undefined;

    const value = this.source.slice(this.pos + 1, end);
    this.pos = end + 1;
    return value;
  }

  /**
   * Read an unquoted token, matching Perl's `[^\s=>]*`.
   *
   * @returns Token text
   */
  private readBareWord(): string {
    const start = this.pos;
    while (this.pos < this.source.length) {
      const char = this.source[this.pos] as string;
      if (WHITESPACE.test(char) || char === '=' || char === '>') break;
      this.pos += 1;
    }
    return this.source.slice(start, this.pos);
  }

  /**
   * Consume an `=` (and surrounding whitespace) if one follows.
   *
   * @returns True if an `=` was consumed
   */
  private consumeEquals(): boolean {
    const mark = this.pos;
    this.skipWhitespace();
    if (this.source[this.pos] === '=') {
      this.pos += 1;
      this.skipWhitespace();
      return true;
    }
    this.pos = mark;
    return false;
  }

  /**
   * Advance past any whitespace.
   */
  private skipWhitespace(): void {
    while (this.pos < this.source.length && WHITESPACE.test(this.source[this.pos] as string)) {
      this.pos += 1;
    }
  }
}
