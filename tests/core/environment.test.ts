/**
 * Environment tests
 *
 * The environment is where a long-lived process configures the library once:
 * one loader, one set of compile defaults, one cache. Most of what is worth
 * pinning here is the cache — when an entry may be reused, and when reusing it
 * would hand a caller the wrong template.
 */

import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IncludeOptions, SyncTemplateLoader, TemplateLoader, TemplateResource } from '../../src/index.js';
import { Environment, memoryLoader } from '../../src/index.js';
import { nodeFileLoader } from '../../src/loaders/index.js';

let directory: string;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'html-template-env-'));
  writeFileSync(join(directory, 'page.tmpl'), 'Hello <TMPL_VAR NAME="name">');
  writeFileSync(join(directory, 'outer.tmpl'), 'A<TMPL_INCLUDE NAME="part.tmpl">B');
  writeFileSync(join(directory, 'part.tmpl'), 'C');
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

/**
 * Give a file a modification time far enough ahead to be unambiguous.
 *
 * @param path - File to touch
 */
function touchFuture(path: string): void {
  const future = new Date(Date.now() + 5000);
  utimesSync(path, future, future);
}

describe('Environment', () => {
  it('compiles template text with its defaults applied', () => {
    const env = new Environment({ defaultEscape: 'none' });

    expect(env.render('<TMPL_VAR NAME="x">', { x: '<b>' })).toBe('<b>');
  });

  it('lets a call override a default', () => {
    const env = new Environment({ defaultEscape: 'none' });

    expect(env.render('<TMPL_VAR NAME="x">', { x: '<b>' }, { defaultEscape: 'html' })).toBe('&lt;b&gt;');
  });

  it('reads a template through the loader', () => {
    const env = new Environment({ loader: nodeFileLoader({ paths: [directory] }) });

    expect(env.renderFile('page.tmpl', { name: 'World' })).toBe('Hello World');
  });

  it('resolves an include relative to the template that referenced it', () => {
    const env = new Environment({ loader: nodeFileLoader({ paths: [directory] }) });

    expect(env.renderFile('outer.tmpl', {})).toBe('ACB');
  });

  it('reports the template name in errors', () => {
    const env = new Environment({ loader: memoryLoader({ 'broken.tmpl': '<TMPL_VAR>' }) });

    expect(() => env.compileFile('broken.tmpl')).toThrow(/broken\.tmpl/);
  });

  it('rejects reading by name without a loader', () => {
    const env = new Environment();

    expect(() => env.compileFile('page.tmpl')).toThrow(/no loader/);
  });

  it('rejects a synchronous call on an asynchronous loader', () => {
    const env = new Environment({ loader: asyncLoader({ 'page.tmpl': 'x' }) });

    expect(() => env.compileFile('page.tmpl')).toThrow(/compileFileAsync/);
  });

  it('rejects an unknown default escape instead of rendering unescaped', () => {
    const env = new Environment({ defaultEscape: 'htm' as never });

    expect(() => env.render('<TMPL_VAR NAME="x">', { x: '<b>' })).toThrow(/Invalid defaultEscape "htm"/);
  });
});

