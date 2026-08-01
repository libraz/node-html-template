/**
 * Public API types
 *
 * @module api/types
 */

import type { SyncTemplateLoader, TemplateLoader } from '../loader/types.js';
import type { ParamUsage } from '../parser/shape.js';
import type { EscapeType, Filter, SourceLoc } from '../types.js';

/**
 * A value a template can substitute directly.
 */
export type Scalar = string | number | boolean | null | undefined;

/**
 * A scalar, or a callback producing one.
 *
 * A callback is invoked only if the template actually reaches the variable,
 * so an expensive value costs nothing on the paths that skip it.
 */
export type ScalarSource = Scalar | (() => Scalar);

/**
 * Rows for a loop, or a callback producing them.
 */
export type RowSource<T> = readonly T[] | (() => readonly T[]);

/**
 * Data supplied to a render.
 */
export type TemplateData = Record<string, unknown>;

/**
 * Anything that can receive rendered output.
 *
 * Structural on purpose: a `node:stream.Writable` satisfies it, and so does a
 * three-line adapter on a runtime that has no such thing.
 */
export interface OutputSink {
  write(chunk: string): unknown;
}

/**
 * How TMPL_INCLUDE tags are resolved.
 */
export interface IncludeOptions {
  /** Directories searched for included templates */
  paths?: readonly string[];

  /**
   * Search the configured paths for includes too, rather than resolving them
   * relative to the template that referenced them.
   */
  searchAllPaths?: boolean;

  /** Maximum nesting depth; zero or less means unlimited. Defaults to 10. */
  maxDepth?: number;

  /** What to do about an include naming a template that does not exist */
  onMissing?: 'throw' | 'ignore';
}

/**
 * Legacy syntax that is off unless a template needs it.
 */
export interface LegacyOptions {
  /** Substitute `%NAME%` as well as TMPL_VAR tags */
  percentVars?: boolean;
}

/**
 * Settings that shape the compiled template.
 *
 * Everything here affects what a template *is*; how a particular render
 * behaves belongs in {@link RenderOptions}.
 */
export interface CompileOptions {
  /**
   * Name reported in errors and used to resolve relative includes.
   * Set automatically when compiling through a loader.
   */
  filename?: string;

  /** Treat a malformed TMPL tag as an error rather than literal text */
  strict?: boolean;

  /**
   * Escape applied to variables whose tag carries no ESCAPE attribute.
   * Defaults to `html`; an explicit `ESCAPE=NONE` still opts a tag out.
   */
  defaultEscape?: EscapeType;

  /** Whether parameter names are matched case-sensitively. Defaults to true. */
  caseSensitive?: boolean;

  /** Let a name unresolved inside a loop fall back to enclosing scopes */
  globalVars?: boolean;

  /** Include handling; `false` rejects any TMPL_INCLUDE in the template */
  includes?: boolean | IncludeOptions;

  /** Transformations applied to the source text before parsing */
  filters?: readonly Filter[];

  /** Opt-in support for older template syntax */
  legacy?: LegacyOptions;

  /** Where included templates are read from. Defaults to the filesystem. */
  loader?: SyncTemplateLoader;
}

/**
 * Compile settings for the asynchronous entry point.
 */
export interface AsyncCompileOptions extends Omit<CompileOptions, 'loader'> {
  loader?: TemplateLoader;
}

/**
 * Settings that affect one render.
 */
export interface RenderOptions {
  /**
   * Reject data keys the template never declares.
   *
   * Off by default: passing a wider object than the template uses is ordinary,
   * and generated types catch genuine typos before the code runs.
   */
  strictData?: boolean;

  /** Provide `__first__`, `__last__`, `__index__` and `__counter__` in loops */
  loopContextVars?: boolean;

  /**
   * Call a function value at most once per render rather than on every
   * reference. Defaults to true.
   */
  memoizeLazy?: boolean;

  /**
   * Fallback for top-level names absent from the data.
   *
   * Consulted only at the top level, never inside a loop iteration.
   */
  resolve?: (name: string) => unknown;
}

/**
 * What a template declares about one parameter name.
 */
export interface ParamInfo {
  /** Name as first written in the template */
  readonly name: string;

  /** Normalized lookup key */
  readonly key: string;

  /** Whether the name is a loop or a plain variable */
  readonly kind: 'var' | 'loop';

  /** Every form the name is used in */
  readonly usages: ReadonlySet<ParamUsage>;

  /** Whether any tag for this name carried a DEFAULT attribute */
  readonly hasDefault: boolean;

  /** ESCAPE values seen on this name */
  readonly escapes: ReadonlySet<EscapeType>;

  /** Where the name first appears */
  readonly loc?: SourceLoc;
}

/**
 * Read-only view of the parameters a template declares.
 */
export interface TemplateShape {
  /** Names declared at this level, in the order the template declares them */
  readonly names: readonly string[];

  /**
   * Look up one name.
   *
   * @param name - Parameter name
   * @returns Declaration, or undefined when the template never names it
   */
  get(name: string): ParamInfo | undefined;

  /**
   * Report whether a name is declared.
   *
   * @param name - Parameter name
   * @returns True when declared
   */
  has(name: string): boolean;

  /**
   * Report what kind of parameter a name is.
   *
   * @param name - Parameter name
   * @returns Kind, or undefined when the name is not declared
   */
  kind(name: string): 'var' | 'loop' | undefined;

  /**
   * Descend into a loop's own parameters.
   *
   * @param name - Loop name
   * @returns Shape of the loop body, or undefined when the name is not a loop
   */
  loop(name: string): TemplateShape | undefined;

  /**
   * Follow a path of loop names.
   *
   * @param path - Loop names, outermost first
   * @returns Shape at that path, or undefined when it does not exist
   */
  at(path: readonly string[]): TemplateShape | undefined;
}
