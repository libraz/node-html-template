/**
 * Template executor
 * Walks the parsed template and produces its output
 *
 * @module runtime/Executor
 */

import type { ShapeNode } from '../parser/shape.js';
import type { CondNode, EscapeType, LoopDataItem, LoopNode, ParseNode, TextNode, VarNode } from '../types.js';
import { fastJoin, normalizeParamName } from '../utils/helpers.js';
import type { Context } from './Context.js';
import { escapeValue } from './Escape.js';

/**
 * Settings the executor needs at render time.
 */
export interface ExecutorOptions {
  /** Reject loop iteration keys the loop body never declares */
  dieOnBadParams: boolean;

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
 * Renders a parsed template against a runtime context.
 */
export class Executor {
  private readonly context: Context;

  private readonly options: ExecutorOptions;

  /** Parameter scope matching the block currently being rendered */
  private scope: ShapeNode | undefined;

  /**
   * @param context - Runtime context holding parameter values
   * @param options - Render-time settings
   * @param scope - Parameter scope of the template's top level
   */
  constructor(context: Context, options: ExecutorOptions, scope?: ShapeNode) {
    this.context = context;
    this.options = options;
    this.scope = scope;
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
    const value = this.context.resolveVarValue(node.name);

    if (value === undefined) {
      // HTML::Template::DEF writes the default straight to the output and
      // skips the escape op, so a DEFAULT is never escaped.
      return node.default ?? '';
    }

    // An absent ESCAPE attribute leaves `escape` undefined, which is what lets
    // the default apply here without overriding an explicit ESCAPE=NONE.
    const escape = node.escape ?? this.options.defaultEscape;

    return escape === 'none' ? value : escapeValue(value, escape);
  }

  /**
   * Render a loop once per iteration.
   *
   * @param node - Loop node
   * @returns Concatenated output of every iteration
   */
  private executeLoopNode(node: LoopNode): string {
    const loopData = this.context.getLoopData(node.name);
    if (loopData.length === 0) {
      return '';
    }

    const outerScope = this.scope;
    const loopScope = outerScope?.loops.get(this.normalize(node.name));
    const parts: string[] = [];

    this.scope = loopScope;

    try {
      for (let i = 0; i < loopData.length; i += 1) {
        const iterationData = loopData[i];
        if (!iterationData) continue;

        this.validateIteration(iterationData, loopScope);

        this.context.pushScope(iterationData, i, loopData.length);
        parts.push(this.execute(node.body));
        this.context.popScope();
      }
    } finally {
      this.scope = outerScope;
    }

    return fastJoin(parts);
  }

  /**
   * Reject iteration keys the loop body never declares.
   *
   * Perl passes each iteration hash to the loop's own sub-template, so
   * `die_on_bad_params` catches typos in loop data exactly as it does for
   * top-level parameters.
   *
   * @param iterationData - One iteration's parameters
   * @param loopScope - Parameter scope of the loop body
   */
  private validateIteration(iterationData: LoopDataItem, loopScope: ShapeNode | undefined): void {
    if (!this.options.dieOnBadParams || !loopScope) return;

    for (const key of Object.keys(iterationData)) {
      const name = this.normalize(key);
      if (loopScope.decls.has(name)) continue;

      throw new Error(
        `HTML::Template->output() : fatal error in loop output : HTML::Template : Attempt to set nonexistent parameter '${name}' - this parameter name doesn't match any declarations in the template file : (die_on_bad_params => 1)`
      );
    }
  }

  /**
   * Render the branch a conditional selects.
   *
   * @param node - Conditional node
   * @returns Rendered text of the selected branch
   */
  private executeCondNode(node: CondNode): string {
    const isTrue = this.context.isConditionTrue(node.name);
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
