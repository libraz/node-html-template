/**
 * Streaming output tests
 *
 * Two walks produce the output: a recursive one writing into a sink, and an
 * explicit-stack one yielding chunks. They have to agree exactly, so the
 * table below is checked against both.
 */

import { describe, expect, it } from 'vitest';
import { compile } from '../../src/index.js';

const CASES: Array<{ name: string; source: string; data: Record<string, unknown> }> = [
  { name: 'plain text', source: 'nothing to render', data: {} },
  { name: 'a variable', source: 'a<TMPL_VAR NAME="x">b', data: { x: 'X' } },
  { name: 'an unset variable', source: 'a<TMPL_VAR NAME="x">b', data: {} },
  { name: 'a default', source: '<TMPL_VAR NAME="x" DEFAULT="d">', data: {} },
  { name: 'an escape', source: '<TMPL_VAR NAME="x" ESCAPE="html">', data: { x: '<b>' } },
  { name: 'a taken conditional', source: '<TMPL_IF NAME="c">yes<TMPL_ELSE>no</TMPL_IF>', data: { c: true } },
  { name: 'an else branch', source: '<TMPL_IF NAME="c">yes<TMPL_ELSE>no</TMPL_IF>', data: { c: false } },
  { name: 'an empty conditional', source: 'a<TMPL_IF NAME="c">yes</TMPL_IF>b', data: { c: false } },
  {
    name: 'a loop',
    source: '<TMPL_LOOP NAME="rows">[<TMPL_VAR NAME="c">]</TMPL_LOOP>',
    data: { rows: [{ c: '1' }, { c: '2' }, { c: '3' }] }
  },
  { name: 'an empty loop', source: 'a<TMPL_LOOP NAME="rows">x</TMPL_LOOP>b', data: { rows: [] } },
  { name: 'an unset loop', source: 'a<TMPL_LOOP NAME="rows">x</TMPL_LOOP>b', data: {} },
  {
    name: 'nested loops',
    source:
      '<TMPL_LOOP NAME="outer"><TMPL_VAR NAME="o">(<TMPL_LOOP NAME="inner"><TMPL_VAR NAME="i"></TMPL_LOOP>)</TMPL_LOOP>',
    data: {
      outer: [
        { o: 'A', inner: [{ i: '1' }, { i: '2' }] },
        { o: 'B', inner: [{ i: '3' }] }
      ]
    }
  },
  {
    name: 'a conditional inside a loop',
    source: '<TMPL_LOOP NAME="rows"><TMPL_IF NAME="show"><TMPL_VAR NAME="c"></TMPL_IF></TMPL_LOOP>',
    data: {
      rows: [
        { show: true, c: 'A' },
        { show: false, c: 'B' },
        { show: true, c: 'C' }
      ]
    }
  },
  {
    name: 'a loop inside a conditional',
    source: '<TMPL_IF NAME="show"><TMPL_LOOP NAME="rows"><TMPL_VAR NAME="c"></TMPL_LOOP></TMPL_IF>',
    data: { show: true, rows: [{ c: 'a' }, { c: 'b' }] }
  },
  {
    name: 'three levels of loop',
    source:
      '<TMPL_LOOP NAME="a"><TMPL_LOOP NAME="b"><TMPL_LOOP NAME="c"><TMPL_VAR NAME="v"></TMPL_LOOP></TMPL_LOOP></TMPL_LOOP>',
    data: { a: [{ b: [{ c: [{ v: 'x' }, { v: 'y' }] }] }, { b: [{ c: [{ v: 'z' }] }] }] }
  },
  {
    name: 'a name an enclosing scope supplies',
    source: '<TMPL_LOOP NAME="rows">[<TMPL_VAR NAME="g">]</TMPL_LOOP>',
    data: { g: 'G', rows: [{}, { g: 'r' }] }
  },
  {
    name: 'names differing only in case',
    source: '<TMPL_VAR NAME="Name">|<TMPL_IF NAME="FLAG">f</TMPL_IF>',
    data: { Name: 'a', name: 'b', FLAG: 1 }
  },
  {
    name: 'null values',
    source: '<TMPL_VAR NAME="x" DEFAULT="d"><TMPL_IF NAME="x">y</TMPL_IF><TMPL_LOOP NAME="rows">r</TMPL_LOOP>',
    data: { x: null, rows: null }
  },
  {
    name: 'function values',
    source: '<TMPL_VAR NAME="v"><TMPL_IF NAME="rows">+</TMPL_IF><TMPL_LOOP NAME="rows"><TMPL_VAR NAME="c"></TMPL_LOOP>',
    data: { v: () => '<v>', rows: () => [{ c: () => 'c1' }, { c: '<c2>' }] }
  },
  { name: 'a name left to resolve', source: '<TMPL_VAR NAME="missing">|<TMPL_IF NAME="other">o</TMPL_IF>', data: {} }
];

