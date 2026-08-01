/**
 * Type generation tests
 *
 * A template carries no type information, so what is generated is a statement
 * about which names exist and in what role — not about what they hold. These
 * pin that boundary.
 */

import { describe, expect, it } from 'vitest';
import { generateModule, generateTypes } from '../../src/codegen/index.js';

describe('generateTypes', () => {
  it('describes a variable', () => {
    expect(generateTypes('<TMPL_VAR NAME="title">', { name: 'Page' })).toBe(
      ['export interface Page {', '  title?: ScalarSource;', '}'].join('\n')
    );
  });

  it('lists names in the order the template declares them', () => {
    const output = generateTypes('<TMPL_VAR NAME="zeta"><TMPL_VAR NAME="alpha">', { name: 'Page' });

    expect(output.indexOf('zeta')).toBeLessThan(output.indexOf('alpha'));
  });

  it('mentions a name used twice only once', () => {
    const output = generateTypes('<TMPL_VAR NAME="x"><TMPL_VAR NAME="x">', { name: 'Page' });

    expect(output.match(/\bx\?/g)).toHaveLength(1);
  });

  it('widens a name used only as a condition', () => {
    const output = generateTypes('<TMPL_IF NAME="on">a</TMPL_IF><TMPL_UNLESS NAME="off">b</TMPL_UNLESS>', {
      name: 'Page'
    });

    expect(output).toContain('on?: unknown;');
    expect(output).toContain('off?: unknown;');
  });

  it('narrows a name that is also written out', () => {
    const output = generateTypes('<TMPL_IF NAME="x"><TMPL_VAR NAME="x"></TMPL_IF>', { name: 'Page' });

    expect(output).toContain('x?: ScalarSource;');
  });

  it('nests a loop row inline', () => {
    const output = generateTypes('<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="cell"></TMPL_LOOP>', { name: 'Page' });

    expect(output).toBe(
      ['export interface Page {', '  rows?: RowSource<{', '    cell?: ScalarSource;', '  }>;', '}'].join('\n')
    );
  });

  it('nests loops within loops', () => {
    const output = generateTypes(
      '<TMPL_LOOP NAME="outer"><TMPL_LOOP NAME="inner"><TMPL_VAR NAME="deep"></TMPL_LOOP></TMPL_LOOP>',
      { name: 'Page' }
    );

    expect(output).toContain('inner?: RowSource<{');
    expect(output).toContain('deep?: ScalarSource;');
  });

  it('describes a loop whose body declares nothing', () => {
    expect(generateTypes('<TMPL_LOOP NAME="rows">text</TMPL_LOOP>', { name: 'Page' })).toContain(
      'rows?: RowSource<Record<string, never>>;'
    );
  });

  it('leaves out the variables a loop provides itself', () => {
    const output = generateTypes(
      '<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="__counter__"><TMPL_IF NAME="__first__">x</TMPL_IF><TMPL_VAR NAME="cell"></TMPL_LOOP>',
      { name: 'Page' }
    );

    expect(output).not.toContain('__counter__');
    expect(output).not.toContain('__first__');
    expect(output).toContain('cell?: ScalarSource;');
  });

  it('quotes a name that is not a bare identifier', () => {
    const output = generateTypes('<TMPL_VAR NAME="item-name"><TMPL_VAR NAME="a.b/c">', { name: 'Page' });

    expect(output).toContain("'item-name'?: ScalarSource;");
    expect(output).toContain("'a.b/c'?: ScalarSource;");
  });

  it('makes every property required when asked', () => {
    const output = generateTypes('<TMPL_VAR NAME="x"><TMPL_LOOP NAME="rows"><TMPL_VAR NAME="c"></TMPL_LOOP>', {
      name: 'Page',
      required: true
    });

    expect(output).toContain('x: ScalarSource;');
    expect(output).toContain('c: ScalarSource;');
    expect(output).not.toContain('?:');
  });

  it('gives each loop row its own interface when split', () => {
    const output = generateTypes('<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="cell"></TMPL_LOOP>', {
      name: 'Page',
      split: true
    });

    expect(output).toContain('rows?: RowSource<PageRowsRow>;');
    expect(output).toContain('export interface PageRowsRow {');
  });

  it('describes a template that declares nothing', () => {
    expect(generateTypes('plain text', { name: 'Page' })).toBe('export interface Page {}');
  });

  it('describes names an include contributes', () => {
    const output = generateTypes('<TMPL_VAR NAME="x">', { name: 'Page' });

    expect(output).toContain('x?: ScalarSource;');
  });
});

describe('generateModule', () => {
  it('imports only the value types it used', () => {
    const scalarsOnly = generateModule([{ name: 'Page', source: '<TMPL_VAR NAME="x">' }]);

    expect(scalarsOnly).toContain("import type { ScalarSource } from '@libraz/html-template';");
    expect(scalarsOnly).not.toContain('RowSource');
  });

  it('imports nothing for a template that declares nothing', () => {
    expect(generateModule([{ name: 'Page', source: 'plain' }])).not.toContain('import');
  });

  it('takes the module to import from', () => {
    const output = generateModule([{ name: 'Page', source: '<TMPL_VAR NAME="x">' }], { importFrom: './runtime.js' });

    expect(output).toContain("from './runtime.js';");
  });

  it('describes several templates in one file', () => {
    const output = generateModule([
      { name: 'PageData', source: '<TMPL_VAR NAME="a">' },
      { name: 'MailData', source: '<TMPL_VAR NAME="b">' }
    ]);

    expect(output).toContain('export interface PageData {');
    expect(output).toContain('export interface MailData {');
  });

  it('ends with a newline', () => {
    expect(generateModule([{ name: 'Page', source: '<TMPL_VAR NAME="x">' }]).endsWith('\n')).toBe(true);
  });
});