describe('Environment caching', () => {
  it('is off unless asked for', () => {
    const env = new Environment({ loader: nodeFileLoader({ paths: [directory] }) });

    expect(env.compileFile('page.tmpl')).not.toBe(env.compileFile('page.tmpl'));
    expect(env.cacheSize).toBe(0);
  });

  it('reuses a compiled template', () => {
    const env = new Environment({ loader: nodeFileLoader({ paths: [directory] }), cache: true });

    expect(env.compileFile('page.tmpl')).toBe(env.compileFile('page.tmpl'));
    expect(env.cacheSize).toBe(1);
  });

  it('recompiles after the template changes', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'html-template-env-cache-'));
    const file = join(scratch, 'changing.tmpl');
    writeFileSync(file, 'before');

    const env = new Environment({ loader: nodeFileLoader({ paths: [scratch] }), cache: true });
    expect(env.renderFile('changing.tmpl', {})).toBe('before');

    writeFileSync(file, 'after');
    touchFuture(file);

    expect(env.renderFile('changing.tmpl', {})).toBe('after');

    rmSync(scratch, { recursive: true, force: true });
  });

  it('recompiles after an included template changes', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'html-template-env-include-cache-'));
    writeFileSync(join(scratch, 'root.tmpl'), '[<TMPL_INCLUDE NAME="child.tmpl">]');
    writeFileSync(join(scratch, 'child.tmpl'), 'before');

    const env = new Environment({ loader: nodeFileLoader({ paths: [scratch] }), cache: true });
    expect(env.renderFile('root.tmpl', {})).toBe('[before]');

    writeFileSync(join(scratch, 'child.tmpl'), 'after');
    touchFuture(join(scratch, 'child.tmpl'));

    expect(env.renderFile('root.tmpl', {})).toBe('[after]');

    rmSync(scratch, { recursive: true, force: true });
  });

  it('serves a stale template when revalidation is turned off', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'html-template-env-blind-'));
    const file = join(scratch, 'blind.tmpl');
    writeFileSync(file, 'before');

    const env = new Environment({ loader: nodeFileLoader({ paths: [scratch] }), cache: { revalidate: false } });
    expect(env.renderFile('blind.tmpl', {})).toBe('before');

    writeFileSync(file, 'after');
    touchFuture(file);

    expect(env.renderFile('blind.tmpl', {})).toBe('before');

    rmSync(scratch, { recursive: true, force: true });
  });

  it('keeps compilations under different settings apart', () => {
    const env = new Environment({ loader: nodeFileLoader({ paths: [directory] }), cache: true });

    const escaped = env.compileFile('page.tmpl', { defaultEscape: 'html' });
    const raw = env.compileFile('page.tmpl', { defaultEscape: 'none' });

    expect(escaped).not.toBe(raw);
    expect(escaped.render({ name: '<b>' })).toBe('Hello &lt;b&gt;');
    expect(raw.render({ name: '<b>' })).toBe('Hello <b>');
  });

  // A filter rewrites the source, and a function carries no identity a key can
  // record, so caching one would let two different filters share an entry.
  it('never reuses a filtered compilation', () => {
    const env = new Environment({ loader: nodeFileLoader({ paths: [directory] }), cache: true });

    const upper = env.compileFile('page.tmpl', {
      filters: [{ sub: (content) => (content as string).replace('Hello', 'Hi') }]
    });

    expect(upper.render({ name: 'x' })).toBe('Hi x');
    expect(env.cacheSize).toBe(0);
  });

  it('drops the least recently used entry past the limit', () => {
    const env = new Environment({
      loader: memoryLoader({ 'a.tmpl': 'a', 'b.tmpl': 'b', 'c.tmpl': 'c' }),
      cache: { maxSize: 2 }
    });

    const first = env.compileFile('a.tmpl');
    env.compileFile('b.tmpl');
    env.compileFile('c.tmpl');

    expect(env.cacheSize).toBe(2);
    expect(env.compileFile('a.tmpl')).not.toBe(first);
  });

  it('reuses an entry from a loader that reports no version', () => {
    const env = new Environment({ loader: memoryLoader({ 'a.tmpl': 'a' }), cache: true });

    expect(env.compileFile('a.tmpl')).toBe(env.compileFile('a.tmpl'));
  });

  it('forgets everything on demand', () => {
    const env = new Environment({ loader: nodeFileLoader({ paths: [directory] }), cache: true });
    const before = env.compileFile('page.tmpl');

    env.clearCache();

    expect(env.cacheSize).toBe(0);
    expect(env.compileFile('page.tmpl')).not.toBe(before);
  });
});

describe('Environment with an asynchronous loader', () => {
  it('compiles through it', async () => {
    const env = new Environment({ loader: asyncLoader({ 'page.tmpl': 'Hello <TMPL_VAR NAME="name">' }) });

    expect(await env.renderFileAsync('page.tmpl', { name: 'World' })).toBe('Hello World');
  });

  it('caches across calls', async () => {
    const env = new Environment({ loader: asyncLoader({ 'page.tmpl': 'x' }), cache: true });

    expect(await env.compileFileAsync('page.tmpl')).toBe(await env.compileFileAsync('page.tmpl'));
  });

  it('recompiles when the reported version changes', async () => {
    const files = { 'page.tmpl': 'before' };
    const versions = new Map<string, string>([['page.tmpl', 'v1']]);
    const inner = memoryLoader(files);

    const loader: TemplateLoader = {
      sync: false,
      resolve: async (request) => inner.resolve(request),
      read: async (id) => ({ id, text: files[id as keyof typeof files], version: versions.get(id) }),
      version: async (id) => versions.get(id)
    };

    const env = new Environment({ loader, cache: true });
    expect(await env.renderFileAsync('page.tmpl', {})).toBe('before');

    files['page.tmpl'] = 'after';
    versions.set('page.tmpl', 'v2');

    expect(await env.renderFileAsync('page.tmpl', {})).toBe('after');
  });
});

