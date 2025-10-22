/**
 * Parser internal types
 * Types used only within the parser implementation
 *
 * @module parser/types
 */

/**
 * Attribute map parsed from TMPL tags
 * Maps attribute name (lowercase) to value
 */
export type AttributeMap = Map<string, string>;

/**
 * Parse context for tracking position in template
 */
export interface ParseContext {
  /**
   * Current line number (1-indexed)
   */
  line: number;

  /**
   * Current column number (1-indexed)
   */
  col: number;

  /**
   * Current position in source string (0-indexed)
   */
  pos: number;

  /**
   * Source template string
   */
  source: string;

  /**
   * Template filename (if available)
   */
  filename?: string;
}

/**
 * Token position information
 */
export interface TokenPosition {
  line: number;
  col: number;
  pos: number;
}
