/**
 * TMPL_INCLUDE tests
 *
 * The tag's syntax and its effect on the compiled template. The expander's own
 * rules — read-once, cycles, depth, provenance — are pinned separately against
 * the expander itself.
 */

import { describe, expect, it } from 'vitest';
import { compile, compileAsync, Environment, memoryLoader, TemplateNotFoundError } from '../../src/index.js';

const FILES = {
  'header.tmpl': '<h1>Site Header</h1>\n',
  'footer.tmpl': '<footer>end</footer>',
  'with-vars.tmpl': 'Hello <TMPL_VAR NAME="name">!',
  'with-loop.tmpl': '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="item">,</TMPL_LOOP>',
  'with-whitespace.tmpl': '  content  \n',
  'outer.tmpl': 'Outer start <TMPL_INCLUDE NAME="inner.tmpl"> Outer end',
  'inner.tmpl': 'Inner: <TMPL_VAR NAME="inner_var">'
};

/**
 * Compile against the fixed set of in-memory templates.
 *
 * @param source - Template text
 * @param options - Extra compile settings
 * @returns Compiled template
 */
function withIncludes(source: string, options: Record<string, unknown> = {}) {
  return compile(source, { loader: memoryLoader(FILES), defaultEscape: 'none', ...options });
}

describe('TMPL_INCLUDE syntax', () => {
  it('splices the named template in place', () => {
    expect(withIncludes('Start <TMPL_INCLUDE NAME="header.tmpl"> End').render({})).toBe(
      'Start <h1>Site Header</h1>\n End'
    );
  });

  it('accepts single quotes', () => {
    expect(withIncludes("<TMPL_INCLUDE NAME='header.tmpl'>").render({})).toBe('<h1>Site Header</h1>\n');
  });

  it('accepts an unquoted name', () => {
    expect(withIncludes('<TMPL_INCLUDE NAME=header.tmpl>').render({})).toBe('<h1>Site Header</h1>\n');
  });

  it('accepts the name without the NAME attribute', () => {
    expect(withIncludes('<TMPL_INCLUDE header.tmpl>').render({})).toBe('<h1>Site Header</h1>\n');
  });

  it('accepts the HTML comment form', () => {
    expect(withIncludes('<!-- TMPL_INCLUDE NAME="header.tmpl" -->').render({})).toBe('<h1>Site Header</h1>\n');
  });

  it('reports a tag naming nothing', () => {
    expect(() => withIncludes('<TMPL_INCLUDE>')).toThrow(/No NAME given/);
    expect(() => withIncludes('<TMPL_INCLUDE NAME="">')).toThrow(/No NAME given/);
  });
});

describe('included content', () => {
  it('parses tags in the included text', () => {
    expect(withIncludes('Start: <TMPL_INCLUDE NAME="with-vars.tmpl">').render({ name: 'World' })).toBe(
      'Start: Hello World!'
    );
  });

  it('parses loops in the included text', () => {
    expect(
      withIncludes('Items: <TMPL_INCLUDE NAME="with-loop.tmpl">').render({
        items: [{ item: 'a' }, { item: 'b' }, { item: 'c' }]
      })
    ).toBe('Items: a,b,c,');
  });

  it('expands includes of includes', () => {
    expect(withIncludes('<TMPL_INCLUDE NAME="outer.tmpl">').render({ inner_var: 'deep' })).toBe(
      'Outer start Inner: deep Outer end'
    );
  });

  it('preserves the included text exactly', () => {
    expect(withIncludes('<TMPL_INCLUDE NAME="with-whitespace.tmpl">').render({})).toBe('  content  \n');
    expect(withIncludes('Start\n<TMPL_INCLUDE NAME="header.tmpl">\nEnd').render({})).toBe(
      'Start\n<h1>Site Header</h1>\n\nEnd'
    );
  });

  it('declares names from the included text on the shape', () => {
    expect(withIncludes('<TMPL_INCLUDE NAME="with-vars.tmpl">').shape.names).toEqual(['name']);
  });
});

describe('include settings', () => {
  it('rejects any include when includes are turned off', () => {
    expect(() => withIncludes('A<TMPL_INCLUDE NAME="header.tmpl">B', { includes: false })).toThrow(/no_includes/);
  });

  it('drops a missing include when told to ignore it', () => {
    expect(
      withIncludes('Before <TMPL_INCLUDE NAME="absent.tmpl"> After', { includes: { onMissing: 'ignore' } }).render({})
    ).toBe('Before  After');
  });

  it('reports a missing include by default', () => {
    expect(() => withIncludes('<TMPL_INCLUDE NAME="absent.tmpl">')).toThrow(/absent\.tmpl/);
  });

  it('reports a missing template as the exported TemplateNotFoundError on every compile path', async () => {
    const loader = memoryLoader(FILES);
    const env = new Environment({ loader });
    const source = '<TMPL_INCLUDE NAME="absent.tmpl">';
    const failures = [
      catchError(() => compile(source, { loader })),
      await rejection(compileAsync(source, { loader })),
      catchError(() => env.compileFile('absent.tmpl')),
      await rejection(env.compileFileAsync('absent.tmpl'))
    ];

    for (const error of failures) {
      expect(error).toBeInstanceOf(TemplateNotFoundError);
      expect((error as Error).name).toBe('TemplateNotFoundError');
      expect((error as TemplateNotFoundError).templateName).toBe('absent.tmpl');
    }
  });

  it('keeps expanding the includes that follow an ignored one', () => {
    const template = withIncludes('<TMPL_INCLUDE NAME="absent.tmpl"><TMPL_INCLUDE NAME="outer.tmpl">', {
      includes: { onMissing: 'ignore' }
    });

    expect(template.render({ inner_var: 'x' })).toBe('Outer start Inner: x Outer end');
  });

  it('applies filters to included text as well', () => {
    const template = withIncludes('<TMPL_INCLUDE NAME="with-vars.tmpl">', {
      filters: [{ sub: (content: string | string[]) => (content as string).replace('Hello', 'Hi') }]
    });

    expect(template.render({ name: 'Sam' })).toBe('Hi Sam!');
  });
});

/**
 * Capture what a call throws.
 *
 * @param fn - Call expected to throw
 * @returns The thrown value
 */
function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

/**
 * Capture what a promise rejects with.
 *
 * @param promise - Promise expected to reject
 * @returns The rejection reason
 */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected the promise to reject');
    },
    (error: unknown) => error
  );
}
