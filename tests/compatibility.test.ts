import { mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HTMLTemplate } from '../src/index.js';

function touchFuture(filepath: string): void {
  const future = new Date(Date.now() + 5000);
  utimesSync(filepath, future, future);
}

describe('Perl HTML::Template compatibility gaps', () => {
  it('supports param() list, getter, and explicit undefined values', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="foo"><TMPL_VAR NAME="bar" DEFAULT="fallback">'
    });

    expect(tmpl.param()).toEqual(['bar', 'foo']);

    tmpl.param('foo', 'value');
    tmpl.param('bar', undefined);

    expect(tmpl.param('foo')).toBe('value');
    expect(tmpl.param('bar')).toBeUndefined();
    expect(tmpl.output()).toBe('valuefallback');
  });

  it('provides Perl-style constructor helpers and clear_params()', () => {
    const tmpl = HTMLTemplate.new_scalar_ref('<TMPL_VAR NAME="x">');
    tmpl.param('x', 'one');
    expect(tmpl.output()).toBe('one');

    tmpl.clear_params();
    tmpl.param('x', 'two');
    expect(tmpl.output()).toBe('two');
  });

  it('caches lazy variables and loops when cache_lazy_* options are enabled', () => {
    let varCalls = 0;
    let loopCalls = 0;

    const tmpl = new HTMLTemplate({
      scalarref:
        '<TMPL_VAR NAME="v"> <TMPL_VAR NAME="v"> <TMPL_LOOP NAME="rows"><TMPL_VAR NAME="x"></TMPL_LOOP><TMPL_LOOP NAME="rows"><TMPL_VAR NAME="x"></TMPL_LOOP>',
      cache_lazy_vars: true,
      cache_lazy_loops: true
    });

    tmpl.param('v', () => {
      varCalls += 1;
      return varCalls;
    });
    tmpl.param('rows', () => {
      loopCalls += 1;
      return [{ x: loopCalls }];
    });

    expect(tmpl.output()).toBe('1 1 11');
    expect(varCalls).toBe(1);
    expect(loopCalls).toBe(1);
  });

  it('honors strict parsing for unknown TMPL tags', () => {
    expect(() => new HTMLTemplate({ scalarref: '<TMPL_BOGUS NAME="x">' })).toThrow(/Syntax error/);

    const tmpl = new HTMLTemplate({
      scalarref: 'A<TMPL_BOGUS NAME="x">B',
      strict: false
    });
    expect(tmpl.output()).toBe('A<TMPL_BOGUS NAME="x">B');
  });

  it('applies filters to included templates and supports include shorthand', () => {
    const dir = mkdtempSync(join(tmpdir(), 'html-template-include-'));
    writeFileSync(join(dir, 'child.tmpl'), 'hello <TMPL_VAR NAME="name">');

    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_INCLUDE child.tmpl>',
      path: [dir],
      filter: {
        sub: (content) => (content as string).replace('hello', 'hi'),
        format: 'scalar'
      }
    });
    tmpl.param('name', 'Sam');
    expect(tmpl.output()).toBe('hi Sam');
  });

  it('parses Perl-style open_mode and rejects utf8 with open_mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'html-template-encoding-'));
    const file = join(dir, 'utf8.tmpl');
    writeFileSync(file, Buffer.from([0xc3, 0xa4]));

    const utf8Template = new HTMLTemplate({
      filename: file,
      open_mode: '<:encoding(utf-8)>'
    });
    expect(utf8Template.output()).toBe('ä');

    const rawTemplate = new HTMLTemplate({
      filename: file,
      open_mode: '<:raw'
    });
    expect(rawTemplate.output()).toBe('Ã¤');

    expect(() => new HTMLTemplate({ filename: file, utf8: true, open_mode: '<:raw' })).toThrow(/utf8 and open_mode/);
  });

  it('rejects caching for non-file template sources', () => {
    expect(() => new HTMLTemplate({ scalarref: 'x', cache: true })).toThrow(/Cannot have caching/);
  });

  it('uses options that affect parsing in the cache key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'html-template-cache-'));
    const file = join(dir, 'template.tmpl');
    writeFileSync(file, '<TMPL_VAR NAME="v">');

    const escaped = new HTMLTemplate({
      filename: file,
      cache: true,
      default_escape: 'html'
    });
    escaped.param('v', '<');
    expect(escaped.output()).toBe('&lt;');

    const raw = new HTMLTemplate({
      filename: file,
      cache: true,
      default_escape: 'none'
    });
    raw.param('v', '<');
    expect(raw.output()).toBe('<');
  });

  it('validates regular memory cache entries by template mtime', () => {
    const dir = mkdtempSync(join(tmpdir(), 'html-template-memory-cache-'));
    const file = join(dir, 'template.tmpl');
    writeFileSync(file, 'before');

    expect(new HTMLTemplate({ filename: file, cache: true }).output()).toBe('before');

    writeFileSync(file, 'after');
    touchFuture(file);

    expect(new HTMLTemplate({ filename: file, cache: true }).output()).toBe('after');
  });

  it('keeps stale templates in blind_cache mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'html-template-blind-cache-'));
    const file = join(dir, 'template.tmpl');
    writeFileSync(file, 'before');

    expect(new HTMLTemplate({ filename: file, blind_cache: true }).output()).toBe('before');

    writeFileSync(file, 'after');
    touchFuture(file);

    expect(new HTMLTemplate({ filename: file, blind_cache: true }).output()).toBe('before');
  });

  it('writes file cache entries and invalidates them by template mtime', () => {
    const dir = mkdtempSync(join(tmpdir(), 'html-template-file-cache-'));
    const cacheDir = join(dir, 'cache');
    mkdirSync(cacheDir);
    const file = join(dir, 'template.tmpl');
    writeFileSync(file, 'file-cache-before');

    expect(new HTMLTemplate({ filename: file, file_cache: true, file_cache_dir: cacheDir }).output()).toBe(
      'file-cache-before'
    );
    expect(readdirSync(cacheDir).some((fileName) => fileName.endsWith('.json'))).toBe(true);

    writeFileSync(file, 'file-cache-after');
    touchFuture(file);

    expect(new HTMLTemplate({ filename: file, file_cache: true, file_cache_dir: cacheDir }).output()).toBe(
      'file-cache-after'
    );
  });

  it('creates both memory and file cache entries in double_file_cache mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'html-template-double-file-cache-'));
    const cacheDir = join(dir, 'cache');
    const file = join(dir, 'template.tmpl');
    writeFileSync(file, '<TMPL_VAR NAME="value">');

    const tmpl = new HTMLTemplate({
      filename: file,
      double_file_cache: true,
      file_cache_dir: cacheDir
    });
    tmpl.param('value', 'cached');

    expect(tmpl.output()).toBe('cached');
    expect(readdirSync(cacheDir).some((fileName) => fileName.endsWith('.json'))).toBe(true);
  });

  it('rejects values whose shapes do not match the declared parameter type', () => {
    const scalarTemplate = new HTMLTemplate({ scalarref: '<TMPL_VAR NAME="value">' });
    expect(() => scalarTemplate.param('value', [{ value: 'bad' }])).toThrow(/parameter is not a TMPL_LOOP/);

    const loopTemplate = new HTMLTemplate({ scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="value"></TMPL_LOOP>' });
    expect(() => loopTemplate.param('items', 'bad')).toThrow(/parameter is not a TMPL_VAR/);
  });

  it('matches associate parameter names case-insensitively by default', () => {
    const associate = {
      param(name?: string) {
        if (name === undefined) return ['UserName'];
        return name === 'UserName' ? 'Alice' : undefined;
      }
    };

    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="username">',
      associate,
      die_on_bad_params: false
    });

    expect(tmpl.output()).toBe('Alice');
  });

  it('supports function shorthand filters on nested includes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'html-template-filter-shorthand-'));
    writeFileSync(join(dir, 'outer.tmpl'), 'outer <TMPL_INCLUDE inner.tmpl>');
    writeFileSync(join(dir, 'inner.tmpl'), 'inner <TMPL_VAR NAME="value">');

    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_INCLUDE outer.tmpl>',
      path: [dir],
      filter: (content) => (content as string).replace('inner <', 'child <').replace('outer ', 'parent ')
    });
    tmpl.param('value', 'done');

    expect(tmpl.output()).toBe('parent child done');
  });

  it('applies open_mode to included templates', () => {
    const dir = mkdtempSync(join(tmpdir(), 'html-template-include-encoding-'));
    writeFileSync(join(dir, 'child.tmpl'), Buffer.from([0xc3, 0xa4]));

    const utf8Template = new HTMLTemplate({
      scalarref: '<TMPL_INCLUDE child.tmpl>',
      path: [dir],
      open_mode: '<:encoding(utf-8)>'
    });
    expect(utf8Template.output()).toBe('ä');

    const rawTemplate = new HTMLTemplate({
      scalarref: '<TMPL_INCLUDE child.tmpl>',
      path: [dir],
      open_mode: '<:raw'
    });
    expect(rawTemplate.output()).toBe('Ã¤');
  });

  it('uses config() defaults for later templates while per-instance options remain local', () => {
    const dir = mkdtempSync(join(tmpdir(), 'html-template-config-'));
    writeFileSync(join(dir, 'configured.tmpl'), '<TMPL_VAR NAME="value">');

    HTMLTemplate.config({ path: [dir] });

    const fromConfig = new HTMLTemplate({ filename: 'configured.tmpl' });
    fromConfig.param('value', 'configured');
    expect(fromConfig.output()).toBe('configured');

    const localOverride = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="Value">',
      case_sensitive: true,
      die_on_bad_params: false
    });
    localOverride.param('value', 'wrong-case');
    expect(localOverride.output()).toBe('');

    const afterOverride = new HTMLTemplate({ filename: 'configured.tmpl' });
    afterOverride.param('value', 'still-configured');
    expect(afterOverride.output()).toBe('still-configured');
  });
});