describe('Environment loader selection', () => {
  /**
   * Wrap an asynchronous loader so any call on it fails the test.
   *
   * @returns Loader that must never be called
   */
  function untouchable(): TemplateLoader {
    const fail = (): never => {
      throw new Error('loader was called');
    };
    return { sync: false, resolve: fail, read: fail, version: fail };
  }

  it.each([
    ['compile', (env: Environment) => env.compile('<TMPL_INCLUDE NAME="part.tmpl">')],
    ['render', (env: Environment) => env.render('<TMPL_INCLUDE NAME="part.tmpl">', {})],
    ['compileFile', (env: Environment) => env.compileFile('page.tmpl')],
    ['renderFile', (env: Environment) => env.renderFile('page.tmpl', {})]
  ])('%s rejects an asynchronous loader before calling it', (_name, call) => {
    const env = new Environment({ loader: untouchable() });

    expect(() => call(env)).toThrow('The loader is asynchronous; use compileFileAsync or renderFileAsync');
  });

  it('still compiles include-free text with an asynchronous loader configured', () => {
    const env = new Environment({ loader: untouchable() });

    expect(env.render('<TMPL_VAR NAME="x">', { x: 'y' })).toBe('y');
  });

  it('reads the entry and its includes through a per-call loader', () => {
    const env = new Environment({ loader: memoryLoader({ 'page.tmpl': 'environment' }) });
    const other = memoryLoader({ 'page.tmpl': 'call [<TMPL_INCLUDE NAME="part.tmpl">]', 'part.tmpl': 'part' });

    expect(env.renderFile('page.tmpl', {}, { loader: other })).toBe('call [part]');
    expect(env.renderFile('page.tmpl', {})).toBe('environment');
  });

  it('caches per-call loader compilations apart from the environment loader', () => {
    const env = new Environment({ loader: memoryLoader({ 'page.tmpl': 'environment' }), cache: true });
    const other = memoryLoader({ 'page.tmpl': 'call' });

    const first = env.compileFile('page.tmpl', { loader: other });

    expect(env.compileFile('page.tmpl', { loader: other })).toBe(first);
    expect(env.compileFile('page.tmpl').render({})).toBe('environment');
    expect(env.cacheSize).toBe(2);
  });

  it('reads through a per-call asynchronous loader', async () => {
    const env = new Environment({ loader: memoryLoader({ 'page.tmpl': 'environment' }) });

    expect(await env.renderFileAsync('page.tmpl', {}, { loader: asyncLoader({ 'page.tmpl': 'call' }) })).toBe('call');
  });

  it('rejects a per-call asynchronous loader on a synchronous method', () => {
    const env = new Environment({ loader: memoryLoader({ 'page.tmpl': 'environment' }) });
    const loader = untouchable() as unknown as SyncTemplateLoader;

    expect(() => env.compileFile('page.tmpl', { loader })).toThrow(/compileFileAsync/);
  });
});

describe('Environment cache revalidation', () => {
  it('recompiles after the template changes when includes are off', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'html-template-env-noinc-'));
    const file = join(scratch, 'changing.tmpl');
    writeFileSync(file, 'before');

    const env = new Environment({ loader: nodeFileLoader({ paths: [scratch] }), cache: true, includes: false });
    expect(env.renderFile('changing.tmpl', {})).toBe('before');

    writeFileSync(file, 'after');
    touchFuture(file);

    expect(env.renderFile('changing.tmpl', {})).toBe('after');

    rmSync(scratch, { recursive: true, force: true });
  });

  it.each([true, false])('records the entry version from its read, includes %s', (includes) => {
    let queries = 0;
    const inner = memoryLoader({ 'page.tmpl': 'x' });
    const loader: SyncTemplateLoader = {
      sync: true,
      resolve: (request) => inner.resolve(request),
      read: (id) => ({ ...inner.read(id), version: 'read' }),
      version: () => `queried-${++queries}`
    };

    const template = new Environment({ loader, cache: true, includes }).compileFile('page.tmpl');

    expect(Object.fromEntries(template.compiled.versions)).toEqual({ 'page.tmpl': 'read' });
  });

  it('records the entry version from its read on the asynchronous path', async () => {
    const inner = memoryLoader({ 'page.tmpl': 'x' });
    const loader: TemplateLoader = {
      sync: false,
      resolve: async (request) => inner.resolve(request),
      read: async (id) => ({ ...inner.read(id), version: 'read' }),
      version: async () => 'queried'
    };

    const template = await new Environment({ loader, cache: true }).compileFileAsync('page.tmpl');

    expect(Object.fromEntries(template.compiled.versions)).toEqual({ 'page.tmpl': 'read' });
  });
});

describe('Environment include options', () => {
  // Include lookup belongs to the loader; options it never reads must not
  // split the cache.
  it('keys the cache only on include options that change the result', () => {
    const env = new Environment({ loader: nodeFileLoader({ paths: [directory] }), cache: true });
    const stray = { paths: ['/elsewhere'], searchAllPaths: true } as unknown as IncludeOptions;

    expect(env.compileFile('page.tmpl', { includes: stray })).toBe(env.compileFile('page.tmpl'));
  });

  it('does not declare include search options', () => {
    // @ts-expect-error include search belongs to nodeFileLoader
    const paths: IncludeOptions = { paths: ['./views'] };
    // @ts-expect-error include search belongs to nodeFileLoader
    const searchAllPaths: IncludeOptions = { searchAllPaths: true };

    expect([paths, searchAllPaths]).toHaveLength(2);
  });
});

/**
 * Wrap an in-memory loader so every method answers with a promise.
 *
 * @param files - Template text keyed by name
 * @returns Asynchronous loader
 */
function asyncLoader(files: Record<string, string>): TemplateLoader {
  const inner: SyncTemplateLoader = memoryLoader(files);

  return {
    sync: false,
    resolve: async (request) => inner.resolve(request),
    read: async (id): Promise<TemplateResource> => inner.read(id),
    version: async (id) => inner.version?.(id)
  };
}
