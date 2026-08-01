/**
 * Cache manager
 * Orchestrates memory and file caches based on template options
 *
 * Implements Perl HTML::Template caching behavior:
 * - cache: In-memory cache
 * - blind_cache: Skip mtime validation (faster but may serve stale templates)
 * - file_cache: Disk-based cache for non-persistent environments
 * - double_file_cache: Use both memory and file caches
 *
 * @module cache/CacheManager
 */

import type { CacheEntry, HTMLTemplateOptions, ParseNode } from '../types.js';
import { hashCode } from '../utils/helpers.js';
import { FileCache } from './FileCache.js';
import { MemoryCache } from './MemoryCache.js';

/**
 * Cache manager
 * Provides unified interface to memory and file caches
 */
export class CacheManager {
  private static memoryCaches = new Map<string, MemoryCache>();

  /**
   * Memory cache instance (if enabled)
   */
  private memoryCache?: MemoryCache;

  /**
   * File cache instance (if enabled)
   */
  private fileCache?: FileCache;

  /**
   * Template options
   */
  private options: HTMLTemplateOptions;

  /**
   * Cache debug mode
   */
  private debug: boolean;

  /**
   * Create cache manager
   *
   * @param options - Template options
   */
  constructor(options: HTMLTemplateOptions) {
    this.options = options;
    this.debug = options.cache_debug ?? false;

    // Initialize memory cache if enabled
    if (options.cache || options.blind_cache || options.double_file_cache) {
      const cacheName = options.blind_cache ? 'blind' : 'checked';
      let memoryCache = CacheManager.memoryCaches.get(cacheName);
      if (!memoryCache) {
        memoryCache = new MemoryCache(options.blind_cache ?? false);
        CacheManager.memoryCaches.set(cacheName, memoryCache);
      }
      this.memoryCache = memoryCache;
      if (this.debug) {
        console.error('[CacheManager] Memory cache enabled (blind:', options.blind_cache, ')');
      }
    }

    // Initialize file cache if enabled
    if (options.file_cache || options.double_file_cache) {
      if (!options.file_cache_dir) {
        throw new Error('file_cache requires file_cache_dir option');
      }
      this.fileCache = new FileCache(options.file_cache_dir, options.file_cache_dir_mode ?? 0o700);
      if (this.debug) {
        console.error('[CacheManager] File cache enabled in:', options.file_cache_dir);
      }
    }
  }

  /**
   * Generate cache key from template identifier
   *
   * @param identifier - Template identifier (filename or content hash)
   * @returns Cache key
   */
  static generateKey(identifier: string): string {
    // Use hash of identifier as key
    const hash = hashCode(identifier);
    return `tmpl_${hash}`;
  }

  /**
   * Get cached template
   * Tries memory cache first, then file cache (if double_file_cache)
   *
   * @param key - Cache key
   * @returns Cache entry or null if not found
   */
  get(key: string): CacheEntry | null {
    // Try memory cache first
    if (this.memoryCache) {
      const entry = this.memoryCache.get(key);
      if (entry) {
        if (this.debug) {
          console.error('[CacheManager] Memory cache HIT:', key);
        }
        return entry;
      }
      if (this.debug) {
        console.error('[CacheManager] Memory cache MISS:', key);
      }
    }

    // Try file cache (if double_file_cache)
    if (this.fileCache && this.options.double_file_cache) {
      const entry = this.fileCache.get(key);
      if (entry) {
        if (this.debug) {
          console.error('[CacheManager] File cache HIT:', key);
        }
        // Store in memory cache for faster access next time
        if (this.memoryCache) {
          this.memoryCache.set(key, entry.nodes, entry.versions);
        }
        return entry;
      }
      if (this.debug) {
        console.error('[CacheManager] File cache MISS:', key);
      }
    }

    // Try file cache only (if file_cache without double)
    if (this.fileCache && !this.options.double_file_cache) {
      const entry = this.fileCache.get(key);
      if (entry) {
        if (this.debug) {
          console.error('[CacheManager] File cache HIT:', key);
        }
        return entry;
      }
      if (this.debug) {
        console.error('[CacheManager] File cache MISS:', key);
      }
    }

    return null;
  }

  /**
   * Store template in cache
   * Stores in memory cache and/or file cache based on options
   *
   * @param key - Cache key
   * @param nodes - Parsed template nodes
   * @param versions - Source template versions for validation
   */
  set(key: string, nodes: ParseNode[], versions: Map<string, string | undefined>): void {
    // Store in memory cache
    if (this.memoryCache) {
      this.memoryCache.set(key, nodes, versions);
      if (this.debug) {
        console.error('[CacheManager] Stored in memory cache:', key);
      }
    }

    // Store in file cache
    if (this.fileCache) {
      this.fileCache.set(key, nodes, versions);
      if (this.debug) {
        console.error('[CacheManager] Stored in file cache:', key);
      }
    }
  }

  /**
   * Clear all caches
   */
  clear(): void {
    if (this.memoryCache) {
      this.memoryCache.clear();
    }
    if (this.fileCache) {
      this.fileCache.clear();
    }
    if (this.debug) {
      console.error('[CacheManager] All caches cleared');
    }
  }

  /**
   * Check if caching is enabled
   *
   * @returns True if any cache is enabled
   */
  isEnabled(): boolean {
    return !!(this.memoryCache || this.fileCache);
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats
   */
  getStats(): {
    memoryCache?: { size: number; maxSize: number; blindMode: boolean };
    fileCache?: { enabled: boolean; dir?: string };
  } {
    return {
      memoryCache: this.memoryCache?.getStats(),
      fileCache: this.fileCache ? { enabled: true, dir: this.options.file_cache_dir } : undefined
    };
  }
}
