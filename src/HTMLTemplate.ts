/**
 * HTMLTemplate - Main template class
 *
 * Public API for loading a template, setting parameters and producing output.
 * Compatible with the core API and template syntax of Perl HTML::Template
 * v2.98.
 *
 * @module HTMLTemplate
 */

import { CacheManager } from './cache/CacheManager.js';
import { expandIncludes } from './compile/expandIncludes.js';
import { nodeFileLoader } from './loader/nodeFile.js';
import { loadTemplateSource } from './loader/source.js';
import type { SyncTemplateLoader } from './loader/types.js';
import { getGlobalOptions, normalizeOptions, setGlobalOptions } from './options.js';
import { stripComments } from './parser/comments.js';
import { Parser } from './parser/Parser.js';
import { buildShape, type ShapeNode, withGlobalVars } from './parser/shape.js';
import { Tokenizer } from './parser/Tokenizer.js';
import { Context } from './runtime/Context.js';
import { Executor } from './runtime/Executor.js';
import { TemplateQuery } from './TemplateQuery.js';
import type {
  AssociateObject,
  EscapeType,
  HTMLTemplateOptions,
  OutputOptions,
  ParamValue,
  ParseNode,
  QueryOptions,
  QueryResult
} from './types.js';
import { applyFilters } from './utils/filters.js';
import { createError } from './utils/helpers.js';
import { maybeCacheLazyLoop, maybeCacheLazyValue } from './utils/LazyValue.js';

/**
 * HTMLTemplate class
 *
 * @example
 * ```ts
 * // From file
 * const tmpl = new HTMLTemplate({ filename: 'template.tmpl' });
 * tmpl.param('name', 'World');
 * console.log(tmpl.output());
 *
 * // From string
 * const tmpl2 = new HTMLTemplate({ scalarref: 'Hello <TMPL_VAR NAME="name">' });
 * tmpl2.param('name', 'World');
 * console.log(tmpl2.output());
 * ```
 */
export class HTMLTemplate {
  /** Normalized options with all defaults applied */
  private readonly options: Required<HTMLTemplateOptions>;

  /** Parsed template */
  private readonly ast: ParseNode[];

  /** Runtime parameter storage */
  private readonly context: Context;

  /** Source of the template and anything it includes */
  private readonly loader: SyncTemplateLoader;

  /**
   * Parameter namespaces used for name resolution.
   *
   * The shape tree itself is built without global_vars hoisting so it always
   * describes the template's real nesting; this is the derived lookup view,
   * which mirrors nested variables into the root when the option is on.
   */
  private readonly lookupShape: ShapeNode;

  /** Introspection over the template's declared parameters */
  private readonly introspection: TemplateQuery;

