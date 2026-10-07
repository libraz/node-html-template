/**
 * Compiled-template cache
 *
 * Keyed on the template's identity plus every setting that changes what
 * compiling it produces, so an entry can never be handed to a caller who asked
 * for something different.
 *
 * Freshness is asked of the loader rather than of the filesystem: a loader
 * reports an opaque version per template, and one that reports none is
 * promising the template will not change.
 *
 * @module api/cache
 */

import type { Template } from './Template.js';

/**
 * How compiled templates are reused.
 */
export interface CacheOptions {
  /** Most templates kept before the least recently used one is dropped */
  maxSize?: number;

  /**
   * Check a cached template against its sources before reusing it.
   *
   * Turning this off skips the loader round-trip, at the cost of serving a
   * template that has since changed on disk. Defaults to true.
   */
  revalidate?: boolean;
}

/**
 * Version of every template a compilation drew on, keyed by template id.
 */
export type Versions = ReadonlyMap<string, string | undefined>;

/**
 * One cached compilation.
 */
export interface CacheEntry {
  /** The compiled template */
  template: Template<object>;

  /** Version of every template it was built from */
  versions: Versions;
}

/**
 * A bounded, least-recently-used store of compiled templates.
 *
 * Deciding whether an entry is still current is left to the caller, because
 * only the caller knows whether its loader can answer synchronously.
 */
export class TemplateCache {
  private readonly entries = new Map<string, CacheEntry>();

  private readonly maxSize: number;

  /** Whether the caller should check entries against their sources */
  readonly revalidate: boolean;

  /**
   * @param options - Cache settings
   */
  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.revalidate = options.revalidate ?? true;
  }

  /**
   * Look up an entry, marking it as most recently used.
   *
   * @param key - Cache key
   * @returns Entry, or undefined when the key is absent
   */
  take(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    // Reinsert so the most recently used entry is last, which is where the
    // eviction order reads from.
    this.entries.delete(key);
    this.entries.set(key, entry);

    return entry;
  }

  /**
   * Store a compiled template.
   *
   * @param key - Cache key
   * @param template - Compiled template
   * @param versions - Version of every template it was built from
   */
  set(key: string, template: Template<object>, versions: Versions): void {
    this.entries.delete(key);
    this.entries.set(key, { template, versions });

    while (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  /**
   * Drop one entry.
   *
   * @param key - Cache key
   */
  delete(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Drop every entry.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Number of templates currently held.
   *
   * @returns Entry count
   */
  get size(): number {
    return this.entries.size;
  }
}
