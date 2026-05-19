/**
 * HTMLTemplate - Main template class
 * Compatible with Perl HTML::Template v2.98 core API and template syntax
 *
 * Public API for template loading, parameter management, and output generation.
 *
 * @module HTMLTemplate
 */

import { readFileSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { CacheManager } from './cache/CacheManager.js';
import { processIncludes } from './parser/IncludeProcessor.js';
import { Parser } from './parser/Parser.js';
import { Tokenizer } from './parser/Tokenizer.js';
import { Context } from './runtime/Context.js';
import { Executor } from './runtime/Executor.js';
import type { HTMLTemplateOptions, OutputOptions, ParamValue, ParseNode, QueryOptions, QueryResult } from './types.js';
import { parseOpenMode, readFileWithEncoding } from './utils/encoding.js';
import { getFileMtime, resolveFile } from './utils/FileResolver.js';
import { createError } from './utils/helpers.js';
import { maybeCacheLazyLoop, maybeCacheLazyValue } from './utils/LazyValue.js';

/**
 * HTMLTemplate class
 * Main entry point for template processing
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
  private static globalOptions: HTMLTemplateOptions = {
    die_on_bad_params: true,
    strict: true,
    force_untaint: 0,
    vanguard_compatibility_mode: false,
    cache: false,
    blind_cache: false,
    file_cache: false,
    file_cache_dir_mode: 0o700,
    double_file_cache: false,
    double_cache: false,
    shared_cache: false,
    shared_cache_debug: false,
    memory_debug: false,
    cache_lazy_vars: false,
    cache_lazy_loops: false,
    path: [],
    search_path_on_include: false,
    utf8: false,
    debug: false,
    stack_debug: false,
    cache_debug: false,
    associate: [],
    case_sensitive: false,
    loop_context_vars: false,
    global_vars: false,
    no_includes: false,
    max_includes: 10,
    die_on_missing_include: true,
    filter: [],
    default_escape: 'none'
  };
  /**
   * Template options (normalized with defaults)
   */
  private options: Required<HTMLTemplateOptions>;

  /**
   * Parsed template AST
   */
  private ast: ParseNode[];

  /**
   * Runtime context for parameter management
   */
  private context: Context;

  /**
   * Cache manager
   */
  private cacheManager: CacheManager;

  /**
   * Template source content (before parsing)
   */
  private templateSource: string;

  /**
   * Set of valid parameter names (for die_on_bad_params checking)
   * Names are normalized according to case_sensitive option
   */
  private validParams: Set<string>;

  /**
   * Map of valid parameter names to their template type.
   */
  private paramTypes: Map<string, 'VAR' | 'LOOP'>;

  /**
   * Create new HTMLTemplate instance
   *
   * @param options - Template options
   */
  constructor(options: HTMLTemplateOptions) {
    // Normalize options with defaults
    this.options = HTMLTemplate.normalizeOptions(options);

    // Initialize cache manager
    this.cacheManager = new CacheManager(this.options);

    // Initialize context
    this.context = new Context(this.options);

    // Load and parse template
    const { source, filename } = this.loadTemplateSource();
    this.templateSource = source;

    // Apply filters
    let filteredSource = this.applyFilters(this.templateSource);

    // Strip TMPL_COMMENT blocks (before include processing)
    filteredSource = HTMLTemplate.stripComments(filteredSource);

    // Process includes
    let includeMtimes = new Map<string, number>();
    if (!this.options.no_includes) {
      const includeResult = processIncludes(filteredSource, this.options, filename);
      filteredSource = includeResult.source;
      includeMtimes = includeResult.mtimes;
    }

    // Parse template (with caching)
    this.ast = this.parseTemplate(filteredSource, filename, includeMtimes);

    // Extract valid parameter names from AST (for die_on_bad_params checking)
    this.paramTypes = this.extractParamTypes(this.ast);
    this.validParams = new Set(this.paramTypes.keys());
  }

  /**
   * Set parameter value(s)
   * Can be called with name and value, or with object of name-value pairs
   *
   * @param nameOrParams - Parameter name or object with multiple parameters
   * @param value - Parameter value (if first argument is string)
   */
  param(): string[];
  param(name: string): ParamValue | undefined;
  param(name: string, value: ParamValue): void;
  param(params: Record<string, ParamValue>): void;
  param(
    ...args: [] | [string] | [string, ParamValue] | [Record<string, ParamValue>]
  ): string[] | ParamValue | undefined {
    if (args.length === 0) {
      return this.queryAllParams();
    }

    const [nameOrParams, value] = args;

    if (typeof nameOrParams === 'string' && args.length === 1) {
      const normalizedName = this.options.case_sensitive ? nameOrParams : nameOrParams.toLowerCase();
      if (this.options.die_on_bad_params && !this.validParams.has(normalizedName)) {
        throw createError(
          `HTML::Template : Attempt to get nonexistent parameter '${normalizedName}' - this parameter name doesn't match any declarations in the template file : (die_on_bad_params set => 1)`
        );
      }
      return this.context.getParam(nameOrParams);
    }

    if (typeof nameOrParams === 'string') {
      // Single parameter
      const name = nameOrParams;

      // Check if parameter exists in template (if die_on_bad_params)
      const normalizedName = this.options.case_sensitive ? name : name.toLowerCase();
      if (this.options.die_on_bad_params && !this.validParams.has(normalizedName)) {
        throw createError(
          `HTML::Template : Attempt to set nonexistent parameter '${normalizedName}' - this parameter name doesn't match any declarations in the template file : (die_on_bad_params => 1)`
        );
      }

      this.context.setParam(name, this.prepareParamValue(normalizedName, value));
    } else if (nameOrParams && typeof nameOrParams === 'object') {
      // Multiple parameters
      const params = nameOrParams;
      Object.entries(params).forEach(([key, val]) => {
        this.param(key, val);
      });
    } else {
      throw createError('HTML::Template->param() : Single reference arg to param() must be a hash-ref!');
    }

    return undefined;
  }

  /**
   * Generate output HTML
   *
   * @param options - Output options (optional)
   * @returns Generated HTML string, or undefined if print_to is specified
   */
  output(options?: OutputOptions): string | undefined {
    // Execute template
    const executor = new Executor(this.context);
    const html = executor.execute(this.ast);

    // If print_to specified, write to stream
    if (options?.print_to) {
      options.print_to.write(html);
      return undefined;
    }

    return html;
  }

  /**
   * Query template structure
   * Returns information about parameters in the template
   *
   * Compatible with Perl HTML::Template query() method:
   * - query() - returns array of all top-level parameter names
   * - query({ name: 'foo' }) - returns 'VAR', 'LOOP', or undefined
   * - query({ loop: 'foo' }) - returns array of parameter names in loop
   *
   * @param options - Query options
   * @returns Query result
   */
  query(options?: QueryOptions): QueryResult | string[] | undefined {
    if (!options) {
      // No options: return all top-level parameter names
      return this.queryAllParams();
    }

    if (options.name !== undefined) {
      // Query specific parameter type
      return this.queryParamType(options.name);
    }

    if (options.loop !== undefined) {
      // Query parameters within a loop
      return this.queryLoopParams(options.loop);
    }

    return undefined;
  }

  /**
   * Clear all parameters
   * Resets template to initial state
   */
  clear(): void {
    this.context.clear();
  }

  /**
   * Perl-compatible clear_params() alias.
   */
  clear_params(): void {
    this.clear();
  }

  /**
   * Obsolete Perl-compatible associateCGI() method.
   */
  associateCGI(object: { param?: unknown }): void {
    if (!object || typeof object.param !== 'function') {
      throw createError('Warning! non-CGI object was passed to HTML::Template::associateCGI()!');
    }
    this.context.addAssociate(object as never);
  }

  static config(): HTMLTemplateOptions;
  static config(options: HTMLTemplateOptions): HTMLTemplateOptions;
  static config(options?: HTMLTemplateOptions): HTMLTemplateOptions {
    if (options) {
      HTMLTemplate.globalOptions = {
        ...HTMLTemplate.globalOptions,
        ...options,
        associate:
          options.associate !== undefined
            ? [
                ...HTMLTemplate.asArray(HTMLTemplate.globalOptions.associate),
                ...HTMLTemplate.asArray(options.associate)
              ]
            : HTMLTemplate.globalOptions.associate,
        filter:
          options.filter !== undefined
            ? [...HTMLTemplate.asArray(HTMLTemplate.globalOptions.filter), ...HTMLTemplate.asArray(options.filter)]
            : HTMLTemplate.globalOptions.filter,
        path:
          options.path !== undefined
            ? [...HTMLTemplate.asArray(HTMLTemplate.globalOptions.path), ...HTMLTemplate.asArray(options.path)]
            : HTMLTemplate.globalOptions.path
      };
    }
    return { ...HTMLTemplate.globalOptions };
  }

  static new_file(filename: string, options: Omit<HTMLTemplateOptions, 'filename'> = {}): HTMLTemplate {
    return new HTMLTemplate({ ...options, filename });
  }

  static new_scalar_ref(scalarref: string, options: Omit<HTMLTemplateOptions, 'scalarref'> = {}): HTMLTemplate {
    return new HTMLTemplate({ ...options, scalarref });
  }

  static new_array_ref(arrayref: string[], options: Omit<HTMLTemplateOptions, 'arrayref'> = {}): HTMLTemplate {
    return new HTMLTemplate({ ...options, arrayref });
  }

  static new_filehandle(filehandle: Readable, options: Omit<HTMLTemplateOptions, 'filehandle'> = {}): HTMLTemplate {
    return new HTMLTemplate({ ...options, filehandle });
  }

  /**
   * Normalize options with defaults
   *
   * @param options - User-provided options
   * @returns Normalized options with all defaults applied
   */
  private static normalizeOptions(options: HTMLTemplateOptions): Required<HTMLTemplateOptions> {
    const mergedOptions = { ...HTMLTemplate.globalOptions, ...options };
    HTMLTemplate.validateOptions(mergedOptions);

    return {
      // Source options
      filename: mergedOptions.filename,
      scalarref: mergedOptions.scalarref,
      arrayref: mergedOptions.arrayref,
      filehandle: mergedOptions.filehandle,
      type: mergedOptions.type,
      source: mergedOptions.source,

      // Error detection
      // vanguard_compatibility_mode implies die_on_bad_params: false
      die_on_bad_params: mergedOptions.vanguard_compatibility_mode ? false : (mergedOptions.die_on_bad_params ?? true),
      strict: mergedOptions.strict ?? true,
      force_untaint: mergedOptions.force_untaint ?? 0,
      vanguard_compatibility_mode: mergedOptions.vanguard_compatibility_mode ?? false,

      // Caching
      cache:
        mergedOptions.cache ||
        mergedOptions.blind_cache ||
        mergedOptions.file_cache ||
        mergedOptions.double_file_cache ||
        false,
      blind_cache: mergedOptions.blind_cache ?? false,
      file_cache: mergedOptions.file_cache || mergedOptions.double_file_cache || false,
      file_cache_dir: mergedOptions.file_cache_dir,
      file_cache_dir_mode: mergedOptions.file_cache_dir_mode ?? 0o700,
      double_file_cache: mergedOptions.double_file_cache ?? false,
      double_cache: mergedOptions.double_cache ?? false,
      shared_cache: mergedOptions.shared_cache ?? false,
      shared_cache_debug: mergedOptions.shared_cache_debug ?? false,
      memory_debug: mergedOptions.memory_debug ?? false,
      cache_lazy_vars: mergedOptions.cache_lazy_vars ?? false,
      cache_lazy_loops: mergedOptions.cache_lazy_loops ?? false,

      // File system
      path: HTMLTemplate.asArray(mergedOptions.path),
      search_path_on_include: mergedOptions.search_path_on_include ?? false,
      utf8: mergedOptions.utf8 ?? false,
      open_mode: mergedOptions.utf8 ? 'utf-8' : mergedOptions.open_mode,

      // Debugging
      debug: mergedOptions.debug ?? false,
      stack_debug: mergedOptions.stack_debug ?? false,
      cache_debug: mergedOptions.cache_debug ?? false,

      // Behavior
      associate: HTMLTemplate.asArray(mergedOptions.associate),
      case_sensitive: mergedOptions.case_sensitive ?? false,
      loop_context_vars: mergedOptions.loop_context_vars ?? false,
      global_vars: mergedOptions.global_vars ?? false,
      no_includes: mergedOptions.no_includes ?? false,
      max_includes: mergedOptions.max_includes ?? 10,
      die_on_missing_include: mergedOptions.die_on_missing_include ?? true,
      filter: HTMLTemplate.asArray(mergedOptions.filter),
      default_escape: (mergedOptions.default_escape ?? 'none').toLowerCase() as never
    } as Required<HTMLTemplateOptions>;
  }

  private static validateOptions(options: HTMLTemplateOptions): void {
    if (options.type !== undefined) {
      if (options.source === undefined) {
        throw createError("HTML::Template->new called with 'type' parameter set, but no 'source'!");
      }
      if (!['filename', 'scalarref', 'arrayref', 'filehandle'].includes(options.type)) {
        throw createError(
          "HTML::Template->new called with invalid type parameter! Valid types are 'filename', 'scalarref', 'arrayref' and 'filehandle'."
        );
      }
      return;
    }

    const sourceCount =
      Number(options.filename !== undefined) +
      Number(options.filehandle !== undefined) +
      Number(options.arrayref !== undefined) +
      Number(options.scalarref !== undefined);
    if (sourceCount !== 1) {
      throw createError(
        'HTML::Template->new called with multiple (or no) template sources specified! A valid call to new() has exactly one filename, scalarref, arrayref or filehandle'
      );
    }

    const hasNonFileSource =
      options.filehandle !== undefined || options.arrayref !== undefined || options.scalarref !== undefined;
    if (
      hasNonFileSource &&
      (options.cache ||
        options.blind_cache ||
        options.file_cache ||
        options.shared_cache ||
        options.double_cache ||
        options.double_file_cache)
    ) {
      throw createError('Cannot have caching when template source is not file');
    }

    if ((options.file_cache || options.double_file_cache) && !options.file_cache_dir) {
      throw createError('You must specify the file_cache_dir option if you want to use file_cache.');
    }

    if (options.utf8 && options.open_mode) {
      throw createError('HTML::Template->new(): utf8 and open_mode cannot be used at the same time');
    }

    if (options.default_escape && !['none', 'html', 'url', 'js'].includes(options.default_escape.toLowerCase())) {
      throw createError(
        `HTML::Template->new(): Invalid setting for default_escape - '${options.default_escape}'. Valid values are 'none', 'html', 'url', or 'js'.`
      );
    }

    for (const associate of HTMLTemplate.asArray(options.associate)) {
      if (!associate || typeof associate.param !== 'function') {
        throw createError(
          'HTML::Template->new called with associate option, containing object which lacks a param() method!'
        );
      }
    }
  }

  private static asArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }

  /**
   * Load template source from options
   * Handles filename, scalarref, arrayref, filehandle, or type/source
   *
   * @returns Template source and optional filename
   */
  private loadTemplateSource(): { source: string; filename?: string } {
    // Check for alternative type/source specification
    if (this.options.type && this.options.source !== undefined) {
      const { type, source } = this.options;
      switch (type) {
        case 'filename':
          return this.loadFromFile(source as string);
        case 'scalarref':
          return { source: source as string };
        case 'arrayref':
          return { source: (source as string[]).join('') };
        case 'filehandle':
          return { source: HTMLTemplate.readStream(source as Readable) };
        default:
          throw createError(`Unknown template type: ${type}`);
      }
    }

    // Check for direct source specifications (in priority order)
    if (this.options.scalarref !== undefined) {
      return { source: this.options.scalarref };
    }

    if (this.options.arrayref !== undefined) {
      return { source: this.options.arrayref.join('') };
    }

    if (this.options.filehandle !== undefined) {
      return { source: HTMLTemplate.readStream(this.options.filehandle) };
    }

    if (this.options.filename !== undefined) {
      return this.loadFromFile(this.options.filename);
    }

    throw createError('No template source specified (need filename, scalarref, arrayref, or filehandle)');
  }

  /**
   * Load template from file
   *
   * @param filename - Filename to load
   * @returns Source content and resolved filename
   */
  private loadFromFile(filename: string): { source: string; filename: string } {
    // Resolve file path
    const resolved = resolveFile(filename, {
      path: this.options.path,
      searchPathOnInclude: this.options.search_path_on_include
    });

    // Determine encoding
    let encoding: BufferEncoding | undefined;
    if (this.options.utf8) {
      encoding = 'utf-8';
    } else if (this.options.open_mode) {
      encoding = parseOpenMode(this.options.open_mode);
    }

    // Read file
    const source = encoding
      ? readFileWithEncoding(resolved.filepath, encoding)
      : readFileSync(resolved.filepath, 'utf-8');

    return { source, filename: resolved.filepath };
  }

  /**
   * Read template from stream
   *
   * @param stream - Readable stream
   * @returns Template content
   */
  private static readStream(stream: Readable): string {
    // Synchronous stream reading using readable iteration
    const chunks: Buffer[] = [];
    let chunk: Buffer | null;
    chunk = stream.read() as Buffer | null;
    while (chunk !== null) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      chunk = stream.read() as Buffer | null;
    }

    return Buffer.concat(chunks).toString('utf-8');
  }

  /**
   * Apply content filters to template source
   *
   * @param source - Template source
   * @returns Filtered source
   */
  private applyFilters(source: string): string {
    if (!this.options.filter) {
      return source;
    }

    const filters = Array.isArray(this.options.filter) ? this.options.filter : [this.options.filter];

    let filtered: string | string[] = source;

    for (const filter of filters) {
      // Convert to appropriate format
      if (typeof filter === 'function') {
        if (Array.isArray(filtered)) {
          filtered = filtered.join('');
        }
        filtered = filter(filtered);
      } else if (filter.format === 'array') {
        // Convert to array if needed
        if (typeof filtered === 'string') {
          filtered = filtered.split(/(?<=\n)/);
        }
        filtered = filter.sub(filtered);
      } else {
        // scalar format (default)
        // Convert to string if needed
        if (Array.isArray(filtered)) {
          filtered = filtered.join('');
        }
        filtered = filter.sub(filtered);
      }
    }

    // Ensure final result is string
    return Array.isArray(filtered) ? filtered.join('') : filtered;
  }

  /**
   * Strip TMPL_COMMENT and TMPL_NOTE blocks from template source
   *
   * @param source - Template source
   * @returns Source with comment blocks removed
   */
  private static stripComments(source: string): string {
    return source.replace(
      /<\s*(?:!--\s*)?TMPL_(?:COMMENT|NOTE)\b[^>]*(?:--\s*)?>([\s\S]*?)<\s*(?:!--\s*)?\/TMPL_(?:COMMENT|NOTE)\s*(?:--\s*)?>/gi,
      ''
    );
  }

  /**
   * Parse template with caching
   *
   * @param source - Template source (after filtering and includes)
   * @param filename - Optional filename for cache key
   * @param includeMtimes - Mtimes of included files
   * @returns Parsed AST
   */
  private parseTemplate(source: string, filename?: string, includeMtimes?: Map<string, number>): ParseNode[] {
    // Generate cache key
    const cacheKey = CacheManager.generateKey(this.cacheIdentifier(filename, source));

    // Try cache
    if (this.cacheManager.isEnabled()) {
      const cached = this.cacheManager.get(cacheKey);
      if (cached) {
        if (this.options.cache_debug) {
          console.error('[HTMLTemplate] Cache HIT:', filename ?? 'inline');
        }
        return cached.nodes;
      }
      if (this.options.cache_debug) {
        console.error('[HTMLTemplate] Cache MISS:', filename ?? 'inline');
      }
    }

    // Parse template
    const tokenizer = new Tokenizer(source, filename, this.options.vanguard_compatibility_mode, this.options.strict);
    const tokens = tokenizer.tokenize();

    const parser = new Parser(tokens, filename, this.options.no_includes);
    let ast = parser.parse();

    // Apply default_escape if specified
    if (this.options.default_escape && this.options.default_escape !== 'none') {
      ast = this.applyDefaultEscape(ast, this.options.default_escape);
    }

    // Store in cache
    if (this.cacheManager.isEnabled() && filename) {
      // Merge include mtimes with main file mtime
      const mtimes = includeMtimes ?? new Map<string, number>();
      // Add main file mtime if not already present
      if (filename && !mtimes.has(filename)) {
        const mainMtime = getFileMtime(filename);
        if (mainMtime !== -1) {
          mtimes.set(filename, mainMtime);
        }
      }
      this.cacheManager.set(cacheKey, ast, mtimes);
    }

    return ast;
  }

  /**
   * Apply default escape to VAR nodes that don't have explicit escape
   *
   * @param nodes - ParseNode array
   * @param defaultEscape - Default escape type
   * @returns Modified AST with default escape applied
   */
  private applyDefaultEscape(nodes: ParseNode[], defaultEscape: string): ParseNode[] {
    return nodes.map((node) => {
      if (node.type === 'VAR') {
        // Only apply default if current escape is 'none'
        if (node.escape === 'none') {
          return {
            ...node,
            escape: defaultEscape as 'html' | 'js' | 'url' | 'none'
          };
        }
        return node;
      }
      if (node.type === 'LOOP') {
        return {
          ...node,
          body: this.applyDefaultEscape(node.body, defaultEscape)
        };
      }
      if (node.type === 'COND') {
        return {
          ...node,
          consequent: this.applyDefaultEscape(node.consequent, defaultEscape),
          alternate: node.alternate ? this.applyDefaultEscape(node.alternate, defaultEscape) : undefined
        };
      }
      return node;
    });
  }

  private cacheIdentifier(filename: string | undefined, source: string): string {
    return JSON.stringify({
      template: filename ?? source,
      path: this.options.path,
      search_path_on_include: this.options.search_path_on_include,
      loop_context_vars: this.options.loop_context_vars,
      global_vars: this.options.global_vars,
      open_mode: this.options.open_mode,
      default_escape: this.options.default_escape,
      vanguard_compatibility_mode: this.options.vanguard_compatibility_mode,
      strict: this.options.strict,
      no_includes: this.options.no_includes
    });
  }

  private prepareParamValue(name: string, value: ParamValue): ParamValue {
    const paramType = this.paramTypes.get(name);

    if (!paramType) {
      if (Array.isArray(value)) {
        return maybeCacheLazyLoop(value, this.options.cache_lazy_loops) as ParamValue;
      }
      return maybeCacheLazyValue(value, this.options.cache_lazy_vars) as ParamValue;
    }

    if (paramType === 'LOOP') {
      if (value !== undefined && value !== null && !Array.isArray(value) && typeof value !== 'function') {
        throw createError(
          `HTML::Template::param() : attempt to set parameter '${name}' with a scalar - parameter is not a TMPL_VAR!`
        );
      }
      return maybeCacheLazyLoop(value, this.options.cache_lazy_loops) as ParamValue;
    }

    if (Array.isArray(value)) {
      throw createError(
        `HTML::Template::param() : attempt to set parameter '${name}' with an array ref - parameter is not a TMPL_LOOP!`
      );
    }
    return maybeCacheLazyValue(value, this.options.cache_lazy_vars) as ParamValue;
  }

  /**
   * Extract all parameter names from AST
   * Used for die_on_bad_params validation
   *
   * @param nodes - ParseNode array
   * @returns Set of parameter names (normalized according to case_sensitive)
   */
  private extractParamTypes(nodes: ParseNode[]): Map<string, 'VAR' | 'LOOP'> {
    const params = new Map<string, 'VAR' | 'LOOP'>();

    const setParamType = (name: string, type: 'VAR' | 'LOOP'): void => {
      const existing = params.get(name);
      if (existing === 'LOOP') {
        return;
      }
      params.set(name, type);
    };

    const processNode = (node: ParseNode): void => {
      if (node.type === 'VAR') {
        // Add variable name
        const name = this.options.case_sensitive ? node.name : node.name.toLowerCase();
        setParamType(name, 'VAR');
      } else if (node.type === 'LOOP') {
        // Add loop name
        const name = this.options.case_sensitive ? node.name : node.name.toLowerCase();
        setParamType(name, 'LOOP');
        // Process loop body
        node.body.forEach(processNode);
      } else if (node.type === 'COND') {
        // Add condition name
        const name = this.options.case_sensitive ? node.name : node.name.toLowerCase();
        setParamType(name, 'VAR');
        // Process consequent
        node.consequent.forEach(processNode);
        // Process alternate if exists
        if (node.alternate) {
          node.alternate.forEach(processNode);
        }
      }
    };

    nodes.forEach(processNode);
    return params;
  }

  /**
   * Query all top-level parameter names
   * Returns array of parameter names found in template
   *
   * @returns Array of parameter names
   */
  private queryAllParams(): string[] {
    const params = new Set<string>();

    const processNode = (node: ParseNode): void => {
      if (node.type === 'VAR') {
        params.add(node.name);
      } else if (node.type === 'LOOP') {
        params.add(node.name);
      } else if (node.type === 'COND') {
        params.add(node.name);
      }
    };

    this.ast.forEach(processNode);
    return Array.from(params).sort();
  }

  /**
   * Query parameter type
   * Returns 'VAR', 'LOOP', or undefined for a specific parameter
   *
   * @param name - Parameter name (string or array path)
   * @returns Parameter type or undefined if not found
   */
  private queryParamType(name: string | string[]): QueryResult {
    // Normalize name to array path
    const path = Array.isArray(name) ? name : [name];
    const targetName = path[path.length - 1];

    if (!targetName) {
      return undefined;
    }

    const nodes = this.resolveQueryScope(path.slice(0, -1));
    return nodes ? this.findParamTypeInNodes(targetName, nodes, path.length === 1) : undefined;
  }

  /**
   * Find parameter type in node array
   *
   * @param name - Parameter name to find
   * @param nodes - Nodes to search
   * @returns Parameter type or undefined
   */
  private findParamTypeInNodes(name: string, nodes: ParseNode[], recursive = true): QueryResult {
    const normalizeName = (n: string): string => (this.options.case_sensitive ? n : n.toLowerCase());

    const normalizedTarget = normalizeName(name);

    for (const node of nodes) {
      if (node.type === 'VAR' && normalizeName(node.name) === normalizedTarget) {
        return 'VAR';
      }
      if (node.type === 'LOOP' && normalizeName(node.name) === normalizedTarget) {
        return 'LOOP';
      }
      if (node.type === 'COND' && normalizeName(node.name) === normalizedTarget) {
        // Conditionals are treated as VARs in query
        return 'VAR';
      }

      // Search recursively
      if (recursive && node.type === 'LOOP') {
        const result = this.findParamTypeInNodes(name, node.body);
        if (result) {
          return result;
        }
      } else if (recursive && node.type === 'COND') {
        const result1 = this.findParamTypeInNodes(name, node.consequent);
        if (result1) {
          return result1;
        }
        if (node.alternate) {
          const result2 = this.findParamTypeInNodes(name, node.alternate);
          if (result2) {
            return result2;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Find loop node by name
   *
   * @param name - Loop name
   * @param nodes - Nodes to search
   * @returns Loop node or undefined
   */
  private findLoop(name: string, nodes: ParseNode[]): ParseNode | undefined {
    const normalizeName = (n: string): string => (this.options.case_sensitive ? n : n.toLowerCase());

    const normalizedTarget = normalizeName(name);

    for (const node of nodes) {
      if (node.type === 'LOOP' && normalizeName(node.name) === normalizedTarget) {
        return node;
      }

      // Search recursively
      if (node.type === 'LOOP') {
        const result = this.findLoop(name, node.body);
        if (result) {
          return result;
        }
      } else if (node.type === 'COND') {
        const result1 = this.findLoop(name, node.consequent);
        if (result1) {
          return result1;
        }
        if (node.alternate) {
          const result2 = this.findLoop(name, node.alternate);
          if (result2) {
            return result2;
          }
        }
      }
    }

    return undefined;
  }

  private findLoopAtCurrentLevel(name: string, nodes: ParseNode[]): ParseNode | undefined {
    const normalizeName = (n: string): string => (this.options.case_sensitive ? n : n.toLowerCase());
    const normalizedTarget = normalizeName(name);

    for (const node of nodes) {
      if (node.type === 'LOOP' && normalizeName(node.name) === normalizedTarget) {
        return node;
      }
    }

    return undefined;
  }

  private resolveQueryScope(path: string[]): ParseNode[] | undefined {
    let nodes = this.ast;

    for (const loopName of path) {
      const loopNode = this.findLoopAtCurrentLevel(loopName, nodes);
      if (!loopNode || loopNode.type !== 'LOOP') {
        return undefined;
      }
      nodes = loopNode.body;
    }

    return nodes;
  }

  /**
   * Query parameters within a loop
   * Returns array of parameter names found in the specified loop
   *
   * @param loop - Loop name (string or array path)
   * @returns Array of parameter names or undefined if loop not found
   */
  private queryLoopParams(loop: string | string[]): string[] | undefined {
    // Normalize loop to array path
    const path = Array.isArray(loop) ? loop : [loop];
    if (!path[path.length - 1]) {
      return undefined;
    }

    const parentNodes = path.length === 1 ? this.ast : this.resolveQueryScope(path.slice(0, -1));
    const loopName = path[path.length - 1] ?? '';
    const loopNode =
      parentNodes && path.length === 1
        ? this.findLoop(loopName, parentNodes)
        : parentNodes
          ? this.findLoopAtCurrentLevel(loopName, parentNodes)
          : undefined;
    if (!loopNode || loopNode.type !== 'LOOP') {
      throw createError(
        `HTML::Template::query() : Search path [${path.join(', ')}] doesn't end in a TMPL_LOOP - it is an error to use the 'loop' option on a non-loop parameter.`
      );
    }

    // Extract parameter names from loop body
    const params = new Set<string>();

    const processNode = (node: ParseNode): void => {
      if (node.type === 'VAR') {
        params.add(node.name);
      } else if (node.type === 'LOOP') {
        params.add(node.name);
      } else if (node.type === 'COND') {
        params.add(node.name);
        node.consequent.forEach(processNode);
        if (node.alternate) {
          node.alternate.forEach(processNode);
        }
      }
    };

    loopNode.body.forEach(processNode);
    return Array.from(params).sort();
  }
}
