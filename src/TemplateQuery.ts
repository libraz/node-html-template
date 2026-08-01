/**
 * Template introspection
 *
 * Backs `query()` and the no-argument form of `param()`. Every answer comes
 * from the shape tree, so the names `param()` will accept and the names
 * `query()` reports can never disagree.
 *
 * @module TemplateQuery
 */

import { createShapeNode, resolveShape, type ShapeNode, shapeKind, shapeNames } from './parser/shape.js';
import type { ParamType, QueryOptions, QueryResult } from './types.js';
import { createError } from './utils/helpers.js';

/**
 * Read-only view over a template's shape tree.
 */
export class TemplateQuery {
  private readonly root: ShapeNode;

  private readonly caseSensitive: boolean;

  /**
   * @param root - Root shape node
   * @param caseSensitive - Whether parameter names keep their case
   */
  constructor(root: ShapeNode, caseSensitive: boolean) {
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
    return sorted(this.root);
  }

  /**
   * Look up the type a name was declared with at the top level.
   *
   * @param name - Parameter name
   * @returns Declared type, or undefined when the name is not declared
   */
  topLevelType(name: string): ParamType | undefined {
    return shapeKind(this.root, this.normalize(name));
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

    const scope = resolveShape(this.root, path.slice(0, -1));
    return scope ? shapeKind(scope, target) : undefined;
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

    const parent = resolveShape(this.root, path.slice(0, -1));
    const type = parent ? shapeKind(parent, target) : undefined;

    if (type === undefined) return undefined;

    if (type !== 'LOOP') {
      throw createError(
        `HTML::Template::query() : Search path [${path.join(', ')}] doesn't end in a TMPL_LOOP - it is an error to use the 'loop' option on a non-loop parameter.`
      );
    }

    return sorted(parent?.loops.get(target) ?? createShapeNode());
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

/**
 * List a namespace's names the way Perl reports them.
 *
 * The shape tree preserves declaration order, but Perl hands back hash keys,
 * so both `param()` and `query({loop})` sort.
 *
 * @param shape - Namespace to list
 * @returns Sorted parameter names
 */
function sorted(shape: ShapeNode): string[] {
  return shapeNames(shape).sort();
}
