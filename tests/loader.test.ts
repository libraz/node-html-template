/**
 * Loader tests
 *
 * Pins the resolution order the filesystem loader inherited from Perl
 * HTML::Template, and the immutability contract the in-memory loader relies on
 * for caching.
 */

import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TemplateNotFoundError } from '../src/loader/errors.js';
import { memoryLoader } from '../src/loader/memory.js';
import { fileVersion, nodeFileLoader } from '../src/loader/nodeFile.js';
import { normalizeEncodingName, parseOpenMode } from '../src/utils/encoding.js';

describe('nodeFileLoader', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'html-template-loader-'));
    mkdirSync(join(dir, 'views'));
    mkdirSync(join(dir, 'shared'));
    writeFileSync(join(dir, 'views', 'page.tmpl'), 'page');
    writeFileSync(join(dir, 'views', 'sibling.tmpl'), 'sibling');
    writeFileSync(join(dir, 'shared', 'sibling.tmpl'), 'shared sibling');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves an absolute name directly', () => {
    const loader = nodeFileLoader();
    const target = join(dir, 'views', 'page.tmpl');

    expect(loader.resolve({ name: target, include: false })).toBe(target);
  });

  it('resolves a relative name against the configured paths', () => {
    const loader = nodeFileLoader({ paths: [join(dir, 'views')] });

    expect(loader.resolve({ name: 'page.tmpl', include: false })).toBe(join(dir, 'views', 'page.tmpl'));
  });

  it('prefers the referencing file directory for includes', () => {
    const loader = nodeFileLoader({ paths: [join(dir, 'shared')] });
    const resolved = loader.resolve({
      name: 'sibling.tmpl',
      from: join(dir, 'views', 'page.tmpl'),
      include: true
    });

    expect(resolved).toBe(join(dir, 'views', 'sibling.tmpl'));
  });

  it('searches the configured paths first when searchAllPaths is set', () => {
    const loader = nodeFileLoader({ paths: [join(dir, 'shared')], searchAllPaths: true });
    const resolved = loader.resolve({
      name: 'sibling.tmpl',
      from: join(dir, 'views', 'page.tmpl'),
      include: true
    });

    expect(resolved).toBe(join(dir, 'shared', 'sibling.tmpl'));
  });

  it('resolves under the configured root', () => {
    const loader = nodeFileLoader({ root: dir, paths: ['views'] });

    expect(loader.resolve({ name: 'page.tmpl', include: false })).toBe(join(dir, 'views', 'page.tmpl'));
  });

  it('falls back to the configured working directory', () => {
    const loader = nodeFileLoader({ cwd: join(dir, 'views') });

    expect(loader.resolve({ name: 'page.tmpl', include: false })).toBe(join(dir, 'views', 'page.tmpl'));
  });

  it('reports a missing template as TemplateNotFoundError', () => {
    const loader = nodeFileLoader({ paths: [dir] });

    expect(() => loader.resolve({ name: 'absent.tmpl', include: true })).toThrow(TemplateNotFoundError);
  });

  it('reports a missing absolute name as TemplateNotFoundError without searching', () => {
    const loader = nodeFileLoader({ paths: [dir] });

    expect(() => loader.resolve({ name: join(dir, 'absent.tmpl'), include: false })).toThrow(TemplateNotFoundError);
  });

  it('has no version for a path it cannot stat', () => {
    const loader = nodeFileLoader({ paths: [dir] });

    expect(loader.version?.(join(dir, 'absent.tmpl'))).toBeUndefined();
  });

  it('ignores a directory that shares the template name', () => {
    const loader = nodeFileLoader({ paths: [dir, join(dir, 'views')] });
    mkdirSync(join(dir, 'page.tmpl'));

    expect(loader.resolve({ name: 'page.tmpl', include: false })).toBe(join(dir, 'views', 'page.tmpl'));
  });

  it('reads a resolved template with its version', () => {
    const loader = nodeFileLoader({ paths: [join(dir, 'views')] });
    const id = loader.resolve({ name: 'page.tmpl', include: false });
    const resource = loader.read(id);

    expect(resource.text).toBe('page');
    expect(resource.id).toBe(id);
    expect(resource.version).toBeTypeOf('string');
  });

  it('changes the version when the file changes', () => {
    const loader = nodeFileLoader({ paths: [join(dir, 'views')] });
    const id = loader.resolve({ name: 'page.tmpl', include: false });
    const before = loader.version?.(id);

    writeFileSync(id, 'page, revised');

    expect(loader.version?.(id)).not.toBe(before);
  });

  it('changes the version when only the size changes under the same mtime', () => {
    const loader = nodeFileLoader({ paths: [join(dir, 'views')] });
    const id = loader.resolve({ name: 'page.tmpl', include: false });
    const stamp = new Date(1_700_000_000_000);

    utimesSync(id, stamp, stamp);
    const before = loader.version?.(id);

    writeFileSync(id, 'page, longer than before');
    utimesSync(id, stamp, stamp);

    expect(loader.version?.(id)).not.toBe(before);
  });

  it('decodes with the configured encoding', () => {
    writeFileSync(join(dir, 'latin.tmpl'), Buffer.from([0xe9]));
    const loader = nodeFileLoader({ paths: [dir], encoding: ':raw' });
    const id = loader.resolve({ name: 'latin.tmpl', include: false });

    expect(loader.read(id).text).toBe('é');
  });

  it.each([
    ['utf-16be', [0x00, 0x41, 0x30, 0x42]],
    ['<:encoding(UTF-16BE)', [0x00, 0x41, 0x30, 0x42]],
    ['utf-16le', [0x41, 0x00, 0x42, 0x30]],
    ['utf16', [0xfe, 0xff, 0x00, 0x41, 0x30, 0x42]],
    ['utf16', [0xff, 0xfe, 0x41, 0x00, 0x42, 0x30]],
    ['<:encoding(euc-jp)', [0x41, 0xa4, 0xa2]],
    ['<:encoding(shiftjis)', [0x41, 0x82, 0xa0]],
    ['cp932', [0x41, 0x82, 0xa0]]
  ])('decodes %s with exactly that encoding', (encoding, bytes) => {
    writeFileSync(join(dir, 'encoded.tmpl'), Buffer.from(bytes));
    const loader = nodeFileLoader({ paths: [dir], encoding });

    expect(loader.read(loader.resolve({ name: 'encoded.tmpl', include: false })).text).toBe('Aあ');
  });

  it('rejects UTF-16 text without a byte order mark rather than guessing its order', () => {
    writeFileSync(join(dir, 'bare.tmpl'), Buffer.from([0x00, 0x41]));
    const loader = nodeFileLoader({ paths: [dir], encoding: 'utf16' });
    const id = loader.resolve({ name: 'bare.tmpl', include: false });

    expect(() => loader.read(id)).toThrow(/byte order mark/);
  });

  it('rejects an encoding it cannot decode when built', () => {
    expect(() => nodeFileLoader({ encoding: 'no-such-encoding' })).toThrow(/'no-such-encoding'/);
    expect(() => nodeFileLoader({ encoding: '<:encoding(no-such-encoding)' })).toThrow(/'no-such-encoding'/);
  });

  it('reads with the version of the file it read', () => {
    const loader = nodeFileLoader({ paths: [join(dir, 'views')] });
    const id = loader.resolve({ name: 'page.tmpl', include: false });

    expect(loader.read(id).version).toBe(fileVersion(id));
  });
});

