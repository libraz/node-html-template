/**
 * Template executor
 * Walks the parsed template and produces its output
 *
 * @module runtime/Executor
 */

import type { ShapeNode } from '../parser/shape.js';
import type { CondNode, EscapeType, LoopDataItem, LoopNode, ParseNode, TextNode, VarNode } from '../types.js';
import { fastJoin, normalizeParamName } from '../utils/helpers.js';
import { escapeValue } from './Escape.js';
import type { RenderState } from './RenderState.js';

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

  /**
   * @param state - Values and scope position for this render
   * @param options - Render-time settings
   */
  constructor(state: RenderState, options: ExecutorOptions) {
    this.state = state;
    this.options = options;
  }

  /**
   * Render a list of nodes.
   *
   * @param nodes - Nodes to render
   * @returns Rendered text
   */
  execute(nodes: ParseNode[]): string {
    const parts: string[] = [];

    for (const node of nodes) {
      const output = this.executeNode(node);
      if (output) {
        parts.push(output);
      }
    }

    return fastJoin(parts);
  }

  /**
   * Render a single node.
   *
   * @param node - Node to render
   * @returns Rendered text
   */
  private executeNode(node: ParseNode): string {
    switch (node.type) {
      case 'TEXT':
        return Executor.executeTextNode(node);
      case 'VAR':
        return this.executeVarNode(node);
      case 'LOOP':
        return this.executeLoopNode(node);
      case 'COND':
        return this.executeCondNode(node);
      default:
        return '';
    }
  }

  /**
   * Render literal text.
   *
   * @param node - Text node
   * @returns The node's content
   */
  private static executeTextNode(node: TextNode): string {
    return node.content;
  }

  /**
   * Render a variable, applying its escape or its default.
   *
   * @param node - Variable node
   * @returns Rendered text
   */
  private executeVarNode(node: VarNode): string {
    const value = this.state.text(node.name);

    if (value === undefined) {
      // A DEFAULT is written straight to the output and never escaped.
      return node.default ?? '';
    }

    // An absent ESCAPE attribute leaves the field undefined, which is what lets
    // the default apply here without overriding an explicit ESCAPE=NONE.
    const escapeType = node.escape ?? this.options.defaultEscape;

    return escapeType === 'none' ? value : escapeValue(value, escapeType);
  }

  /**
   * Render a loop once per iteration.
   *
   * @param node - Loop node
   * @returns Concatenated output of every iteration
   */
  private executeLoopNode(node: LoopNode): string {
    const rows = this.state.rows(node.name);
    if (rows.length === 0) {
      return '';
    }

    const bodyShape = this.state.shape?.loops.get(this.normalize(node.name));
    const parts: string[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) continue;

      this.validateRow(row, bodyShape);

      this.state.enter(row, bodyShape, i, rows.length);
      parts.push(this.execute(node.body));
      this.state.leave();
    }

    return fastJoin(parts);
  }

  /**
   * Reject row keys the loop body never declares.
   *
   * A loop body is its own namespace, so a typo in a row is exactly as much a
   * mistake as one at the top level and is reported the same way.
   *
   * @param row - One iteration's parameters
   * @param bodyShape - Parameters the loop body declares
   */
  private validateRow(row: LoopDataItem, bodyShape: ShapeNode | undefined): void {
    if (!this.options.strictData || !bodyShape) return;

    for (const key of Object.keys(row)) {
      const name = this.normalize(key);
      if (bodyShape.decls.has(name)) continue;

      throw new Error(`Attempt to set parameter '${name}', which the loop body does not declare (strictData is on)`);
    }
  }

  /**
   * Render the branch a conditional selects.
   *
   * @param node - Conditional node
   * @returns Rendered text of the selected branch
   */
  private executeCondNode(node: CondNode): string {
    const isTrue = this.state.isTrue(node.name);
    const takeConsequent = node.condition === 'if' ? isTrue : !isTrue;

    if (takeConsequent) {
      return this.execute(node.consequent);
    }

    return node.alternate ? this.execute(node.alternate) : '';
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
