/**
 * Compiled template
 *
 * A template is immutable once compiled, and every render builds its own
 * state. That is what lets one compiled template serve concurrent renders, and
 * what keeps a render that throws from leaving anything behind for the next
 * one.
 *
 * @module api/Template
 */

import { declKind, type ShapeNode } from '../parser/shape.js';
import { Context } from '../runtime/Context.js';
import { Executor } from '../runtime/Executor.js';
import type { EscapeType, ParamValue, ParseNode } from '../types.js';
import { createError } from '../utils/helpers.js';
import { maybeCacheLazyLoop, maybeCacheLazyValue } from '../utils/LazyValue.js';
import { createShapeView } from './shape.js';
import type { OutputSink, RenderOptions, TemplateData, TemplateShape } from './types.js';

/**
 * Everything compilation produced, in the form rendering needs it.
 *
 * @internal
 */
export interface CompiledTemplate {
  /** Parse tree */
  nodes: ParseNode[];

  /**
   * Parameters the template declares, without global_vars hoisting, so it
   * always describes the real nesting.
   */
  shape: ShapeNode;

  /** Shape used for name resolution, with global_vars applied */
  lookupShape: ShapeNode;

  /** Whether parameter names are matched case-sensitively */
  caseSensitive: boolean;

  /** Whether names unresolved in a loop fall back to enclosing scopes */
  globalVars: boolean;

  /** Escape applied to variables carrying no ESCAPE attribute */
  defaultEscape: EscapeType;

  /** Name the template was loaded under, if any */
  filename?: string;

  /** Version of every template this one was built from */
  versions: Map<string, string | undefined>;
}

/**
 * A compiled template, ready to render against any number of data sets.
 *
 * Obtained from `compile()` rather than constructed directly, so an
 * environment can hand back a cached instance and so an asynchronous loader
 * can be awaited before the template exists.
 */
export class Template<T extends TemplateData = TemplateData> {
  /** Parameters the template declares */
  readonly shape: TemplateShape;

  /** Name the template was loaded under, if any */
  readonly filename: string | undefined;

  /** @internal */
  readonly compiled: CompiledTemplate;

  /**
   * @param compiled - Result of compilation
   * @internal
   */
  constructor(compiled: CompiledTemplate) {
    this.compiled = compiled;
    this.shape = createShapeView(compiled.shape, compiled.caseSensitive);
    this.filename = compiled.filename;
  }

  /**
   * Render the template.
   *
   * @param data - Values for the template's parameters
   * @param options - Settings for this render
   * @returns Rendered text
   */
  render(data: T, options: RenderOptions = {}): string {
    const context = this.prepare(data, options);
    const executor = new Executor(
      context,
      {
        dieOnBadParams: options.strictData ?? false,
        caseSensitive: this.compiled.caseSensitive,
        defaultEscape: this.compiled.defaultEscape
      },
      this.compiled.lookupShape
    );

    return executor.execute(this.compiled.nodes);
  }

  /**
   * Render the template into a sink.
   *
   * @param sink - Destination for the output
   * @param data - Values for the template's parameters
   * @param options - Settings for this render
   */
  renderTo(sink: OutputSink, data: T, options: RenderOptions = {}): void {
    sink.write(this.render(data, options));
  }

  /**
   * Build the runtime context for one render.
   *
   * @param data - Values for the template's parameters
   * @param options - Settings for this render
   * @returns Populated context
   */
  private prepare(data: T, options: RenderOptions): Context {
    if (options.strictData) {
      this.assertDeclared(data);
    }

    const resolve = options.resolve;
    const context = new Context({
      caseSensitive: this.compiled.caseSensitive,
      globalVars: this.compiled.globalVars,
      loopContextVars: options.loopContextVars ?? false,
      associates: resolve ? [{ param: (name?: string) => resolveOne(resolve, name) }] : []
    });

    const memoize = options.memoizeLazy ?? true;
    for (const [name, value] of Object.entries(data)) {
      context.setParam(name, this.toParamValue(name, value, memoize));
    }

    return context;
  }

  /**
   * Adapt a caller-supplied value to what the runtime stores.
   *
   * A callback returning rows and one returning a scalar are the same thing at
   * runtime, so which memoisation wrapper applies is decided from what the
   * template declares the name to be.
   *
   * @param name - Parameter name
   * @param value - Value from the data object
   * @param memoize - Whether a function value is called at most once per render
   * @returns Value in runtime form
   */
  private toParamValue(name: string, value: unknown, memoize: boolean): ParamValue {
    if (!memoize || typeof value !== 'function') {
      return value as ParamValue;
    }

    const key = this.compiled.caseSensitive ? name : name.toLowerCase();
    const decl = this.compiled.lookupShape.decls.get(key);
    const isLoop = decl ? declKind(decl) === 'LOOP' : false;

    return (
      isLoop ? maybeCacheLazyLoop(value as ParamValue, true) : maybeCacheLazyValue(value as ParamValue, true)
    ) as ParamValue;
  }

  /**
   * Reject data keys the template never declares.
   *
   * @param data - Values supplied by the caller
   * @throws Error naming the first undeclared key
   */
  private assertDeclared(data: T): void {
    for (const name of Object.keys(data)) {
      const key = this.compiled.caseSensitive ? name : name.toLowerCase();
      if (this.compiled.lookupShape.decls.has(key)) continue;

      throw createError(
        `Attempt to set parameter '${name}', which the template does not declare (strictData is on)`,
        this.compiled.filename
      );
    }
  }
}

/**
 * Adapt a resolve hook to the lookup interface the context expects.
 *
 * @param resolve - Caller's fallback hook
 * @param name - Name being resolved, absent when the context is enumerating
 * @returns Value from the hook, or an empty list when enumerating
 */
function resolveOne(resolve: (name: string) => unknown, name?: string): ParamValue | string[] {
  if (name === undefined) return [];

  return resolve(name) as ParamValue;
}
