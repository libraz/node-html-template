/**
 * TMPL_LOOP tests
 *
 * Covers iteration, nesting, scope rules, and the loop context variables —
 * including the exact strings Perl writes for them, since templates written
 * against those values render them directly.
 */

import { describe, expect, it } from 'vitest';
import { compile } from '../../src/index.js';

describe('TMPL_LOOP', () => {
  it('renders the body once per row', () => {
    const template = compile('<TMPL_LOOP NAME="items"><TMPL_VAR NAME="value"></TMPL_LOOP>');

    expect(template.render({ items: [{ value: 'a' }, { value: 'b' }, { value: 'c' }] })).toBe('abc');
  });

  it('renders nothing for an empty list', () => {
    const template = compile('before<TMPL_LOOP NAME="items">content</TMPL_LOOP>after');

    expect(template.render({ items: [] })).toBe('beforeafter');
  });

  it('renders nothing when the loop is unset', () => {
    const template = compile('before<TMPL_LOOP NAME="items">content</TMPL_LOOP>after');

    expect(template.render({})).toBe('beforeafter');
  });

  it('substitutes several names per row', () => {
    const template = compile('<TMPL_LOOP NAME="items"><TMPL_VAR NAME="a">-<TMPL_VAR NAME="b"> </TMPL_LOOP>');

    expect(
      template.render({
        items: [
          { a: '1', b: 'one' },
          { a: '2', b: 'two' }
        ]
      })
    ).toBe('1-one 2-two ');
  });

  it('preserves whitespace in the body', () => {
    const template = compile('<TMPL_LOOP NAME="items">  <TMPL_VAR NAME="x">  </TMPL_LOOP>');

    expect(template.render({ items: [{ x: 'a' }, { x: 'b' }] })).toBe('  a    b  ');
  });

  it('accepts the HTML comment form', () => {
    const template = compile('<!-- TMPL_LOOP NAME="items" --><TMPL_VAR NAME="x"><!-- /TMPL_LOOP -->');

    expect(template.render({ items: [{ x: 'a' }, { x: 'b' }] })).toBe('ab');
  });
});

describe('nested loops', () => {
  it('renders an inner loop per outer row', () => {
    const template = compile(
      '<TMPL_LOOP NAME="outer"><TMPL_VAR NAME="name">:<TMPL_LOOP NAME="inner"><TMPL_VAR NAME="value">,</TMPL_LOOP>|</TMPL_LOOP>'
    );

    const output = template.render({
      outer: [
        { name: 'A', inner: [{ value: '1' }, { value: '2' }] },
        { name: 'B', inner: [{ value: '3' }] }
      ]
    });

    expect(output).toBe('A:1,2,|B:3,|');
  });

  it('restores the outer row after an inner loop ends', () => {
    const template = compile(
      '<TMPL_LOOP NAME="outer"><TMPL_VAR NAME="a">-<TMPL_LOOP NAME="inner"><TMPL_VAR NAME="b"></TMPL_LOOP>-<TMPL_VAR NAME="a">|</TMPL_LOOP>'
    );

    const output = template.render({
      outer: [
        { a: 'X', inner: [{ b: '1' }, { b: '2' }] },
        { a: 'Y', inner: [{ b: '3' }] }
      ]
    });

    expect(output).toBe('X-12-X|Y-3-Y|');
  });

  it('handles three levels', () => {
    const template = compile(
      '<TMPL_LOOP NAME="l1"><TMPL_LOOP NAME="l2"><TMPL_LOOP NAME="l3"><TMPL_VAR NAME="v"></TMPL_LOOP></TMPL_LOOP><TMPL_VAR NAME="x"></TMPL_LOOP>'
    );

    const output = template.render({
      l1: [
        { x: 'A', l2: [{ l3: [{ v: '1' }] }] },
        { x: 'B', l2: [{ l3: [{ v: '2' }, { v: '3' }] }] }
      ]
    });

    expect(output).toBe('1A23B');
  });
});

