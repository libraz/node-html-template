/**
 * Template benchmarks
 *
 * Split along the line that matters for this library: what compiling costs,
 * and what rendering an already-compiled template costs. Anything reported
 * under "render" reuses one compiled template, which is how it is meant to be
 * used in a server.
 */

import { test } from 'vitest';
import { compile, memoryLoader, render } from '../src/index.js';

const SIMPLE = 'Hello <TMPL_VAR NAME="name">!';
const COMPLEX = `
  <html>
    <head><title><TMPL_VAR NAME="title"></title></head>
    <body>
      <h1><TMPL_VAR NAME="heading"></h1>
      <TMPL_IF NAME="show_content">
        <div>
          <TMPL_LOOP NAME="items">
            <p><TMPL_VAR NAME="item_name">: <TMPL_VAR NAME="item_value"></p>
          </TMPL_LOOP>
        </div>
      </TMPL_IF>
    </body>
  </html>
`;

const COMPLEX_DATA = {
  title: 'Test',
  heading: 'Test Page',
  show_content: true,
  items: [
    { item_name: 'Item 1', item_value: 'Value 1' },
    { item_name: 'Item 2', item_value: 'Value 2' },
    { item_name: 'Item 3', item_value: 'Value 3' }
  ]
};

test('compile', async ({ bench }) => {
  await bench.compare(
    bench('simple template', () => {
      void compile(SIMPLE);
    }),
    bench('complex template', () => {
      void compile(COMPLEX);
    }),
    bench('template with three includes', () => {
      void compile('<TMPL_INCLUDE NAME="a.tmpl"><TMPL_INCLUDE NAME="b.tmpl">', {
        loader: memoryLoader({
          'a.tmpl': '<TMPL_VAR NAME="a"><TMPL_INCLUDE NAME="c.tmpl">',
          'b.tmpl': '<TMPL_VAR NAME="b">',
          'c.tmpl': '<TMPL_VAR NAME="c">'
        })
      });
    })
  );
});

test('render', async ({ bench }) => {
  const simple = compile(SIMPLE);
  const complex = compile(COMPLEX);
  const loop = compile('<TMPL_LOOP NAME="items"><TMPL_VAR NAME="item"></TMPL_LOOP>');
  const nested = compile(
    '<TMPL_LOOP NAME="outer"><TMPL_LOOP NAME="inner"><TMPL_VAR NAME="value"></TMPL_LOOP></TMPL_LOOP>'
  );
  const conditionals = compile(
    '<TMPL_IF NAME="show"><TMPL_VAR NAME="content"></TMPL_IF><TMPL_UNLESS NAME="hide"><TMPL_VAR NAME="footer"></TMPL_UNLESS>'
  );

  const rows = Array.from({ length: 100 }, (_, i) => ({ item: `Item ${i}` }));
  const grid = Array.from({ length: 10 }, (_, i) => ({
    inner: Array.from({ length: 10 }, (__, j) => ({ value: `${i}-${j}` }))
  }));

  await bench.compare(
    bench('simple template', () => {
      simple.render({ name: 'World' });
    }),
    bench('complex template', () => {
      complex.render(COMPLEX_DATA);
    }),
    bench('loop, 10 rows', () => {
      loop.render({ items: rows.slice(0, 10) });
    }),
    bench('loop, 100 rows', () => {
      loop.render({ items: rows });
    }),
    bench('nested loops, 10x10', () => {
      nested.render({ outer: grid });
    }),
    bench('conditionals', () => {
      conditionals.render({ show: true, hide: false, content: 'Content', footer: 'Footer' });
    })
  );
});

test('escaping', async ({ bench }) => {
  const html = compile('<TMPL_VAR NAME="v" ESCAPE="HTML">');
  const url = compile('<a href="?q=<TMPL_VAR NAME="v" ESCAPE="URL">">Link</a>');
  const js = compile('<script>var x = "<TMPL_VAR NAME="v" ESCAPE="JS">";</script>');
  const unescaped = compile('<TMPL_VAR NAME="v">', { defaultEscape: 'none' });

  await bench.compare(
    bench('html', () => {
      html.render({ v: '<script>alert("XSS")</script>' });
    }),
    bench('url', () => {
      url.render({ v: 'hello world & stuff' });
    }),
    bench('js', () => {
      js.render({ v: 'Some "quoted" string' });
    }),
    bench('none', () => {
      unescaped.render({ v: '<script>alert("XSS")</script>' });
    })
  );
});

test('compile per render', async ({ bench }) => {
  // The cost the compile/render split exists to remove: rendering the same
  // template ten times without keeping the compiled form.
  await bench.compare(
    bench('render() ten times', () => {
      for (let i = 0; i < 10; i += 1) {
        render(SIMPLE, { name: 'World' });
      }
    }),
    bench('compile once, render ten times', () => {
      const template = compile(SIMPLE);
      for (let i = 0; i < 10; i += 1) {
        template.render({ name: 'World' });
      }
    })
  );
});

test('percent variables', async ({ bench }) => {
  const tags = compile('Hello <TMPL_VAR NAME="name">!');
  const percent = compile('Hello %name%!', { legacy: { percentVars: true } });
  const mixed = compile('%greeting% <TMPL_VAR NAME="name">!', { legacy: { percentVars: true } });

  await bench.compare(
    bench('TMPL_VAR only', () => {
      tags.render({ name: 'World' });
    }),
    bench('%VAR% only', () => {
      percent.render({ name: 'World' });
    }),
    bench('both forms', () => {
      mixed.render({ greeting: 'Hello', name: 'World' });
    })
  );
});
