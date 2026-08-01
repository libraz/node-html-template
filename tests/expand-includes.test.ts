/**
 * Include expansion tests
 *
 * Exercises the expander directly against an in-memory loader, so the
 * structural rules — read-once, cycle detection, depth limiting, provenance —
 * are pinned without touching disk.
 */

import { describe, expect, it } from 'vitest';
import { type ExpandOptions, expandIncludes } from '../src/compile/expandIncludes.js';
import { memoryLoader } from '../src/loader/memory.js';
import type { SyncTemplateLoader } from '../src/loader/types.js';

/**
 * Build expansion settings over an in-memory set of templates.
 *
 * @param files - Template text keyed by name
 * @param overrides - Settings to override
 * @returns Expansion settings
 */
function options(files: Record<string, string>, overrides: Partial<ExpandOptions> = {}): ExpandOptions {
  return {
    loader: memoryLoader(files),
    maxDepth: 10,
    onMissing: 'throw',
    prepare: (text) => text,
    ...overrides
  };
}

/**
 * Wrap a loader to count how many times each template is read.
 *
 * @param loader - Loader to wrap
 * @param counts - Map receiving the per-id read counts
 * @returns Wrapped loader
 */
function counting(loader: SyncTemplateLoader, counts: Map<string, number>): SyncTemplateLoader {
  return {
    sync: true,
    resolve: (request) => loader.resolve(request),
    read: (id) => {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      return loader.read(id);
    },
    version: (id) => loader.version?.(id)
  };
}

describe('expandIncludes', () => {
  it('splices an include into the referencing text', () => {
    const result = expandIncludes('A<TMPL_INCLUDE NAME="child.tmpl">B', 'root.tmpl', options({ 'child.tmpl': 'C' }));

    expect(result.text).toBe('ACB');
  });

  it('expands three levels', () => {
    const result = expandIncludes(
      'top <TMPL_INCLUDE NAME="mid.tmpl">',
      'root.tmpl',
      options({
        'mid.tmpl': '(mid <TMPL_INCLUDE NAME="deep.tmpl">)',
        'deep.tmpl': '[deep]'
      })
    );

    expect(result.text).toBe('top (mid [deep])');
  });

  it('reads a template shared by several includes only once', () => {
    const counts = new Map<string, number>();
    const files = {
      'part.tmpl': 'x',
      'a.tmpl': '<TMPL_INCLUDE NAME="part.tmpl">',
      'b.tmpl': '<TMPL_INCLUDE NAME="part.tmpl">'
    };

    const result = expandIncludes(
      '<TMPL_INCLUDE NAME="a.tmpl"><TMPL_INCLUDE NAME="b.tmpl"><TMPL_INCLUDE NAME="part.tmpl">',
      'root.tmpl',
      { ...options(files), loader: counting(memoryLoader(files), counts) }
    );

    expect(result.text).toBe('xxx');
    expect(counts.get('part.tmpl')).toBe(1);
  });

  it('applies the prepare step to included text but not to the entry text', () => {
    const result = expandIncludes(
      'ROOT <TMPL_INCLUDE NAME="child.tmpl">',
      'root.tmpl',
      options({ 'child.tmpl': 'child' }, { prepare: (text) => text.toUpperCase() })
    );

    expect(result.text).toBe('ROOT CHILD');
  });

  it('reports where each stretch of the output came from', () => {
    const root = 'A<TMPL_INCLUDE NAME="child.tmpl">B';
    const result = expandIncludes(root, 'root.tmpl', options({ 'child.tmpl': 'C' }));

    expect(result.segments).toEqual([
      { outputStart: 0, id: 'root.tmpl', sourceStart: 0 },
      { outputStart: 1, id: 'child.tmpl', sourceStart: 0 },
      { outputStart: 2, id: 'root.tmpl', sourceStart: root.indexOf('B') }
    ]);
  });

  it('records the version of every template it drew on', () => {
    const result = expandIncludes('<TMPL_INCLUDE NAME="child.tmpl">', 'root.tmpl', options({ 'child.tmpl': 'C' }));

    expect([...result.versions.keys()].sort()).toEqual(['child.tmpl', 'root.tmpl']);
  });

  it('rejects a direct cycle', () => {
    expect(() => expandIncludes('<TMPL_INCLUDE NAME="self.tmpl">', 'self.tmpl', options({ 'self.tmpl': 'x' }))).toThrow(
      /likely recursive includes/
    );
  });

  it('rejects an indirect cycle', () => {
    expect(() =>
      expandIncludes(
        '<TMPL_INCLUDE NAME="a.tmpl">',
        'root.tmpl',
        options({
          'a.tmpl': '<TMPL_INCLUDE NAME="b.tmpl">',
          'b.tmpl': '<TMPL_INCLUDE NAME="a.tmpl">'
        })
      )
    ).toThrow(/likely recursive includes/);
  });

  it('allows the same template twice on separate branches', () => {
    const result = expandIncludes(
      '<TMPL_INCLUDE NAME="a.tmpl"><TMPL_INCLUDE NAME="a.tmpl">',
      'root.tmpl',
      options({ 'a.tmpl': 'x' })
    );

    expect(result.text).toBe('xx');
  });

  it('enforces the depth limit', () => {
    const files = {
      'one.tmpl': '<TMPL_INCLUDE NAME="two.tmpl">',
      'two.tmpl': '<TMPL_INCLUDE NAME="three.tmpl">',
      'three.tmpl': 'end'
    };

    expect(() =>
      expandIncludes('<TMPL_INCLUDE NAME="one.tmpl">', 'root.tmpl', options(files, { maxDepth: 2 }))
    ).toThrow(/parsed 2 files deep/);

    expect(expandIncludes('<TMPL_INCLUDE NAME="one.tmpl">', 'root.tmpl', options(files, { maxDepth: 0 })).text).toBe(
      'end'
    );
  });

  it('drops a missing include when told to ignore it', () => {
    const result = expandIncludes(
      'before<TMPL_INCLUDE NAME="absent.tmpl">after',
      'root.tmpl',
      options({}, { onMissing: 'ignore' })
    );

    expect(result.text).toBe('beforeafter');
  });

  it('still enforces depth and cycles when missing includes are ignored', () => {
    expect(() =>
      expandIncludes(
        '<TMPL_INCLUDE NAME="self.tmpl">',
        'self.tmpl',
        options({ 'self.tmpl': 'x' }, { onMissing: 'ignore' })
      )
    ).toThrow(/likely recursive includes/);
  });

  it('leaves a template without includes untouched', () => {
    const result = expandIncludes('plain text', 'root.tmpl', options({}));

    expect(result.text).toBe('plain text');
    expect(result.segments).toHaveLength(1);
  });
});
