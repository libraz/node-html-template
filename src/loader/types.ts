/**
 * Loader interface
 *
 * The compiler reaches templates only through a loader, so the core carries no
 * filesystem dependency and can run wherever a caller can supply text.
 *
 * @module loader/types
 */

/**
 * A template's text, as returned by a loader.
 */
export interface TemplateResource {
  /** Canonical identifier, used for cycle detection and cache keys */
  id: string;

  /** Decoded template text */
  text: string;

  /**
   * Opaque version identifier, compared verbatim to decide whether a cached
   * compilation is still valid.
   *
   * `undefined` is a promise from the loader that the resource never changes,
   * so a cache entry built from it stays valid forever. A loader backed by
   * mutable storage must return a value that changes whenever the text does.
   */
  version?: string;
}

/**
 * A request to turn a template name into a canonical id.
 */
export interface ResolveRequest {
  /** Name as written, either the entry template or a TMPL_INCLUDE target */
  name: string;

  /** Canonical id of the template referencing this one, if any */
  from?: string;

  /** Whether the request came from a TMPL_INCLUDE rather than the entry point */
  include: boolean;
}

/**
 * Source of template text.
 *
 * The `Sync` parameter is a type-level marker rather than a runtime switch: a
 * loader declaring `sync: true` promises every method returns a value
 * directly, which is what lets the synchronous compiler accept it and reject
 * loaders that can only answer with a promise.
 */
export interface TemplateLoader<Sync extends boolean = boolean> {
  /** Whether every method answers without a promise */
  readonly sync: Sync;

  /**
   * Turn a template name into a canonical id.
   *
   * @param request - Name to resolve and where it was referenced from
   * @returns Canonical id
   * @throws TemplateNotFoundError when no such template exists
   */
  resolve(request: ResolveRequest): Sync extends true ? string : string | Promise<string>;

  /**
   * Read a resolved template.
   *
   * @param id - Canonical id from {@link resolve}
   * @returns The template's text
   */
  read(id: string): Sync extends true ? TemplateResource : TemplateResource | Promise<TemplateResource>;

  /**
   * Report a resource's current version without reading it.
   *
   * Used to revalidate a cached compilation. Omit the method entirely when the
   * loader cannot tell versions apart; compilations from it are then cached
   * only for the lifetime of the process.
   *
   * @param id - Canonical id
   * @returns Current version, or undefined when the resource is immutable
   */
  version?(id: string): Sync extends true ? string | undefined : (string | undefined) | Promise<string | undefined>;
}

/**
 * A loader usable from the synchronous compiler.
 */
export type SyncTemplateLoader = TemplateLoader<true>;
