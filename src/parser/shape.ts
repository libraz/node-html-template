/**
 * Template shape
 *
 * The set of parameters a template declares, as a tree mirroring its loop
 * nesting: every TMPL_LOOP opens a namespace, while conditionals share the
 * namespace they appear in. Introspection, loop-data validation and type
 * generation all read this one structure, so they cannot drift apart.
 *
 * Declarations record every form a name was used in rather than collapsing to
 * a single type, so a name used as both a conditional and a loop keeps both
 * facts instead of one overwriting the other.
 *
 * @module parser/shape
 */

import type { EscapeType, ParamType, ParseNode, SourceLoc } from '../types.js';

/**
 * How a name was written in the template.
 */
export type ParamUsage = 'var' | 'if' | 'unless' | 'loop';

/**
 * Everything the template says about one parameter name.
 */
export interface ParamDecl {
  /** Name as first written, before any case folding */
  raw: string;

  /** Normalized lookup key */
  key: string;

  /** Every form the name was used in */
  usages: Set<ParamUsage>;

  /** Whether any TMPL_VAR for this name carried a DEFAULT attribute */
  hasDefault: boolean;

  /** ESCAPE values observed on this name */
  escapes: Set<EscapeType>;

  /** Where the name first appeared */
  loc?: SourceLoc;
}

/**
 * One parameter namespace: the top level, or the body of one loop.
 *
 * Both maps preserve insertion order, so iterating them yields declaration
 * order as written in the template.
 */
export interface ShapeNode {
  /** Declarations in this namespace, keyed by normalized name */
  decls: Map<string, ParamDecl>;

  /** Child namespaces, keyed by normalized loop name */
  loops: Map<string, ShapeNode>;
}

/**
 * Build the shape tree for a parsed template.
 *
 * The tree is always built without global_vars hoisting, so it describes the
 * template's real nesting. Apply {@link withGlobalVars} for the runtime lookup
 * view when that option is on.
 *
 * @param nodes - Parsed template AST
 * @param caseSensitive - Whether parameter names keep their case
 * @returns Root shape node
 */
export function buildShape(nodes: ParseNode[], caseSensitive: boolean): ShapeNode {
  const shape = createShapeNode();
  collectInto(shape, nodes, caseSensitive);
  return shape;
}

/**
 * Derive the lookup view used when global_vars is enabled.
 *
 * Perl mirrors each nested variable into the top-level param_map so a value
 * set on the template is visible inside loops. Loop names are not mirrored,
 * since a nested loop stays addressable only through its parent.
 *
 * The original tree is left untouched and its loop namespaces are shared, so
 * callers that need the true nesting still have it.
 *
 * @param shape - Shape built by {@link buildShape}
 * @returns Root node whose declarations also cover nested variables
 */
export function withGlobalVars(shape: ShapeNode): ShapeNode {
  const root: ShapeNode = { decls: new Map(shape.decls), loops: shape.loops };

  for (const child of shape.loops.values()) {
    hoistInto(root, child);
  }

  return root;
}

/**
 * Walk a path of loop names to the namespace it designates.
 *
 * @param root - Node to start from
 * @param path - Normalized loop names, outermost first
 * @returns Target node, or undefined when the path does not exist
 */
export function resolveShape(root: ShapeNode, path: string[]): ShapeNode | undefined {
  let shape: ShapeNode | undefined = root;

  for (const loopName of path) {
    shape = shape.loops.get(loopName);
    if (!shape) return undefined;
  }

  return shape;
}

/**
 * List the names declared in a namespace, in declaration order.
 *
 * @param shape - Node to list
 * @returns Normalized parameter names
 */
export function shapeNames(shape: ShapeNode): string[] {
  return Array.from(shape.decls.keys());
}

/**
 * Look up the effective type of a declared name.
 *
 * @param shape - Node to read
 * @param key - Normalized parameter name
 * @returns Declared type, or undefined when the name is not declared
 */
export function shapeKind(shape: ShapeNode, key: string): ParamType | undefined {
  const decl = shape.decls.get(key);
  return decl ? declKind(decl) : undefined;
}

/**
 * Reduce a declaration's usages to a single type.
 *
 * A name used as both a conditional and a loop is a LOOP, matching Perl, where
 * the conditional binds to the existing LOOP object.
 *
 * @param decl - Declaration to classify
 * @returns Effective parameter type
 */
export function declKind(decl: ParamDecl): ParamType {
  return decl.usages.has('loop') ? 'LOOP' : 'VAR';
}

/**
 * Create an empty namespace.
 *
 * @returns Empty shape node
 */
export function createShapeNode(): ShapeNode {
  return { decls: new Map(), loops: new Map() };
}

/**
 * Copy every nested variable declaration into the root namespace.
 *
 * @param root - Namespace receiving the names
 * @param shape - Namespace being walked
 */
function hoistInto(root: ShapeNode, shape: ShapeNode): void {
  for (const decl of shape.decls.values()) {
    if (declKind(decl) === 'LOOP') continue;
    if (root.decls.has(decl.key)) continue;
    root.decls.set(decl.key, decl);
  }

  for (const child of shape.loops.values()) {
    hoistInto(root, child);
  }
}

/**
 * Add the names declared by `nodes` to `shape`.
 *
 * @param shape - Namespace being filled
 * @param nodes - Nodes at this level
 * @param caseSensitive - Whether parameter names keep their case
 */
function collectInto(shape: ShapeNode, nodes: ParseNode[], caseSensitive: boolean): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'VAR': {
        const decl = declare(shape, node.name, caseSensitive, 'var', node.loc);
        if (node.default !== undefined) {
          decl.hasDefault = true;
        }
        if (node.escape !== undefined) {
          decl.escapes.add(node.escape);
        }
        break;
      }

      case 'COND':
        declare(shape, node.name, caseSensitive, node.condition, node.loc);
        collectInto(shape, node.consequent, caseSensitive);
        if (node.alternate) {
          collectInto(shape, node.alternate, caseSensitive);
        }
        break;

      case 'LOOP': {
        const decl = declare(shape, node.name, caseSensitive, 'loop', node.loc);

        // Repeating a loop name reuses the same namespace, as Perl does by
        // linking the second tag to the existing LOOP object.
        let child = shape.loops.get(decl.key);
        if (!child) {
          child = createShapeNode();
          shape.loops.set(decl.key, child);
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
 * Record a usage of a name, creating its declaration on first sight.
 *
 * @param shape - Namespace to write to
 * @param raw - Name as written in the template
 * @param caseSensitive - Whether parameter names keep their case
 * @param usage - Form the name was used in
 * @param loc - Position of the tag
 * @returns The declaration, new or existing
 */
function declare(shape: ShapeNode, raw: string, caseSensitive: boolean, usage: ParamUsage, loc?: SourceLoc): ParamDecl {
  const key = caseSensitive ? raw : raw.toLowerCase();
  let decl = shape.decls.get(key);

  if (!decl) {
    decl = { raw, key, usages: new Set(), hasDefault: false, escapes: new Set(), loc };
    shape.decls.set(key, decl);
  }

  decl.usages.add(usage);
  return decl;
}
