/**
 * Parser internals tests
 *
 * The Perl compatibility suite exercises these modules through rendered
 * output. These tests pin the internal contracts that rendering cannot show:
 * the difference between an absent and an explicit ESCAPE, and the shape of
 * the parameter scope tree.
 */

import { describe, expect, it } from 'vitest';
import { parseTagAttributes, TagSyntaxError } from '../src/parser/attributes.js';
import { buildParamScope, resolveScope, scopeNames } from '../src/parser/ParamScope.js';
import { Parser } from '../src/parser/Parser.js';
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

describe('buildParamScope', () => {
  /**
   * Parse a template into nodes without going through HTMLTemplate.
   *
   * @param source - Template text
   * @returns Parsed nodes
   */
  const parse = (source: string): ParseNode[] => new Parser(new Tokenizer(source).tokenize()).parse();

  it('keeps conditional names in the enclosing scope', () => {
    const scope = buildParamScope(parse('<TMPL_IF c><TMPL_VAR inside></TMPL_IF><TMPL_VAR top>'), false);

    expect(scopeNames(scope)).toEqual(['c', 'inside', 'top']);
    expect(scope.loops.size).toBe(0);
  });

  it('opens a child scope per loop', () => {
    const scope = buildParamScope(
      parse('<TMPL_LOOP L><TMPL_VAR a><TMPL_LOOP M><TMPL_VAR b></TMPL_LOOP></TMPL_LOOP>'),
      false
    );

    expect(scopeNames(scope)).toEqual(['l']);
    expect(scopeNames(resolveScope(scope, ['l']) as never)).toEqual(['a', 'm']);
    expect(scopeNames(resolveScope(scope, ['l', 'm']) as never)).toEqual(['b']);
    expect(resolveScope(scope, ['m'])).toBeUndefined();
  });

  it('merges repeated loop tags into one scope', () => {
    const scope = buildParamScope(
      parse('<TMPL_LOOP L><TMPL_VAR a></TMPL_LOOP><TMPL_LOOP L><TMPL_VAR b></TMPL_LOOP>'),
      false
    );

    expect(scopeNames(resolveScope(scope, ['l']) as never)).toEqual(['a', 'b']);
  });

  it('lets a loop name win over a conditional of the same name', () => {
    const scope = buildParamScope(parse('<TMPL_IF L>x</TMPL_IF><TMPL_LOOP L>y</TMPL_LOOP>'), false);

    expect(scope.types.get('l')).toBe('LOOP');
  });

  it('preserves case when case_sensitive is set', () => {
    const scope = buildParamScope(parse('<TMPL_VAR FooBar>'), true);

    expect(scopeNames(scope)).toEqual(['FooBar']);
  });

  it('publishes nested variables to the root scope with global_vars', () => {
    const nodes = parse('<TMPL_LOOP A><TMPL_VAR mid><TMPL_LOOP B><TMPL_VAR deep></TMPL_LOOP></TMPL_LOOP>');

    expect(scopeNames(buildParamScope(nodes, false, false))).toEqual(['a']);
    // Loop names stay in their own scope; only variables are published.
    expect(scopeNames(buildParamScope(nodes, false, true))).toEqual(['a', 'deep', 'mid']);
  });
});
