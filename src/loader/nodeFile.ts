/**
 * Filesystem loader
 *
 * The only place the template pipeline touches `node:fs`. Everything the old
 * resolver read from the ambient environment — `HTML_TEMPLATE_ROOT` and the
 * working directory — is captured once when the loader is built, so resolution
 * cannot shift under a long-lived process.
 *
 * @module loader/nodeFile
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parseOpenMode } from '../utils/encoding.js';
import { TemplateNotFoundError } from './errors.js';
import type { ResolveRequest, SyncTemplateLoader, TemplateResource } from './types.js';

/**
 * Settings for {@link nodeFileLoader}.
 */
export interface NodeFileLoaderOptions {
  /** Directories searched for template files */
  paths?: readonly string[];

  /**
   * Search the configured paths for includes too, rather than resolving them
   * relative to the file that referenced them.
   */
  searchAllPaths?: boolean;

  /**
   * Prefix prepended to the search paths.
   * Defaults to the HTML_TEMPLATE_ROOT environment variable.
   */
  root?: string;

  /** Working directory used as the last resort. Defaults to the process cwd. */
  cwd?: string;

  /**
   * Encoding used to decode files, in either Node or Perl spelling
   * (`utf-8`, `<:encoding(utf8)`, `:raw`). Defaults to UTF-8.
   */
  encoding?: string;
}

/**
 * Create a loader that reads templates from the filesystem.
 *
 * Resolution follows Perl HTML::Template: an absolute name is used as given,
 * and a relative one is looked up in the directory of the referencing file
 * (unless `searchAllPaths` is set), then under the root, then the configured
 * paths, then the working directory, and finally each path under the root.
 *
 * @param options - Loader settings
 * @returns Synchronous loader
 */
export function nodeFileLoader(options: NodeFileLoaderOptions = {}): SyncTemplateLoader {
  const paths = [...(options.paths ?? [])];
  const searchAllPaths = options.searchAllPaths ?? false;
  const root = options.root ?? process.env.HTML_TEMPLATE_ROOT;
  const cwd = options.cwd ?? process.cwd();
  const encoding: BufferEncoding = options.encoding ? parseOpenMode(options.encoding) : 'utf-8';

  return {
    sync: true,

    resolve(request: ResolveRequest): string {
      if (isAbsolute(request.name)) {
        if (isFile(request.name)) return request.name;
        throw new TemplateNotFoundError(request.name);
      }

      for (const directory of searchDirectories(request)) {
        const candidate = resolve(directory, request.name);
        if (isFile(candidate)) return candidate;
      }

      throw new TemplateNotFoundError(request.name);
    },

    read(id: string): TemplateResource {
      return { id, text: readFileSync(id, { encoding }), version: versionOf(id) };
    },

    version(id: string): string | undefined {
      return versionOf(id);
    }
  };

  /**
   * List the directories to search for a relative name, in order.
   *
   * @param request - Name being resolved
   * @returns Directories, most specific first
   */
  function searchDirectories(request: ResolveRequest): string[] {
    const directories: string[] = [];

    if (request.from && !searchAllPaths) {
      directories.push(dirname(request.from));
    }
    if (root) {
      directories.push(root);
    }
    directories.push(...paths, cwd);
    if (root) {
      directories.push(...paths.map((path) => join(root, path)));
    }

    return directories;
  }
}

/**
 * Report whether a path names an existing regular file.
 *
 * @param path - Path to test
 * @returns True when the path is a file
 */
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Build a version identifier for a file.
 *
 * Size is folded in alongside the modification time because two writes within
 * the same millisecond share an mtime.
 *
 * @param path - Path to stat
 * @returns Version string, or undefined when the file cannot be stat'd
 */
function versionOf(path: string): string | undefined {
  try {
    const stats = statSync(path);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return undefined;
  }
}
