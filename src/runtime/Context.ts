/**
 * Runtime execution context
 * Manages parameter scopes and variable resolution
 *
 * Features:
 * - Nested scope support for loops
 * - Global variables (when the globalVars option is enabled)
 * - Loop context variables (__first__, __last__, etc.)
 * - Case-sensitive/insensitive parameter lookup
 * - A fallback hook for names the caller never set
 *
 * @module runtime/Context
 */

import type { LoopDataItem, ParamValue } from '../types.js';
import { isTruthy, normalizeParamName } from '../utils/helpers.js';
import { getFinalLoopData, getFinalValue } from '../utils/LazyValue.js';

/**
 * Settings a context needs to resolve names.
 *
 * Deliberately narrower than the full option set: name resolution depends on
 * these four things and nothing else.
 */
export interface ContextOptions {
  /** Whether parameter names keep their case */
  caseSensitive: boolean;

  /** Whether a name unresolved in a loop falls back to enclosing scopes */
  globalVars: boolean;

  /** Whether loop iterations get __first__ and friends */
  loopContextVars: boolean;

  /**
   * Consulted for a top-level name the caller never set.
   *
   * Never consulted inside a loop iteration: a name missing from a row is
   * missing, not something to go looking for elsewhere.
   */
  resolve?: (name: string) => ParamValue;
}

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
   * Name resolution settings
   */
  private options: ContextOptions;

  /**
   * Create execution context
   *
   * @param options - Name resolution settings
   */
  constructor(options: ContextOptions) {
    this.options = options;
    this.rootScope = { params: new Map() };
    this.currentScope = this.rootScope;
  }

  /**
   * Set parameter value
   *
   * @param name - Parameter name
   * @param value - Parameter value
   */
  setParam(name: string, value: ParamValue): void {
    const normalizedName = normalizeParamName(name, this.options.caseSensitive);
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
    const normalizedName = normalizeParamName(name, this.options.caseSensitive);

    // Search current scope
    if (this.currentScope.params.has(normalizedName)) {
      return this.currentScope.params.get(normalizedName);
    }

    // If global_vars enabled, search parent scopes
    if (this.options.globalVars) {
      let scope = this.currentScope.parent;
      while (scope) {
        if (scope.params.has(normalizedName)) {
          return scope.params.get(normalizedName);
        }
        scope = scope.parent;
      }
    }

    if (this.currentScope === this.rootScope) {
      return this.options.resolve?.(name);
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
    return this.resolveVarValue(name) ?? defaultValue ?? '';
  }

  /**
   * Resolve a variable to its string value.
   *
   * Returns `undefined` when the parameter is unset, which callers need in
   * order to distinguish "no value, use DEFAULT" from "value is empty string".
   *
   * @param name - Variable name
   * @returns String value, or undefined when the parameter is unset
   */
  resolveVarValue(name: string): string | undefined {
    const finalValue = getFinalValue(this.getParam(name));

    if (finalValue === undefined || finalValue === null) {
      return undefined;
    }

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
    const caseSensitive = this.options.caseSensitive;
    Object.entries(params).forEach(([key, value]) => {
      const normalizedKey = normalizeParamName(key, caseSensitive);
      newScope.params.set(normalizedKey, value);
    });

    // Add loop context variables if enabled
    if (this.options.loopContextVars) {
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
    const caseSensitive = this.options.caseSensitive;

    // Loop context variables are always spelled in lowercase in templates, but
    // they still go through name normalization so case_sensitive mode matches.
    const setVar = (name: string, value: ParamValue): void => {
      scope.params.set(normalizeParamName(name, caseSensitive), value);
    };

    // HTML::Template::LOOP::output assigns these per branch rather than from a
    // single boolean expression, which is why a false value is sometimes the
    // number 0 and sometimes the empty string. Templates that print a context
    // variable directly can observe the difference, so it is reproduced here.
    let first: number | string;
    let inner: number | string;
    let outer: number | string;
    let last: number | string;

    if (index === 0) {
      [first, inner, outer, last] = [1, 0, 1, length === 1 ? 1 : ''];
    } else if (index === length - 1) {
      [first, inner, outer, last] = [0, 0, 1, 1];
    } else {
      [first, inner, outer, last] = [0, 1, 0, 0];
    }

    const odd = index % 2 === 0;

    setVar('__first__', first);
    setVar('__inner__', inner);
    setVar('__outer__', outer);
    setVar('__last__', last);
    setVar('__odd__', odd ? 1 : '');
    setVar('__even__', odd ? '' : 1);
    setVar('__counter__', index + 1);
    setVar('__index__', index);
  }
}
