/**
 * Chunked rendering
 *
 * Produces the same output as the executor, one piece at a time. The walk is
 * driven by an explicit stack rather than by recursive `yield*` delegation:
 * delegation adds a hop per nesting level to every chunk that passes through
 * it, so a deeply nested loop would pay for its depth on each item it yields.
 *
 * @module runtime/chunks
 */

import type { ShapeNode } from '../parser/shape.js';
import type { LoopDataItem, LoopNode, ParseNode } from '../types.js';
import { normalizeParamName } from '../utils/helpers.js';
import type { ExecutorOptions } from './Executor.js';
import type { RenderState } from './RenderState.js';
import { renderVar, validateRow } from './renderNode.js';

/**
 * A position in a list of nodes.
 */
interface NodeFrame {
  kind: 'nodes';
  nodes: ParseNode[];
  index: number;
}

/**
 * A position in a loop's rows.
 */
interface LoopFrame {
  kind: 'loop';
  node: LoopNode;
  rows: LoopDataItem[];
  bodyShape: ShapeNode | undefined;
  index: number;

  /** Whether a row's scope is currently open and still has to be left */
  entered: boolean;
}

type Frame = NodeFrame | LoopFrame;

/**
 * Render a template one chunk at a time.
 *
 * @param nodes - Parse tree to render
 * @param state - Values and scope position for this render
 * @param options - Render-time settings
 * @yields Pieces of the rendered output, in order
 */
export function* renderChunks(nodes: ParseNode[], state: RenderState, options: ExecutorOptions): Generator<string> {
  const stack: Frame[] = [{ kind: 'nodes', nodes, index: 0 }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1] as Frame;

    if (frame.kind === 'loop') {
      advanceLoop(frame, stack, state, options);
      continue;
    }

    if (frame.index >= frame.nodes.length) {
      stack.pop();
      continue;
    }

    const node = frame.nodes[frame.index] as ParseNode;
    frame.index += 1;

    switch (node.type) {
      case 'TEXT':
        yield node.content;
        break;

      case 'VAR': {
        const text = renderVar(node, state, options.defaultEscape);
        if (text) yield text;
        break;
      }

      case 'COND': {
        const isTrue = state.isTrue(node.name);
        const branch = (node.condition === 'if' ? isTrue : !isTrue) ? node.consequent : node.alternate;
        if (branch) stack.push({ kind: 'nodes', nodes: branch, index: 0 });
        break;
      }

      case 'LOOP': {
        const rows = state.rows(node.name);
        if (rows.length === 0) break;

        const key = normalizeParamName(node.name, options.caseSensitive);
        stack.push({
          kind: 'loop',
          node,
          rows,
          bodyShape: state.shape?.loops.get(key),
          index: 0,
          entered: false
        });
        break;
      }

      default:
        break;
    }
  }
}

/**
 * Move a loop frame to its next row, or retire it.
 *
 * @param frame - The loop frame on top of the stack
 * @param stack - Walk stack, pushed to when a row opens
 * @param state - Values and scope position for this render
 * @param options - Render-time settings
 */
function advanceLoop(frame: LoopFrame, stack: Frame[], state: RenderState, options: ExecutorOptions): void {
  if (frame.entered) {
    state.leave();
    frame.entered = false;
  }

  while (frame.index < frame.rows.length) {
    const row = frame.rows[frame.index];
    const index = frame.index;
    frame.index += 1;

    if (!row) continue;

    if (options.strictData) {
      validateRow(row, frame.bodyShape, options.caseSensitive);
    }

    state.enter(row, frame.bodyShape, index, frame.rows.length);
    frame.entered = true;
    stack.push({ kind: 'nodes', nodes: frame.node.body, index: 0 });
    return;
  }

  stack.pop();
}
