/**
 * Shape view
 *
 * Wraps the internal shape tree in a stable, read-only surface. Keeping the
 * two apart means the internal structure can gain fields without that becoming
 * part of the public API.
 *
 * @module api/shape
 */

import { declKind, type ShapeNode } from '../parser/shape.js';
import type { ParamInfo, TemplateShape } from './types.js';

/**
 * Build the public view of a shape node.
 *
 * @param node - Internal shape node
 * @param caseSensitive - Whether lookups fold case
 * @returns Read-only view
 */
export function createShapeView(node: ShapeNode, caseSensitive: boolean): TemplateShape {
  const normalize = (name: string): string => (caseSensitive ? name : name.toLowerCase());

  return {
    get names(): readonly string[] {
      return Array.from(node.decls.keys());
    },

    get(name: string): ParamInfo | undefined {
      const decl = node.decls.get(normalize(name));
      if (!decl) return undefined;

      return {
        name: decl.raw,
        key: decl.key,
        kind: declKind(decl) === 'LOOP' ? 'loop' : 'var',
        usages: decl.usages,
        hasDefault: decl.hasDefault,
        escapes: decl.escapes,
        loc: decl.loc
      };
    },

    has(name: string): boolean {
      return node.decls.has(normalize(name));
    },

    kind(name: string): 'var' | 'loop' | undefined {
      const decl = node.decls.get(normalize(name));
      if (!decl) return undefined;

      return declKind(decl) === 'LOOP' ? 'loop' : 'var';
    },

    loop(name: string): TemplateShape | undefined {
      const child = node.loops.get(normalize(name));
      return child ? createShapeView(child, caseSensitive) : undefined;
    },

    at(path: readonly string[]): TemplateShape | undefined {
      let current: ShapeNode | undefined = node;

      for (const segment of path) {
        current = current.loops.get(normalize(segment));
        if (!current) return undefined;
      }

      return createShapeView(current, caseSensitive);
    }
  };
}
