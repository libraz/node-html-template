/**
 * Template syntax tests
 *
 * Everything that is neither a loop, a conditional, nor an escape: variable
 * substitution, comments, the HTML comment form of every tag, filters, and
 * what a malformed template reports.
 */

import { describe, expect, it } from 'vitest';
import { compile } from '../../src/index.js';

/** Compile with escaping off so raw values pass through unchanged */
const raw = { defaultEscape: 'none' } as const;

describe('TMPL_VAR', () => {
  it('substitutes the same name wherever it appears', () => {
    expect(compile('<TMPL_VAR NAME="x"> <TMPL_VAR NAME="x"> <TMPL_VAR NAME="x">').render({ x: 'bar' })).toBe(
      'bar bar bar'
    );
  });

  it('stringifies non-string values', () => {
    expect(compile('<TMPL_VAR NAME="x">').render({ x: 42 })).toBe('42');
    expect(compile('<TMPL_VAR NAME="x">').render({ x: 0 })).toBe('0');
    expect(compile('<TMPL_VAR NAME="x">').render({ x: false })).toBe('false');
  });

  it('accepts the HTML comment form', () => {
    expect(compile('Hello <!-- TMPL_VAR NAME="name" -->').render({ name: 'World' })).toBe('Hello World');
  });

  it('mixes both tag forms', () => {
    expect(compile('<TMPL_VAR NAME="a"> <!-- TMPL_VAR NAME="b" -->').render({ a: '1', b: '2' })).toBe('1 2');
  });

  it('reports a tag with no name', () => {
    expect(() => compile('<TMPL_VAR>')).toThrow(/No NAME given/);
  });
});

describe('DEFAULT', () => {
  it('applies only when the value is unset', () => {
    const template = compile('Hello <TMPL_VAR NAME="name" DEFAULT="World">');

    expect(template.render({})).toBe('Hello World');
    expect(template.render({ name: 'Sam' })).toBe('Hello Sam');
  });

  it('does not apply to an empty value', () => {
    expect(compile('<TMPL_VAR NAME="x" DEFAULT="fallback">').render({ x: '' })).toBe('');
  });

  it('accepts an empty default', () => {
    expect(compile('[<TMPL_VAR NAME="x" DEFAULT="">]').render({})).toBe('[]');
  });

  it('applies per row inside a loop', () => {
    const template = compile('<TMPL_LOOP NAME="items"><TMPL_VAR NAME="x" DEFAULT="none">,</TMPL_LOOP>');

    expect(template.render({ items: [{}, { x: 'a' }, {}] })).toBe('none,a,none,');
  });
});

describe('TMPL_COMMENT', () => {
  it('drops the block and its contents', () => {
    expect(compile('Hello <TMPL_COMMENT>this is a comment</TMPL_COMMENT>World').render({})).toBe('Hello World');
  });

  it('accepts the NOTE spelling', () => {
    expect(compile('A<TMPL_NOTE>note here</TMPL_NOTE>B').render({})).toBe('AB');
  });

  it('accepts the HTML comment form', () => {
    expect(compile('X<!-- TMPL_COMMENT -->hidden<!-- /TMPL_COMMENT -->Y').render({})).toBe('XY');
  });

  it('drops a block spanning several lines', () => {
    expect(compile('Before\n<TMPL_COMMENT>\n  hidden\n</TMPL_COMMENT>\nAfter').render({})).toBe('Before\n\nAfter');
  });

  it('drops every block in the template', () => {
    expect(compile('A<TMPL_COMMENT>1</TMPL_COMMENT>B<TMPL_COMMENT>2</TMPL_COMMENT>C').render({})).toBe('ABC');
  });
});

describe('text handling', () => {
  it('preserves surrounding whitespace', () => {
    expect(compile('  <TMPL_VAR NAME="x">  ').render({ x: 'bar' })).toBe('  bar  ');
    expect(compile('Line 1\n<TMPL_VAR NAME="x">\nLine 3').render({ x: 'Line 2' })).toBe('Line 1\nLine 2\nLine 3');
  });

  it('renders a template with no tags unchanged', () => {
    expect(compile('   \n\t  ').render({})).toBe('   \n\t  ');
    expect(compile('').render({})).toBe('');
  });

  it('carries non-ASCII values through', () => {
    expect(compile('<TMPL_VAR NAME="x">', raw).render({ x: 'こんにちは世界' })).toBe('こんにちは世界');
    expect(compile('<TMPL_VAR NAME="x">', raw).render({ x: '🎉🚀' })).toBe('🎉🚀');
  });
});

