/**
 * File-based template cache
 * Caches parsed templates to disk for non-persistent environments (CGI)
 *
 * Features:
 * - JSON serialization of ParseNode tree
 * - Automatic cache directory creation
 * - mtime validation
 * - Safe file I/O with error handling
 *
 * @module cache/FileCache
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CacheEntry, ParseNode } from '../types.js';
import { validateMtimes } from '../utils/FileResolver.js';
import { createError } from '../utils/helpers.js';

/**
 * File-based cache for parsed templates
 */
export class FileCache {
  /**
   * Cache directory path
   */
  private cacheDir: string;

  /**
   * Cache directory permissions
   */
  private dirMode: number;

  /**
   * Create file cache
   *
   * @param cacheDir - Directory for cache files
   * @param dirMode - Directory permissions (default: 0o700)
   */
  constructor(cacheDir: string, dirMode = 0o700) {
    this.cacheDir = cacheDir;
    this.dirMode = dirMode;

    // Ensure cache directory exists
    this.ensureCacheDir();
  }

  /**
   * Ensure cache directory exists
   * Creates directory with specified permissions if needed
   */
  private ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      try {
        mkdirSync(this.cacheDir, { recursive: true, mode: this.dirMode });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        throw createError(`Failed to create cache directory ${this.cacheDir}: ${errorMsg}`);
      }
    }
  }

  /**
   * Get cache file path for key
   *
   * @param key - Cache key
   * @returns Absolute path to cache file
   */
  private getCacheFilePath(key: string): string {
    // Use key as filename (already hashed)
    return join(this.cacheDir, `${key}.json`);
  }

  /**
   * Get cached template
   * Returns null if not found or invalid (stale)
   *
   * @param key - Cache key
   * @returns Cache entry or null
   */
  get(key: string): CacheEntry | null {
    const filePath = this.getCacheFilePath(key);

    // Check if cache file exists
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      // Read and parse cache file
      const content = readFileSync(filePath, 'utf-8');
      const entry = JSON.parse(content) as CacheEntry;

      // Reconstruct mtimes Map (JSON serializes Map as object)
      if (entry.mtimes && typeof entry.mtimes === 'object') {
        entry.mtimes = new Map(Object.entries(entry.mtimes));
      }

      // Validate mtimes
      if (!validateMtimes(entry.mtimes)) {
        // Stale - remove cache file
        this.delete(key);
        return null;
      }

      return entry;
    } catch {
      // Failed to read or parse - remove invalid cache file
      this.delete(key);
      return null;
    }
  }

  /**
   * Store template in cache
   *
   * @param key - Cache key
   * @param nodes - Parsed template nodes
   * @param mtimes - File mtimes for validation
   */
  set(key: string, nodes: ParseNode[], mtimes: Map<string, number>): void {
    const entry: CacheEntry = {
      nodes,
      mtimes,
      key
    };

    // Convert Map to object for JSON serialization
    const serializable = {
      ...entry,
      mtimes: Object.fromEntries(entry.mtimes.entries())
    };

    const filePath = this.getCacheFilePath(key);

    try {
      const content = JSON.stringify(serializable);
      writeFileSync(filePath, content, 'utf-8');
    } catch (err) {
      // File cache write failure is non-fatal - just warn
      if (process.env.DEBUG) {
        console.error(`Warning: Failed to write cache file ${filePath}:`, err);
      }
    }
  }

  /**
   * Check if key exists in cache (without validation)
   *
   * @param key - Cache key
   * @returns True if cache file exists
   */
  has(key: string): boolean {
    const filePath = this.getCacheFilePath(key);
    return existsSync(filePath);
  }

  /**
   * Clear all cached entries
   * Removes all .json files from cache directory
   */
  clear(): void {
    if (!existsSync(this.cacheDir)) return;
    try {
      const files = readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            unlinkSync(join(this.cacheDir, file));
          } catch {
            // Ignore individual deletion errors
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  /**
   * Remove specific entry from cache
   *
   * @param key - Cache key
   */
  delete(key: string): void {
    const filePath = this.getCacheFilePath(key);
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // Ignore deletion errors
    }
  }

  /**
   * Get cache file mtime
   *
   * @param key - Cache key
   * @returns File mtime or -1 if not found
   */
  getCacheMtime(key: string): number {
    const filePath = this.getCacheFilePath(key);
    try {
      const stats = statSync(filePath);
      return stats.mtimeMs;
    } catch {
      return -1;
    }
  }
}
