/**
 * Include expansion tests
 *
 * Exercises the expander directly against an in-memory loader, so the
 * structural rules — read-once, cycle detection, depth limiting, provenance —
 * are pinned without touching disk.
 */

import { describe, expect, it } from 'vitest';
import { type ExpandOptions, expandIncludes, expandIncludesAsync } from '../src/compile/expandIncludes.js';
import { memoryLoader } from '../src/loader/memory.js';
import type { SyncTemplateLoader, TemplateLoader } from '../src/loader/types.js';

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
    filter: (text) => text,
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
    const result = expandIncludes(
      { id: 'root.tmpl', text: 'A<TMPL_INCLUDE NAME="child.tmpl">B' },
      options({ 'child.tmpl': 'C' })
    );

    expect(result.text).toBe('ACB');
  });

  it('expands three levels', () => {
    const result = expandIncludes(
      { id: 'root.tmpl', text: 'top <TMPL_INCLUDE NAME="mid.tmpl">' },
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
      {
        id: 'root.tmpl',
        text: '<TMPL_INCLUDE NAME="a.tmpl"><TMPL_INCLUDE NAME="b.tmpl"><TMPL_INCLUDE NAME="part.tmpl">'
      },
      { ...options(files), loader: counting(memoryLoader(files), counts) }
    );

    expect(result.text).toBe('xxx');
    expect(counts.get('part.tmpl')).toBe(1);
  });

  it('applies the filter to the entry text and to every included text', () => {
    const result = expandIncludes(
      { id: 'root.tmpl', text: 'root <TMPL_INCLUDE NAME="child.tmpl">' },
      options({ 'child.tmpl': 'leaf' }, { filter: (text) => text.replace(/root|leaf/g, (word) => word.toUpperCase()) })
    );

    expect(result.text).toBe('ROOT LEAF');
  });

  it('reports where each stretch of the output came from', () => {
    const root = 'A<TMPL_INCLUDE NAME="child.tmpl">B';
    const result = expandIncludes({ id: 'root.tmpl', text: root }, options({ 'child.tmpl': 'C' }));

    expect(result.segments).toEqual([
      { outputStart: 0, id: 'root.tmpl', sourceStart: 0 },
      { outputStart: 1, id: 'child.tmpl', sourceStart: 0 },
      { outputStart: 2, id: 'root.tmpl', sourceStart: root.indexOf('B') }
    ]);
  });

  it('records the version of every template read through the loader', () => {
    const files = { 'root.tmpl': '<TMPL_INCLUDE NAME="child.tmpl">', 'child.tmpl': 'C' };
    const resource = memoryLoader(files).read('root.tmpl');
    const result = expandIncludes({ id: 'root.tmpl', text: resource.text, resource }, options(files));

    expect([...result.versions.keys()].sort()).toEqual(['child.tmpl', 'root.tmpl']);
  });

  it('records no version for entry text the caller supplied', () => {
    const result = expandIncludes(
      { id: 'root.tmpl', text: '<TMPL_INCLUDE NAME="child.tmpl">' },
      options({ 'child.tmpl': 'C' })
    );

    expect([...result.versions.keys()]).toEqual(['child.tmpl']);
  });

  it('takes each version from the read that produced the text, not a later query', () => {
    let generation = 0;
    const inner = memoryLoader({ 'root.tmpl': '<TMPL_INCLUDE NAME="child.tmpl">', 'child.tmpl': 'C' });
    const loader: SyncTemplateLoader = {
      sync: true,
      resolve: (request) => inner.resolve(request),
      read: (id) => ({ ...inner.read(id), version: `read-${generation}` }),
      version: () => `later-${++generation}`
    };

    const resource = loader.read('root.tmpl');
    const result = expandIncludes({ id: 'root.tmpl', text: resource.text, resource }, { ...options({}), loader });

    expect(Object.fromEntries(result.versions)).toEqual({ 'root.tmpl': 'read-0', 'child.tmpl': 'read-0' });
  });

  it('rejects a direct cycle', () => {
    expect(() =>
      expandIncludes({ id: 'self.tmpl', text: '<TMPL_INCLUDE NAME="self.tmpl">' }, options({ 'self.tmpl': 'x' }))
    ).toThrow(/likely recursive includes/);
  });

  it('rejects an indirect cycle', () => {
    expect(() =>
      expandIncludes(
        { id: 'root.tmpl', text: '<TMPL_INCLUDE NAME="a.tmpl">' },
        options({
          'a.tmpl': '<TMPL_INCLUDE NAME="b.tmpl">',
          'b.tmpl': '<TMPL_INCLUDE NAME="a.tmpl">'
        })
      )
    ).toThrow(/likely recursive includes/);
  });

  it('allows the same template twice on separate branches', () => {
    const result = expandIncludes(
      { id: 'root.tmpl', text: '<TMPL_INCLUDE NAME="a.tmpl"><TMPL_INCLUDE NAME="a.tmpl">' },
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
      expandIncludes({ id: 'root.tmpl', text: '<TMPL_INCLUDE NAME="one.tmpl">' }, options(files, { maxDepth: 2 }))
    ).toThrow(/parsed 2 files deep/);

    expect(
      expandIncludes({ id: 'root.tmpl', text: '<TMPL_INCLUDE NAME="one.tmpl">' }, options(files, { maxDepth: 0 })).text
    ).toBe('end');
  });

  it('drops a missing include when told to ignore it', () => {
    const result = expandIncludes(
      { id: 'root.tmpl', text: 'before<TMPL_INCLUDE NAME="absent.tmpl">after' },
      options({}, { onMissing: 'ignore' })
    );

    expect(result.text).toBe('beforeafter');
  });

  it('still enforces depth and cycles when missing includes are ignored', () => {
    expect(() =>
      expandIncludes(
        { id: 'self.tmpl', text: '<TMPL_INCLUDE NAME="self.tmpl">' },
        options({ 'self.tmpl': 'x' }, { onMissing: 'ignore' })
      )
    ).toThrow(/likely recursive includes/);
  });

  it('leaves a template without includes untouched', () => {
    const result = expandIncludes({ id: 'root.tmpl', text: 'plain text' }, options({}));

    expect(result.text).toBe('plain text');
    expect(result.segments).toHaveLength(1);
  });
});

