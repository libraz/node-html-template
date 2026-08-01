/**
 * Shared type definitions
 *
 * @packageDocumentation
 */

// ============================================================================
// Values a template works with
// ============================================================================

/**
 * Escape type for TMPL_VAR tags
 *
 * - `html`: HTML entity escaping (&, ", ', <, >)
 * - `js`: JavaScript string escaping (\, ', ", \n, \r, U+2028, U+2029)
 * - `url`: URL encoding (percent-encoding)
 * - `none`: No escaping
 */
export type EscapeType = 'html' | 'js' | 'url' | 'none';

/**
 * Lazy value callback for TMPL_VAR
 * Function is called only if the variable is actually used in the template
 *
 * @returns The value to substitute for the variable
 */
export type LazyValue = () => string | number | boolean | null | undefined;

/**
 * Single loop iteration data
 * Each key-value pair represents a parameter available within the loop
 */
// biome-ignore lint/suspicious/noExplicitAny: loop data items can contain arbitrary values
export type LoopDataItem = Record<string, any>;

/**
 * Lazy loop callback for TMPL_LOOP
 * Function is called only if the loop is actually used in the template
 *
 * @returns Array of parameter objects for each loop iteration
 */
export type LazyLoopValue = () => LoopDataItem[];

/**
 * Loop data - array of objects or lazy callback
 */
export type LoopData = LoopDataItem[] | LazyLoopValue;

/**
 * Parameter value types
 * Can be:
 * - Primitive values (string, number, boolean, null, undefined)
 * - Lazy value (callback function for TMPL_VAR)
 * - Loop data (array or callback for TMPL_LOOP)
 */
export type ParamValue = string | number | boolean | null | undefined | LazyValue | LoopData;

/**
 * Filter function configuration
 * Filters are called after reading the template content but before parsing
 */
export interface Filter {
  /**
   * Filter function
   * @param content - Template content (string or array of lines)
   * @returns Filtered content
   */
  sub: (content: string | string[]) => string | string[];

  /**
   * Format of content passed to filter
   * - `scalar`: Single string
   * - `array`: Array of lines
   */
  format?: 'scalar' | 'array';
}

/**
 * Template-declared type of a parameter
 */
export type ParamType = 'VAR' | 'LOOP';

// ============================================================================
// Internal Types - Used by parser and runtime
// ============================================================================

/**
 * Token type from tokenizer
 * @internal
 */
export type TokenType =
  | 'TEXT' // Literal text content
  | 'VAR' // TMPL_VAR tag
  | 'LOOP' // TMPL_LOOP start tag
  | 'ENDLOOP' // TMPL_LOOP end tag
  | 'IF' // TMPL_IF tag
  | 'UNLESS' // TMPL_UNLESS tag
  | 'ELSE' // TMPL_ELSE tag
  | 'ENDIF' // TMPL_IF/UNLESS end tag
  | 'INCLUDE'; // TMPL_INCLUDE tag

/**
 * Token from tokenizer
 * @internal
 */
export interface Token {
  type: TokenType;
  name?: string; // Parameter name (for VAR, LOOP, IF, UNLESS, INCLUDE)
  escape?: EscapeType; // Escape type (for VAR); undefined means no ESCAPE attribute
  default?: string; // Default value (for VAR)
  content?: string; // Text content (for TEXT tokens)
  closes?: 'IF' | 'UNLESS'; // Which spelling closed the block (for ENDIF)
  line?: number; // Line number in source
  col?: number; // Column number in source
}

/**
 * Parse node type
 * @internal
 */
export type ParseNodeType =
  | 'TEXT' // Literal text
  | 'VAR' // Variable substitution
  | 'LOOP' // Loop construct
  | 'COND' // Conditional (IF/UNLESS/ELSE)
  | 'NOOP'; // No-op (jump target)

/**
 * Position of a tag in the template source.
 *
 * Lines and columns are 1-based. Positions refer to the source after include
 * expansion, so a tag that came from an included file reports where it landed
 * in the flattened text.
 * @internal
 */
export interface SourceLoc {
  line: number;
  col: number;
}

/**
 * Base parse node
 * @internal
 */
export interface BaseParseNode {
  type: ParseNodeType;
}

/**
 * Text node - literal content
 * @internal
 */
export interface TextNode extends BaseParseNode {
  type: 'TEXT';
  content: string;
}

/**
 * Variable node - TMPL_VAR
 * @internal
 */
export interface VarNode extends BaseParseNode {
  type: 'VAR';
  name: string;

  /**
   * Escape type from the ESCAPE attribute.
   * `undefined` means the attribute was absent, which is what lets
   * `default_escape` apply without overriding an explicit `ESCAPE=NONE`.
   */
  escape?: EscapeType;

  /**
   * DEFAULT attribute value, written verbatim when the parameter is unset.
   */
  default?: string;

  /** Where the tag appeared, for diagnostics and type generation. */
  loc?: SourceLoc;
}

/**
 * No-op node - jump target for conditionals
 * @internal
 */
export interface NoopNode extends BaseParseNode {
  type: 'NOOP';
}

/**
 * Loop node - TMPL_LOOP
 * Uses ParseNode[] which creates intentional forward reference for recursive structure
 * @internal
 */
export interface LoopNode extends BaseParseNode {
  type: 'LOOP';
  name: string;
  body: ParseNode[]; // Loop body nodes (recursive structure)

  /** Where the opening tag appeared, for diagnostics and type generation. */
  loc?: SourceLoc;
}

/**
 * Conditional node - TMPL_IF/UNLESS/ELSE
 * Uses ParseNode[] which creates intentional forward reference for recursive structure
 * @internal
 */
export interface CondNode extends BaseParseNode {
  type: 'COND';
  name: string;
  condition: 'if' | 'unless';
  consequent: ParseNode[]; // Nodes when condition is true (recursive structure)
  alternate?: ParseNode[]; // Nodes when condition is false (recursive structure)

  /** Where the opening tag appeared, for diagnostics and type generation. */
  loc?: SourceLoc;
}

/**
 * Union type of all parse nodes
 * @internal
 */
export type ParseNode = TextNode | VarNode | LoopNode | CondNode | NoopNode;
