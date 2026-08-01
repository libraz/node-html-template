/**
 * Type generation command tests
 *
 * The command is driven through an in-memory filesystem, so what is exercised
 * is the command itself — its arguments, its exit codes and what it writes —
 * rather than the disk underneath it.
 */

import { describe, expect, it } from 'vitest';
import type { CommandIO } from '../../src/cli/run.js';
import { run } from '../../src/cli/run.js';

/**
 * Build in-memory bindings over a set of files.
 *
 * @param files - File contents keyed by path
 * @returns Bindings, plus the captured streams and the resulting files
 */
function harness(files: Record<string, string>) {
  const out: string[] = [];
  const err: string[] = [];
  const written: Record<string, string> = { ...files };

  const io: CommandIO = {
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    readFile: (path) => {
      const text = written[path];
      if (text === undefined) throw new Error(`No such file: ${path}`);
      return text;
    },
    writeFile: (path, text) => {
      written[path] = text;
    },
    exists: (path) => path in written || Object.keys(written).some((file) => file.startsWith(`${path}/`)),
    isDirectory: (path) => !(path in written) && Object.keys(written).some((file) => file.startsWith(`${path}/`)),
    listFiles: (path) =>
      Object.keys(written)
        .filter((file) => file.startsWith(`${path}/`))
        .map((file) => file.slice(path.length + 1)),
    join: (...segments) => segments.join('/'),
    stem: (path) => {
      const base = path.slice(path.lastIndexOf('/') + 1);
      const dot = base.lastIndexOf('.');
      return dot > 0 ? base.slice(0, dot) : base;
    },
    extension: (path) => {
      const base = path.slice(path.lastIndexOf('/') + 1);
      const dot = base.lastIndexOf('.');
      return dot > 0 ? base.slice(dot) : '';
    },
    directory: (path) => path.slice(0, Math.max(0, path.lastIndexOf('/'))) || '.'
  };

  return { io, out, err, written };
}

describe('run', () => {
  it('writes the generated types to standard output', () => {
    const { io, out } = harness({ 'views/page.tmpl': '<TMPL_VAR NAME="title">' });

    expect(run(['views/page.tmpl'], io)).toBe(0);
    expect(out.join('\n')).toContain('export interface PageData {');
    expect(out.join('\n')).toContain('title?: ScalarSource;');
  });

  it('writes to a file when told to', () => {
    const { io, written, out } = harness({ 'views/page.tmpl': '<TMPL_VAR NAME="title">' });

    expect(run(['views/page.tmpl', '-o', 'types/templates.d.ts'], io)).toBe(0);
    expect(written['types/templates.d.ts']).toContain('export interface PageData {');
    expect(out).toHaveLength(0);
  });

  it('names each interface after its file', () => {
    const { io, out } = harness({
      'views/user-profile.tmpl': '<TMPL_VAR NAME="a">',
      'views/mail.tmpl': '<TMPL_VAR NAME="b">'
    });

    run(['views'], io);

    expect(out.join('\n')).toContain('export interface UserProfileData {');
    expect(out.join('\n')).toContain('export interface MailData {');
  });

  it('takes the interface suffix', () => {
    const { io, out } = harness({ 'views/page.tmpl': '<TMPL_VAR NAME="a">' });

    run(['views/page.tmpl', '--suffix', 'Params'], io);

    expect(out.join('\n')).toContain('export interface PageParams {');
  });

  it('searches a directory recursively', () => {
    const { io, out } = harness({
      'views/page.tmpl': '<TMPL_VAR NAME="a">',
      'views/mail/welcome.tmpl': '<TMPL_VAR NAME="b">'
    });

    expect(run(['views'], io)).toBe(0);
    expect(out.join('\n')).toContain('export interface PageData {');
    expect(out.join('\n')).toContain('export interface WelcomeData {');
  });

  it('picks up only the configured extensions', () => {
    const { io, out } = harness({
      'views/page.tmpl': '<TMPL_VAR NAME="a">',
      'views/notes.md': 'not a template'
    });

    run(['views'], io);

    expect(out.join('\n')).not.toContain('NotesData');
  });

  it('takes an extension list', () => {
    const { io, out } = harness({ 'views/page.tt': '<TMPL_VAR NAME="a">' });

    expect(run(['views', '--ext', 'tt'], io)).toBe(0);
    expect(out.join('\n')).toContain('export interface PageData {');
  });

  it('passes the required and split settings through', () => {
    const { io, out } = harness({ 'views/page.tmpl': '<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="c"></TMPL_LOOP>' });

    run(['views/page.tmpl', '--required', '--split'], io);

    expect(out.join('\n')).toContain('rows: RowSource<PageDataRowsRow>;');
  });

  it('prints usage on request', () => {
    const { io, out } = harness({});

    expect(run(['--help'], io)).toBe(0);
    expect(out.join('\n')).toContain('Usage: html-template-codegen');
  });

  it('rejects a run with no paths', () => {
    const { io, err } = harness({});

    expect(run([], io)).toBe(2);
    expect(err.join('\n')).toContain('No template paths given.');
  });

  it('rejects an unknown option', () => {
    const { io, err } = harness({ 'views/page.tmpl': 'x' });

    expect(run(['views/page.tmpl', '--nope'], io)).toBe(2);
    expect(err.join('\n')).toContain('Usage: html-template-codegen');
  });

  it('reports a path that does not exist', () => {
    const { io, err } = harness({});

    expect(run(['missing.tmpl'], io)).toBe(2);
    expect(err.join('\n')).toContain('No such file or directory: missing.tmpl');
  });

  it('reports a directory with nothing in it to read', () => {
    const { io, err } = harness({ 'views/notes.md': 'x' });

    expect(run(['views'], io)).toBe(2);
    expect(err.join('\n')).toContain('No templates found');
  });

  it('reports a template it cannot parse', () => {
    const { io, err } = harness({ 'views/broken.tmpl': '<TMPL_LOOP NAME="rows">unclosed' });

    expect(run(['views/broken.tmpl'], io)).toBe(1);
    expect(err.join('\n')).toContain('Unclosed LOOP');
  });
});

