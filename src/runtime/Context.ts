/**
 * Runtime execution context
 * Manages parameter scopes and variable resolution
 *
 * Features:
 * - Nested scope support for loops
 * - Global variables (when global_vars option enabled)
 * - Loop context variables (__first__, __last__, etc.)
 * - Case-sensitive/insensitive parameter lookup
 * - Associate object support (CGI.pm compatibility)
 *
 * @module runtime/Context
 */

import type { AssociateObject, HTMLTemplateOptions, LoopDataItem, ParamValue } from '../types.js';
import { getFinalLoopData, getFinalValue } from '../utils/LazyValue.js';
import { isTruthy, normalizeParamName } from '../utils/helpers.js';

/**
 * Parameter scope
 * Represents one level of variable scope (template root or loop iteration)
 */
interface Scope {
  /**
   * Parameters in this scope
   * Map of normalized name -> value
   */
  params: Map<string, ParamValue>;

  /**
   * Parent scope (for nested loops and global_vars)
   */
  parent?: Scope;
}

/**
 * Runtime execution context
 * Manages parameter values and scoping
 */
export class Context {
  /**
   * Root scope (top-level template parameters)
   */
  private rootScope: Scope;

  /**
   * Current scope (changes during loop iteration)
   */
  private currentScope: Scope;

  /**
   * Template options
   */
  private options: HTMLTemplateOptions;

  /**
   * Associate objects for parameter lookup
   */
  private associates: AssociateObject[];

  /**
   * Create execution context
   *
   * @param options - Template options
   */
  constructor(options: HTMLTemplateOptions) {
    this.options = options;
    this.rootScope = { params: new Map() };
    this.currentScope = this.rootScope;

    // Initialize associate objects
    if (options.associate) {
      this.associates = Array.isArray(options.associate) ? options.associate : [options.associate];
    } else {
      this.associates = [];
    }
  }

  /**
   * Set parameter value
   *
   * @param name - Parameter name
   * @param value - Parameter value
   */
  setParam(name: string, value: ParamValue): void {
    const normalizedName = normalizeParamName(name, this.options.case_sensitive ?? false);
    this.rootScope.params.set(normalizedName, value);
  }

  /**
   * Get parameter value from current scope
   * Implements scope resolution with global_vars support
   *
   * @param name - Parameter name
   * @returns Parameter value or undefined if not found
   */
  getParam(name: string): ParamValue | undefined {
    const normalizedName = normalizeParamName(name, this.options.case_sensitive ?? false);

    // Search current scope
    const value = this.currentScope.params.get(normalizedName);
    if (value !== undefined) {
      return value;
    }

    // If global_vars enabled, search parent scopes
    if (this.options.global_vars) {
      let scope = this.currentScope.parent;
      while (scope) {
        const parentValue = scope.params.get(normalizedName);
        if (parentValue !== undefined) {
          return parentValue;
        }
        scope = scope.parent;
      }
    }

    // Search associate objects (in reverse order - last has priority)
    for (let i = this.associates.length - 1; i >= 0; i -= 1) {
      const associate = this.associates[i];
      if (associate) {
        const associateValue = associate.param(name);
        if (associateValue !== undefined) {
          return associateValue;
        }
      }
    }

    return undefined;
  }

  /**
   * Check if parameter exists in current scope
   *
   * @param name - Parameter name
   * @returns True if parameter exists
   */
  hasParam(name: string): boolean {
    return this.getParam(name) !== undefined;
  }

  /**
   * Get variable value as string
   * Handles lazy evaluation and default values
   *
   * @param name - Variable name
   * @param defaultValue - Default value if variable not found
   * @returns String value
   */
  getVarValue(name: string, defaultValue?: string): string {
    const value = this.getParam(name);

    // Evaluate lazy value
    const finalValue = getFinalValue(value);

    // Use default if value is undefined/null
    if (finalValue === undefined || finalValue === null) {
      return defaultValue ?? '';
    }

    // Convert to string
    return String(finalValue);
  }

