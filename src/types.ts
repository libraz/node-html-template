/**
 * Type definitions for node-perl-html-template
 * Complete TypeScript/ESM port of Perl's HTML::Template module
 *
 * @packageDocumentation
 */

import type { Readable, Writable } from 'node:stream';

// ============================================================================
// Public Types - 100% compatible with Perl HTML::Template v2.98
// ============================================================================

/**
 * Escape type for TMPL_VAR tags
 *
 * - `html`: HTML entity escaping (&, ", ', <, >)
 * - `js`: JavaScript string escaping (\, ', ", \n, \r, U+2028, U+2029)
 * - `url`: URL encoding (percent-encoding)
 * - `none`: No escaping (default)
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
 * Object with param() method interface (like CGI.pm)
 * Used with the `associate` option to pull parameters from external objects
 */
export interface AssociateObject {
  /**
   * Get parameter value by name
   * @param name - Parameter name
   * @returns Parameter value or undefined if not found
   */
  param(name?: string): ParamValue | string[];
}

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
 * Options for output() method
 */
export interface OutputOptions {
  /**
   * Print output to this stream instead of returning it
   * When specified, output() returns void instead of string
   */
  print_to?: Writable;
}

/**
 * Query result type
 * - `VAR`: Parameter is a TMPL_VAR
 * - `LOOP`: Parameter is a TMPL_LOOP
 * - `undefined`: Parameter not found
 */
export type QueryResult = 'VAR' | 'LOOP' | undefined;

/**
 * Query options for query() method
 */
export interface QueryOptions {
  /**
   * Query parameter name or path
   * - Single string: Query parameter in current scope
   * - Array: Query nested parameter (e.g., ['LOOP_NAME', 'VAR_NAME'])
   */
  name?: string | string[];

  /**
   * Query parameters inside a loop
   * Returns array of parameter names within the specified loop
   */
  loop?: string | string[];
}

/**
 * HTML::Template constructor options
 * All options are compatible with Perl HTML::Template v2.98
 */
export interface HTMLTemplateOptions {
  // ========================================
  // Template Source (one required)
  // ========================================

  /**
   * Load template from file path
   * File is resolved using path search (see `path` option)
   *
   * @example
   * ```ts
   * new HTMLTemplate({ filename: 'template.tmpl' })
   * ```
   */
  filename?: string;

  /**
   * Load template from string
   * String is parsed directly without file I/O
   *
   * @example
   * ```ts
   * new HTMLTemplate({ scalarref: '<TMPL_VAR NAME="foo">' })
   * ```
   */
  scalarref?: string;

  /**
   * Load template from array of lines
   * Lines are joined with newlines before parsing
   *
   * @example
   * ```ts
   * new HTMLTemplate({ arrayref: ['<html>', '<TMPL_VAR NAME="title">', '</html>'] })
   * ```
   */
  arrayref?: string[];

  /**
   * Load template from readable stream
   * Stream is read to completion before parsing
   *
   * @example
   * ```ts
   * new HTMLTemplate({ filehandle: fs.createReadStream('template.tmpl') })
   * ```
   */
  filehandle?: Readable;

  /**
   * Alternative source specification using type + source
   *
   * @example
   * ```ts
   * new HTMLTemplate({ type: 'filename', source: 'template.tmpl' })
   * ```
   */
  type?: 'filename' | 'scalarref' | 'arrayref' | 'filehandle';

  /**
   * Source content (used with `type` option)
   */
  source?: string | string[] | Readable;

  // ========================================
  // Error Detection Options
  // ========================================

  /**
   * Die on attempt to set undefined parameters
   *
   * Default: `true`
   *
   * When true, calling param() with a parameter name not in the template
   * will throw an error. Set to false to allow setting undefined parameters.
   *
   * @default true
   */
  die_on_bad_params?: boolean;

  /**
   * Strict parsing mode
   *
   * Default: `true`
   *
   * When true, malformed TMPL_* tags cause parse errors.
   * When false, invalid tags are ignored.
   *
   * @default true
   */
  strict?: boolean;

  /**
   * Force taint checking on parameters
   *
   * Default: `0`
   *
   * - `0`: No taint checking (default)
   * - `1`: Prevent tainted values in unescaped TMPL_VAR
   * - `2`: Prevent tainted values everywhere
   *
   * Note: Node.js has no taint mode. This option only generates warnings.
   *
   * @default 0
   */
  force_untaint?: 0 | 1 | 2;

