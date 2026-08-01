/**
 * Template source loading
 *
 * Resolves whichever of `filename` / `scalarref` / `arrayref` / `filehandle`
 * (or the `type` + `source` pair) was given into raw template text.
 *
 * @module loader/source
 */

import { readFileSync } from 'node:fs';
import type { Readable } from 'node:stream';
import type { HTMLTemplateOptions } from '../types.js';
import { parseOpenMode, readFileWithEncoding } from '../utils/encoding.js';
import { resolveFile } from '../utils/FileResolver.js';
import { createError } from '../utils/helpers.js';

/**
 * Loaded template text, plus the file it came from when it came from disk.
 */
export interface LoadedSource {
  source: string;
  filename?: string;
}

/**
 * Load the template text described by the options.
 *
 * @param options - Normalized options
 * @returns Template text and resolved filename
 * @throws Error when no usable source is configured
 */
export function loadTemplateSource(options: Required<HTMLTemplateOptions>): LoadedSource {
  if (options.type && options.source !== undefined) {
    return loadFromTypedSource(options);
  }

  if (options.scalarref !== undefined) {
    return { source: options.scalarref };
  }

  if (options.arrayref !== undefined) {
    return { source: options.arrayref.join('') };
  }

  if (options.filehandle !== undefined) {
    return { source: readStream(options.filehandle) };
  }

  if (options.filename !== undefined) {
    return loadFromFile(options.filename, options);
  }

  throw createError('No template source specified (need filename, scalarref, arrayref, or filehandle)');
}

/**
 * Resolve the `type` + `source` option pair.
 *
 * @param options - Normalized options
 * @returns Template text and resolved filename
 */
function loadFromTypedSource(options: Required<HTMLTemplateOptions>): LoadedSource {
  const { type, source } = options;

  switch (type) {
    case 'filename':
      return loadFromFile(source as string, options);
    case 'scalarref':
      return { source: source as string };
    case 'arrayref':
      return { source: (source as string[]).join('') };
    case 'filehandle':
      return { source: readStream(source as Readable) };
    default:
      throw createError(`Unknown template type: ${type}`);
  }
}

/**
 * Read a template file, honouring `utf8` / `open_mode`.
 *
 * @param filename - Filename to resolve and read
 * @param options - Normalized options
 * @returns Template text and the path it was read from
 */
function loadFromFile(filename: string, options: Required<HTMLTemplateOptions>): Required<LoadedSource> {
  const resolved = resolveFile(filename, {
    path: options.path,
    searchPathOnInclude: options.search_path_on_include
  });

  return {
    source: readTemplateFile(resolved.filepath, options),
    filename: resolved.filepath
  };
}

/**
 * Read a resolved template file with the configured encoding.
 *
 * Shared with the include pipeline so a template and its includes are always
 * decoded the same way.
 *
 * @param filepath - Absolute path to read
 * @param options - Options carrying `utf8` / `open_mode`
 * @returns File contents
 */
export function readTemplateFile(filepath: string, options: HTMLTemplateOptions): string {
  if (options.utf8) {
    return readFileWithEncoding(filepath, 'utf-8');
  }
  if (options.open_mode) {
    return readFileWithEncoding(filepath, parseOpenMode(options.open_mode));
  }
  return readFileSync(filepath, 'utf-8');
}

/**
 * Drain a readable stream synchronously.
 *
 * @param stream - Stream to read
 * @returns Stream contents decoded as UTF-8
 */
function readStream(stream: Readable): string {
  const chunks: Buffer[] = [];

  let chunk = stream.read() as Buffer | null;
  while (chunk !== null) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    chunk = stream.read() as Buffer | null;
  }

  return Buffer.concat(chunks).toString('utf-8');
}