describe('malformed templates', () => {
  it('reports an unclosed block', () => {
    expect(() => compile('<TMPL_LOOP NAME="items">body')).toThrow(/Unclosed LOOP/);
    expect(() => compile('<TMPL_IF NAME="x">body')).toThrow(/Unclosed IF/);
  });

  it('reports a closing tag with nothing open', () => {
    expect(() => compile('</TMPL_LOOP>')).toThrow(/Unexpected ENDLOOP/);
    expect(() => compile('</TMPL_IF>')).toThrow(/Unexpected ENDIF/);
    expect(() => compile('<TMPL_ELSE>')).toThrow(/Unexpected ELSE/);
  });

  it('reports an unknown tag', () => {
    expect(() => compile('<TMPL_BOGUS NAME="x">')).toThrow(/Syntax error/);
  });

  it('leaves an unknown tag as text when strict is off', () => {
    expect(compile('A<TMPL_BOGUS NAME="x">B', { strict: false }).render({})).toBe('A<TMPL_BOGUS NAME="x">B');
  });
  // Perl splits tags at `<` immediately followed by `TMPL_` or `!--`.
  it('treats a space after the opening bracket as text, as Perl does', () => {
    expect(compile('< TMPL_VAR NAME="x">').render({ x: 'y' })).toBe('< TMPL_VAR NAME="x">');
    expect(compile('< !-- TMPL_VAR NAME="x" -->').render({ x: 'y' })).toBe('< !-- TMPL_VAR NAME="x" -->');
  });

  it('still accepts space inside the comment form', () => {
    expect(compile('<!--   TMPL_VAR NAME="x" -->').render({ x: 'y' })).toBe('y');
  });
});

describe('scanning time', () => {
  const LIMIT_MS = 250;

  /**
   * Time a compile that is expected to fail or succeed quickly.
   *
   * @param run - Compile call
   * @returns Elapsed milliseconds
   */
  function elapsed(run: () => unknown): number {
    const start = performance.now();
    try {
      run();
    } catch {
      // Only the time matters here.
    }
    return performance.now() - start;
  }

  it.each([
    ['spaces after an unclosed tag', `<TMPL_VAR${' '.repeat(50_000)}`],
    ['newlines after an unclosed tag', `<TMPL_VAR${'\n'.repeat(50_000)}`],
    ['an unclosed comment-form tag', `<!-- TMPL_VAR x --${' '.repeat(50_000)}`],
    ['many unclosed tags', '<TMPL_VAR x '.repeat(20_000)],
    ['many unclosed includes', '<TMPL_INCLUDE x '.repeat(20_000)],
    ['an unclosed comment block', `<TMPL_COMMENT>${' '.repeat(50_000)}`],
    ['many unclosed comment blocks', '<TMPL_COMMENT> '.repeat(20_000)],
    ['whitespace inside a closed tag', `<TMPL_VAR x${' '.repeat(50_000)}/>`]
  ])('stays linear on %s', (_name, source) => {
    expect(elapsed(() => compile(source))).toBeLessThan(LIMIT_MS);
    expect(elapsed(() => compile(source, { strict: false }))).toBeLessThan(LIMIT_MS);
  });

  it('still rejects an unclosed tag under strict', () => {
    expect(() => compile(`text\n<TMPL_VAR${' '.repeat(10_000)}`)).toThrow('malformed tag at line 2');
  });
});

describe('filters', () => {
  it('rewrites the source before it is parsed', () => {
    // The filter sees template text, not rendered output, so it can introduce
    // a tag that did not appear in the original source.
    const template = compile('hello XXnameXX', {
      ...raw,
      filters: [{ sub: (content) => (content as string).replace(/XX(\w+)XX/g, '<TMPL_VAR NAME=$1>'), format: 'scalar' }]
    });

    expect(template.shape.names).toEqual(['name']);
    expect(template.render({ name: 'world' })).toBe('hello world');
  });

  it('can work line by line', () => {
    const template = compile('line1\nline2\nline3', {
      filters: [{ sub: (content) => (content as string[]).filter((line) => line.includes('2')), format: 'array' }]
    });

    expect(template.render({})).toBe('line2\n');
  });

  it('applies in order', () => {
    const template = compile('hello', {
      filters: [{ sub: (c) => `${c as string} world` }, { sub: (c) => (c as string).toUpperCase() }]
    });

    expect(template.render({})).toBe('HELLO WORLD');
  });
});