  /**
   * Get loop data array
   * Handles lazy evaluation
   *
   * @param name - Loop parameter name
   * @returns Loop data array (empty if not found)
   */
  getLoopData(name: string): LoopDataItem[] {
    const value = this.getParam(name);
    return getFinalLoopData(value);
  }

  /**
   * Check if condition is truthy
   * Used for TMPL_IF and TMPL_UNLESS
   *
   * @param name - Condition parameter name
   * @returns True if condition is truthy
   */
  isConditionTrue(name: string): boolean {
    const value = this.getParam(name);

    // For conditionals, we need to handle arrays specially
    // Arrays should be evaluated as truthy/falsy directly (non-empty = true)
    if (Array.isArray(value)) {
      return isTruthy(value);
    }

    const finalValue = getFinalValue(value);
    return isTruthy(finalValue);
  }

  /**
   * Push new scope for loop iteration
   * Creates child scope with loop iteration data
   *
   * @param params - Loop iteration parameters
   * @param loopIndex - Loop iteration index (0-based)
   * @param loopLength - Total number of loop iterations
   */
  pushScope(params: LoopDataItem, loopIndex: number, loopLength: number): void {
    const newScope: Scope = {
      params: new Map(),
      parent: this.currentScope
    };

    // Add loop iteration parameters
    const caseSensitive = this.options.case_sensitive ?? false;
    Object.entries(params).forEach(([key, value]) => {
      const normalizedKey = normalizeParamName(key, caseSensitive);
      newScope.params.set(normalizedKey, value);
    });

    // Add loop context variables if enabled
    if (this.options.loop_context_vars) {
      this.addLoopContextVars(newScope, loopIndex, loopLength);
    }

    this.currentScope = newScope;
  }

  /**
   * Pop current scope (return to parent)
   */
  popScope(): void {
    if (this.currentScope.parent) {
      this.currentScope = this.currentScope.parent;
    } else {
      // Back to root scope
      this.currentScope = this.rootScope;
    }
  }

  /**
   * Add loop context variables to scope
   * Adds __first__, __last__, __inner__, __outer__, __odd__, __even__, __counter__, __index__
   *
   * @param scope - Scope to add variables to
   * @param index - Loop iteration index (0-based)
   * @param length - Total loop length
   */
  private addLoopContextVars(scope: Scope, index: number, length: number): void {
    const caseSensitive = this.options.case_sensitive ?? false;

    // Note: In case_sensitive mode, loop context vars should be lowercase only
    // In case_insensitive mode, they work with any case but are stored normalized
    const setVar = (name: string, value: ParamValue): void => {
      const normalizedName = normalizeParamName(name, caseSensitive);
      scope.params.set(normalizedName, value);
    };

    const isFirst = index === 0;
    const isLast = index === length - 1;
    const counter = index + 1; // 1-based

    // Use Perl-compatible values: 1 for true, '' for false
    const perlBool = (v: boolean): number | string => (v ? 1 : '');

    setVar('__first__', perlBool(isFirst));
    setVar('__last__', perlBool(isLast));
    setVar('__inner__', perlBool(!isFirst && !isLast));
    setVar('__outer__', perlBool(isFirst || isLast));
    setVar('__odd__', perlBool(counter % 2 === 1));
    setVar('__even__', perlBool(counter % 2 === 0));
    setVar('__counter__', counter);
    setVar('__index__', index);
  }

  /**
   * Get all parameters in root scope
   * Used for query() method
   *
   * @returns Array of parameter names
   */
  getRootParams(): string[] {
    return Array.from(this.rootScope.params.keys());
  }

  /**
   * Clear all parameters
   * Resets context to initial state
   */
  clear(): void {
    this.rootScope.params.clear();
    this.currentScope = this.rootScope;
  }
}
