/**
 * Function value tests
 *
 * A function standing in for a value is resolved by the render that reads it.
 * These pin when it is called and how often, and what a callback answering
 * with the wrong shape does.
 */

import { describe, expect, it } from 'vitest';
import { compile } from '../../src/index.js';

describe('a function in place of a variable', () => {
  it('is called once per render however often the template reads it', () => {
    let calls = 0;
    const template = compile('<TMPL_VAR NAME="v"><TMPL_VAR NAME="v">');

    expect(
      template.render({
        v: () => {
          calls += 1;
          return 'x';
        }
      })
    ).toBe('xx');
    expect(calls).toBe(1);
  });

  it('is called again by the next render', () => {
    let calls = 0;
    const template = compile('<TMPL_VAR NAME="v">');
    const value = () => {
      calls += 1;
      return calls;
    };

    expect(template.render({ v: value })).toBe('1');
    expect(template.render({ v: value })).toBe('2');
  });

  it('is called on every read when memoizeLazy is off', () => {
    let calls = 0;
    const template = compile('<TMPL_VAR NAME="v"><TMPL_VAR NAME="v">');

    template.render(
      {
        v: () => {
          calls += 1;
          return 'x';
        }
      },
      { memoizeLazy: false }
    );

    expect(calls).toBe(2);
  });

  it('escapes what the function returns like any other value', () => {
    expect(compile('<TMPL_VAR NAME="v">').render({ v: () => '<b>' })).toBe('&lt;b&gt;');
  });

  it('decides a condition by what it returns', () => {
    const template = compile('<TMPL_IF NAME="c">yes<TMPL_ELSE>no</TMPL_IF>');

    expect(template.render({ c: () => true })).toBe('yes');
    expect(template.render({ c: () => '' })).toBe('no');
  });
});

describe('a function in place of loop data', () => {
  const template = compile('<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="n"></TMPL_LOOP>');

  it('supplies the rows', () => {
    expect(template.render({ rows: () => [{ n: 1 }, { n: 2 }] })).toBe('12');
  });

  it('supplies them the same way when memoizeLazy is off', () => {
    expect(template.render({ rows: () => [{ n: 3 }] }, { memoizeLazy: false })).toBe('3');
  });

  it('is called once per render', () => {
    let calls = 0;
    const twice = compile(
      '<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="n"></TMPL_LOOP><TMPL_LOOP NAME="rows"><TMPL_VAR NAME="n"></TMPL_LOOP>'
    );

    twice.render({
      rows: () => {
        calls += 1;
        return [{ n: 1 }];
      }
    });

    expect(calls).toBe(1);
  });

  it('is rejected when it answers with something other than an array', () => {
    expect(() => template.render({ rows: () => 'nope' as never })).toThrow('Lazy loop function must return an array');
  });

  it('is rejected the same way when memoizeLazy is off', () => {
    expect(() => template.render({ rows: () => 'nope' as never }, { memoizeLazy: false })).toThrow(
      'Lazy loop function must return an array'
    );
  });
});

describe('a value of the wrong kind', () => {
  it('renders a variable given loop data as empty', () => {
    expect(compile('<TMPL_VAR NAME="v">').render({ v: [{ n: 1 }] as never })).toBe('');
  });

  it('renders a variable given an object as empty', () => {
    expect(compile('<TMPL_VAR NAME="v">').render({ v: { n: 1 } as never })).toBe('');
  });

  it('renders a loop given a scalar as empty', () => {
    expect(compile('<TMPL_LOOP NAME="rows">x</TMPL_LOOP>').render({ rows: 'nope' as never })).toBe('');
  });
});
