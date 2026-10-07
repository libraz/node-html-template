/**
 * Entry point tests
 *
 * The main entry has to stay free of Node built-ins: that is what lets the
 * library run somewhere without a filesystem, and a comment cannot enforce it.
 * The source graph is checked on every run, with no build; the built output is
 * checked as well when present, because what a consumer imports is the bundle.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };

const DIST = resolve(import.meta.dirname, '../../dist');
const built = existsSync(join(DIST, 'index.js'));

/**
 * Collect every module an entry pulls in, following relative imports.
 *
 * @param entry - Path to the built entry file
 * @returns Every reachable file, the entry included
 */
function reachable(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];

  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const [, specifier] of readFileSync(file, 'utf-8').matchAll(/from\s+["']([^"']+)["']/g)) {
      if (specifier?.startsWith('.')) pending.push(join(dirname(file), specifier));
    }
  }

  return [...seen];
}

/**
 * List the Node built-ins an entry imports, directly or through a chunk.
 *
 * @param entry - Path to the built entry file
 * @returns Built-in specifiers, deduplicated
 */
function builtins(entry: string): string[] {
  const found = new Set<string>();

  for (const file of reachable(entry)) {
    for (const [, specifier] of readFileSync(file, 'utf-8').matchAll(/from\s+["'](node:[^"']+)["']/g)) {
      if (specifier) found.add(specifier);
    }
  }

  return [...found].sort();
}

const SRC = resolve(import.meta.dirname, '../../src');

/** Matches `from 'x'`, bare `import 'x'` and `import('x')` specifiers. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

/**
 * Resolve a relative source specifier, which names a `.js` file that lives as `.ts`.
 *
 * @param from - File containing the import
 * @param specifier - Relative specifier as written
 * @returns Path of the source file
 */
function resolveSource(from: string, specifier: string): string {
  const base = join(dirname(from), specifier);
  const candidates = [base.replace(/\.js$/, '.ts'), `${base}.ts`, join(base, 'index.ts')];
  const found = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!found) throw new Error(`cannot resolve '${specifier}' imported from ${from}`);

  return found;
}

/**
 * Walk the source import graph from an entry and report what it imports.
 *
 * @param entry - Path to the entry source file
 * @returns Reachable source files and every non-relative specifier they use
 */
function sourceGraph(entry: string): { files: string[]; external: string[] } {
  const seen = new Set<string>();
  const external = new Set<string>();
  const pending = [entry];

  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const [, specifier] of readFileSync(file, 'utf-8').matchAll(SPECIFIER)) {
      if (!specifier) continue;
      if (specifier.startsWith('.')) pending.push(resolveSource(file, specifier));
      else external.add(specifier);
    }
  }

  return { files: [...seen], external: [...external].sort() };
}

describe('source entry graph', () => {
  it('reaches the whole root entry, so the check below is not vacuous', () => {
    const { files } = sourceGraph(join(SRC, 'index.ts'));

    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain(join(SRC, 'api/compile.ts'));
  });

  it('imports no node: module from the root entry', () => {
    expect(sourceGraph(join(SRC, 'index.ts')).external.filter((name) => name.startsWith('node:'))).toEqual([]);
  });

  it('imports no bare Node built-in from the root entry', () => {
    const { external } = sourceGraph(join(SRC, 'index.ts'));

    expect(external.filter((name) => builtinModules.includes(name.split('/')[0] as string))).toEqual([]);
  });

  it('confines the filesystem to the loaders entry', () => {
    expect(sourceGraph(join(SRC, 'loaders/index.ts')).external).toContain('node:fs');
  });
});

describe.skipIf(!built)('built entry points', () => {
  it('keeps Node built-ins out of the main entry', () => {
    expect(builtins(join(DIST, 'index.js'))).toEqual([]);
  });

  it('confines the filesystem to the loaders entry', () => {
    expect(builtins(join(DIST, 'loaders.js'))).toContain('node:fs');
  });

  it('ships every path the package advertises', () => {
    for (const target of Object.values(pkg.exports)) {
      const file = typeof target === 'string' ? target : target.import;
      expect(existsSync(resolve(import.meta.dirname, '../..', file))).toBe(true);
    }
  });

  it('ships an executable with a shebang', () => {
    const cli = resolve(import.meta.dirname, '../..', pkg.bin['html-template-codegen']);

    expect(readFileSync(cli, 'utf-8').startsWith('#!/usr/bin/env node\n')).toBe(true);
  });
});
