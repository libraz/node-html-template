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

import type { ShapeNode } from '../parser/shape.js';
import { renderChunks } from '../runtime/chunks.js';
import { Executor, type ExecutorOptions, StringSink } from '../runtime/Executor.js';
import { RenderState } from '../runtime/RenderState.js';
import type { EscapeType, ParamValue, ParseNode } from '../types.js';
import { createError } from '../utils/helpers.js';
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
export class Template<T extends object = TemplateData> {
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
    const sink = new StringSink();
    this.renderTo(sink, data, options);

    return sink.toString();
  }

  /**
   * Render the template into a sink.
   *
   * Output reaches the sink as it is produced, so nothing has to be held in
   * memory that the destination has already accepted.
   *
   * @param sink - Destination for the output
   * @param data - Values for the template's parameters
   * @param options - Settings for this render
   */
  renderTo(sink: OutputSink, data: T, options: RenderOptions = {}): void {
    const executor = new Executor(this.prepare(data, options), this.executorOptions(options), sink);

    executor.execute(this.compiled.nodes);
  }

  /**
   * Render the template one chunk at a time.
   *
   * Nothing is computed until a chunk is asked for, so a consumer that stops
   * early stops the work with it.
   *
   * @param data - Values for the template's parameters
   * @param options - Settings for this render
   * @returns Iterator over the pieces of the output, in order
   */
  renderChunks(data: T, options: RenderOptions = {}): Generator<string> {
    return renderChunks(this.compiled.nodes, this.prepare(data, options), this.executorOptions(options));
  }

  /**
   * Collect the render-time settings the walk needs.
   *
   * @param options - Settings for this render
   * @returns Executor settings
   */
  private executorOptions(options: RenderOptions): ExecutorOptions {
    return {
      strictData: options.strictData ?? false,
      caseSensitive: this.compiled.caseSensitive,
      defaultEscape: this.compiled.defaultEscape
    };
  }

  /**
   * Build the state for one render.
   *
   * @param data - Values for the template's parameters
   * @param options - Settings for this render
   * @returns Populated state
   */
  private prepare(data: T, options: RenderOptions): RenderState {
    if (options.strictData) {
      this.assertDeclared(data);
    }

    const resolve = options.resolve;
    const state = new RenderState(
      {
        caseSensitive: this.compiled.caseSensitive,
        globalVars: this.compiled.globalVars,
        loopContextVars: options.loopContextVars ?? false,
        memoizeLazy: options.memoizeLazy ?? true,
        resolve: resolve ? (name) => resolve(name) as ParamValue : undefined
      },
      this.compiled.lookupShape
    );

    for (const [name, value] of Object.entries(data)) {
      state.set(name, value as ParamValue);
    }

    return state;
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
