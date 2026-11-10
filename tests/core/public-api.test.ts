/**
 * Public API shape tests
 *
 * Pins, from the consumer's side, what the entry point promises: a typed
 * syntax error with its location, async counterparts for every text entry
 * point, and filter callbacks typed by their `format`.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  compile,
  Environment,
  type Filter,
  memoryLoader,
  render,
  renderAsync,
  type TemplateLoader,
  TemplateSyntaxError
} from '../../src/index.js';

/** Wrap a synchronous loader so every answer is a promise */
function asyncLoader(files: Record<string, string>): TemplateLoader<false> {
  const inner = memoryLoader(files);
  return {
    sync: false,
    resolve: async (request) => inner.resolve(request),
    read: async (id) => inner.read(id)
  };
}

/** Capture what a call throws */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

describe('TemplateSyntaxError', () => {
  it('carries the location of a malformed tag', () => {
    const error = thrown(() => compile('ok\n  <TMPL_VAR NAME="a" ESCAPE=bogus>', { filename: 'page.tmpl' }));

    expect(error).toBeInstanceOf(TemplateSyntaxError);
    expect(error).toBeInstanceOf(Error);
    expect((error as TemplateSyntaxError).name).toBe('TemplateSyntaxError');
    expect((error as TemplateSyntaxError).file).toBe('page.tmpl');
    expect((error as TemplateSyntaxError).line).toBe(2);
    expect((error as TemplateSyntaxError).col).toBe(3);
  });

  it('names the included template for an error inside it', () => {
    const loader = memoryLoader({ 'inner.tmpl': 'x\n<TMPL_IF a>' });
    const error = thrown(() => compile('<TMPL_INCLUDE NAME="inner.tmpl">', { loader }));

    expect(error).toBeInstanceOf(TemplateSyntaxError);
    expect((error as TemplateSyntaxError).file).toBe('inner.tmpl');
  });

  it('covers a tag the settings reject, naming the option to change', () => {
    const error = thrown(() => compile('<TMPL_INCLUDE NAME="a.tmpl">', { includes: false }));

    expect(error).toBeInstanceOf(TemplateSyntaxError);
    expect((error as Error).message).toMatch(/includes: false/);
  });

  it('is not used for failures that are not about the text', () => {
    const loader = memoryLoader({ 'a.tmpl': '<TMPL_INCLUDE NAME="a.tmpl">' });
    const error = thrown(() => compile('<TMPL_INCLUDE NAME="a.tmpl">', { loader }));

    expect(error).not.toBeInstanceOf(TemplateSyntaxError);
  });

  it('points at includes.maxDepth when the depth limit is hit', () => {
    const loader = memoryLoader({ 'a.tmpl': '<TMPL_INCLUDE NAME="b.tmpl">', 'b.tmpl': 'b' });

    expect(() => compile('<TMPL_INCLUDE NAME="a.tmpl">', { loader, includes: { maxDepth: 2 } })).toThrow(
      /raise includes\.maxDepth/
    );
  });

  it('lifts the depth limit with Infinity', () => {
    const loader = memoryLoader({ 'a.tmpl': '<TMPL_INCLUDE NAME="b.tmpl">', 'b.tmpl': 'b' });

    expect(render('<TMPL_INCLUDE NAME="a.tmpl">', {}, { loader, includes: { maxDepth: Infinity } })).toBe('b');
  });
});

describe('async text entry points', () => {
  const loader = asyncLoader({ 'part.tmpl': '<TMPL_VAR who>' });
  const source = 'Hi <TMPL_INCLUDE NAME="part.tmpl">';

  it('renderAsync compiles and renders through an async loader', async () => {
    await expect(renderAsync(source, { who: 'Ann' }, { loader })).resolves.toBe('Hi Ann');
  });

  it('Environment.compileAsync and renderAsync use the environment loader', async () => {
    const env = new Environment({ loader });

    await expect(env.renderAsync(source, { who: 'Bo' })).resolves.toBe('Hi Bo');
    expect((await env.compileAsync(source)).render({ who: 'Cy' })).toBe('Hi Cy');
  });

  it('the synchronous Environment.compile points to the async variant', () => {
    const env = new Environment({ loader });

    expect(() => env.compile(source)).toThrow(/compileAsync/);
  });
});

describe('Filter', () => {
  it('types the callback argument by format', () => {
    const lines: Filter = {
      format: 'array',
      sub: (content) => {
        expectTypeOf(content).toEqualTypeOf<string[]>();
        return content.map((line) => line.trimStart());
      }
    };
    const text: Filter = {
      sub: (content) => {
        expectTypeOf(content).toEqualTypeOf<string>();
        return content.replace('<TMPL_VAR a>', '[<TMPL_VAR a>]');
      }
    };

    expect(render('  <TMPL_VAR a>  \nb', { a: 'x' }, { filters: [lines, text] })).toBe('[x]  \nb');
  });
});