describe('memoryLoader', () => {
  it('resolves a bare name', () => {
    const loader = memoryLoader({ 'page.tmpl': 'page' });

    expect(loader.resolve({ name: 'page.tmpl', include: false })).toBe('page.tmpl');
    expect(loader.read('page.tmpl').text).toBe('page');
  });

  it('resolves an include against the referencing template directory', () => {
    const loader = memoryLoader({
      'views/page.tmpl': 'page',
      'views/part.tmpl': 'part'
    });

    const resolved = loader.resolve({ name: 'part.tmpl', from: 'views/page.tmpl', include: true });

    expect(resolved).toBe('views/part.tmpl');
  });

  it('falls back to the bare name when no sibling exists', () => {
    const loader = memoryLoader({
      'views/page.tmpl': 'page',
      'shared.tmpl': 'shared'
    });

    const resolved = loader.resolve({ name: 'shared.tmpl', from: 'views/page.tmpl', include: true });

    expect(resolved).toBe('shared.tmpl');
  });

  it('collapses relative segments', () => {
    const loader = memoryLoader({ 'shared/part.tmpl': 'part' });

    const resolved = loader.resolve({ name: '../shared/part.tmpl', from: 'views/page.tmpl', include: true });

    expect(resolved).toBe('shared/part.tmpl');
  });

  it('reports a missing template as TemplateNotFoundError', () => {
    const loader = memoryLoader({});

    expect(() => loader.resolve({ name: 'absent.tmpl', include: true })).toThrow(TemplateNotFoundError);
  });

  it('reports an unknown id the same way when read directly', () => {
    const loader = memoryLoader({ 'page.tmpl': 'page' });

    expect(() => loader.read('absent.tmpl')).toThrow(TemplateNotFoundError);
  });

  it('accepts a Map and copies it, so later writes do not leak in', () => {
    const files = new Map([['page.tmpl', 'original']]);
    const loader = memoryLoader(files);

    files.set('page.tmpl', 'mutated');
    files.set('added.tmpl', 'added');

    expect(loader.read('page.tmpl').text).toBe('original');
    expect(() => loader.resolve({ name: 'added.tmpl', include: false })).toThrow(TemplateNotFoundError);
  });

  it.each(['./a.tmpl', 'dir//b.tmpl', 'dir/./c.tmpl'])('serves a key under its own spelling: %s', (key) => {
    const loader = memoryLoader({ [key]: 'text' });

    expect(loader.read(loader.resolve({ name: key, include: false })).text).toBe('text');
    expect(loader.read(loader.resolve({ name: key, from: 'top.tmpl', include: true })).text).toBe('text');
  });

  it('rejects two keys that name the same template', () => {
    expect(() => memoryLoader({ 'a.tmpl': 'one', './a.tmpl': 'two' })).toThrow(/same template/);
  });

  it('declares its resources immutable', () => {
    const loader = memoryLoader({ 'page.tmpl': 'page' });

    expect(loader.version?.('page.tmpl')).toBeUndefined();
    expect(loader.read('page.tmpl').version).toBeUndefined();
  });
});

