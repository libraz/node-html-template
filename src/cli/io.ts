/**
 * Node bindings for the command
 *
 * The only part of the command that knows about the filesystem or the process.
 *
 * @module cli/io
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import type { CommandIO } from './run.js';

/**
 * Build the command's bindings on top of Node.
 *
 * @param write - Writes a line to standard output
 * @param writeError - Writes a line to standard error
 * @returns Bindings
 */
export function nodeIO(write: (text: string) => void, writeError: (text: string) => void): CommandIO {
  return {
    out: write,
    err: writeError,

    readFile: (path) => readFileSync(path, 'utf-8'),

    writeFile: (path, text) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text, 'utf-8');
    },

    exists: (path) => existsSync(path),

    isDirectory: (path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },

    listFiles: (path) =>
      readdirSync(path, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(path, join(entry.parentPath, entry.name))),

    join,
    stem: (path) => basename(path, extname(path)),
    extension: (path) => extname(path),
    directory: (path) => dirname(path)
  };
}
