/**
 * Legacy %VAR% syntax tests
 *
 * Part of the template syntax rather than of any API, so it survives the port
 * — but off unless a template actually needs it, since `%` is ordinary text
 * everywhere else.
 */

import { describe, expect, it } from 'vitest';
import { compile } from '../../src/index.js';

/** Compile with the legacy syntax enabled */
const percent = { legacy: { percentVars: true }, defaultEscape: 'none' } as const;

describe('%VAR% substitution', () => {
  it('substitutes a name', () => {
    expect(compile('Hello %name%!', percent).render({ name: 'World' })).toBe('Hello World!');
  });

  it('substitutes several names in one template', () => {
    expect(compile('%greeting% %name%!', percent).render({ greeting: 'Hello', name: 'World' })).toBe('Hello World!');
  });

  it('substitutes adjacent names', () => {
    expect(compile('%a%%b%%c%', percent).render({ a: '1', b: '2', c: '3' })).toBe('123');
  });

  it('substitutes at the start and end of the text', () => {
    expect(compile('%start% middle %end%', percent).render({ start: 'A', end: 'Z' })).toBe('A middle Z');
  });

  it('writes an empty string for an unset name', () => {
    expect(compile('Value: %missing%.', percent).render({})).toBe('Value: .');
  });

  it('stringifies non-string values', () => {
    expect(compile('Count: %count%', percent).render({ count: 42 })).toBe('Count: 42');
    expect(compile('Value: %zero%', percent).render({ zero: 0 })).toBe('Value: 0');
  });

  it('leaves the text alone unless the option is on', () => {
    expect(compile('Hello %name%!').render({ name: 'World' })).toBe('Hello %name%!');
  });
});

describe('%VAR% alongside TMPL tags', () => {
  it('mixes with TMPL_VAR', () => {
    expect(compile('%greeting% <TMPL_VAR NAME="name">!', percent).render({ greeting: 'Hello', name: 'World' })).toBe(
      'Hello World!'
    );
  });

  it('works inside a loop', () => {
    const template = compile('<TMPL_LOOP NAME="items">%item% </TMPL_LOOP>', percent);

    expect(template.render({ items: [{ item: 'a' }, { item: 'b' }] })).toBe('a b ');
  });

  it('works inside a conditional', () => {
    const template = compile('<TMPL_IF NAME="show">Value: %value%</TMPL_IF>', percent);

    expect(template.render({ show: true, value: 'test' })).toBe('Value: test');
  });

  it('is reported on the shape like any other variable', () => {
    const shape = compile('%foo% <TMPL_VAR NAME="bar">', percent).shape;

    expect(shape.names).toEqual(['foo', 'bar']);
    expect(shape.kind('foo')).toBe('var');
  });
});

describe('%VAR% name matching', () => {
  it('matches case-sensitively by default', () => {
    expect(compile('%FooBar%', percent).render({ FooBar: 'correct', foobar: 'wrong' })).toBe('correct');
  });

  it('folds case when asked', () => {
    expect(compile('%FooBar%', { ...percent, caseSensitive: false }).render({ foobar: 'test' })).toBe('test');
  });
});
