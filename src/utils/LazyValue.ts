/**
 * Lazy value utilities
 * Handle lazy evaluation of variables and loops
 *
 * @module utils/LazyValue
 */

import type { LoopDataItem } from '../types.js';
import { isFunction } from './helpers.js';

/**
 * A function value that is called at most once
 *
 * The raw result is cached and interpreted by the reader, so whether the name
 * is used as a variable, a condition or a loop does not affect the wrapping.
 */
export class CachedLazy {
  private evaluated = false;

  private cached: unknown;

  /**
   * Create cached lazy value
   *
   * @param lazyFn - Function supplied as a value
   */
  constructor(private readonly lazyFn: () => unknown) {}

  /**
   * Get the function's result (evaluates on first call only)
   *
   * @returns Raw result
   */
  get(): unknown {
    if (!this.evaluated) {
      this.cached = this.lazyFn();
      this.evaluated = true;
    }
    return this.cached;
  }
}

/**
 * Resolve a function value, cached or not, to what it returns
 *
 * @param value - Stored value
 * @returns The function's result, or the value itself when it is not a function
 */
export function resolveLazy(value: unknown): unknown {
  if (value instanceof CachedLazy) {
    return value.get();
  }
  if (isFunction(value)) {
    return value();
  }
  return value;
}

/**
 * Get the scalar a value renders as
 *
 * @param value - Stored value (may be lazy)
 * @returns Scalar value, or undefined for loop data and other non-scalars
 */
export function getFinalValue(value: unknown): string | number | boolean | null | undefined {
  const resolved = resolveLazy(value);

  if (
    typeof resolved === 'string' ||
    typeof resolved === 'number' ||
    typeof resolved === 'boolean' ||
    resolved === null ||
    resolved === undefined
  ) {
    return resolved;
  }
  return undefined;
}

/**
 * Get the rows a value iterates over
 *
 * @param value - Stored value (may be lazy)
 * @returns Loop rows, empty for anything that is not loop data
 * @throws Error when a function value returns something other than an array
 */
export function getFinalLoopData(value: unknown): LoopDataItem[] {
  if (Array.isArray(value)) {
    return value as LoopDataItem[];
  }
  if (!(value instanceof CachedLazy) && !isFunction(value)) {
    return [];
  }

  const resolved = resolveLazy(value);
  if (!Array.isArray(resolved)) {
    throw new Error('Lazy loop function must return an array');
  }
  return resolved as LoopDataItem[];
}
