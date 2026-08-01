/**
 * Node evaluation
 *
 * The parts of rendering that depend only on a node and the current state, so
 * that walking the tree recursively and walking it with an explicit stack can
 * share one definition of what each node means.
 *
 * @module runtime/renderNode
 */

import type { ShapeNode } from '../parser/shape.js';
import type { EscapeType, LoopDataItem, VarNode } from '../types.js';
import { normalizeParamName } from '../utils/helpers.js';
import { escapeValue } from './Escape.js';
import type { RenderState } from './RenderState.js';

/**
 * Resolve a variable node to the text it contributes.
 *
 * @param node - Variable node
 * @param state - Values and scope position for this render
 * @param defaultEscape - Escape applied when the tag carries no ESCAPE
 * @returns Text to write, empty when the node contributes nothing
 */
export function renderVar(node: VarNode, state: RenderState, defaultEscape: EscapeType): string {
  const value = state.text(node.name);

  // A DEFAULT is written straight to the output and never escaped.
  if (value === undefined) return node.default ?? '';
  if (value === '') return '';

  // An absent ESCAPE attribute leaves the field undefined, which is what lets
  // the default apply here without overriding an explicit ESCAPE=NONE.
  const escapeType = node.escape ?? defaultEscape;

  return escapeType === 'none' ? value : escapeValue(value, escapeType);
}

/**
 * Reject row keys the loop body never declares.
 *
 * A loop body is its own namespace, so a typo in a row is exactly as much a
 * mistake as one at the top level and is reported the same way.
 *
 * @param row - One iteration's parameters
 * @param bodyShape - Parameters the loop body declares
 * @param caseSensitive - Whether parameter names keep their case
 * @throws Error naming the first undeclared key
 */
export function validateRow(row: LoopDataItem, bodyShape: ShapeNode | undefined, caseSensitive: boolean): void {
  if (!bodyShape) return;

  for (const key of Object.keys(row)) {
    const name = normalizeParamName(key, caseSensitive);
    if (bodyShape.decls.has(name)) continue;

    throw new Error(`Attempt to set parameter '${name}', which the loop body does not declare (strictData is on)`);
  }
}
