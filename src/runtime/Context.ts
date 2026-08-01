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
import { isTruthy, normalizeParamName } from '../utils/helpers.js';
import { getFinalLoopData, getFinalValue } from '../utils/LazyValue.js';

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
    if (this.currentScope.params.has(normalizedName)) {
      return this.currentScope.params.get(normalizedName);
    }

    // If global_vars enabled, search parent scopes
    if (this.options.global_vars) {
      let scope = this.currentScope.parent;
      while (scope) {
        if (scope.params.has(normalizedName)) {
          return scope.params.get(normalizedName);
        }
        scope = scope.parent;
      }
    }

    // Perl fills associated values into the top-level parameter map only, so
    // they must not resolve names that are missing from a loop iteration.
    if (this.currentScope === this.rootScope) {
      return this.lookupAssociate(name, normalizedName);
    }

    return undefined;
  }

  /**
   * Query associate objects for a parameter value.
   * Objects are searched in reverse order, so the last one registered wins.
   *
   * @param name - Parameter name as written by the caller
   * @param normalizedName - Name after case normalization
   * @returns Value from an associate object, or undefined
   */
  private lookupAssociate(name: string, normalizedName: string): ParamValue | undefined {
    for (let i = this.associates.length - 1; i >= 0; i -= 1) {
      const associate = this.associates[i];
      if (!associate) continue;

      let associateName = name;
      if (!this.options.case_sensitive) {
        const associateParamNames = associate.param();
        if (Array.isArray(associateParamNames)) {
          const matchedName = associateParamNames.find(
            (paramName): paramName is string =>
              typeof paramName === 'string' && paramName.toLowerCase() === normalizedName
          );
          if (matchedName) {
            associateName = matchedName;
          }
        }
      }

      const associateValue = associate.param(associateName);
      if (associateValue !== undefined && !Array.isArray(associateValue)) {
        return associateValue;
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
   * Add an associate object after construction.
   *
   * @param object - Object with a param() method
   */
  addAssociate(object: AssociateObject): void {
    this.associates.push(object);
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
