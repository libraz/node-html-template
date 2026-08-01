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
import { compile, compileAsync } from './compile.js';
import type { Template } from './Template.js';
import type { CompileOptions, RenderOptions, TemplateData } from './types.js';

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
  compile<T extends TemplateData = TemplateData>(source: string, options: CompileOptions = {}): Template<T> {
    return compile<T>(source, this.settings(options));
  }

  /**
   * Compile a template read through the loader.
   *
   * @param name - Template name, resolved by the loader
   * @param options - Settings overriding the environment's own
   * @returns Compiled template
   * @throws Error when the environment's loader cannot answer synchronously
   */
  compileFile<T extends TemplateData = TemplateData>(name: string, options: CompileOptions = {}): Template<T> {
    const loader = this.syncLoader();

    const id = loader.resolve({ name, include: false });
    const key = this.cacheKey(id, options);

    const cached = key === undefined ? undefined : this.lookup(key, loader);
    if (cached) return cached as Template<T>;

    const resource = loader.read(id);
    const template = compile<T>(resource.text, { ...this.settings(options), filename: id, loader });

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
  async compileFileAsync<T extends TemplateData = TemplateData>(
    name: string,
    options: CompileOptions = {}
  ): Promise<Template<T>> {
    const loader = this.requireLoader();
    const id = await loader.resolve({ name, include: false });
    const key = this.cacheKey(id, options);

    const cached = key === undefined ? undefined : await this.lookupAsync(key, loader);
    if (cached) return cached as Template<T>;

    const resource = await loader.read(id);
    const template = await compileAsync<T>(resource.text, { ...this.settings(options), filename: id, loader });

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
  render<T extends TemplateData = TemplateData>(
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
  renderFile<T extends TemplateData = TemplateData>(
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
  async renderFileAsync<T extends TemplateData = TemplateData>(
    name: string,
    data: T,
    options: CompileOptions & RenderOptions = {}
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
   * @returns Settings for the compiler
   */
  private settings(options: CompileOptions): CompileOptions {
    return { ...this.defaults, ...options, loader: (options.loader ?? this.loader) as SyncTemplateLoader | undefined };
  }

  /**
   * Return the configured loader.
   *
   * @returns The loader
   * @throws Error when the environment has none
   */
  private requireLoader(): TemplateLoader {
    if (!this.loader) {
      throw new Error(
        "This environment has no loader, so it cannot read templates by name; pass one as the 'loader' option"
      );
    }

    return this.loader;
  }

  /**
   * Assert that the loader can answer without a promise.
   *
   * @returns The loader, typed as synchronous
   * @throws Error when the loader is asynchronous
   */
  private syncLoader(): SyncTemplateLoader {
    const loader = this.requireLoader();

    if (!loader.sync) {
      throw new Error('This environment has an asynchronous loader; use compileFileAsync or renderFileAsync');
    }

    return loader as SyncTemplateLoader;
  }

  /**
   * Return a cached template if it is still current.
   *
   * @param key - Cache key
   * @param loader - Loader consulted for current versions
   * @returns Cached template, or undefined on a miss or a stale entry
   */
  private lookup(key: string, loader: SyncTemplateLoader): Template | undefined {
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
  private async lookupAsync(key: string, loader: TemplateLoader): Promise<Template | undefined> {
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
   * @returns Cache key, or undefined when the compilation must not be cached
   */
  private cacheKey(id: string, options: CompileOptions): string | undefined {
    if (!this.cache) return undefined;

    const settings = this.settings(options);

    // A filter is a function, and a function has no identity that survives
    // being written into a key, so a filtered template is never reused: two
    // filters that differ would otherwise share an entry and one of the two
    // callers would get the wrong output.
    if (settings.filters?.length) return undefined;
    if (settings.loader !== this.loader) return undefined;

    const includes = typeof settings.includes === 'object' ? settings.includes : {};

    return JSON.stringify([
      id,
      settings.strict ?? true,
      settings.caseSensitive ?? true,
      settings.globalVars ?? false,
      settings.defaultEscape ?? 'html',
      settings.legacy?.percentVars ?? false,
      settings.includes !== false,
      includes.maxDepth ?? 10,
      includes.onMissing ?? 'throw',
      includes.searchAllPaths ?? false,
      includes.paths ?? []
    ]);
  }
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