  /**
   * Vanguard compatibility mode
   *
   * Default: `false`
   *
   * When true, enables legacy %NAME% syntax in addition to TMPL_VAR.
   * Also implies `die_on_bad_params: false`.
   *
   * @default false
   */
  vanguard_compatibility_mode?: boolean;

  // ========================================
  // Caching Options
  // ========================================

  /**
   * Enable in-memory caching
   *
   * Default: `false`
   *
   * When true, parsed templates are cached in memory based on file mtime.
   * Most effective in persistent environments (servers).
   *
   * @default false
   */
  cache?: boolean;

  /**
   * Blind cache mode (no mtime validation)
   *
   * Default: `false`
   *
   * When true, cached templates are never validated against file mtime.
   * About 1-2% faster than regular cache but may serve stale templates.
   *
   * WARNING: Template changes won't be detected until process restart!
   *
   * @default false
   */
  blind_cache?: boolean;

  /**
   * Enable file-based caching
   *
   * Default: `false`
   *
   * When true, parsed templates are cached to disk using serialization.
   * Requires `file_cache_dir` option. Good for non-persistent environments (CGI).
   *
   * @default false
   */
  file_cache?: boolean;

  /**
   * Directory for file cache storage
   *
   * Required when `file_cache: true`
   *
   * Directory is created if it doesn't exist, with permissions from
   * `file_cache_dir_mode`.
   */
  file_cache_dir?: string;

  /**
   * File cache directory permissions
   *
   * Default: `0o700`
   *
   * Permissions used when creating `file_cache_dir`.
   *
   * @default 0o700
   */
  file_cache_dir_mode?: number;

  /**
   * Enable double caching (memory + file)
   *
   * Default: `false`
   *
   * When true, uses both memory cache and file cache for maximum performance.
   * First checks memory, then file cache, then parses.
   *
   * @default false
   */
  double_file_cache?: boolean;

  /**
   * Enable double caching using shared memory + memory in Perl HTML::Template.
   *
   * Node.js has no IPC::SharedCache equivalent in this package, so this option
   * is accepted for API compatibility but is not implemented.
   *
   * @default false
   */
  double_cache?: boolean;

  /**
   * Enable IPC::SharedCache in Perl HTML::Template.
   *
   * Node.js has no IPC::SharedCache equivalent in this package, so this option
   * is accepted for API compatibility but is not implemented.
   *
   * @default false
   */
  shared_cache?: boolean;

  /**
   * Enable shared cache debug output.
   *
   * Accepted for API compatibility with Perl HTML::Template.
   *
   * @default false
   */
  shared_cache_debug?: boolean;

  /**
   * Enable memory debug output.
   *
   * Accepted for API compatibility with Perl HTML::Template.
   *
   * @default false
   */
  memory_debug?: boolean;

  /**
   * Cache lazy variable values
   *
   * Default: `false`
   *
   * When true, results of lazy value callbacks are cached after first evaluation.
   * Prevents re-execution if variable is used multiple times.
   *
   * @default false
   */
  cache_lazy_vars?: boolean;

  /**
   * Cache lazy loop values
   *
   * Default: `false`
   *
   * When true, results of lazy loop callbacks are cached after first evaluation.
   * Prevents re-execution if loop is used multiple times.
   *
   * @default false
   */
  cache_lazy_loops?: boolean;

  // ========================================
  // File System Options
  // ========================================

  /**
   * Template search paths
   *
   * Default: `[]`
   *
   * Array of directories to search for templates and includes.
   * Tried in order after HTML_TEMPLATE_ROOT environment variable.
   *
   * @default []
   */
  path?: string[];

  /**
   * Search path for every include
   *
   * Default: `false`
   *
   * When false (default), TMPL_INCLUDE only searches relative to current file.
   * When true, searches from top of path array for each include.
   *
   * @default false
   */
  search_path_on_include?: boolean;

  /**
   * Treat template files as UTF-8
   *
   * Default: `false`
   *
   * When true, reads files with UTF-8 encoding.
   * Cannot be used with `open_mode`.
   *
   * @default false
   */
  utf8?: boolean;

  /**
   * Custom file encoding
   *
   * Default: `undefined`
   *
   * Specifies custom encoding for reading template files.
   * Cannot be used with `utf8`.
   *
   * @example 'utf-16le', 'latin1', 'ascii'
   */
  open_mode?: BufferEncoding | string;

  // ========================================
  // Debugging Options
  // ========================================

