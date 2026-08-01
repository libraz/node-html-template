/**
 * Parameter scope tree
 *
 * Mirrors Perl HTML::Template's stack of `param_map` hashes: every TMPL_LOOP
 * opens a fresh namespace, while conditionals share the namespace they appear
 * in. `die_on_bad_params`, `param()` with no arguments and `query()` all read
 * from this structure, so they cannot drift apart.
 *
 * @module parser/ParamScope
 */

import type { ParamType, ParseNode } from '../types.js';

/**
 * One parameter namespace: the top-level template, or the body of one loop.
 */
export interface ParamScope {
  /** Names declared directly in this namespace */
  types: Map<string, ParamType>;

  /** Child namespaces, keyed by loop name */
  loops: Map<string, ParamScope>;
}

/**
 * Build the scope tree for a parsed template.
 *
 * @param nodes - Parsed template AST
 * @param caseSensitive - Whether parameter names keep their case
 * @param globalVars - Whether the global_vars option is enabled
 * @returns Root scope
 */
export function buildParamScope(nodes: ParseNode[], caseSensitive: boolean, globalVars = false): ParamScope {
  const scope = createScope();
  collectInto(scope, nodes, caseSensitive);

  if (globalVars) {
    hoistVariables(scope, scope);
  }

  return scope;
}

/**
 * Publish every nested variable name into the root scope.
 *
 * With global_vars, Perl mirrors each variable into the top-level param_map so
 * a value set on the template is visible inside loops. Loop names are not
 * mirrored, since a nested loop is still only addressable through its parent.
 *
 * @param root - Root scope receiving the names
 * @param scope - Scope being walked
 */
function hoistVariables(root: ParamScope, scope: ParamScope): void {
  if (scope !== root) {
    for (const [name, type] of scope.types) {
      if (type === 'VAR') {
        declare(root, name, 'VAR');
      }
    }
  }

  for (const child of scope.loops.values()) {
    hoistVariables(root, child);
  }
}

/**
 * Walk a path of loop names to the scope it designates.
 *
 * @param root - Scope to start from
 * @param path - Loop names, outermost first
 * @returns Target scope, or undefined when the path does not exist
 */
export function resolveScope(root: ParamScope, path: string[]): ParamScope | undefined {
  let scope: ParamScope | undefined = root;

  for (const loopName of path) {
    scope = scope.loops.get(loopName);
    if (!scope) return undefined;
  }

  return scope;
}

/**
 * List the names declared in a scope, in a stable order.
 *
 * @param scope - Scope to list
 * @returns Sorted parameter names
 */
export function scopeNames(scope: ParamScope): string[] {
  return Array.from(scope.types.keys()).sort();
}

/**
 * Create an empty scope.
 *
 * @returns Empty scope
 */
function createScope(): ParamScope {
  return { types: new Map(), loops: new Map() };
}

/**
 * Add the names declared by `nodes` to `scope`.
 *
 * Conditionals contribute their own name and recurse into the same scope;
 * loops contribute their name and recurse into a child scope.
 *
 * @param scope - Scope being filled
 * @param nodes - Nodes at this level
 * @param caseSensitive - Whether parameter names keep their case
 */
function collectInto(scope: ParamScope, nodes: ParseNode[], caseSensitive: boolean): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'VAR':
        declare(scope, normalize(node.name, caseSensitive), 'VAR');
        break;

      case 'COND':
        declare(scope, normalize(node.name, caseSensitive), 'VAR');
        collectInto(scope, node.consequent, caseSensitive);
        if (node.alternate) {
          collectInto(scope, node.alternate, caseSensitive);
        }
        break;

      case 'LOOP': {
        const name = normalize(node.name, caseSensitive);
        declare(scope, name, 'LOOP');

        // Repeating a loop name reuses the same namespace, as Perl does by
        // linking the second tag to the existing LOOP object.
        let child = scope.loops.get(name);
        if (!child) {
          child = createScope();
          scope.loops.set(name, child);
        }
        collectInto(child, node.body, caseSensitive);
        break;
      }

      default:
        break;
    }
  }
}

/**
 * Record a name in a scope.
 *
 * A name used as both a conditional and a loop stays a LOOP, matching Perl,
 * where the conditional binds to the existing LOOP object.
 *
 * @param scope - Scope to write to
 * @param name - Normalized parameter name
 * @param type - Parameter type
 */
function declare(scope: ParamScope, name: string, type: ParamType): void {
  if (scope.types.get(name) === 'LOOP') return;
  scope.types.set(name, type);
}

/**
 * Normalize a parameter name for lookup.
 *
 * @param name - Raw name from the template
 * @param caseSensitive - Whether to preserve case
 * @returns Normalized name
 */
function normalize(name: string, caseSensitive: boolean): string {
  return caseSensitive ? name : name.toLowerCase();
}