  /**
   * Create a new template instance.
   *
   * @param options - Template options
   */
  constructor(options: HTMLTemplateOptions) {
    this.options = normalizeOptions(options);
    this.context = new Context(this.options);
    this.loader = nodeFileLoader({
      paths: this.options.path,
      searchAllPaths: this.options.search_path_on_include,
      encoding: this.options.utf8 ? 'utf-8' : this.options.open_mode || undefined
    });

    const { source, filename } = loadTemplateSource(this.options, this.loader);
    const prepared = this.preprocess(source, filename);

    this.ast = this.parseTemplate(prepared.source, filename, prepared.versions);
    const shape = buildShape(this.ast, this.options.case_sensitive);
    this.lookupShape = this.options.global_vars ? withGlobalVars(shape) : shape;
    this.introspection = new TemplateQuery(this.lookupShape, this.options.case_sensitive);
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Get, set, or list parameters.
   *
   * @returns All top-level parameter names when called with no arguments,
   *   the stored value when called with a name, and nothing when setting.
   */
  param(): string[];
  param(name: string): ParamValue | undefined;
  param(name: string, value: ParamValue): void;
  param(params: Record<string, ParamValue>): void;
  param(
    ...args: [] | [string] | [string, ParamValue] | [Record<string, ParamValue>]
  ): string[] | ParamValue | undefined {
    if (args.length === 0) {
      return this.introspection.topLevelNames();
    }

    const [nameOrParams, value] = args;

    if (typeof nameOrParams === 'string') {
      return args.length === 1 ? this.getParam(nameOrParams) : this.setParam(nameOrParams, value);
    }

    if (nameOrParams && typeof nameOrParams === 'object') {
      for (const [key, val] of Object.entries(nameOrParams)) {
        this.setParam(key, val);
      }
      return undefined;
    }

    throw createError('HTML::Template->param() : Single reference arg to param() must be a hash-ref!');
  }

  /**
   * Render the template.
   *
   * @param options - Output options
   * @returns Rendered text, or undefined when `print_to` was given
   */
  output(options?: OutputOptions): string | undefined {
    const executor = new Executor(
      this.context,
      { dieOnBadParams: this.options.die_on_bad_params, caseSensitive: this.options.case_sensitive },
      this.lookupShape
    );
    const html = executor.execute(this.ast);

    if (options?.print_to) {
      options.print_to.write(html);
      return undefined;
    }

    return html;
  }

  /**
   * Inspect the template's structure.
   *
   * - `query()` lists the top-level parameter names
   * - `query({ name })` reports `'VAR'`, `'LOOP'` or `undefined`
   * - `query({ loop })` lists the names declared inside a loop
   *
   * @param options - Query options
   * @returns Query result
   */
  query(options?: QueryOptions): QueryResult | string[] | undefined {
    return this.introspection.query(options);
  }

  /**
   * Discard all parameter values.
   */
  clear(): void {
    this.context.clear();
  }

  /**
   * Perl-compatible alias for {@link HTMLTemplate.clear}.
   */
  clear_params(): void {
    this.clear();
  }

  /**
   * Register a CGI-like object after construction.
   *
   * @param object - Object exposing a param() method
   */
  associateCGI(object: { param?: unknown }): void {
    if (!object || typeof object.param !== 'function') {
      throw createError('Warning! non-CGI object was passed to HTML::Template::associateCGI()!');
    }
    this.context.addAssociate(object as AssociateObject);
  }

  /**
   * Read or extend the process-wide default options.
   *
   * @param options - Overrides to install
   * @returns The resulting global options
   */
  static config(): HTMLTemplateOptions;
  static config(options: HTMLTemplateOptions): HTMLTemplateOptions;
  static config(options?: HTMLTemplateOptions): HTMLTemplateOptions {
    return options ? setGlobalOptions(options) : getGlobalOptions();
  }

  /**
   * Construct from a filename.
   *
   * @param filename - Template filename
   * @param options - Additional options
   * @returns Template instance
   */
  static new_file(filename: string, options: Omit<HTMLTemplateOptions, 'filename'> = {}): HTMLTemplate {
    return new HTMLTemplate({ ...options, filename });
  }

  /**
   * Construct from a string.
   *
   * @param scalarref - Template text
   * @param options - Additional options
   * @returns Template instance
   */
  static new_scalar_ref(scalarref: string, options: Omit<HTMLTemplateOptions, 'scalarref'> = {}): HTMLTemplate {
    return new HTMLTemplate({ ...options, scalarref });
  }

  /**
   * Construct from an array of lines.
   *
   * @param arrayref - Template lines
   * @param options - Additional options
   * @returns Template instance
   */
  static new_array_ref(arrayref: string[], options: Omit<HTMLTemplateOptions, 'arrayref'> = {}): HTMLTemplate {
    return new HTMLTemplate({ ...options, arrayref });
  }

  /**
   * Construct from a readable stream.
   *
   * @param filehandle - Stream to read
   * @param options - Additional options
   * @returns Template instance
   */
  static new_filehandle(
    filehandle: NonNullable<HTMLTemplateOptions['filehandle']>,
    options: Omit<HTMLTemplateOptions, 'filehandle'> = {}
  ): HTMLTemplate {
    return new HTMLTemplate({ ...options, filehandle });
  }

  // ==========================================================================
  // Parameter access
  // ==========================================================================

  /**
   * Read a parameter, enforcing `die_on_bad_params`.
   *
   * @param name - Parameter name
   * @returns Stored value, or undefined
   */
  private getParam(name: string): ParamValue | undefined {
    this.assertDeclared(name, 'get');
    return this.context.getParam(name);
  }

  /**
   * Write a parameter, enforcing `die_on_bad_params` and the declared type.
   *
   * @param name - Parameter name
   * @param value - Value to store
   */
  private setParam(name: string, value: ParamValue): undefined {
    this.assertDeclared(name, 'set');
    this.context.setParam(name, this.prepareParamValue(name, value));
    return undefined;
  }

  /**
   * Reject names that the template never declares at its top level.
   *
   * Perl checks against the top-level param_map only, so a name that exists
   * solely inside a loop body is not settable from the outside.
   *
   * @param name - Parameter name
   * @param action - Whether the caller is reading or writing
   */
  private assertDeclared(name: string, action: 'get' | 'set'): void {
    if (!this.options.die_on_bad_params) return;
    if (this.introspection.topLevelType(name) !== undefined) return;

    const normalized = this.options.case_sensitive ? name : name.toLowerCase();
    const suffix = action === 'get' ? 'die_on_bad_params set => 1' : 'die_on_bad_params => 1';

    throw createError(
      `HTML::Template : Attempt to ${action} nonexistent parameter '${normalized}' - this parameter name doesn't match any declarations in the template file : (${suffix})`
    );
  }

  /**
   * Check a value against the parameter's declared type and wrap lazy values
   * for caching when requested.
   *
   * @param name - Parameter name
   * @param value - Value to store
   * @returns Value as it should be stored
   */
  private prepareParamValue(name: string, value: ParamValue): ParamValue {
    const paramType = this.introspection.topLevelType(name);
    const normalized = this.options.case_sensitive ? name : name.toLowerCase();
    const isLoopShaped = value === undefined || value === null || Array.isArray(value) || typeof value === 'function';

    if (paramType === 'LOOP') {
      if (!isLoopShaped) {
        throw createError(
          `HTML::Template::param() : attempt to set parameter '${normalized}' with a scalar - parameter is not a TMPL_VAR!`
        );
      }
      return maybeCacheLazyLoop(value, this.options.cache_lazy_loops) as ParamValue;
    }

    if (paramType === 'VAR' && Array.isArray(value)) {
      throw createError(
        `HTML::Template::param() : attempt to set parameter '${normalized}' with an array ref - parameter is not a TMPL_LOOP!`
      );
    }

    if (Array.isArray(value)) {
      return maybeCacheLazyLoop(value, this.options.cache_lazy_loops) as ParamValue;
    }

    return maybeCacheLazyValue(value, this.options.cache_lazy_vars) as ParamValue;
  }

  // ==========================================================================
  // Template preparation
  // ==========================================================================

  /**
   * Run the pre-parse pipeline: filters, comment removal, include expansion.
   *
   * @param source - Raw template text
   * @param filename - Path the text came from, if any
   * @returns Prepared text and the versions of every template it draws on
   */
  private preprocess(source: string, filename?: string): { source: string; versions: Map<string, string | undefined> } {
    const prepare = (text: string): string => stripComments(applyFilters(text, this.options.filter));
    const prepared = prepare(source);

    if (this.options.no_includes) {
      return { source: prepared, versions: new Map() };
    }

    const expanded = expandIncludes(prepared, filename, {
      loader: this.loader,
      maxDepth: this.options.max_includes,
      onMissing: this.options.die_on_missing_include ? 'throw' : 'ignore',
      prepare
    });

    return { source: expanded.text, versions: expanded.versions };
  }

  /**
   * Tokenize and parse the prepared text, consulting the cache first.
   *
   * @param source - Prepared template text
   * @param filename - Path the template came from, if any
   * @param versions - Versions of every template the text draws on
   * @returns Parsed template
   */
  private parseTemplate(
    source: string,
    filename: string | undefined,
    versions: Map<string, string | undefined>
  ): ParseNode[] {
    const cacheManager = new CacheManager(this.options);
    const cacheKey = CacheManager.generateKey(this.cacheIdentifier(filename, source));

    if (cacheManager.isEnabled()) {
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        this.logCache('HIT', filename);
        return cached.nodes;
      }
      this.logCache('MISS', filename);
    }

    const tokens = new Tokenizer(
      source,
      filename,
      this.options.vanguard_compatibility_mode,
      this.options.strict
    ).tokenize();

    let ast = new Parser(tokens, filename, this.options.no_includes).parse();

    if (this.options.default_escape !== 'none') {
      ast = HTMLTemplate.applyDefaultEscape(ast, this.options.default_escape);
    }

    if (cacheManager.isEnabled() && filename) {
      if (!versions.has(filename)) {
        versions.set(filename, this.loader.version?.(filename));
      }
      cacheManager.set(cacheKey, ast, versions);
    }

    return ast;
  }