  /**
   * Enable debug output
   *
   * Default: `false`
   *
   * When true, prints debugging information to stderr during parsing and execution.
   *
   * @default false
   */
  debug?: boolean;

  /**
   * Dump parse stack
   *
   * Default: `false`
   *
   * When true, dumps internal parse stack structure to stderr.
   * Useful for debugging parser issues.
   *
   * @default false
   */
  stack_debug?: boolean;

  /**
   * Enable cache debugging
   *
   * Default: `false`
   *
   * When true, prints cache hit/miss information to stderr.
   *
   * @default false
   */
  cache_debug?: boolean;

  // ========================================
  // Behavior Options
  // ========================================

  /**
   * Associate external objects for parameter lookup
   *
   * Default: `undefined`
   *
   * Object(s) with param() method (like CGI.pm) to query for undefined parameters.
   * Multiple objects are searched in reverse order (last has highest priority).
   *
   * @example
   * ```ts
   * const cgi = { param: (name) => name === 'foo' ? 'bar' : undefined };
   * new HTMLTemplate({ filename: 'test.tmpl', associate: cgi })
   * ```
   */
  associate?: AssociateObject | AssociateObject[];

  /**
   * Case-sensitive parameter names
   *
   * Default: `false`
   *
   * When false (default), parameter names are case-insensitive.
   * When true, 'FOO' and 'foo' are different parameters.
   *
   * Note: Loop context variables are lowercase only when case_sensitive is true.
   *
   * @default false
   */
  case_sensitive?: boolean;

  /**
   * Enable loop context variables
   *
   * Default: `false`
   *
   * When true, special variables are available inside TMPL_LOOP:
   * - `__first__`: True on first iteration
   * - `__last__`: True on last iteration
   * - `__inner__`: True for non-first/last iterations
   * - `__outer__`: True for first and last iterations
   * - `__odd__`: True for odd iterations (1, 3, 5, ...)
   * - `__even__`: True for even iterations (2, 4, 6, ...)
   * - `__counter__`: Iteration counter starting at 1
   * - `__index__`: Iteration index starting at 0
   *
   * @default false
   */
  loop_context_vars?: boolean;

  /**
   * Make outer variables visible in loops
   *
   * Default: `false`
   *
   * When true, variables from outer template/loops are accessible inside loops.
   * Creates circular references that are cleaned up after output().
   *
   * @default false
   */
  global_vars?: boolean;

  /**
   * Disable TMPL_INCLUDE processing
   *
   * Default: `false`
   *
   * When true, TMPL_INCLUDE tags are not processed.
   * Useful for security or performance in constrained environments.
   *
   * @default false
   */
  no_includes?: boolean;

  /**
   * Maximum include depth
   *
   * Default: `10`
   *
   * Maximum nesting level for TMPL_INCLUDE.
   * Set to 0 to disable limit.
   *
   * @default 10
   */
  max_includes?: number;

  /**
   * Die on missing include files
   *
   * Default: `true`
   *
   * When true, missing TMPL_INCLUDE files throw errors.
   * When false, missing includes are silently skipped.
   *
   * @default true
   */
  die_on_missing_include?: boolean;

  /**
   * Template content filters
   *
   * Default: `undefined`
   *
   * Filter(s) applied to template content after reading but before parsing.
   * Applied to main template and all included files.
   *
   * @example
   * ```ts
   * {
   *   filter: {
   *     sub: (content) => content.toUpperCase(),
   *     format: 'scalar'
   *   }
   * }
   * ```
   */
  filter?: Filter | Filter['sub'] | Array<Filter | Filter['sub']>;

  /**
   * Default escape type for all TMPL_VAR
   *
   * Default: `'none'`
   *
   * Sets default escaping for all TMPL_VAR tags.
   * Can be overridden per-tag with ESCAPE attribute.
   *
   * @default 'none'
   */
  default_escape?: EscapeType;
}

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
  escape?: EscapeType; // Escape type (for VAR)
  default?: string; // Default value (for VAR)
  content?: string; // Text content (for TEXT tokens)
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
  escape: EscapeType;
  default?: string;
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
}

/**
 * Union type of all parse nodes
 * @internal
 */
export type ParseNode = TextNode | VarNode | LoopNode | CondNode | NoopNode;

/**
 * Cache entry
 * @internal
 */
export interface CacheEntry {
  nodes: ParseNode[];
  mtimes: Map<string, number>; // File path -> mtime mapping
  key: string;
}
