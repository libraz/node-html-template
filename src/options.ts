/**
 * Constructor option handling
 *
 * Holds the defaults, the process-wide overrides installed by
 * `HTMLTemplate.config()`, the validation rules, and the normalization that
 * turns a user-supplied option bag into a fully populated one.
 *
 * @module options
 */

import type { AssociateObject, EscapeType, HTMLTemplateOptions } from './types.js';
import { createError } from './utils/helpers.js';

/** Option defaults, matching Perl HTML::Template's %OPTIONS */
const DEFAULT_OPTIONS: HTMLTemplateOptions = {
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

/** Option keys whose values accumulate rather than replace in config() */
const ACCUMULATING_KEYS = ['associate', 'filter', 'path'] as const;

const VALID_SOURCE_TYPES = ['filename', 'scalarref', 'arrayref', 'filehandle'];
const VALID_ESCAPES = ['none', 'html', 'url', 'js'];

let globalOptions: HTMLTemplateOptions = { ...DEFAULT_OPTIONS };

/**
 * Read the current process-wide options.
 *
 * @returns Copy of the global options
 */
export function getGlobalOptions(): HTMLTemplateOptions {
  return { ...globalOptions };
}

/**
 * Merge overrides into the process-wide options.
 *
 * List-valued options append rather than replace, matching Perl's `config()`.
 *
 * @param options - Overrides to install
 * @returns Copy of the resulting global options
 */
export function setGlobalOptions(options: HTMLTemplateOptions): HTMLTemplateOptions {
  const merged: HTMLTemplateOptions = { ...globalOptions, ...options };

  for (const key of ACCUMULATING_KEYS) {
    if (options[key] === undefined) {
      merged[key] = globalOptions[key] as never;
      continue;
    }
    merged[key] = [...asArray<unknown>(globalOptions[key]), ...asArray<unknown>(options[key])] as never;
  }

  globalOptions = merged;
  return { ...globalOptions };
}

/**
 * Reset the process-wide options to their defaults.
 * Intended for tests that would otherwise leak configuration between cases.
 */
export function resetGlobalOptions(): void {
  globalOptions = { ...DEFAULT_OPTIONS };
}

/**
 * Wrap a scalar in an array, treating undefined as empty.
 *
 * @param value - Value, array of values, or undefined
 * @returns Array of values
 */
export function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Merge user options over the global options, validate them, and fill in
 * every default so the rest of the code never has to handle undefined.
 *
 * @param options - User-supplied options
 * @returns Fully populated options
 * @throws Error when the combination of options is invalid
 */
export function normalizeOptions(options: HTMLTemplateOptions): Required<HTMLTemplateOptions> {
  const merged = { ...globalOptions, ...options };
  validateOptions(merged);

  return {
    // Source
    filename: merged.filename,
    scalarref: merged.scalarref,
    arrayref: merged.arrayref,
    filehandle: merged.filehandle,
    type: merged.type,
    source: merged.source,

    // Error detection. vanguard_compatibility_mode implies die_on_bad_params: false.
    die_on_bad_params: merged.vanguard_compatibility_mode ? false : (merged.die_on_bad_params ?? true),
    strict: merged.strict ?? true,
    force_untaint: merged.force_untaint ?? 0,
    vanguard_compatibility_mode: merged.vanguard_compatibility_mode ?? false,

    // Caching. Every specific cache mode implies the generic one.
    cache: merged.cache || merged.blind_cache || merged.file_cache || merged.double_file_cache || false,
    blind_cache: merged.blind_cache ?? false,
    file_cache: merged.file_cache || merged.double_file_cache || false,
    file_cache_dir: merged.file_cache_dir,
    file_cache_dir_mode: merged.file_cache_dir_mode ?? 0o700,
    double_file_cache: merged.double_file_cache ?? false,
    double_cache: merged.double_cache ?? false,
    shared_cache: merged.shared_cache ?? false,
    shared_cache_debug: merged.shared_cache_debug ?? false,
    memory_debug: merged.memory_debug ?? false,
    cache_lazy_vars: merged.cache_lazy_vars ?? false,
    cache_lazy_loops: merged.cache_lazy_loops ?? false,

    // File system
    path: asArray(merged.path),
    search_path_on_include: merged.search_path_on_include ?? false,
    utf8: merged.utf8 ?? false,
    open_mode: merged.utf8 ? 'utf-8' : merged.open_mode,

    // Debugging
    debug: merged.debug ?? false,
    stack_debug: merged.stack_debug ?? false,
    cache_debug: merged.cache_debug ?? false,

    // Behavior
    associate: asArray(merged.associate),
    case_sensitive: merged.case_sensitive ?? false,
    loop_context_vars: merged.loop_context_vars ?? false,
    global_vars: merged.global_vars ?? false,
    no_includes: merged.no_includes ?? false,
    max_includes: merged.max_includes ?? 10,
    die_on_missing_include: merged.die_on_missing_include ?? true,
    filter: asArray(merged.filter),
    default_escape: (merged.default_escape ?? 'none').toLowerCase() as EscapeType
  } as Required<HTMLTemplateOptions>;
}

/**
 * Reject option combinations that Perl HTML::Template refuses.
 *
 * @param options - Merged options
 * @throws Error describing the first problem found
 */
function validateOptions(options: HTMLTemplateOptions): void {
  validateSource(options);
  validateCaching(options);
  validateEncoding(options);
  validateEscaping(options);
  validateAssociates(options.associate);
}

/**
 * Check that exactly one template source is given and that `type`/`source`
 * are used together.
 *
 * @param options - Merged options
 */
function validateSource(options: HTMLTemplateOptions): void {
  if (options.type !== undefined) {
    if (options.source === undefined) {
      throw createError("HTML::Template->new called with 'type' parameter set, but no 'source'!");
    }
    if (!VALID_SOURCE_TYPES.includes(options.type)) {
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
}

/**
 * Check cache options against the template source.
 *
 * @param options - Merged options
 */
function validateCaching(options: HTMLTemplateOptions): void {
  const hasNonFileSource =
    options.filehandle !== undefined || options.arrayref !== undefined || options.scalarref !== undefined;

  const cachingRequested =
    options.cache ||
    options.blind_cache ||
    options.file_cache ||
    options.shared_cache ||
    options.double_cache ||
    options.double_file_cache;

  if (hasNonFileSource && cachingRequested) {
    throw createError('Cannot have caching when template source is not file');
  }

  if ((options.file_cache || options.double_file_cache) && !options.file_cache_dir) {
    throw createError('You must specify the file_cache_dir option if you want to use file_cache.');
  }
}

/**
 * Check that only one encoding mechanism is selected.
 *
 * @param options - Merged options
 */
function validateEncoding(options: HTMLTemplateOptions): void {
  if (options.utf8 && options.open_mode) {
    throw createError('HTML::Template->new(): utf8 and open_mode cannot be used at the same time');
  }
}

/**
 * Check the default_escape value.
 *
 * @param options - Merged options
 */
function validateEscaping(options: HTMLTemplateOptions): void {
  if (options.default_escape && !VALID_ESCAPES.includes(options.default_escape.toLowerCase())) {
    throw createError(
      `HTML::Template->new(): Invalid setting for default_escape - '${options.default_escape}'. Valid values are 'none', 'html', 'url', or 'js'.`
    );
  }
}

/**
 * Check that every associate object exposes a param() method.
 *
 * @param associate - `associate` option value
 */
function validateAssociates(associate: HTMLTemplateOptions['associate']): void {
  for (const entry of asArray<AssociateObject>(associate)) {
    if (!entry || typeof entry.param !== 'function') {
      throw createError(
        'HTML::Template->new called with associate option, containing object which lacks a param() method!'
      );
    }
  }
}
