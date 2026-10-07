/**
 * Source positions
 *
 * The tokenizer reads text that has been through comment removal and include
 * expansion, but an error or a parameter location has to point into the file
 * a person edits. Each template's {@link TemplateText} remembers where comment
 * blocks were cut, and a {@link SourceMap} remembers which template each
 * stretch of the expanded text came from, so one lookup walks both back to a
 * template, line and column.
 *
 * @module parser/sourceMap
 */

import { createError } from '../utils/helpers.js';
import { type CommentCut, stripComments } from './comments.js';

/**
 * A position in the template that physically contains it.
 */
export interface Location {
  /** Template id, when the template has one */
  file?: string;

  /** 1-based line */
  line: number;

  /** 1-based column */
  col: number;
}

/**
 * One template's text as the tokenizer sees it, plus the way back to the text
 * as written.
 */
export class TemplateText {
  private lineStarts: number[] | undefined;

  /**
   * @param file - Template id, when it has one
   * @param source - Text as written
   * @param text - Text the tokenizer sees
   * @param cuts - Comment blocks removed from `source` to give `text`
   */
  private constructor(
    readonly file: string | undefined,
    readonly source: string,
    readonly text: string,
    private readonly cuts: readonly CommentCut[]
  ) {}

  /**
   * Prepare a template for parsing by removing its comment blocks.
   *
   * @param source - Text as written
   * @param file - Template id, when it has one
   * @returns Prepared text
   */
  static prepare(source: string, file?: string): TemplateText {
    const { text, cuts } = stripComments(source);
    return new TemplateText(file, source, text, cuts);
  }

  /**
   * Wrap text that is parsed exactly as given.
   *
   * @param source - Text as written
   * @param file - Template id, when it has one
   * @returns Unprepared text
   */
  static verbatim(source: string, file?: string): TemplateText {
    return new TemplateText(file, source, source, []);
  }

  /**
   * Locate an offset in {@link text} within the text as written.
   *
   * @param offset - Offset in the prepared text
   * @returns Template, line and column
   */
  locate(offset: number): Location {
    let original = offset;
    for (const cut of this.cuts) {
      if (cut.at > offset) break;
      original += cut.removed;
    }

    this.lineStarts ??= lineStartsOf(this.source);
    const index = lastAtOrBefore(this.lineStarts, original, (start) => start);
    const lineStart = this.lineStarts[index] ?? 0;

    return { file: this.file, line: index + 1, col: original - lineStart + 1 };
  }
}

/**
 * Where a stretch of the expanded text came from.
 */
export interface MappedStretch {
  /** Offset in the expanded text where the stretch begins */
  outputStart: number;

  /** Template it came from */
  template: TemplateText;

  /** Offset within that template's prepared text */
  sourceStart: number;
}

/**
 * Map from offsets in an expanded template back to the templates they came
 * from.
 */
export class SourceMap {
  /**
   * @param stretches - Stretches of the expanded text, in output order
   */
  constructor(private readonly stretches: readonly MappedStretch[]) {}

  /**
   * Map a single template that was not expanded.
   *
   * @param template - The template
   * @returns Source map covering its whole text
   */
  static of(template: TemplateText): SourceMap {
    return new SourceMap([{ outputStart: 0, template, sourceStart: 0 }]);
  }

  /**
   * Locate an offset in the expanded text.
   *
   * @param offset - Offset in the expanded text
   * @returns Template, line and column where the character was written
   */
  locate(offset: number): Location {
    const stretch = this.stretches[lastAtOrBefore(this.stretches, offset, (entry) => entry.outputStart)];
    if (!stretch) return { line: 1, col: 1 };

    return stretch.template.locate(stretch.sourceStart + offset - stretch.outputStart);
  }
}

/**
 * Build a template error naming where the problem was written.
 *
 * Every tokenizer, parser and include-scan error goes through here, so they
 * all report a location the same way.
 *
 * @param message - What went wrong
 * @param location - Where, as far as it is known
 * @returns Error to throw
 */
export function templateError(message: string, location: { file?: string; line?: number } = {}): Error {
  return createError(message, location.file, location.line);
}

/**
 * List the offset of every line start in a text.
 *
 * @param text - Text to scan
 * @returns Line start offsets, the first being zero
 */
function lineStartsOf(text: string): number[] {
  const starts = [0];

  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    starts.push(index + 1);
  }

  return starts;
}

/**
 * Find the last entry whose key is at or before a value.
 *
 * @param entries - Entries sorted by key
 * @param value - Value to look up
 * @param key - Key of an entry
 * @returns Index of the entry, zero when every key is past the value
 */
function lastAtOrBefore<T>(entries: readonly T[], value: number, key: (entry: T) => number): number {
  let low = 0;
  let high = entries.length - 1;
  let found = 0;

  while (low <= high) {
    const middle = (low + high) >> 1;
    if (key(entries[middle] as T) <= value) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found;
}
