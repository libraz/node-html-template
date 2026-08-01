/**
 * Compilation entry points
 *
 * @module api/compile
 */

import { type ExpandOptions, expandIncludes, expandIncludesAsync } from '../compile/expandIncludes.js';
import { nodeFileLoader } from '../loader/nodeFile.js';
import type { SyncTemplateLoader, TemplateLoader } from '../loader/types.js';
import { stripComments } from '../parser/comments.js';
import { Parser } from '../parser/Parser.js';
import { buildShape, withGlobalVars } from '../parser/shape.js';
import { Tokenizer } from '../parser/Tokenizer.js';
import { applyFilters } from '../utils/filters.js';
import { type CompiledTemplate, Template } from './Template.js';
import type { AsyncCompileOptions, CompileOptions, IncludeOptions, RenderOptions, TemplateData } from './types.js';

/**
 * Compile a template.
 *
 * @param source - Template text
 * @param options - Compile settings
 * @returns Compiled template, reusable across renders
 * @throws Error on a malformed tag, a missing include or a cyclic include
 *
 * @example
 * ```ts
 * const template = compile('<h1><TMPL_VAR NAME="title"></h1>');
 * template.render({ title: 'Hello' });
 * ```
 */
export function compile<T extends TemplateData = TemplateData>(
  source: string,
  options: CompileOptions = {}
): Template<T> {
  const settings = resolveSettings(options);
  const prepared = settings.prepare(source);

  const expanded = settings.includes
    ? expandIncludes(prepared, options.filename, {
        ...settings.expand,
        loader: options.loader ?? defaultLoader(settings.includeOptions)
      })
    : { text: prepared, versions: new Map<string, string | undefined>(), segments: [] };

  return new Template<T>(assemble(expanded.text, expanded.versions, settings, options));
}

/**
 * Compile a template, reading includes through an asynchronous loader.
 *
 * @param source - Template text
 * @param options - Compile settings
 * @returns Compiled template, reusable across renders
 * @throws Error on a malformed tag, a missing include or a cyclic include
 */
export async function compileAsync<T extends TemplateData = TemplateData>(
  source: string,
  options: AsyncCompileOptions = {}
): Promise<Template<T>> {
  const settings = resolveSettings(options);
  const prepared = settings.prepare(source);

  const expanded = settings.includes
    ? await expandIncludesAsync(prepared, options.filename, {
        ...settings.expand,
        loader: options.loader ?? defaultLoader(settings.includeOptions)
      })
    : { text: prepared, versions: new Map<string, string | undefined>(), segments: [] };

  return new Template<T>(assemble(expanded.text, expanded.versions, settings, options));
}

/**
 * Compile and render in one step.
 *
 * Use {@link compile} when the same template is rendered more than once; this
 * reparses on every call.
 *
 * @param source - Template text
 * @param data - Values for the template's parameters
 * @param options - Compile and render settings
 * @returns Rendered text
 */
export function render<T extends TemplateData = TemplateData>(
  source: string,
  data: T,
  options: CompileOptions & RenderOptions = {}
): string {
  return compile<T>(source, options).render(data, options);
}

/**
 * Compile settings after defaults are applied.
 */
interface Settings {
  strict: boolean;
  caseSensitive: boolean;
  globalVars: boolean;
  defaultEscape: CompileOptions['defaultEscape'];
  percentVars: boolean;
  includes: boolean;
  includeOptions: IncludeOptions;
  expand: Omit<ExpandOptions, 'loader'>;
  prepare(text: string): string;
}

/**
 * Apply defaults to the caller's options.
 *
 * @param options - Compile settings
 * @returns Settings with every default filled in
 */
function resolveSettings(options: CompileOptions | AsyncCompileOptions): Settings {
  const includes = options.includes ?? true;
  const includeOptions: IncludeOptions = typeof includes === 'object' ? includes : {};
  const filters = options.filters ?? [];
  const prepare = (text: string): string => stripComments(applyFilters(text, [...filters]));

  return {
    strict: options.strict ?? true,
    caseSensitive: options.caseSensitive ?? true,
    globalVars: options.globalVars ?? false,
    defaultEscape: options.defaultEscape ?? 'html',
    percentVars: options.legacy?.percentVars ?? false,
    includes: includes !== false,
    includeOptions,
    expand: {
      maxDepth: includeOptions.maxDepth ?? 10,
      onMissing: includeOptions.onMissing ?? 'throw',
      prepare
    },
    prepare
  };
}

/**
 * Build the filesystem loader implied by the include settings.
 *
 * @param includeOptions - Include settings
 * @returns Loader reading from disk
 */
function defaultLoader(includeOptions: IncludeOptions): SyncTemplateLoader & TemplateLoader {
  return nodeFileLoader({
    paths: includeOptions.paths,
    searchAllPaths: includeOptions.searchAllPaths
  });
}

/**
 * Tokenize, parse and describe an expanded template.
 *
 * @param text - Fully expanded template text
 * @param versions - Version of every template it was built from
 * @param settings - Resolved compile settings
 * @param options - Caller's options, for the filename
 * @returns Compiled form
 */
function assemble(
  text: string,
  versions: Map<string, string | undefined>,
  settings: Settings,
  options: CompileOptions | AsyncCompileOptions
): CompiledTemplate {
  const tokens = new Tokenizer(text, options.filename, settings.percentVars, settings.strict).tokenize();
  const nodes = new Parser(tokens, options.filename, !settings.includes).parse();
  const shape = buildShape(nodes, settings.caseSensitive);

  return {
    nodes,
    shape,
    lookupShape: settings.globalVars ? withGlobalVars(shape) : shape,
    caseSensitive: settings.caseSensitive,
    globalVars: settings.globalVars,
    defaultEscape: settings.defaultEscape ?? 'html',
    filename: options.filename,
    versions
  };
}