/**
 * Wrap a loader so every method answers with a promise.
 *
 * @param loader - Loader to wrap
 * @param onRead - Called with the id whenever a read starts
 * @returns Asynchronous loader
 */
function deferred(loader: SyncTemplateLoader, onRead?: (id: string) => void): TemplateLoader {
  return {
    sync: false,
    resolve: async (request) => loader.resolve(request),
    read: async (id) => {
      onRead?.(id);
      await Promise.resolve();
      return loader.read(id);
    },
    version: async (id) => loader.version?.(id)
  };
}

describe('expandIncludesAsync', () => {
  const FIXTURES: Array<{ name: string; root: string; files: Record<string, string> }> = [
    { name: 'no includes', root: 'plain', files: {} },
    { name: 'single include', root: 'A<TMPL_INCLUDE NAME="c.tmpl">B', files: { 'c.tmpl': 'C' } },
    {
      name: 'three levels',
      root: 'top <TMPL_INCLUDE NAME="mid.tmpl">',
      files: { 'mid.tmpl': '(mid <TMPL_INCLUDE NAME="deep.tmpl">)', 'deep.tmpl': '[deep]' }
    },
    {
      name: 'shared include',
      root: '<TMPL_INCLUDE NAME="a.tmpl"><TMPL_INCLUDE NAME="b.tmpl">',
      files: { 'a.tmpl': '<TMPL_INCLUDE NAME="p.tmpl">', 'b.tmpl': '<TMPL_INCLUDE NAME="p.tmpl">', 'p.tmpl': 'x' }
    },
    {
      name: 'include inside a loop',
      root: '<TMPL_LOOP rows><TMPL_INCLUDE NAME="row.tmpl"></TMPL_LOOP>',
      files: { 'row.tmpl': '<TMPL_VAR NAME="cell">' }
    }
  ];

  // The point of the split is that only the reading pass differs; assembly is
  // the same code, so the two entry points must agree exactly.
  for (const fixture of FIXTURES) {
    it(`matches the synchronous result: ${fixture.name}`, async () => {
      const sync = expandIncludes({ id: 'root.tmpl', text: fixture.root }, options(fixture.files));
      const async = await expandIncludesAsync(
        { id: 'root.tmpl', text: fixture.root },
        {
          ...options(fixture.files),
          loader: deferred(memoryLoader(fixture.files))
        }
      );

      expect(async.text).toBe(sync.text);
      expect(async.segments).toEqual(sync.segments);
      expect([...async.versions.keys()].sort()).toEqual([...sync.versions.keys()].sort());
    });
  }

  it('reads each level concurrently rather than one template at a time', async () => {
    const files = {
      'a.tmpl': 'a',
      'b.tmpl': 'b',
      'c.tmpl': 'c'
    };

    let inFlight = 0;
    let peak = 0;
    const loader = deferred(memoryLoader(files), () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
    });

    await expandIncludesAsync(
      { id: 'root.tmpl', text: '<TMPL_INCLUDE NAME="a.tmpl"><TMPL_INCLUDE NAME="b.tmpl"><TMPL_INCLUDE NAME="c.tmpl">' },
      { ...options(files), loader }
    );

    expect(peak).toBe(3);
  });

  it('rejects a cycle', async () => {
    const files = { 'a.tmpl': '<TMPL_INCLUDE NAME="b.tmpl">', 'b.tmpl': '<TMPL_INCLUDE NAME="a.tmpl">' };

    await expect(
      expandIncludesAsync(
        { id: 'root.tmpl', text: '<TMPL_INCLUDE NAME="a.tmpl">' },
        {
          ...options(files),
          loader: deferred(memoryLoader(files))
        }
      )
    ).rejects.toThrow(/likely recursive includes/);
  });

  it('drops a missing include when told to ignore it', async () => {
    const result = await expandIncludesAsync(
      { id: 'root.tmpl', text: 'before<TMPL_INCLUDE NAME="absent.tmpl">after' },
      {
        ...options({}, { onMissing: 'ignore' }),
        loader: deferred(memoryLoader({}))
      }
    );

    expect(result.text).toBe('beforeafter');
  });
});