/** Every combination of the compile options a walk consults */
const COMPILE_OPTIONS = (['none', 'html'] as const).flatMap((defaultEscape) =>
  [false, true].flatMap((caseSensitive) =>
    [false, true].map((globalVars) => ({ defaultEscape, caseSensitive, globalVars }))
  )
);

/** Every combination of the render options a walk consults */
const RENDER_OPTIONS = [false, true].flatMap((loopContextVars) =>
  [false, true].flatMap((memoizeLazy) =>
    [undefined, (name: string) => `<${name}>`].map((resolve) => ({ loopContextVars, memoizeLazy, resolve }))
  )
);

describe('renderChunks', () => {
  for (const testCase of CASES) {
    it(`matches render() for ${testCase.name} under every option combination`, () => {
      for (const compileOptions of COMPILE_OPTIONS) {
        const template = compile(testCase.source, compileOptions);

        for (const options of RENDER_OPTIONS) {
          expect([...template.renderChunks(testCase.data, options)].join(''), JSON.stringify(compileOptions)).toBe(
            template.render(testCase.data, options)
          );
        }
      }
    });
  }

  it('keeps two interleaved generators on one template independent', () => {
    const template = compile(
      '<TMPL_LOOP NAME="outer"><TMPL_VAR NAME="o">(<TMPL_LOOP NAME="inner"><TMPL_VAR NAME="i"></TMPL_LOOP>)</TMPL_LOOP>',
      { globalVars: true }
    );
    const first = {
      outer: [
        { o: 'A', inner: [{ i: '1' }, { i: '2' }] },
        { o: 'B', inner: () => [{ i: '3' }] }
      ]
    };
    const second = { o: 'G', outer: () => [{ inner: [{ i: 'x' }] }, { o: 'C', inner: [] }] };
    const a = template.renderChunks(first, { loopContextVars: true });
    const b = template.renderChunks(second);
    const out = { a: '', b: '' };

    for (let doneA = false, doneB = false; !doneA || !doneB; ) {
      if (!doneA) {
        const step = a.next();
        doneA = step.done === true;
        if (!doneA) out.a += step.value;
      }
      if (!doneB) {
        const step = b.next();
        doneB = step.done === true;
        if (!doneB) out.b += step.value;
      }
    }

    expect(out.a).toBe(template.render(first, { loopContextVars: true }));
    expect(out.b).toBe(template.render(second));
    expect(out.b).toBe('G(x)C()');
  });

  it('matches render() with loop context variables', () => {
    const template = compile(
      '<TMPL_LOOP NAME="rows">[<TMPL_VAR NAME="__counter__">/<TMPL_VAR NAME="__last__">]</TMPL_LOOP>'
    );
    const data = { rows: [{}, {}, {}] };
    const options = { loopContextVars: true };

    expect([...template.renderChunks(data, options)].join('')).toBe(template.render(data, options));
  });

  it('rejects an undeclared row key under strictData', () => {
    const template = compile('<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="c"></TMPL_LOOP>');

    expect(() => [...template.renderChunks({ rows: [{ typo: 1 }] }, { strictData: true })]).toThrow(/typo/);
  });

  it('emits nothing before the first chunk is asked for', () => {
    let calls = 0;
    const template = compile('<TMPL_VAR NAME="v">');
    const chunks = template.renderChunks({
      v: () => {
        calls += 1;
        return 'x';
      }
    });

    expect(calls).toBe(0);
    expect(chunks.next().value).toBe('x');
    expect(calls).toBe(1);
  });

  it('stops doing work when the consumer stops', () => {
    let rows = 0;
    const template = compile('<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="c"></TMPL_LOOP>', { defaultEscape: 'none' });

    for (const chunk of template.renderChunks({
      rows: [
        {
          get c() {
            rows += 1;
            return 'a';
          }
        },
        {
          get c() {
            rows += 1;
            return 'b';
          }
        }
      ]
    })) {
      expect(chunk).toBe('a');
      break;
    }

    expect(rows).toBe(1);
  });
});

describe('renderTo', () => {
  it('writes each piece as it is produced rather than one whole string', () => {
    const chunks: string[] = [];
    const template = compile('<TMPL_LOOP NAME="rows">[<TMPL_VAR NAME="c">]</TMPL_LOOP>', { defaultEscape: 'none' });

    template.renderTo({ write: (chunk) => chunks.push(chunk) }, { rows: [{ c: 'a' }, { c: 'b' }] });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe('[a][b]');
  });
});
