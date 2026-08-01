/**
 * Template executor
 * Walks the parsed template and writes its output
 *
 * Output goes to a sink rather than coming back as a string, so nothing
 * accumulates per node, per loop iteration or per conditional branch on the
 * way out. Collecting the whole result is then just one sink among others.
 *
 * @module runtime/Executor
 */

import type { CondNode, EscapeType, LoopNode, ParseNode, VarNode } from '../types.js';
import { normalizeParamName } from '../utils/helpers.js';
import type { RenderState } from './RenderState.js';
import { renderVar, validateRow } from './renderNode.js';

/**
 * Anything that can receive rendered output.
 *
 * Structural on purpose: a `node:stream.Writable` satisfies it, and so does a
 * three-line adapter on a runtime that has no such thing.
 */
export interface Sink {
  write(chunk: string): unknown;
}

/**
 * Settings the executor needs at render time.
 */
export interface ExecutorOptions {
  /** Reject loop iteration keys the loop body never declares */
  strictData: boolean;

  /** Whether parameter names keep their case */
  caseSensitive: boolean;

  /**
   * Escape applied to variables whose tag carried no ESCAPE attribute.
   *
   * Resolved here rather than burned into the parse tree, so one compiled
   * template can serve callers with different escaping policies and the tree
   * stays free of render-time decisions.
   */
  defaultEscape: EscapeType;
}

/**
 * Renders a parsed template against a render state.
 *
 * The executor holds no scope of its own: the state carries both the parameter
 * values and the position in the shape tree, and the two advance together.
 */
export class Executor {
  private readonly state: RenderState;

  private readonly options: ExecutorOptions;

  private readonly sink: Sink;

  /**
   * @param state - Values and scope position for this render
   * @param options - Render-time settings
   * @param sink - Destination for the output
   */
  constructor(state: RenderState, options: ExecutorOptions, sink: Sink) {
    this.state = state;
    this.options = options;
    this.sink = sink;
  }

  /**
   * Render a list of nodes.
   *
   * @param nodes - Nodes to render
   */
  execute(nodes: ParseNode[]): void {
    for (const node of nodes) {
      this.executeNode(node);
    }
  }

  /**
   * Render a single node.
   *
   * @param node - Node to render
   */
  private executeNode(node: ParseNode): void {
    switch (node.type) {
      case 'TEXT':
        this.sink.write(node.content);
        break;
      case 'VAR':
        this.executeVarNode(node);
        break;
      case 'LOOP':
        this.executeLoopNode(node);
        break;
      case 'COND':
        this.executeCondNode(node);
        break;
      default:
        break;
    }
  }

  /**
   * Render a variable, applying its escape or its default.
   *
   * @param node - Variable node
   */
  private executeVarNode(node: VarNode): void {
    const text = renderVar(node, this.state, this.options.defaultEscape);

    if (text) this.sink.write(text);
  }

  /**
   * Render a loop once per iteration.
   *
   * @param node - Loop node
   */
  private executeLoopNode(node: LoopNode): void {
    const rows = this.state.rows(node.name);
    if (rows.length === 0) return;

    const bodyShape = this.state.shape?.loops.get(this.normalize(node.name));

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) continue;

      if (this.options.strictData) {
        validateRow(row, bodyShape, this.options.caseSensitive);
      }

      this.state.enter(row, bodyShape, i, rows.length);
      this.execute(node.body);
      this.state.leave();
    }
  }

  /**
   * Render the branch a conditional selects.
   *
   * @param node - Conditional node
   */
  private executeCondNode(node: CondNode): void {
    const isTrue = this.state.isTrue(node.name);
    const takeConsequent = node.condition === 'if' ? isTrue : !isTrue;

    if (takeConsequent) {
      this.execute(node.consequent);
    } else if (node.alternate) {
      this.execute(node.alternate);
    }
  }

  /**
   * Normalize a parameter name for scope lookup.
   *
   * @param name - Raw name
   * @returns Normalized name
   */
  private normalize(name: string): string {
    return normalizeParamName(name, this.options.caseSensitive);
  }
}

/**
 * A sink that keeps everything written to it.
 */
export class StringSink implements Sink {
  private text = '';

  /**
   * Append a chunk.
   *
   * @param chunk - Text to append
   */
  write(chunk: string): void {
    this.text += chunk;
  }

  /**
   * Everything written so far.
   *
   * @returns Accumulated text
   */
  toString(): string {
    return this.text;
  }
}