describe('loop scope', () => {
  it('hides enclosing names from the body', () => {
    const template = compile('<TMPL_LOOP NAME="items">[<TMPL_VAR NAME="outer">]</TMPL_LOOP>');

    expect(template.render({ outer: 'OUTER', items: [{}] })).toBe('[]');
  });

  it('exposes enclosing names when globalVars is on', () => {
    const template = compile('<TMPL_LOOP NAME="items"><TMPL_VAR NAME="outer">-<TMPL_VAR NAME="inner"> </TMPL_LOOP>', {
      globalVars: true
    });

    expect(template.render({ outer: 'OUT', items: [{ inner: '1' }, { inner: '2' }] })).toBe('OUT-1 OUT-2 ');
  });

  it('lets a row shadow an enclosing name when globalVars is on', () => {
    const template = compile('<TMPL_LOOP NAME="items"><TMPL_VAR NAME="foo"></TMPL_LOOP>', { globalVars: true });

    expect(template.render({ foo: 'outer', items: [{ foo: 'inner1' }, { foo: 'inner2' }] })).toBe('inner1inner2');
  });

  it('publishes names to the top level rather than to intermediate loops', () => {
    const template = compile(
      '<TMPL_LOOP NAME="outer"><TMPL_VAR NAME="top">.<TMPL_VAR NAME="mid"><TMPL_LOOP NAME="inner"><TMPL_VAR NAME="top"><TMPL_VAR NAME="mid"></TMPL_LOOP></TMPL_LOOP>',
      { globalVars: true }
    );

    expect(template.render({ top: 'T', outer: [{ mid: 'M', inner: [{}] }] })).toBe('T.MTM');
  });
});

describe('loop context variables', () => {
  const context = { loopContextVars: true } as const;

  /**
   * Render a loop body against a fixed number of empty rows.
   *
   * @param body - Loop body source
   * @param rows - Number of iterations
   * @returns Rendered text
   */
  function iterate(body: string, rows: number): string {
    return compile(`<TMPL_LOOP NAME="items">${body}</TMPL_LOOP>`).render(
      { items: Array.from({ length: rows }, () => ({})) },
      context
    );
  }

  it('marks the first iteration', () => {
    expect(iterate('<TMPL_IF NAME="__first__">F</TMPL_IF>.', 3)).toBe('F...');
  });

  it('marks the last iteration', () => {
    expect(iterate('.<TMPL_IF NAME="__last__">L</TMPL_IF>', 3)).toBe('...L');
  });

  it('marks the iterations that are neither first nor last', () => {
    expect(iterate('<TMPL_IF NAME="__inner__">I</TMPL_IF>', 4)).toBe('II');
  });

  it('marks the first and last iterations together', () => {
    expect(iterate('<TMPL_IF NAME="__outer__">O</TMPL_IF>', 3)).toBe('OO');
  });

  it('counts from one and indexes from zero', () => {
    expect(iterate('<TMPL_VAR NAME="__counter__"><TMPL_VAR NAME="__index__">,', 3)).toBe('10,21,32,');
  });

  it('marks odd and even iterations', () => {
    expect(iterate('<TMPL_IF NAME="__odd__">O</TMPL_IF><TMPL_IF NAME="__even__">E</TMPL_IF> ', 4)).toBe('O E O E ');
  });

  // Templates can write these values straight into the output, so the exact
  // strings matter, not just their truthiness.
  it('writes __first__ as 1 then 0', () => {
    expect(iterate('[<TMPL_VAR NAME="__first__">]', 3)).toBe('[1][0][0]');
  });

  it('writes __last__ as an empty string until the final iteration', () => {
    expect(iterate('[<TMPL_VAR NAME="__last__">]', 2)).toBe('[][1]');
    expect(iterate('[<TMPL_VAR NAME="__last__">]', 1)).toBe('[1]');
  });

  it('writes __odd__ as 1 on the first, third, ... rows and __even__ as 1 on the others, the other one empty', () => {
    expect(iterate('<TMPL_VAR NAME="__odd__">,<TMPL_VAR NAME="__even__">|', 3)).toBe('1,|,1|1,|');
  });

  it('provides nothing unless asked', () => {
    expect(compile('<TMPL_LOOP NAME="items">[<TMPL_VAR NAME="__counter__">]</TMPL_LOOP>').render({ items: [{}] })).toBe(
      '[]'
    );
  });
});