describe('run --check', () => {
  it('passes when the file is up to date', () => {
    const { io, written } = harness({ 'views/page.tmpl': '<TMPL_VAR NAME="a">' });

    run(['views/page.tmpl', '-o', 'types.d.ts'], io);

    expect(written['types.d.ts']).toBeDefined();
    expect(run(['views/page.tmpl', '-o', 'types.d.ts', '--check'], io)).toBe(0);
  });

  it('fails when the file is stale', () => {
    const { io, err, written } = harness({ 'views/page.tmpl': '<TMPL_VAR NAME="a">' });

    run(['views/page.tmpl', '-o', 'types.d.ts'], io);
    written['views/page.tmpl'] = '<TMPL_VAR NAME="b">';

    expect(run(['views/page.tmpl', '-o', 'types.d.ts', '--check'], io)).toBe(1);
    expect(err.join('\n')).toContain('out of date');
  });

  it('fails when the file does not exist yet', () => {
    const { io } = harness({ 'views/page.tmpl': '<TMPL_VAR NAME="a">' });

    expect(run(['views/page.tmpl', '-o', 'absent.d.ts', '--check'], io)).toBe(1);
  });

  it('writes nothing', () => {
    const { io, written } = harness({ 'views/page.tmpl': '<TMPL_VAR NAME="a">' });

    run(['views/page.tmpl', '-o', 'types.d.ts', '--check'], io);

    expect(written['types.d.ts']).toBeUndefined();
  });

  it('needs somewhere to compare against', () => {
    const { io, err } = harness({ 'views/page.tmpl': '<TMPL_VAR NAME="a">' });

    expect(run(['views/page.tmpl', '--check'], io)).toBe(2);
    expect(err.join('\n')).toContain('--check needs --out');
  });
});

describe('run with includes', () => {
  it('describes names an included template contributes', () => {
    const { io, out } = harness({
      'views/page.tmpl': '<TMPL_VAR NAME="title"><TMPL_INCLUDE NAME="parts/row.tmpl">',
      'views/parts/row.tmpl': '<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="cell"></TMPL_LOOP>'
    });

    expect(run(['views/page.tmpl'], io)).toBe(0);
    expect(out.join('\n')).toContain('title?: ScalarSource;');
    expect(out.join('\n')).toContain('cell?: ScalarSource;');
  });

  it('reports an include it cannot find', () => {
    const { io, err } = harness({ 'views/page.tmpl': '<TMPL_INCLUDE NAME="absent.tmpl">' });

    expect(run(['views/page.tmpl'], io)).toBe(1);
    expect(err.join('\n')).toContain('absent.tmpl');
  });
});
