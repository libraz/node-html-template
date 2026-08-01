/**
 * Entry point tests
 *
 * The main entry has to stay free of Node built-ins: that is what lets the
 * library run somewhere without a filesystem, and a comment cannot enforce it.
 * The check runs against the built output, because what a consumer imports is
 * the bundle, not the source.
 */

import { existsSync, readFileSync } from 'node:fs';
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
