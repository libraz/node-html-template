/**
 * Compilation entry points
 *
 * @module api/compile
 */

import {
  type EntryTemplate,
  type ExpandedSource,
  type ExpandOptions,
  expandIncludes,
  expandIncludesAsync,
  withoutIncludes
} from '../compile/expandIncludes.js';
import type { ResolveRequest, SyncTemplateLoader } from '../loader/types.js';
import { resolveEscapeType, TagSyntaxError } from '../parser/attributes.js';
import { Parser } from '../parser/Parser.js';
import { buildShape, withGlobalVars } from '../parser/shape.js';
import { Tokenizer } from '../parser/Tokenizer.js';
import type { EscapeType } from '../types.js';
import { applyFilters } from '../utils/filters.js';
import { createError } from '../utils/helpers.js';
import { type CompiledTemplate, Template } from './Template.js';
import type { AsyncCompileOptions, CompileOptions, IncludeOptions, RenderOptions, TemplateData } from './types.js';

/**
 * Compile a template.
 *
 * @param source - Template text
 * @param options - Compile settings
 * @returns Compiled template, reusable across renders
 * @throws Error on a malformed tag, a missing include, a cyclic include or an
 *   unknown `defaultEscape`
 *
 * @example
 * ```ts
 * const template = compile('<h1><TMPL_VAR NAME="title"></h1>');
 * template.render({ title: 'Hello' });
 * ```
 */
export function compile<T extends object = TemplateData>(source: string, options: CompileOptions = {}): Template<T> {
  return compileEntry<T>({ id: options.filename, text: source }, options);
}

/**
 * Compile a template, reading includes through an asynchronous loader.
 *
 * @param source - Template text
 * @param options - Compile settings
 * @returns Compiled template, reusable across renders
 * @throws Error on a malformed tag, a missing include, a cyclic include or an
 *   unknown `defaultEscape`
 */
export async function compileAsync<T extends object = TemplateData>(
  source: string,
  options: AsyncCompileOptions = {}
): Promise<Template<T>> {
  return compileEntryAsync<T>({ id: options.filename, text: source }, options);
}

/**
 * Compile an entry template.
 *
 * {@link Environment} passes the loader read its text came from, so the
 * version recorded for cache validation is the one that read returned.
 *
 * @param entry - Entry template
 * @param options - Compile settings
 * @returns Compiled template
 * @internal
 */
export function compileEntry<T extends object = TemplateData>(
  entry: EntryTemplate,
  options: CompileOptions
): Template<T> {
  const settings = resolveSettings(options);
  const expanded = settings.includes
    ? expandIncludes(entry, { ...settings.expand, loader: options.loader ?? NO_LOADER })
    : withoutIncludes(entry, settings.expand.filter);

  return new Template<T>(assemble(expanded, settings, options));
}

/**
 * Compile an entry template, reading includes through an asynchronous loader.
 *
 * @param entry - Entry template
 * @param options - Compile settings
 * @returns Compiled template
 * @internal
 */
export async function compileEntryAsync<T extends object = TemplateData>(
  entry: EntryTemplate,
  options: AsyncCompileOptions
): Promise<Template<T>> {
  const settings = resolveSettings(options);
  const expanded = settings.includes
    ? await expandIncludesAsync(entry, { ...settings.expand, loader: options.loader ?? NO_LOADER })
    : withoutIncludes(entry, settings.expand.filter);

  return new Template<T>(assemble(expanded, settings, options));
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
export function render<T extends object = TemplateData>(
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
  defaultEscape: EscapeType;
  percentVars: boolean;
  includes: boolean;
  expand: Omit<ExpandOptions, 'loader'>;
}

/**
 * Apply defaults to the caller's options.
 *
 * @param options - Compile settings
 * @returns Settings with every default filled in
 * @throws Error when `defaultEscape` names no escape mode
 */
function resolveSettings(options: CompileOptions | AsyncCompileOptions): Settings {
  const includes = options.includes ?? true;
  const includeOptions: IncludeOptions = typeof includes === 'object' ? includes : {};
  const filters = options.filters ?? [];

  return {
    strict: options.strict ?? true,
    caseSensitive: options.caseSensitive ?? true,
    globalVars: options.globalVars ?? false,
    defaultEscape: resolveDefaultEscape(options.defaultEscape),
    percentVars: options.legacy?.percentVars ?? false,
    includes: includes !== false,
    expand: {
      maxDepth: includeOptions.maxDepth ?? 10,
      onMissing: includeOptions.onMissing ?? 'throw',
      filter: (text) => applyFilters(text, [...filters])
    }
  };
}

/**
 * Validate the default escape, accepting the spellings an ESCAPE attribute
 * accepts (so Perl's `HTML`, `URL` and `JS` work too).
 *
 * @param value - Caller's `defaultEscape`
 * @returns Escape mode, `html` when unset
 * @throws Error for anything that is not an escape mode, rather than letting
 *   it render unescaped
 */
function resolveDefaultEscape(value: unknown): EscapeType {
  if (value === undefined) return 'html';

  try {
    if (typeof value === 'string') return resolveEscapeType(value);
  } catch (error) {
    if (!(error instanceof TagSyntaxError)) throw error;
  }

  throw createError(`Invalid defaultEscape ${JSON.stringify(value)}; expected 'html', 'js', 'url' or 'none'`);
}

/**
 * Stands in for a loader that was never configured.
 *
 * There is no default: the core reaches templates only through a loader, which
 * is what keeps it free of any filesystem dependency. The failure is raised
 * lazily so a template without includes never needs one.
 */
const NO_LOADER: SyncTemplateLoader = {
  sync: true,

  resolve(request: ResolveRequest): string {
    throw createError(
      `TMPL_INCLUDE '${request.name}' needs a loader; pass one as the 'loader' option (nodeFileLoader reads from disk)`
    );
  },

  read(id: string): never {
    throw createError(`Cannot read '${id}' without a loader`);
  }
};

/**
 * Tokenize, parse and describe an expanded template.
 *
 * @param expanded - Fully expanded template and its provenance
 * @param settings - Resolved compile settings
 * @param options - Caller's options, for the filename
 * @returns Compiled form
 */
function assemble(
  { text, versions, map }: ExpandedSource,
  settings: Settings,
  options: CompileOptions | AsyncCompileOptions
): CompiledTemplate {
  const tokens = new Tokenizer(text, options.filename, settings.percentVars, settings.strict, map).tokenize();
  const nodes = new Parser(tokens, options.filename, !settings.includes).parse();
  const shape = buildShape(nodes, settings.caseSensitive);

  return {
    nodes,
    shape,
    lookupShape: settings.globalVars ? withGlobalVars(shape) : shape,
    caseSensitive: settings.caseSensitive,
    globalVars: settings.globalVars,
    defaultEscape: settings.defaultEscape,
    filename: options.filename,
    versions
  };
}
