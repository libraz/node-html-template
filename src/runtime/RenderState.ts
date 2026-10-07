/**
 * Per-render state
 *
 * Everything one render mutates lives here and nowhere else, so a compiled
 * template stays immutable and two renders of it cannot interfere. A render
 * that throws is simply abandoned along with its state, which is why nothing
 * in here needs unwinding.
 *
 * The parameter scope and the shape cursor advance together in a single stack.
 * Keeping them apart used to let one be restored while the other was not.
 *
 * @module runtime/RenderState
 */

import type { ShapeNode } from '../parser/shape.js';
import type { LoopDataItem, ParamValue } from '../types.js';
import { isTruthy, normalizeParamName } from '../utils/helpers.js';
import { CachedLazy, getFinalLoopData, getFinalValue, resolveLazy } from '../utils/LazyValue.js';

/** A value as held in render state: a function value may be memoized */
type StoredValue = ParamValue | CachedLazy;

/**
 * Settings a render needs to resolve names.
 *
 * Deliberately narrower than the full option set: name resolution depends on
 * these and nothing else.
 */
export interface RenderSettings {
  /** Whether parameter names keep their case */
  caseSensitive: boolean;

  /** Whether a name unresolved in a loop falls back to enclosing scopes */
  globalVars: boolean;

  /** Whether loop iterations get __first__ and friends */
  loopContextVars: boolean;

  /** Whether a function value is called at most once per render */
  memoizeLazy: boolean;

  /**
   * Consulted for a top-level name the caller never set.
   *
   * Never consulted inside a loop iteration: a name missing from a row is
   * missing, not something to go looking for elsewhere.
   */
  resolve?: (name: string) => ParamValue;
}

/**
 * One level of scope: the template's top level, or one loop iteration.
 */
interface Frame {
  /** Values in this scope, keyed by normalized name */
  params: Map<string, StoredValue>;

  /** Parameters the template declares at this level */
  shape: ShapeNode | undefined;

  /** Enclosing frame, absent at the top level */
  parent?: Frame;
}

/**
 * Parameter values and scope position for one render.
 */
export class RenderState {
  private readonly settings: RenderSettings;

  private readonly root: Frame;

  private frame: Frame;

  /** Memo wrapper per function value, so revisiting a row reuses it */
  private readonly lazies = new WeakMap<() => unknown, CachedLazy>();

  /** Values `resolve` returned, when memoizing */
  private readonly resolved = new Map<string, StoredValue>();

  /**
   * @param settings - Name resolution settings
   * @param shape - Parameters the template declares at its top level
   */
  constructor(settings: RenderSettings, shape?: ShapeNode) {
    this.settings = settings;
    this.root = { params: new Map(), shape };
    this.frame = this.root;
  }

  /**
   * Parameters declared at the current scope.
   *
   * @returns Shape node, or undefined when the template declares nothing here
   */
  get shape(): ShapeNode | undefined {
    return this.frame.shape;
  }

  /**
   * Set a top-level parameter.
   *
   * @param name - Parameter name
   * @param value - Parameter value
   */
  set(name: string, value: ParamValue): void {
    this.root.params.set(this.normalize(name), this.wrap(value));
  }

  /**
   * Resolve a name against the current scope.
   *
   * @param name - Parameter name
   * @returns Parameter value, or undefined when unset
   */
  get(name: string): StoredValue {
    const key = this.normalize(name);

    if (this.frame.params.has(key)) {
      return this.frame.params.get(key);
    }

    if (this.settings.globalVars) {
      for (let frame = this.frame.parent; frame; frame = frame.parent) {
        if (frame.params.has(key)) {
          return frame.params.get(key);
        }
      }
    }

    return this.frame === this.root ? this.resolve(name, key) : undefined;
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
  text(name: string): string | undefined {
    const value = getFinalValue(this.get(name));

    return value === undefined || value === null ? undefined : String(value);
  }

  /**
   * Resolve a loop to its rows.
   *
   * @param name - Loop name
   * @returns Rows, empty when the loop is unset
   */
  rows(name: string): LoopDataItem[] {
    return getFinalLoopData(this.get(name));
  }

  /**
   * Evaluate a name as a condition.
   *
   * @param name - Condition name
   * @returns True when the value is truthy by the template's rules
   */
  isTrue(name: string): boolean {
    return isTruthy(resolveLazy(this.get(name)));
  }

  /**
   * Enter one loop iteration.
   *
   * @param row - The iteration's parameters
   * @param shape - Parameters the loop body declares
   * @param index - Zero-based iteration number
   * @param length - Total number of iterations
   */
  enter(row: LoopDataItem, shape: ShapeNode | undefined, index: number, length: number): void {
    const params = new Map<string, StoredValue>();

    for (const [key, value] of Object.entries(row)) {
      params.set(this.normalize(key), this.wrap(value));
    }

    if (this.settings.loopContextVars) {
      this.addContextVars(params, index, length);
    }

    this.frame = { params, shape, parent: this.frame };
  }

  /**
   * Leave the current loop iteration.
   */
  leave(): void {
    this.frame = this.frame.parent ?? this.root;
  }

  /**
   * Add __first__ and friends to an iteration's parameters.
   *
   * @param params - The iteration's parameter map
   * @param index - Zero-based iteration number
   * @param length - Total number of iterations
   */
  private addContextVars(params: Map<string, StoredValue>, index: number, length: number): void {
    // These are assigned per branch rather than from a single boolean
    // expression, which is why a false value is sometimes the number 0 and
    // sometimes the empty string. A template can print one directly, so the
    // difference is observable and is reproduced here.
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

    // Templates spell these in lowercase, but they still go through name
    // normalization so a case-sensitive template matches them.
    const set = (name: string, value: ParamValue): void => {
      params.set(this.normalize(name), value);
    };

    set('__first__', first);
    set('__inner__', inner);
    set('__outer__', outer);
    set('__last__', last);
    set('__odd__', odd ? 1 : '');
    set('__even__', odd ? '' : 1);
    set('__counter__', index + 1);
    set('__index__', index);
  }

  /**
   * Consult the `resolve` fallback, once per name when memoizing.
   *
   * @param name - Name as written in the template
   * @param key - Normalized name
   * @returns Resolved value, or undefined when there is no fallback
   */
  private resolve(name: string, key: string): StoredValue {
    const resolve = this.settings.resolve;
    if (!resolve) return undefined;
    if (!this.settings.memoizeLazy) return resolve(name);

    if (!this.resolved.has(key)) {
      this.resolved.set(key, this.wrap(resolve(name)));
    }
    return this.resolved.get(key);
  }

  /**
   * Bring a value into render state, memoizing a function value.
   *
   * Every way a value enters the state goes through here, so memoizeLazy
   * changes call counts and nothing else.
   *
   * @param value - Value as supplied
   * @returns Value to store
   */
  private wrap(value: ParamValue): StoredValue {
    if (!this.settings.memoizeLazy || typeof value !== 'function') {
      return value;
    }

    let cached = this.lazies.get(value);
    if (!cached) {
      cached = new CachedLazy(value);
      this.lazies.set(value, cached);
    }
    return cached;
  }

  /**
   * Normalize a parameter name for lookup.
   *
   * @param name - Raw name
   * @returns Normalized name
   */
  private normalize(name: string): string {
    return normalizeParamName(name, this.settings.caseSensitive);
  }
}
