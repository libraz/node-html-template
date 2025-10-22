/**
 * Template executor
 * Executes ParseNode tree and generates output
 *
 * Features:
 * - Recursive node execution
 * - Variable substitution with escaping
 * - Loop iteration
 * - Conditional evaluation
 * - High-performance string building
 *
 * @module runtime/Executor
 */

import type {
  ParseNode, TextNode, VarNode, LoopNode, CondNode
} from '../types.js';
import { Context } from './Context.js';
import { escape } from './Escape.js';
import { fastJoin } from '../utils/helpers.js';

/**
 * Template executor
 * Executes ParseNode tree with given context
 */
export class Executor {
  /**
   * Execution context
   */
  private context: Context;

  /**
   * Create executor
   *
   * @param context - Execution context with parameters
   */
  constructor(context: Context) {
    this.context = context;
  }

  /**
   * Execute ParseNode tree and generate output
   * Main entry point for template execution
   *
   * @param nodes - ParseNode array (AST)
   * @returns Generated output string
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
   * Execute single ParseNode
   *
   * @param node - Node to execute
   * @returns Output string from this node
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

      case 'NOOP':
        // No-op nodes produce no output
        return '';

      default:
        // TypeScript exhaustiveness check ensures this never happens
        return '';
    }
  }

  /**
   * Execute TEXT node
   * Simply returns the text content
   *
   * @param node - Text node
   * @returns Text content
   */
  private static executeTextNode(node: TextNode): string {
    return node.content;
  }

  /**
   * Execute VAR node
   * Substitutes variable value with optional escaping
   *
   * @param node - Variable node
   * @returns Substituted and escaped value
   */
  private executeVarNode(node: VarNode): string {
    // Get value from context
    const value = this.context.getVarValue(node.name, node.default);

    // Apply escaping
    return escape(value, node.escape);
  }

  /**
   * Execute LOOP node
   * Iterates over loop data and executes body for each iteration
   *
   * @param node - Loop node
   * @returns Concatenated output from all iterations
   */
  private executeLoopNode(node: LoopNode): string {
    // Get loop data
    const loopData = this.context.getLoopData(node.name);

    // Empty loop produces no output
    if (loopData.length === 0) {
      return '';
    }

    const parts: string[] = [];

    // Execute body for each iteration
    for (let i = 0; i < loopData.length; i += 1) {
      const iterationData = loopData[i];
      if (!iterationData) continue;

      // Push scope with iteration data
      this.context.pushScope(iterationData, i, loopData.length);

      // Execute loop body
      const output = this.execute(node.body);
      parts.push(output);

      // Pop scope
      this.context.popScope();
    }

    return fastJoin(parts);
  }

  /**
   * Execute COND node (IF/UNLESS)
   * Evaluates condition and executes appropriate branch
   *
   * @param node - Conditional node
   * @returns Output from executed branch
   */
  private executeCondNode(node: CondNode): string {
    // Evaluate condition
    const conditionValue = this.context.isConditionTrue(node.name);

    // Determine which branch to execute
    // IF: execute consequent if condition is true
    // UNLESS: execute consequent if condition is false
    let shouldExecuteConsequent: boolean;
    if (node.condition === 'if') {
      shouldExecuteConsequent = conditionValue;
    } else {
      // 'unless'
      shouldExecuteConsequent = !conditionValue;
    }

    // Execute appropriate branch
    if (shouldExecuteConsequent) {
      return this.execute(node.consequent);
    }
    if (node.alternate) {
      return this.execute(node.alternate);
    }
    return '';
  }
}
