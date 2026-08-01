/**
 * Parser internals tests
 *
 * The Perl compatibility suite exercises these modules through rendered
 * output. These tests pin the internal contracts that rendering cannot show:
 * the difference between an absent and an explicit ESCAPE, and the shape tree
 * that introspection and type generation both read.
 */

import { describe, expect, it } from 'vitest';
import { parseTagAttributes, TagSyntaxError } from '../src/parser/attributes.js';
import { Parser } from '../src/parser/Parser.js';
import { buildShape, resolveShape, shapeKind, shapeNames, withGlobalVars } from '../src/parser/shape.js';
import { Tokenizer } from '../src/parser/Tokenizer.js';
import type { ParseNode } from '../src/types.js';

describe('parseTagAttributes', () => {
  it('leaves escape undefined when the attribute is absent', () => {
    expect(parseTagAttributes('NAME="foo"')).toEqual({ name: 'foo' });
  });

  it('records an explicit ESCAPE=NONE so it can outrank default_escape', () => {
    expect(parseTagAttributes('NAME="foo" ESCAPE=NONE')).toEqual({ name: 'foo', escape: 'none' });
  });

  it('maps the numeric escape shorthands', () => {
    expect(parseTagAttributes('v ESCAPE=1').escape).toBe('html');
    expect(parseTagAttributes('v ESCAPE=0').escape).toBe('none');
  });

  it('accepts attributes in any order', () => {
    const expected = { name: 'foo', escape: 'html', default: 'D' };

    expect(parseTagAttributes('NAME=foo ESCAPE=HTML DEFAULT=D')).toEqual(expected);
    expect(parseTagAttributes('DEFAULT=D foo ESCAPE=HTML')).toEqual(expected);
    expect(parseTagAttributes('ESCAPE=HTML DEFAULT=D NAME=foo')).toEqual(expected);
  });

  it('treats a keyword without an equals sign as the name', () => {
    expect(parseTagAttributes('name')).toEqual({ name: 'name' });
    expect(parseTagAttributes('escape')).toEqual({ name: 'escape' });
  });

  it('keeps an empty default distinct from an absent one', () => {
    expect(parseTagAttributes('v DEFAULT=""').default).toBe('');
    expect(parseTagAttributes('v').default).toBeUndefined();
  });

  it('rejects a second name', () => {
    expect(() => parseTagAttributes('foo bar')).toThrow(TagSyntaxError);
  });

  it('rejects a duplicate escape', () => {
    expect(() => parseTagAttributes('v ESCAPE=HTML ESCAPE=URL')).toThrow(TagSyntaxError);
  });

  it('rejects an escape value Perl does not accept', () => {
    expect(() => parseTagAttributes('v ESCAPE=xml')).toThrow(TagSyntaxError);
  });

  it('ignores a self-closing slash', () => {
    expect(parseTagAttributes('NAME=foo /')).toEqual({ name: 'foo' });
  });
});

describe('buildShape', () => {
  /**
   * Parse a template into nodes without going through HTMLTemplate.
   *
   * @param source - Template text
   * @returns Parsed nodes
   */
  const parse = (source: string): ParseNode[] => new Parser(new Tokenizer(source).tokenize()).parse();

  it('keeps conditional names in the enclosing namespace', () => {
    const shape = buildShape(parse('<TMPL_IF c><TMPL_VAR inside></TMPL_IF><TMPL_VAR top>'), false);

    expect(shapeNames(shape)).toEqual(['c', 'inside', 'top']);
    expect(shape.loops.size).toBe(0);
  });

  it('opens a child namespace per loop', () => {
    const shape = buildShape(
      parse('<TMPL_LOOP L><TMPL_VAR a><TMPL_LOOP M><TMPL_VAR b></TMPL_LOOP></TMPL_LOOP>'),
      false
    );

    expect(shapeNames(shape)).toEqual(['l']);
    expect(shapeNames(resolveShape(shape, ['l']) as never)).toEqual(['a', 'm']);
    expect(shapeNames(resolveShape(shape, ['l', 'm']) as never)).toEqual(['b']);
    expect(resolveShape(shape, ['m'])).toBeUndefined();
  });

  it('merges repeated loop tags into one namespace', () => {
    const shape = buildShape(
      parse('<TMPL_LOOP L><TMPL_VAR a></TMPL_LOOP><TMPL_LOOP L><TMPL_VAR b></TMPL_LOOP>'),
      false
    );

    expect(shapeNames(resolveShape(shape, ['l']) as never)).toEqual(['a', 'b']);
  });

  it('lets a loop name win over a conditional of the same name', () => {
    const shape = buildShape(parse('<TMPL_IF L>x</TMPL_IF><TMPL_LOOP L>y</TMPL_LOOP>'), false);

    expect(shapeKind(shape, 'l')).toBe('LOOP');
  });

  it('preserves case when case_sensitive is set', () => {
    const shape = buildShape(parse('<TMPL_VAR FooBar>'), true);

    expect(shapeNames(shape)).toEqual(['FooBar']);
  });

  it('lists names in declaration order rather than sorted', () => {
    const shape = buildShape(parse('<TMPL_VAR zeta><TMPL_VAR alpha><TMPL_VAR mid>'), false);

    expect(shapeNames(shape)).toEqual(['zeta', 'alpha', 'mid']);
  });

  it('records every form a name was used in', () => {
    const shape = buildShape(parse('<TMPL_IF x>a</TMPL_IF><TMPL_UNLESS x>b</TMPL_UNLESS><TMPL_VAR x>'), false);
    const decl = shape.decls.get('x');

    expect(decl?.usages).toEqual(new Set(['if', 'unless', 'var']));
    expect(shapeKind(shape, 'x')).toBe('VAR');
  });

  it('tracks DEFAULT and ESCAPE across repeated tags', () => {
    const shape = buildShape(
      parse('<TMPL_VAR x ESCAPE=HTML><TMPL_VAR x DEFAULT="fallback"><TMPL_VAR x ESCAPE=URL>'),
      false
    );
    const decl = shape.decls.get('x');

    expect(decl?.hasDefault).toBe(true);
    expect(decl?.escapes).toEqual(new Set(['html', 'url']));
  });

  it('keeps the original spelling and first position of a folded name', () => {
    const shape = buildShape(parse('one\n<TMPL_VAR FooBar>\n<TMPL_VAR foobar>'), false);
    const decl = shape.decls.get('foobar');

    expect(decl?.key).toBe('foobar');
    expect(decl?.raw).toBe('FooBar');
    expect(decl?.loc?.line).toBe(2);
  });

  it('publishes nested variables to the root namespace with global_vars', () => {
    const shape = buildShape(
      parse('<TMPL_LOOP A><TMPL_VAR mid><TMPL_LOOP B><TMPL_VAR deep></TMPL_LOOP></TMPL_LOOP>'),
      false
    );

    // The tree itself never hoists, so type generation always sees the real
    // nesting; only the derived lookup view does.
    expect(shapeNames(shape)).toEqual(['a']);
    // Loop names stay in their own namespace; only variables are published.
    expect(shapeNames(withGlobalVars(shape))).toEqual(['a', 'mid', 'deep']);
    expect(shapeNames(shape)).toEqual(['a']);
  });
});
