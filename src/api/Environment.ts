/**
 * Template environment
 *
 * Holds one loader, one set of compile defaults, and one cache. Everything a
 * long-lived process needs to configure once and then forget — which is why
 * none of it lives in a process-wide global.
 *
 * @module api/Environment
 */

import type { SyncTemplateLoader, TemplateLoader } from '../loader/types.js';
import { type CacheOptions, TemplateCache, type Versions } from './cache.js';
import { compile, compileEntry, compileEntryAsync } from './compile.js';
import type { Template } from './Template.js';
import type { AsyncCompileOptions, CompileOptions, RenderOptions, TemplateData } from './types.js';

/** Raised when a synchronous method would have to call an asynchronous loader */
const ASYNC_LOADER_MESSAGE = 'The loader is asynchronous; use compileFileAsync or renderFileAsync';

/**
 * Stands in for an asynchronous loader on a synchronous path.
 *
 * It fails on first use rather than up front, so text with no includes still
 * compiles, and it never lets the real loader hand back a promise where a
 * value is expected.
 */
const ASYNC_LOADER_GUARD: SyncTemplateLoader = {
  sync: true,

  resolve(): never {
    throw new Error(ASYNC_LOADER_MESSAGE);
  },

  read(): never {
    throw new Error(ASYNC_LOADER_MESSAGE);
  }
};

/**
 * Settings shared by every template an environment compiles.
 */
export interface EnvironmentOptions extends Omit<CompileOptions, 'filename' | 'loader'> {
  /**
   * Where templates are read from.
   *
   * Required to compile anything by name; without one the environment can
   * still compile text that has no includes. `nodeFileLoader` from the
   * `loaders` subpath reads from disk.
   *
   * A loader that answers with promises can only be used through the
   * asynchronous methods.
   */
  loader?: TemplateLoader;

  /**
   * Reuse compiled templates rather than recompiling on every request.
   *
   * Off by default, because a cache that outlives an edit is surprising during
   * development. Pass `true` for the defaults, or settings to tune them.
   */
  cache?: boolean | CacheOptions;
}

/**
 * A configured entry point for compiling and rendering templates.
 *
 * @example
 * ```ts
 * import { Environment } from '@libraz/html-template';
 * import { nodeFileLoader } from '@libraz/html-template/loaders';
 *
 * const env = new Environment({ loader: nodeFileLoader({ paths: ['./views'] }), cache: true });
 * const html = env.renderFile('page.tmpl', { title: 'Hello' });
 * ```
 */
export class Environment {
  private readonly loader: TemplateLoader | undefined;

  private readonly defaults: Omit<CompileOptions, 'filename' | 'loader'>;

  private readonly cache: TemplateCache | undefined;

  /** Identity of every loader a cache key has named */
  private readonly loaderIds = new WeakMap<TemplateLoader, number>();

  private loaderCount = 0;

  /**
   * @param options - Settings shared by every template this environment compiles
   */
  constructor(options: EnvironmentOptions = {}) {
    const { loader, cache, ...defaults } = options;

    this.loader = loader;
    this.defaults = defaults;
    this.cache = cache ? new TemplateCache(cache === true ? {} : cache) : undefined;
  }

  /**
   * Compile template text.
   *
   * @param source - Template text
   * @param options - Settings overriding the environment's own
   * @returns Compiled template
   */
  compile<T extends object = TemplateData>(source: string, options: CompileOptions = {}): Template<T> {
    return compile<T>(source, { ...this.settings(options), loader: this.loaderFor(options, true) });
  }

