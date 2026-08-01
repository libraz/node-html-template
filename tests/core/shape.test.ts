/**
 * Template shape tests
 *
 * The shape is what tells a caller — and the type generator — which
 * parameters a template expects, so it has to describe the template's real
 * nesting rather than whatever the runtime lookup happens to need.
 */

import { describe, expect, it } from 'vitest';
import { compile } from '../../src/index.js';

describe('template shape', () => {
  it('lists top-level names in declaration order', () => {
    const template = compile('<TMPL_VAR NAME="zeta"><TMPL_VAR NAME="alpha"><TMPL_LOOP NAME="rows"></TMPL_LOOP>');

    expect(template.shape.names).toEqual(['zeta', 'alpha', 'rows']);
  });

  it('reports what kind each name is', () => {
    const template = compile('<TMPL_VAR NAME="v"><TMPL_LOOP NAME="l"></TMPL_LOOP><TMPL_IF NAME="c">x</TMPL_IF>');

    expect(template.shape.kind('v')).toBe('var');
    expect(template.shape.kind('l')).toBe('loop');
    expect(template.shape.kind('c')).toBe('var');
    expect(template.shape.kind('absent')).toBeUndefined();
  });

  it('records every form a name is used in', () => {
    const template = compile('<TMPL_IF NAME="x">a</TMPL_IF><TMPL_VAR NAME="x">');

    expect(template.shape.get('x')?.usages).toEqual(new Set(['if', 'var']));
  });

  it('records DEFAULT and ESCAPE for a name', () => {
    const template = compile('<TMPL_VAR NAME="x" DEFAULT="d"><TMPL_VAR NAME="x" ESCAPE=URL>');
    const info = template.shape.get('x');

    expect(info?.hasDefault).toBe(true);
    expect(info?.escapes).toEqual(new Set(['url']));
  });

  it('reports where a name first appears', () => {
    const template = compile('line one\n<TMPL_VAR NAME="x">');

    expect(template.shape.get('x')?.loc?.line).toBe(2);
  });

  it('descends into loops', () => {
    const template = compile(
      '<TMPL_LOOP NAME="outer"><TMPL_VAR NAME="mid"><TMPL_LOOP NAME="inner"><TMPL_VAR NAME="deep"></TMPL_LOOP></TMPL_LOOP>'
    );

    expect(template.shape.loop('outer')?.names).toEqual(['mid', 'inner']);
    expect(template.shape.at(['outer', 'inner'])?.names).toEqual(['deep']);
    expect(template.shape.at(['inner'])).toBeUndefined();
    expect(template.shape.loop('mid')).toBeUndefined();
  });

  it('keeps the original spelling when case folding is on', () => {
    const template = compile('<TMPL_VAR NAME="UserName">', { caseSensitive: false });
    const info = template.shape.get('username');

    expect(info?.name).toBe('UserName');
    expect(info?.key).toBe('username');
    expect(template.shape.has('USERNAME')).toBe(true);
  });

  it('describes the real nesting even when globalVars is on', () => {
    const source = '<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="cell"></TMPL_LOOP>';

    // The runtime lookup mirrors nested names into the root; the shape must
    // not, or generated types would claim `cell` is a top-level parameter.
    expect(compile(source, { globalVars: true }).shape.names).toEqual(['rows']);
    expect(compile(source, { globalVars: true }).shape.loop('rows')?.names).toEqual(['cell']);
  });

  it('resolves names from enclosing scopes at render time when globalVars is on', () => {
    const source = '<TMPL_LOOP NAME="rows">[<TMPL_VAR NAME="shared">]</TMPL_LOOP>';

    expect(compile(source).render({ rows: [{}], shared: 'x' })).toBe('[]');
    expect(compile(source, { globalVars: true }).render({ rows: [{}], shared: 'x' })).toBe('[x]');
  });
});
