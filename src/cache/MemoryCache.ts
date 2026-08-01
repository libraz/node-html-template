/**
 * In-memory template cache
 * Caches parsed templates in memory for fast access
 *
 * Features:
 * - LRU-style eviction (via Map insertion order)
 * - Revalidation against source template versions (unless blind_cache enabled)
 * - Fast hash-based key lookup
 *
 * @module cache/MemoryCache
 */

import type { CacheEntry, ParseNode } from '../types.js';
import { versionsUnchanged } from './validate.js';

/**
 * In-memory cache for parsed templates
 */
export class MemoryCache {
  /**
   * Cache storage
   * Map maintains insertion order for LRU-style behavior
   */
  private cache: Map<string, CacheEntry>;

  /**
   * Blind cache mode (skip revalidation)
   */
  private blindMode: boolean;

  /**
   * Maximum cache size (number of entries)
   * Default: 100 templates
   */
  private maxSize: number;

  /**
   * Create memory cache
   *
   * @param blindMode - Enable blind cache (skip revalidation)
   * @param maxSize - Maximum number of cached templates
   */
  constructor(blindMode = false, maxSize = 100) {
    this.cache = new Map();
    this.blindMode = blindMode;
    this.maxSize = maxSize;
  }

  /**
   * Get cached template
   * Returns null if not found or invalid (stale)
   *
   * @param key - Cache key
   * @returns Cache entry or null
   */
  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // In blind mode, always return cached entry
    if (this.blindMode) {
      // Move to end for LRU (delete and re-insert)
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry;
    }

    // Validate that every source template is unchanged
    if (!versionsUnchanged(entry.versions)) {
      // Stale - remove from cache
      this.cache.delete(key);
      return null;
    }

    // Valid - move to end for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  /**
   * Store template in cache
   *
   * @param key - Cache key
   * @param nodes - Parsed template nodes
   * @param versions - Source template versions for validation
   */
  set(key: string, nodes: ParseNode[], versions: Map<string, string | undefined>): void {
    const entry: CacheEntry = {
      nodes,
      versions,
      key
    };

    // Check if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Evict oldest entry (first in Map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    // Delete existing entry if present (for LRU reordering)
    this.cache.delete(key);

    // Add entry
    this.cache.set(key, entry);
  }

  /**
   * Check if key exists in cache (without validation)
   *
   * @param key - Cache key
   * @returns True if key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size (number of entries)
   *
   * @returns Number of cached templates
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Remove specific entry from cache
   *
   * @param key - Cache key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats
   */
  getStats(): { size: number; maxSize: number; blindMode: boolean } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      blindMode: this.blindMode
    };
  }
}