  /**
   * Compile a template read through the loader.
   *
   * @param name - Template name, resolved by the loader
   * @param options - Settings overriding the environment's own
   * @returns Compiled template
   * @throws Error when there is no loader, or it cannot answer synchronously
   */
  compileFile<T extends object = TemplateData>(name: string, options: CompileOptions = {}): Template<T> {
    const loader = required(this.loaderFor(options, true));

    const id = loader.resolve({ name, include: false });
    const key = this.cacheKey(id, options, loader);

    const cached = key === undefined ? undefined : this.lookup(key, loader);
    if (cached) return cached as Template<T>;

    const resource = loader.read(id);
    const template = compileEntry<T>(
      { id, text: resource.text, resource },
      { ...this.settings(options), filename: id, loader }
    );

    if (key !== undefined) {
      this.cache?.set(key, template, template.compiled.versions);
    }

    return template;
  }

  /**
   * Compile a template read through an asynchronous loader.
   *
   * @param name - Template name, resolved by the loader
   * @param options - Settings overriding the environment's own
   * @returns Compiled template
   */
  async compileFileAsync<T extends object = TemplateData>(
    name: string,
    options: AsyncCompileOptions = {}
  ): Promise<Template<T>> {
    const loader = required(this.loaderFor(options, false));
    const id = await loader.resolve({ name, include: false });
    const key = this.cacheKey(id, options, loader);

    const cached = key === undefined ? undefined : await this.lookupAsync(key, loader);
    if (cached) return cached as Template<T>;

    const resource = await loader.read(id);
    const template = await compileEntryAsync<T>(
      { id, text: resource.text, resource },
      { ...this.settings(options), filename: id, loader }
    );

    if (key !== undefined) {
      this.cache?.set(key, template, template.compiled.versions);
    }

    return template;
  }

  /**
   * Compile template text and render it.
   *
   * @param source - Template text
   * @param data - Values for the template's parameters
   * @param options - Compile and render settings
   * @returns Rendered text
   */
  render<T extends object = TemplateData>(
    source: string,
    data: T,
    options: CompileOptions & RenderOptions = {}
  ): string {
    return this.compile<T>(source, options).render(data, options);
  }

  /**
   * Render a template read through the loader.
   *
   * @param name - Template name, resolved by the loader
   * @param data - Values for the template's parameters
   * @param options - Compile and render settings
   * @returns Rendered text
   */
  renderFile<T extends object = TemplateData>(
    name: string,
    data: T,
    options: CompileOptions & RenderOptions = {}
  ): string {
    return this.compileFile<T>(name, options).render(data, options);
  }

  /**
   * Render a template read through an asynchronous loader.
   *
   * @param name - Template name, resolved by the loader
   * @param data - Values for the template's parameters
   * @param options - Compile and render settings
   * @returns Rendered text
   */
  async renderFileAsync<T extends object = TemplateData>(
    name: string,
    data: T,
    options: AsyncCompileOptions & RenderOptions = {}
  ): Promise<string> {
    return (await this.compileFileAsync<T>(name, options)).render(data, options);
  }

  /**
   * Drop every cached compilation.
   */
  clearCache(): void {
    this.cache?.clear();
  }

  /**
   * Number of compiled templates currently cached.
   *
   * @returns Entry count, zero when caching is off
   */
  get cacheSize(): number {
    return this.cache?.size ?? 0;
  }

  /**
   * Merge the environment's defaults with one call's overrides.
   *
   * @param options - Per-call settings
   * @returns Settings for the compiler, without a loader
   */
  private settings(options: CompileOptions | AsyncCompileOptions): Omit<CompileOptions, 'loader'> {
    const { loader: _loader, ...overrides } = options;
    return { ...this.defaults, ...overrides };
  }

  /**
   * Choose the loader for one call: the per-call override, else the
   * environment's own. Every method obtains its loader here.
   *
   * @param options - Per-call settings
   * @param sync - Whether the caller needs answers without a promise; an
   *   asynchronous loader is then swapped for one that fails on first use
   * @returns The loader, or undefined when none is configured
   */
  private loaderFor(options: { loader?: TemplateLoader }, sync: true): SyncTemplateLoader | undefined;
  private loaderFor(options: { loader?: TemplateLoader }, sync: false): TemplateLoader | undefined;
  private loaderFor(options: { loader?: TemplateLoader }, sync: boolean): TemplateLoader | undefined {
    const loader = options.loader ?? this.loader;
    return sync && loader && !loader.sync ? ASYNC_LOADER_GUARD : loader;
  }