describe('encoding names', () => {
  it('reads a Perl open_mode layer', () => {
    expect(parseOpenMode('<:encoding(utf8)')).toBe('utf-8');
    expect(parseOpenMode('<:encoding(iso-8859-1)')).toBe('latin1');
  });

  it('reads a raw layer as the byte-preserving encoding', () => {
    expect(parseOpenMode(':raw')).toBe('latin1');
    expect(parseOpenMode('<:raw')).toBe('latin1');
  });

  it('accepts a bare Node encoding name', () => {
    expect(parseOpenMode('utf-16le')).toBe('utf-16le');
    expect(parseOpenMode('base64url')).toBe('base64url');
  });

  it('accepts a name however it is spelled', () => {
    expect(normalizeEncodingName('UTF8')).toBe('utf-8');
    expect(normalizeEncodingName('utf-8')).toBe('utf-8');
    expect(normalizeEncodingName('utf_8')).toBe('utf-8');
    expect(normalizeEncodingName('ISO-8859-1')).toBe('latin1');
    expect(normalizeEncodingName('ucs2')).toBe('utf-16le');
    expect(normalizeEncodingName('hex')).toBe('hex');
  });

  it('keeps the byte order a UTF-16 name states', () => {
    expect(normalizeEncodingName('utf16le')).toBe('utf-16le');
    expect(normalizeEncodingName('utf16be')).toBe('utf-16be');
    expect(normalizeEncodingName('UTF-16BE')).toBe('utf-16be');
    expect(normalizeEncodingName('utf16')).toBe('utf-16');
  });

  it('resolves a name Node does not decode to its WHATWG encoding', () => {
    expect(normalizeEncodingName('euc-jp')).toBe('euc-jp');
    expect(normalizeEncodingName('shift_jis')).toBe('shift_jis');
    expect(normalizeEncodingName('cp1252')).toBe('windows-1252');
  });

  it('throws for a name it does not know', () => {
    expect(() => normalizeEncodingName('no-such-encoding')).toThrow(/Unsupported template encoding 'no-such-encoding'/);
    expect(() => parseOpenMode('<:encoding(no-such-encoding)')).toThrow(/'no-such-encoding'/);
  });
});
