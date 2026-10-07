/**
 * Generated interfaces as type arguments
 *
 * Codegen emits an interface, which carries no implicit index signature. This file
 * declares the interface exactly as codegen emits it and passes it to every
 * generic entry point; `yarn type-check` (strict) compiles it, and the first
 * test pins that the declaration still matches what codegen produces.
 */

import { describe, expect, it } from 'vitest';
import { generateModule } from '../../src/codegen/index.js';
import {
  compile,
  compileAsync,
  Environment,
  memoryLoader,
  type RowSource,
  render,
  type ScalarSource,
  type Template
} from '../../src/index.js';

const SOURCE = '<TMPL_VAR NAME="title"><TMPL_LOOP NAME="rows">[<TMPL_VAR NAME="label">]</TMPL_LOOP>';

interface PageData {
  title?: ScalarSource;
  rows?: RowSource<{
    label?: ScalarSource;
  }>;
}

const DATA: PageData = { title: 'T', rows: [{ label: 'a' }, { label: 'b' }] };
const EXPECTED = 'T[a][b]';

describe('generated interface as a type argument', () => {
  it('is the interface codegen emits', () => {
    const declaration = [
      'export interface PageData {',
      '  title?: ScalarSource;',
      '  rows?: RowSource<{',
      '    label?: ScalarSource;',
      '  }>;',
      '}'
    ].join('\n');

    expect(generateModule([{ name: 'PageData', source: SOURCE }])).toContain(declaration);
  });

  it('is accepted by compile, compileAsync, render and Template', async () => {
    const template: Template<PageData> = compile<PageData>(SOURCE);

    expect(template.render(DATA)).toBe(EXPECTED);
    expect([...template.renderChunks(DATA)].join('')).toBe(EXPECTED);
    expect((await compileAsync<PageData>(SOURCE)).render(DATA)).toBe(EXPECTED);
    expect(render<PageData>(SOURCE, DATA)).toBe(EXPECTED);
  });

  it('is accepted by every Environment method', async () => {
    const env = new Environment({ loader: memoryLoader({ 'page.tmpl': SOURCE }) });

    expect(env.compile<PageData>(SOURCE).render(DATA)).toBe(EXPECTED);
    expect(env.compileFile<PageData>('page.tmpl').render(DATA)).toBe(EXPECTED);
    expect((await env.compileFileAsync<PageData>('page.tmpl')).render(DATA)).toBe(EXPECTED);
    expect(env.render<PageData>(SOURCE, DATA)).toBe(EXPECTED);
    expect(env.renderFile<PageData>('page.tmpl', DATA)).toBe(EXPECTED);
    expect(await env.renderFileAsync<PageData>('page.tmpl', DATA)).toBe(EXPECTED);
  });
});
