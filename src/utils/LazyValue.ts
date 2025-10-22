/**
 * Lazy value utilities
 * Handle lazy evaluation of variables and loops
 *
 * @module utils/LazyValue
 */

/* eslint-disable max-classes-per-file */
// CachedLazyValue and CachedLazyLoop are tightly coupled and belong together

import type {
  LazyValue, LazyLoopValue, LoopDataItem, ParamValue
} from '../types.js';
import { isFunction } from './helpers.js';

/**
 * Check if value is a lazy value (callback function)
 *
 * @param value - Value to check
 * @returns True if value is a lazy value
 */
export function isLazyValue(value: ParamValue): value is LazyValue {
  return isFunction(value);
}

/**
 * Check if value is a lazy loop (callback returning array)
 * Note: Cannot distinguish from regular lazy value at runtime,
 * so this just checks if it's a function
 *
 * @param value - Value to check
 * @returns True if value might be a lazy loop
 */
export function isLazyLoop(value: ParamValue): value is LazyLoopValue {
  return isFunction(value);
}

/**
 * Evaluate lazy value if it's a function, otherwise return as-is
 *
 * @param value - Value to evaluate
 * @returns Evaluated value
 */
export function evaluateLazyValue(value: ParamValue): string | number | boolean | null | undefined | LoopDataItem[] {
  if (isFunction(value)) {
    return value();
  }
  return value;
}

/**
 * Wrapper for cached lazy value
 * Evaluates function once and caches result
 */
export class CachedLazyValue {
  private evaluated: boolean = false;

  private cachedValue: string | number | boolean | null | undefined;

  /**
   * Create cached lazy value
   *
   * @param lazyFn - Lazy value function
   */
  // Constructor initializes private readonly field
  // eslint-disable-next-line no-useless-constructor, no-empty-function
  constructor(private readonly lazyFn: LazyValue) {}

  /**
   * Get value (evaluates on first call, returns cached value afterwards)
   *
   * @returns Evaluated value
   */
  getValue(): string | number | boolean | null | undefined {
    if (!this.evaluated) {
      this.cachedValue = this.lazyFn();
      this.evaluated = true;
    }
    return this.cachedValue;
  }

  /**
   * Check if value has been evaluated
   *
   * @returns True if already evaluated
   */
  isEvaluated(): boolean {
    return this.evaluated;
  }

  /**
   * Clear cached value (force re-evaluation on next call)
   */
  clear(): void {
    this.evaluated = false;
    this.cachedValue = undefined;
  }
}

/**
 * Wrapper for cached lazy loop
 * Evaluates function once and caches result
 */
export class CachedLazyLoop {
  private evaluated: boolean = false;

  private cachedData: LoopDataItem[] = [];

  /**
   * Create cached lazy loop
   *
   * @param lazyFn - Lazy loop function
   */
  // Constructor initializes private readonly field
  // eslint-disable-next-line no-useless-constructor, no-empty-function
  constructor(private readonly lazyFn: LazyLoopValue) {}

  /**
   * Get loop data (evaluates on first call, returns cached data afterwards)
   *
   * @returns Loop data array
   */
  getData(): LoopDataItem[] {
    if (!this.evaluated) {
      const result = this.lazyFn();
      // Ensure result is an array
      if (!Array.isArray(result)) {
        throw new Error('Lazy loop function must return an array');
      }
      this.cachedData = result;
      this.evaluated = true;
    }
    return this.cachedData;
  }

  /**
   * Check if data has been evaluated
   *
   * @returns True if already evaluated
   */
  isEvaluated(): boolean {
    return this.evaluated;
  }

  /**
   * Clear cached data (force re-evaluation on next call)
   */
  clear(): void {
    this.evaluated = false;
    this.cachedData = [];
  }
}

/**
 * Create cached lazy value if caching is enabled
 *
 * @param value - Lazy value or regular value
 * @param enableCache - Whether to enable caching
 * @returns Cached wrapper or original value
 */
export function maybeCacheLazyValue(
  value: ParamValue,
  enableCache: boolean
): ParamValue | CachedLazyValue {
  if (enableCache && isLazyValue(value)) {
    return new CachedLazyValue(value);
  }
  return value;
}

/**
 * Create cached lazy loop if caching is enabled
 *
 * @param value - Lazy loop or regular loop data
 * @param enableCache - Whether to enable caching
 * @returns Cached wrapper or original value
 */
export function maybeCacheLazyLoop(
  value: ParamValue,
  enableCache: boolean
): ParamValue | CachedLazyLoop {
  if (enableCache && isLazyLoop(value)) {
    return new CachedLazyLoop(value as LazyLoopValue);
  }
  return value;
}

/**
 * Get final value from potentially cached lazy value
 *
 * @param value - Value (may be cached lazy value)
 * @returns Evaluated value
 */
export function getFinalValue(value: unknown): string | number | boolean | null | undefined {
  if (value instanceof CachedLazyValue) {
    return value.getValue();
  }
  if (isFunction(value)) {
    return value();
  }
  // Filter out arrays (loop data) - those should use getFinalLoopData
  if (Array.isArray(value)) {
    return undefined;
  }
  // Return primitive values
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value === null
    || value === undefined
  ) {
    return value;
  }
  // Unknown type - return undefined
  return undefined;
}

/**
 * Get final loop data from potentially cached lazy loop
 *
 * @param value - Value (may be cached lazy loop or loop data)
 * @returns Loop data array
 */
export function getFinalLoopData(value: unknown): LoopDataItem[] {
  if (value instanceof CachedLazyLoop) {
    return value.getData();
  }
  if (isFunction(value)) {
    const result = value();
    if (!Array.isArray(result)) {
      throw new Error('Lazy loop function must return an array');
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value as LoopDataItem[];
  }
  // Invalid loop data
  return [];
}
