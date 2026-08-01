/**
 * Template introspection
 *
 * Backs `query()` and the no-argument form of `param()`. Every answer comes
 * from the parameter scope tree, so the names `param()` will accept and the
 * names `query()` reports can never disagree.
 *
 * @module TemplateQuery
 */

import { type ParamScope, resolveScope, scopeNames } from './parser/ParamScope.js';
import type { ParamType, QueryOptions, QueryResult } from './types.js';
import { createError } from './utils/helpers.js';

/**
 * Read-only view over a template's parameter scope tree.
 */
export class TemplateQuery {
  private readonly root: ParamScope;

  private readonly caseSensitive: boolean;

  /**
   * @param root - Root parameter scope
   * @param caseSensitive - Whether parameter names keep their case
   */
  constructor(root: ParamScope, caseSensitive: boolean) {
    this.root = root;
    this.caseSensitive = caseSensitive;
  }

  /**
   * List the names declared at the top level of the template.
   *
   * Perl's `param()` returns the keys of the top-level param_map, which
   * includes names used inside conditionals but not names that only exist
   * inside a loop body.
   *
   * @returns Sorted parameter names
   */
  topLevelNames(): string[] {
    return scopeNames(this.root);
  }

  /**
   * Look up the type a name was declared with at the top level.
   *
   * @param name - Parameter name
   * @returns Declared type, or undefined when the name is not declared
   */
  topLevelType(name: string): ParamType | undefined {
    return this.root.types.get(this.normalize(name));
  }

  /**
   * Answer a `query()` call.
   *
   * @param options - Query options; omitted means "list top-level names"
   * @returns Names, a parameter type, or undefined
   */
  query(options?: QueryOptions): QueryResult | string[] | undefined {
    if (!options) {
      return this.topLevelNames();
    }

    if (options.name !== undefined) {
      return this.queryType(options.name);
    }

    if (options.loop !== undefined) {
      return this.queryLoop(options.loop);
    }

    return undefined;
  }

  /**
   * Resolve the type of the parameter at a path.
   *
   * The lookup is exact: Perl walks the named loops and then reads the final
   * name out of that scope, without searching nested scopes.
   *
   * @param name - Parameter name, or a path of loop names ending in a name
   * @returns Declared type, or undefined when the path does not exist
   */
  private queryType(name: string | string[]): QueryResult {
    const path = this.normalizePath(name);
    const target = path[path.length - 1];
    if (target === undefined) return undefined;

    const scope = resolveScope(this.root, path.slice(0, -1));
    return scope?.types.get(target);
  }

  /**
   * List the names declared inside a loop.
   *
   * An unknown path yields undefined, while a path that resolves to a
   * non-loop parameter is an error — the same split Perl's query() makes.
   *
   * @param loop - Loop name, or a path of loop names
   * @returns Sorted parameter names declared in that loop's body
   * @throws Error when the path resolves to a parameter that is not a loop
   */
  private queryLoop(loop: string | string[]): string[] | undefined {
    const path = this.normalizePath(loop);
    const target = path[path.length - 1];
    if (target === undefined) return undefined;

    const parent = resolveScope(this.root, path.slice(0, -1));
    const type = parent?.types.get(target);

    if (type === undefined) return undefined;

    if (type !== 'LOOP') {
      throw createError(
        `HTML::Template::query() : Search path [${path.join(', ')}] doesn't end in a TMPL_LOOP - it is an error to use the 'loop' option on a non-loop parameter.`
      );
    }

    return scopeNames(parent?.loops.get(target) ?? { types: new Map(), loops: new Map() });
  }

  /**
   * Normalize a query path to an array of normalized names.
   *
   * @param path - Name or path
   * @returns Normalized path
   */
  private normalizePath(path: string | string[]): string[] {
    return (Array.isArray(path) ? path : [path]).map((segment) => this.normalize(segment));
  }

  /**
   * Normalize one parameter name.
   *
   * @param name - Raw name
   * @returns Normalized name
   */
  private normalize(name: string): string {
    return this.caseSensitive ? name : name.toLowerCase();
  }
}