  /**
   * Apply `default_escape` to every variable that carries no ESCAPE attribute.
   *
   * An explicit `ESCAPE=NONE` records the escape type, so it survives here and
   * suppresses the default exactly as it does in Perl.
   *
   * @param nodes - Parsed nodes
   * @param defaultEscape - Escape type to apply
   * @returns Nodes with the default applied
   */
  private static applyDefaultEscape(nodes: ParseNode[], defaultEscape: EscapeType): ParseNode[] {
    return nodes.map((node) => {
      switch (node.type) {
        case 'VAR':
          return node.escape === undefined ? { ...node, escape: defaultEscape } : node;
        case 'LOOP':
          return { ...node, body: HTMLTemplate.applyDefaultEscape(node.body, defaultEscape) };
        case 'COND':
          return {
            ...node,
            consequent: HTMLTemplate.applyDefaultEscape(node.consequent, defaultEscape),
            alternate: node.alternate ? HTMLTemplate.applyDefaultEscape(node.alternate, defaultEscape) : undefined
          };
        default:
          return node;
      }
    });
  }

  /**
   * Build the cache identity for this template.
   *
   * Every option that changes the parse result has to appear here, otherwise
   * two templates that differ only in options would share a cache entry.
   *
   * @param filename - Path the template came from, if any
   * @param source - Prepared template text
   * @returns Cache identity string
   */
  private cacheIdentifier(filename: string | undefined, source: string): string {
    return JSON.stringify({
      template: filename ?? source,
      path: this.options.path,
      search_path_on_include: this.options.search_path_on_include,
      case_sensitive: this.options.case_sensitive,
      loop_context_vars: this.options.loop_context_vars,
      global_vars: this.options.global_vars,
      open_mode: this.options.open_mode,
      default_escape: this.options.default_escape,
      vanguard_compatibility_mode: this.options.vanguard_compatibility_mode,
      strict: this.options.strict,
      no_includes: this.options.no_includes
    });
  }

  /**
   * Emit a cache hit/miss line when `cache_debug` is on.
   *
   * @param result - Outcome to report
   * @param filename - Template being looked up
   */
  private logCache(result: 'HIT' | 'MISS', filename?: string): void {
    if (this.options.cache_debug) {
      console.error(`[HTMLTemplate] Cache ${result}:`, filename ?? 'inline');
    }
  }
}
