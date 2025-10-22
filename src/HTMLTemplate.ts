/**
 * HTMLTemplate - Main template class
 * 100% compatible with Perl HTML::Template v2.98
 *
 * Public API for template loading, parameter management, and output generation.
 *
 * @module HTMLTemplate
 */

import type { Readable } from 'stream';
import { readFileSync } from 'fs';
import type {
  HTMLTemplateOptions,
  ParamValue,
  QueryResult,
  QueryOptions,
  OutputOptions,
  ParseNode
} from './types.js';
import { Tokenizer } from './parser/Tokenizer.js';
import { Parser } from './parser/Parser.js';
import { processIncludes } from './parser/IncludeProcessor.js';
import { Context } from './runtime/Context.js';
import { Executor } from './runtime/Executor.js';
import { CacheManager } from './cache/CacheManager.js';
import { resolveFile, getFileMtime } from './utils/FileResolver.js';
import { readFileWithEncoding } from './utils/encoding.js';
import { createError } from './utils/helpers.js';

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
    this.validParams = this.extractParamNames(this.ast);
  }

  /**
   * Set parameter value(s)
   * Can be called with name and value, or with object of name-value pairs
   *
   * @param nameOrParams - Parameter name or object with multiple parameters
   * @param value - Parameter value (if first argument is string)
   */
  param(nameOrParams: string | Record<string, ParamValue>, value?: ParamValue): void {
    if (typeof nameOrParams === 'string') {
      // Single parameter
      const name = nameOrParams;
      if (value === undefined) {
        throw createError('param() requires a value when called with a name');
      }

      // Check if parameter exists in template (if die_on_bad_params)
      if (this.options.die_on_bad_params) {
        const normalizedName = this.options.case_sensitive ? name : name.toLowerCase();
        if (!this.validParams.has(normalizedName)) {
          throw createError(
            `HTML::Template: param() called for nonexistent parameter '${name}' - die_on_bad_params is set to true`
          );
        }
      }

      this.context.setParam(name, value);
    } else {
      // Multiple parameters
      const params = nameOrParams;
      Object.entries(params).forEach(([key, val]) => {
        this.param(key, val);
      });
    }
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
   * Normalize options with defaults
   *
   * @param options - User-provided options
   * @returns Normalized options with all defaults applied
   */
  private static normalizeOptions(options: HTMLTemplateOptions): Required<HTMLTemplateOptions> {
    return {
      // Source options
      filename: options.filename,
      scalarref: options.scalarref,
      arrayref: options.arrayref,
      filehandle: options.filehandle,
      type: options.type,
      source: options.source,

      // Error detection
      // vanguard_compatibility_mode implies die_on_bad_params: false
      die_on_bad_params: options.vanguard_compatibility_mode
        ? false
        : (options.die_on_bad_params ?? true),
      strict: options.strict ?? true,
      force_untaint: options.force_untaint ?? 0,
      vanguard_compatibility_mode: options.vanguard_compatibility_mode ?? false,

      // Caching
      cache: options.cache ?? false,
      blind_cache: options.blind_cache ?? false,
      file_cache: options.file_cache ?? false,
      file_cache_dir: options.file_cache_dir,
      file_cache_dir_mode: options.file_cache_dir_mode ?? 0o700,
      double_file_cache: options.double_file_cache ?? false,
      cache_lazy_vars: options.cache_lazy_vars ?? false,
      cache_lazy_loops: options.cache_lazy_loops ?? false,

      // File system
      path: options.path ?? [],
      search_path_on_include: options.search_path_on_include ?? false,
      utf8: options.utf8 ?? false,
      open_mode: options.open_mode,

      // Debugging
      debug: options.debug ?? false,
      stack_debug: options.stack_debug ?? false,
      cache_debug: options.cache_debug ?? false,

      // Behavior
      associate: options.associate,
      case_sensitive: options.case_sensitive ?? false,
      loop_context_vars: options.loop_context_vars ?? false,
      global_vars: options.global_vars ?? false,
      no_includes: options.no_includes ?? false,
      max_includes: options.max_includes ?? 10,
      die_on_missing_include: options.die_on_missing_include ?? true,
      filter: options.filter,
      default_escape: options.default_escape ?? 'none'
    } as Required<HTMLTemplateOptions>;
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
          return { source: (source as string[]).join('\n') };
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
      return { source: this.options.arrayref.join('\n') };
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
      encoding = this.options.open_mode;
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
    // Synchronous stream reading
    const chunks: Buffer[] = [];

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    // Wait for stream to end (blocking)
    let ended = false;
    stream.on('end', () => {
      ended = true;
    });

    // Simple blocking wait
    // eslint-disable-next-line no-constant-condition
    while (!ended) {
      // Busy wait - not ideal but matches Perl blocking behavior
      // In production, this should use async/await
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
      if (filter.format === 'array') {
        // Convert to array if needed
        if (typeof filtered === 'string') {
          filtered = filtered.split('\n');
        }
        filtered = filter.sub(filtered);
      } else {
        // scalar format (default)
        // Convert to string if needed
        if (Array.isArray(filtered)) {
          filtered = filtered.join('\n');
        }
        filtered = filter.sub(filtered);
      }
    }

    // Ensure final result is string
    return Array.isArray(filtered) ? filtered.join('\n') : filtered;
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
    const cacheKey = CacheManager.generateKey(filename ?? source);

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
    const tokenizer = new Tokenizer(source, filename, this.options.vanguard_compatibility_mode);
    const tokens = tokenizer.tokenize();

    const parser = new Parser(tokens, filename);
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

  /**
   * Extract all parameter names from AST
   * Used for die_on_bad_params validation
   *
   * @param nodes - ParseNode array
   * @returns Set of parameter names (normalized according to case_sensitive)
   */
  private extractParamNames(nodes: ParseNode[]): Set<string> {
    const params = new Set<string>();

    const processNode = (node: ParseNode): void => {
      if (node.type === 'VAR') {
        // Add variable name
        const name = this.options.case_sensitive ? node.name : node.name.toLowerCase();
        params.add(name);
      } else if (node.type === 'LOOP') {
        // Add loop name
        const name = this.options.case_sensitive ? node.name : node.name.toLowerCase();
        params.add(name);
        // Process loop body
        node.body.forEach(processNode);
      } else if (node.type === 'COND') {
        // Add condition name
        const name = this.options.case_sensitive ? node.name : node.name.toLowerCase();
        params.add(name);
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
        // Also include nested parameters
        node.body.forEach(processNode);
      } else if (node.type === 'COND') {
        params.add(node.name);
        node.consequent.forEach(processNode);
        if (node.alternate) {
          node.alternate.forEach(processNode);
        }
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
    const targetName = path[0];

    if (!targetName) {
      return undefined;
    }

    // If path length > 1, we need to navigate to nested scope
    if (path.length > 1) {
      // Find the loop and search within it
      const loopName = path[0];
      const nestedName = path[path.length - 1];

      if (!loopName || !nestedName) {
        return undefined;
      }

      const loopNode = this.findLoop(loopName, this.ast);
      if (!loopNode || loopNode.type !== 'LOOP') {
        return undefined;
      }

      return this.findParamTypeInNodes(nestedName, loopNode.body);
    }

    // Search in top-level nodes
    return this.findParamTypeInNodes(targetName, this.ast);
  }

  /**
   * Find parameter type in node array
   *
   * @param name - Parameter name to find
   * @param nodes - Nodes to search
   * @returns Parameter type or undefined
   */
  private findParamTypeInNodes(name: string, nodes: ParseNode[]): QueryResult {
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
      if (node.type === 'LOOP') {
        const result = this.findParamTypeInNodes(name, node.body);
        if (result) {
          return result;
        }
      } else if (node.type === 'COND') {
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
    const loopName = path[path.length - 1];

    if (!loopName) {
      return undefined;
    }

    // Find the loop node
    const loopNode = this.findLoop(loopName, this.ast);
    if (!loopNode || loopNode.type !== 'LOOP') {
      return undefined;
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