  /**
   * Return a cached template if it is still current.
   *
   * @param key - Cache key
   * @param loader - Loader consulted for current versions
   * @returns Cached template, or undefined on a miss or a stale entry
   */
  private lookup(key: string, loader: SyncTemplateLoader): Template<object> | undefined {
    const entry = this.cache?.take(key);
    if (!entry) return undefined;

    if (this.cache?.revalidate && loader.version) {
      for (const [id, version] of staleCandidates(entry.versions)) {
        if (loader.version(id) !== version) {
          this.cache.delete(key);
          return undefined;
        }
      }
    }

    return entry.template;
  }

  /**
   * Return a cached template if it is still current, awaiting the loader.
   *
   * @param key - Cache key
   * @param loader - Loader consulted for current versions
   * @returns Cached template, or undefined on a miss or a stale entry
   */
  private async lookupAsync(key: string, loader: TemplateLoader): Promise<Template<object> | undefined> {
    const entry = this.cache?.take(key);
    if (!entry) return undefined;

    if (this.cache?.revalidate && loader.version) {
      for (const [id, version] of staleCandidates(entry.versions)) {
        if ((await loader.version(id)) !== version) {
          this.cache.delete(key);
          return undefined;
        }
      }
    }

    return entry.template;
  }

  /**
   * Build the cache key for one compilation.
   *
   * @param id - Canonical template id
   * @param options - Per-call settings
   * @param loader - Loader the template is read through
   * @returns Cache key, or undefined when the compilation must not be cached
   */
  private cacheKey(
    id: string,
    options: CompileOptions | AsyncCompileOptions,
    loader: TemplateLoader
  ): string | undefined {
    if (!this.cache) return undefined;

    const settings = this.settings(options);

    // A filter is a function, and a function has no identity that survives
    // being written into a key, so a filtered template is never reused: two
    // filters that differ would otherwise share an entry and one of the two
    // callers would get the wrong output.
    if (settings.filters?.length) return undefined;

    const includes = typeof settings.includes === 'object' ? settings.includes : {};

    return JSON.stringify([
      this.loaderId(loader),
      id,
      settings.strict ?? true,
      settings.caseSensitive ?? true,
      settings.globalVars ?? false,
      settings.defaultEscape ?? 'html',
      settings.legacy?.percentVars ?? false,
      settings.includes !== false,
      includes.maxDepth ?? 10,
      includes.onMissing ?? 'throw'
    ]);
  }

  /**
   * Number a loader for use in cache keys, so templates read through
   * different loaders never share an entry.
   *
   * @param loader - Loader
   * @returns Stable number for that loader
   */
  private loaderId(loader: TemplateLoader): number {
    let id = this.loaderIds.get(loader);
    if (id === undefined) {
      id = ++this.loaderCount;
      this.loaderIds.set(loader, id);
    }
    return id;
  }
}

/**
 * Insist on a loader for a method that reads templates by name.
 *
 * @param loader - Loader chosen for the call
 * @returns The loader
 * @throws Error when there is none
 */
function required<L extends TemplateLoader>(loader: L | undefined): L {
  if (!loader) {
    throw new Error(
      "This environment has no loader, so it cannot read templates by name; pass one as the 'loader' option"
    );
  }

  return loader;
}

/**
 * List the templates in a compilation whose version has to be checked.
 *
 * A version the loader never supplied is a statement that the template is
 * immutable, so there is nothing to compare it against.
 *
 * @param versions - Versions recorded when the template was compiled
 * @returns Entries worth revalidating
 */
function staleCandidates(versions: Versions): Array<[string, string]> {
  const candidates: Array<[string, string]> = [];

  for (const [id, version] of versions) {
    if (version !== undefined) candidates.push([id, version]);
  }

  return candidates;
}
