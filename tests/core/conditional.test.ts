/**
 * TMPL_IF / TMPL_UNLESS / TMPL_ELSE tests
 *
 * Truthiness follows Perl's rules rather than JavaScript's, because that is
 * what the templates being ported were written against: the string "0" is
 * false, and so is an empty string.
 */

import { describe, expect, it } from 'vitest';
import { compile } from '../../src/index.js';

/**
 * Render a condition against one value.
 *
 * @param value - Value bound to the condition
 * @returns 'yes' when the branch is taken, otherwise an empty string
 */
function branch(value: unknown): string {
  return compile('<TMPL_IF NAME="x">yes</TMPL_IF>').render(value === undefined ? {} : { x: value });
}

describe('TMPL_IF truthiness', () => {
  it('takes the branch for a true value', () => {
    expect(branch(true)).toBe('yes');
    expect(branch(42)).toBe('yes');
    expect(branch('hello')).toBe('yes');
  });

  it('skips the branch for a false value', () => {
    expect(branch(false)).toBe('');
    expect(branch(0)).toBe('');
    expect(branch('')).toBe('');
    expect(branch(undefined)).toBe('');
  });

  it('treats the string "0" as false, as Perl does', () => {
    expect(branch('0')).toBe('');
  });

  it('treats an empty list as false and a populated one as true', () => {
    expect(branch([])).toBe('');
    expect(branch([{ n: 1 }])).toBe('yes');
  });

  it('treats null as false', () => {
    expect(branch(null)).toBe('');
  });
});

describe('TMPL_ELSE', () => {
  it('takes the else branch when the condition is false', () => {
    const template = compile('<TMPL_IF NAME="x">yes<TMPL_ELSE>no</TMPL_IF>');

    expect(template.render({ x: false })).toBe('no');
    expect(template.render({ x: true })).toBe('yes');
  });

  it('renders whatever the taken branch contains', () => {
    const template = compile('<TMPL_IF NAME="x">IF:<TMPL_VAR NAME="a"><TMPL_ELSE>ELSE:<TMPL_VAR NAME="b"></TMPL_IF>');

    expect(template.render({ x: false, a: 'AAA', b: 'BBB' })).toBe('ELSE:BBB');
    expect(template.render({ x: true, a: 'AAA', b: 'BBB' })).toBe('IF:AAA');
  });
});

describe('TMPL_UNLESS', () => {
  it('inverts the condition', () => {
    const template = compile('<TMPL_UNLESS NAME="x">yes</TMPL_UNLESS>');

    expect(template.render({ x: false })).toBe('yes');
    expect(template.render({ x: true })).toBe('');
    expect(template.render({})).toBe('yes');
  });

  it('works with an else branch', () => {
    const template = compile('<TMPL_UNLESS NAME="x">no<TMPL_ELSE>yes</TMPL_UNLESS>');

    expect(template.render({ x: true })).toBe('yes');
  });
});

describe('nested conditionals', () => {
  it('nests IF inside IF', () => {
    const template = compile('<TMPL_IF NAME="outer">O<TMPL_IF NAME="inner">I</TMPL_IF></TMPL_IF>');

    expect(template.render({ outer: true, inner: true })).toBe('OI');
    expect(template.render({ outer: true, inner: false })).toBe('O');
    expect(template.render({ outer: false, inner: true })).toBe('');
  });

  it('mixes IF and UNLESS', () => {
    const template = compile('<TMPL_IF NAME="a"><TMPL_UNLESS NAME="b">yes</TMPL_UNLESS></TMPL_IF>');

    expect(template.render({ a: true, b: false })).toBe('yes');
  });

  it('renders sequential conditionals independently', () => {
    const template = compile('<TMPL_IF NAME="a">A</TMPL_IF><TMPL_IF NAME="b">B</TMPL_IF><TMPL_IF NAME="c">C</TMPL_IF>');

    expect(template.render({ a: true, b: false, c: true })).toBe('AC');
  });

  it('wraps a loop', () => {
    const template = compile('<TMPL_IF NAME="show"><TMPL_LOOP NAME="items"><TMPL_VAR NAME="x"></TMPL_LOOP></TMPL_IF>');

    expect(template.render({ show: true, items: [{ x: 'a' }, { x: 'b' }] })).toBe('ab');
    expect(template.render({ show: false, items: [{ x: 'a' }] })).toBe('');
  });
});

describe('conditionals in loops', () => {
  it('re-evaluates the condition per row', () => {
    const template = compile(
      '<TMPL_LOOP NAME="items"><TMPL_IF NAME="show"><TMPL_VAR NAME="val"></TMPL_IF></TMPL_LOOP>'
    );

    const output = template.render({
      items: [
        { show: true, val: 'A' },
        { show: false, val: 'B' },
        { show: true, val: 'C' }
      ]
    });

    expect(output).toBe('AC');
  });

  it('sees enclosing names when globalVars is on', () => {
    const template = compile('<TMPL_LOOP NAME="items"><TMPL_IF NAME="outer">yes</TMPL_IF></TMPL_LOOP>', {
      globalVars: true
    });

    expect(template.render({ outer: true, items: [{}] })).toBe('yes');
  });

  it('lets a row shadow an enclosing condition', () => {
    const template = compile('<TMPL_LOOP NAME="items"><TMPL_IF NAME="foo">Y<TMPL_ELSE>N</TMPL_IF></TMPL_LOOP>', {
      globalVars: true
    });

    expect(template.render({ foo: true, items: [{ foo: false }] })).toBe('N');
  });
});

describe('HTML comment syntax', () => {
  it('accepts the comment form for IF', () => {
    expect(compile('<!-- TMPL_IF NAME="x" -->yes<!-- /TMPL_IF -->').render({ x: true })).toBe('yes');
  });

  it('accepts the comment form for UNLESS', () => {
    expect(compile('<!-- TMPL_UNLESS NAME="x" -->yes<!-- /TMPL_UNLESS -->').render({ x: false })).toBe('yes');
  });

  it('accepts the comment form for ELSE', () => {
    expect(compile('<!-- TMPL_IF NAME="x" -->yes<!-- TMPL_ELSE -->no<!-- /TMPL_IF -->').render({ x: false })).toBe(
      'no'
    );
  });
});
