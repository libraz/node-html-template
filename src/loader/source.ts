/**
 * Template source loading
 *
 * Resolves whichever of `filename` / `scalarref` / `arrayref` / `filehandle`
 * (or the `type` + `source` pair) was given into raw template text.
 *
 * @module loader/source
 */

import type { Readable } from 'node:stream';
import type { HTMLTemplateOptions } from '../types.js';
import { createError } from '../utils/helpers.js';
import type { SyncTemplateLoader } from './types.js';

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
 * @param loader - Source of template files
 * @returns Template text and resolved filename
 * @throws Error when no usable source is configured
 */
export function loadTemplateSource(options: Required<HTMLTemplateOptions>, loader: SyncTemplateLoader): LoadedSource {
  if (options.type && options.source !== undefined) {
    return loadFromTypedSource(options, loader);
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
    return loadFromFile(options.filename, loader);
  }

  throw createError('No template source specified (need filename, scalarref, arrayref, or filehandle)');
}

/**
 * Resolve the `type` + `source` option pair.
 *
 * @param options - Normalized options
 * @param loader - Source of template files
 * @returns Template text and resolved filename
 */
function loadFromTypedSource(options: Required<HTMLTemplateOptions>, loader: SyncTemplateLoader): LoadedSource {
  const { type, source } = options;

  switch (type) {
    case 'filename':
      return loadFromFile(source as string, loader);
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
 * Resolve and read the entry template through the loader.
 *
 * @param filename - Filename to resolve and read
 * @param loader - Source of template files
 * @returns Template text and the id it was read from
 */
function loadFromFile(filename: string, loader: SyncTemplateLoader): Required<LoadedSource> {
  const id = loader.resolve({ name: filename, include: false });

  return { source: loader.read(id).text, filename: id };
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
