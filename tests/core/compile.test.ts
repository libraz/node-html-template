/**
 * compile() and render() tests
 *
 * Covers the new API's own contract: immutability of a compiled template,
 * the defaults it applies, and the behaviour of its render settings.
 */

import { describe, expect, it } from 'vitest';
import type { TemplateLoader } from '../../src/index.js';
import { compile, compileAsync, memoryLoader, render } from '../../src/index.js';

describe('compile', () => {
  it('renders a variable', () => {
    expect(compile('<TMPL_VAR NAME="title">').render({ title: 'Hello' })).toBe('Hello');
  });

  it('renders the same template repeatedly with different data', () => {
    const template = compile('<TMPL_VAR NAME="n">');

    expect(template.render({ n: 1 })).toBe('1');
    expect(template.render({ n: 2 })).toBe('2');
    expect(template.render({ n: 1 })).toBe('1');
  });

  it('leaves an unset variable empty', () => {
    expect(compile('[<TMPL_VAR NAME="missing">]').render({})).toBe('[]');
  });

  it('writes a DEFAULT when the value is unset', () => {
    expect(compile('<TMPL_VAR NAME="x" DEFAULT="fallback">').render({})).toBe('fallback');
  });

  it('renders loops', () => {
    const template = compile('<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="cell"></TMPL_LOOP>');

    expect(template.render({ rows: [{ cell: 'a' }, { cell: 'b' }] })).toBe('ab');
  });

  it('renders conditionals', () => {
    const template = compile('<TMPL_IF NAME="on">yes<TMPL_ELSE>no</TMPL_IF>');

    expect(template.render({ on: true })).toBe('yes');
    expect(template.render({ on: false })).toBe('no');
  });

  it('resolves a callback only when the template reaches it', () => {
    let calls = 0;
    const template = compile('<TMPL_IF NAME="on"><TMPL_VAR NAME="lazy"></TMPL_IF>');

    template.render({
      on: false,
      lazy: () => {
        calls += 1;
        return 'x';
      }
    });

    expect(calls).toBe(0);
  });

  it('calls a callback once per render by default', () => {
    let calls = 0;
    const template = compile('<TMPL_VAR NAME="v"><TMPL_VAR NAME="v">');
    const data = {
      v: () => {
        calls += 1;
        return 'x';
      }
    };

    expect(template.render(data)).toBe('xx');
    expect(calls).toBe(1);

    template.render(data);
    expect(calls).toBe(2);
  });

  it('calls a callback on every reference when memoizing is off', () => {
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

  it('accepts a callback supplying loop rows', () => {
    const template = compile('<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="cell"></TMPL_LOOP>');

    expect(template.render({ rows: () => [{ cell: 'a' }, { cell: 'b' }] })).toBe('ab');
  });
});

describe('compile defaults', () => {
  it('escapes HTML by default', () => {
    expect(compile('<TMPL_VAR NAME="x">').render({ x: '<b>&</b>' })).toBe('&lt;b&gt;&amp;&lt;/b&gt;');
  });

  it('lets an explicit ESCAPE=NONE opt out of the default', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE=NONE>').render({ x: '<b>' })).toBe('<b>');
  });

  it('never escapes a DEFAULT value', () => {
    // A DEFAULT cannot contain '>', which would close the tag, so '&' stands
    // in for "a character the default escape would otherwise rewrite".
    expect(compile('<TMPL_VAR NAME="x" DEFAULT="a&b">').render({})).toBe('a&b');
    expect(compile('<TMPL_VAR NAME="x" DEFAULT="a&b">').render({ x: 'a&b' })).toBe('a&amp;b');
  });

  it('honours an explicit defaultEscape', () => {
    expect(compile('<TMPL_VAR NAME="x">', { defaultEscape: 'none' }).render({ x: '<b>' })).toBe('<b>');
    expect(compile('<TMPL_VAR NAME="x">', { defaultEscape: 'url' }).render({ x: 'a b' })).toBe('a%20b');
  });

  it('matches names case-sensitively by default', () => {
    const template = compile('<TMPL_VAR NAME="userName">');

    expect(template.render({ userName: 'set' })).toBe('set');
    expect(template.render({ username: 'set' })).toBe('');
  });

  it('folds case when asked', () => {
    const template = compile('<TMPL_VAR NAME="userName">', { caseSensitive: false });

    expect(template.render({ USERNAME: 'set' })).toBe('set');
  });

  it('rejects a malformed tag by default', () => {
    expect(() => compile('<TMPL_VAR>')).toThrow();
  });

  it('keeps an unknown tag as text when strict is off', () => {
    expect(compile('a <TMPL_BOGUS x> b', { strict: false }).render({})).toBe('a <TMPL_BOGUS x> b');
  });

  it('leaves percent variables alone unless the legacy option is on', () => {
    expect(compile('%name%').render({ name: 'x' })).toBe('%name%');
    expect(compile('%name%', { legacy: { percentVars: true } }).render({ name: 'x' })).toBe('x');
  });
});

describe('render options', () => {
  it('ignores undeclared data keys by default', () => {
    expect(compile('<TMPL_VAR NAME="x">').render({ x: 'a', extra: 'b' })).toBe('a');
  });

  it('rejects undeclared data keys under strictData', () => {
    expect(() => compile('<TMPL_VAR NAME="x">').render({ x: 'a', extra: 'b' }, { strictData: true })).toThrow(/extra/);
  });

  it('provides loop context variables when asked', () => {
    const template = compile(
      '<TMPL_LOOP NAME="rows"><TMPL_IF NAME="__first__">[</TMPL_IF><TMPL_VAR NAME="c"></TMPL_LOOP>'
    );

    expect(template.render({ rows: [{ c: 'a' }, { c: 'b' }] })).toBe('ab');
    expect(template.render({ rows: [{ c: 'a' }, { c: 'b' }] }, { loopContextVars: true })).toBe('[ab');
  });

  it('consults the resolve hook for names absent from the data', () => {
    const template = compile('<TMPL_VAR NAME="x">/<TMPL_VAR NAME="y">');
    const output = template.render({ x: 'given' }, { resolve: (name) => `resolved:${name}` });

    expect(output).toBe('given/resolved:y');
  });

  it('does not consult the resolve hook inside a loop iteration', () => {
    const template = compile('<TMPL_LOOP NAME="rows">[<TMPL_VAR NAME="absent">]</TMPL_LOOP>');
    const output = template.render({ rows: [{}] }, { resolve: () => 'from-hook' });

    expect(output).toBe('[]');
  });
});

describe('includes', () => {
  it('expands includes through a loader', () => {
    const template = compile('<TMPL_INCLUDE NAME="part.tmpl">', {
      loader: memoryLoader({ 'part.tmpl': 'included' })
    });

    expect(template.render({})).toBe('included');
  });

  // There is no default loader: the core reaches templates only through one,
  // which is what keeps it free of any filesystem dependency.
  it('reports an include with no loader configured', () => {
    expect(() => compile('<TMPL_INCLUDE NAME="part.tmpl">')).toThrow(/needs a loader/);
  });

  it('compiles a template with no includes without a loader', () => {
    expect(compile('<TMPL_VAR NAME="x">').render({ x: 'ok' })).toBe('ok');
  });

  it('rejects includes when they are turned off', () => {
    expect(() => compile('<TMPL_INCLUDE NAME="part.tmpl">', { includes: false })).toThrow();
  });

  it('accepts include settings', () => {
    const template = compile('[<TMPL_INCLUDE NAME="absent.tmpl">]', {
      loader: memoryLoader({}),
      includes: { onMissing: 'ignore' }
    });

    expect(template.render({})).toBe('[]');
  });
});

describe('render', () => {
  it('compiles and renders in one step', () => {
    expect(render('<TMPL_VAR NAME="x">', { x: 'value' })).toBe('value');
  });

  it('accepts compile and render settings together', () => {
    expect(render('<TMPL_VAR NAME="x">', { x: '<b>' }, { defaultEscape: 'none' })).toBe('<b>');
  });
});

describe('render isolation', () => {
  // A render used to mutate scope state held on the template, so a loop that
  // threw left the next render walking from the wrong scope. Building that
  // state per render removes the failure mode rather than patching it.
  it('is unaffected by an earlier render that threw inside a loop', () => {
    const template = compile('<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="c"></TMPL_LOOP>');

    expect(() => template.render({ rows: [{ undeclared: 1 }] }, { strictData: true })).toThrow();
    expect(template.render({ rows: [{ c: 'ok' }] })).toBe('ok');
  });

  it('does not leak data between renders', () => {
    const template = compile('[<TMPL_VAR NAME="a">][<TMPL_VAR NAME="b">]');

    expect(template.render({ a: '1', b: '2' })).toBe('[1][2]');
    expect(template.render({ a: '3' })).toBe('[3][]');
  });

  it('keeps nested loop scopes separate', () => {
    const template = compile(
      '<TMPL_LOOP NAME="outer"><TMPL_VAR NAME="x"><TMPL_LOOP NAME="inner"><TMPL_VAR NAME="x"></TMPL_LOOP></TMPL_LOOP>'
    );

    const output = template.render({
      outer: [{ x: 'O', inner: [{ x: 'I' }] }]
    });

    expect(output).toBe('OI');
  });

  // Rendering the same compiled template from inside a render of it is the
  // sharpest test available for shared mutable state: any scope held on the
  // template rather than on the render would be clobbered by the inner call
  // and the outer loop would resume in the wrong place.
  it('survives a render started from inside another render of itself', () => {
    const template = compile('<TMPL_LOOP NAME="rows">[<TMPL_VAR NAME="cell"><TMPL_VAR NAME="nested">]</TMPL_LOOP>', {
      defaultEscape: 'none'
    });

    const output = template.render({
      rows: [{ cell: 'a', nested: () => template.render({ rows: [{ cell: 'X' }] }) }, { cell: 'b' }]
    });

    expect(output).toBe('[a[X]][b]');
  });
});

describe('renderTo', () => {
  it('writes to a sink', () => {
    const chunks: string[] = [];
    compile('<TMPL_VAR NAME="x">').renderTo({ write: (chunk) => chunks.push(chunk) }, { x: 'out' });

    expect(chunks.join('')).toBe('out');
  });
});

describe('compileAsync', () => {
  /**
   * Wrap a loader so every method answers with a promise.
   *
   * @param files - Template text keyed by name
   * @returns Asynchronous loader
   */
  function asyncLoader(files: Record<string, string>): TemplateLoader {
    const inner = memoryLoader(files);

    return {
      sync: false,
      resolve: async (request) => inner.resolve(request),
      read: async (id) => inner.read(id),
      version: async (id) => inner.version?.(id)
    };
  }

  it('compiles through an asynchronous loader', async () => {
    const template = await compileAsync('<TMPL_INCLUDE NAME="part.tmpl">', {
      loader: asyncLoader({ 'part.tmpl': 'from disk' })
    });

    expect(template.render({})).toBe('from disk');
  });

  it('produces the same output as the synchronous entry point', async () => {
    const source = '<TMPL_VAR NAME="a"><TMPL_INCLUDE NAME="part.tmpl">';
    const files = { 'part.tmpl': '<TMPL_VAR NAME="b">' };
    const data = { a: '1', b: '2' };

    const sync = compile(source, { loader: memoryLoader(files) }).render(data);
    const async = (await compileAsync(source, { loader: asyncLoader(files) })).render(data);

    expect(async).toBe(sync);
  });
});

describe('defaultEscape', () => {
  it.each(['HTML', 'Html', 'html'])('accepts the %s spelling', (spelling) => {
    expect(render('<TMPL_VAR NAME="x">', { x: '<b>' }, { defaultEscape: spelling as never })).toBe('&lt;b&gt;');
  });

  it("accepts Perl's other upper-case modes", () => {
    expect(render('<TMPL_VAR NAME="x">', { x: 'a b' }, { defaultEscape: 'URL' as never })).toBe('a%20b');
  });

  it.each(['htm', '', 'xml', 42])('rejects %j rather than rendering unescaped', async (value) => {
    const options = { defaultEscape: value as never };

    expect(() => compile('<TMPL_VAR NAME="x">', options)).toThrow(/Invalid defaultEscape/);
    await expect(compileAsync('<TMPL_VAR NAME="x">', options)).rejects.toThrow(/Invalid defaultEscape/);
  });

  it('still lets none turn escaping off', () => {
    expect(render('<TMPL_VAR NAME="x">', { x: '<b>' }, { defaultEscape: 'none' })).toBe('<b>');
  });
});

describe('parameter locations', () => {
  const SOURCE = 'a\n<TMPL_COMMENT>\nskip\nskip\n</TMPL_COMMENT>  <TMPL_VAR NAME="x">\n<TMPL_VAR NAME="y">';

  it('points into the source as written, comment blocks included', async () => {
    const sync = compile(SOURCE);
    const async = await compileAsync(SOURCE);

    expect(sync.shape.get('x')?.loc).toEqual({ line: 5, col: 18 });
    expect(sync.shape.get('y')?.loc).toEqual({ line: 6, col: 1 });
    expect(async.shape.get('x')?.loc).toEqual(sync.shape.get('x')?.loc);
    expect(async.shape.get('y')?.loc).toEqual(sync.shape.get('y')?.loc);
  });

  it('names the template that contains the tag, at any include depth', async () => {
    const loader = memoryLoader({
      'part.tmpl': 'one\n  <TMPL_VAR NAME="inner"><TMPL_INCLUDE NAME="deep.tmpl">',
      'deep.tmpl': 'x\ny\n<TMPL_COMMENT>\n</TMPL_COMMENT><TMPL_LOOP NAME="rows"></TMPL_LOOP>'
    });
    const source = 'a\nb\nc\n<TMPL_INCLUDE NAME="part.tmpl"><TMPL_VAR NAME="outer">';
    const options = { loader, filename: 'page.tmpl' };

    for (const template of [compile(source, options), await compileAsync(source, options)]) {
      expect(template.shape.get('outer')?.loc).toEqual({ file: 'page.tmpl', line: 4, col: 32 });
      expect(template.shape.get('inner')?.loc).toEqual({ file: 'part.tmpl', line: 2, col: 3 });
      expect(template.shape.get('rows')?.loc).toEqual({ file: 'deep.tmpl', line: 4, col: 16 });
    }
  });
});
