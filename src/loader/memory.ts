/**
 * In-memory loader
 *
 * Serves templates from a plain map, with no filesystem access, which is what
 * makes the compiler usable on runtimes that have no `node:fs` — and what lets
 * tests exercise includes without touching disk.
 *
 * @module loader/memory
 */

import { TemplateNotFoundError } from './errors.js';
import type { ResolveRequest, SyncTemplateLoader, TemplateResource } from './types.js';

/**
 * Create a loader backed by an in-memory map of template text.
 *
 * The map is copied on construction, so the loader's templates are immutable
 * and compilations from it stay valid indefinitely.
 *
 * An include is resolved against the directory of the referencing template
 * first, then against the bare name, so a flat map and a nested one both work.
 *
 * @param files - Template text keyed by name
 * @returns Synchronous loader
 */
export function memoryLoader(
  files: Readonly<Record<string, string>> | ReadonlyMap<string, string>
): SyncTemplateLoader {
  const entries = files instanceof Map ? new Map(files) : new Map(Object.entries(files as Record<string, string>));

  return {
    sync: true,

    resolve(request: ResolveRequest): string {
      for (const candidate of candidates(request)) {
        if (entries.has(candidate)) return candidate;
      }

      throw new TemplateNotFoundError(request.name);
    },

    read(id: string): TemplateResource {
      const text = entries.get(id);
      if (text === undefined) {
        throw new TemplateNotFoundError(id);
      }

      return { id, text };
    },

    version(): undefined {
      return undefined;
    }
  };
}

/**
 * List the keys a request could name, in order.
 *
 * @param request - Name being resolved
 * @returns Candidate keys, most specific first
 */
function candidates(request: ResolveRequest): string[] {
  if (!request.from) {
    return [normalize(request.name)];
  }

  const directory = directoryOf(request.from);
  const relative = directory ? normalize(`${directory}/${request.name}`) : normalize(request.name);

  return relative === normalize(request.name) ? [relative] : [relative, normalize(request.name)];
}

/**
 * Strip the last segment from a key.
 *
 * @param key - Template key
 * @returns Directory portion, or an empty string for a top-level key
 */
function directoryOf(key: string): string {
  const index = key.lastIndexOf('/');
  return index === -1 ? '' : key.slice(0, index);
}

/**
 * Collapse `.` and `..` segments and any leading `./`.
 *
 * @param key - Template key
 * @returns Normalized key
 */
function normalize(key: string): string {
  const segments: string[] = [];

  for (const segment of key.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments.join('/');
}
