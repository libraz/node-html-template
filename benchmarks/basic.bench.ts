/**
 * Basic template benchmarks
 * Compares performance of common template operations
 */

import { bench, describe } from 'vitest';
import { HTMLTemplate } from '../src/index.js';

describe('Basic Operations', () => {
  bench('Simple variable substitution', () => {
    const tmpl = new HTMLTemplate({
      scalarref: 'Hello <TMPL_VAR NAME="name">!'
    });
    tmpl.param('name', 'World');
    tmpl.output();
  });

  bench('Multiple variables', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="a"> <TMPL_VAR NAME="b"> <TMPL_VAR NAME="c">'
    });
    tmpl.param({ a: '1', b: '2', c: '3' });
    tmpl.output();
  });

  bench('Simple loop (10 items)', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="item"></TMPL_LOOP>'
    });
    const items = Array.from({ length: 10 }, (_, i) => ({ item: `Item ${i}` }));
    tmpl.param('items', items);
    tmpl.output();
  });

  bench('Simple loop (100 items)', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="item"></TMPL_LOOP>'
    });
    const items = Array.from({ length: 100 }, (_, i) => ({ item: `Item ${i}` }));
    tmpl.param('items', items);
    tmpl.output();
  });

  bench('Nested loops (10x10)', () => {
    const tmpl = new HTMLTemplate({
      scalarref: `
        <TMPL_LOOP NAME="outer">
          <TMPL_LOOP NAME="inner">
            <TMPL_VAR NAME="value">
          </TMPL_LOOP>
        </TMPL_LOOP>
      `
    });
    const data = Array.from({ length: 10 }, (_, i) => ({
      inner: Array.from({ length: 10 }, (__, j) => ({
        value: `${i}-${j}`
      }))
    }));
    tmpl.param('outer', data);
    tmpl.output();
  });

  bench('Conditionals (IF/UNLESS)', () => {
    const tmpl = new HTMLTemplate({
      scalarref: `
        <TMPL_IF NAME="show">
          <TMPL_VAR NAME="content">
        </TMPL_IF>
        <TMPL_UNLESS NAME="hide">
          <TMPL_VAR NAME="footer">
        </TMPL_UNLESS>
      `
    });
    tmpl.param({
      show: true,
      hide: false,
      content: 'Content',
      footer: 'Footer'
    });
    tmpl.output();
  });
});

describe('Escaping', () => {
  bench('HTML escaping', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="html" ESCAPE="HTML">'
    });
    tmpl.param('html', '<script>alert("XSS")</script>');
    tmpl.output();
  });

  bench('URL escaping', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<a href="?q=<TMPL_VAR NAME="query" ESCAPE="URL">">Link</a>'
    });
    tmpl.param('query', 'hello world & stuff');
    tmpl.output();
  });

  bench('JavaScript escaping', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<script>var x = "<TMPL_VAR NAME="data" ESCAPE="JS">";</script>'
    });
    tmpl.param('data', 'Some "quoted" string');
    tmpl.output();
  });

  bench('default_escape option', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="html">',
      default_escape: 'html'
    });
    tmpl.param('html', '<script>alert("XSS")</script>');
    tmpl.output();
  });
});

describe('Template Compilation', () => {
  const simpleTemplate = 'Hello <TMPL_VAR NAME="name">!';
  const complexTemplate = `
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

  bench('Parse simple template', () => {
    void new HTMLTemplate({ scalarref: simpleTemplate });
  });

  bench('Parse complex template', () => {
    void new HTMLTemplate({ scalarref: complexTemplate });
  });

  bench('Parse and execute simple template', () => {
    const tmpl = new HTMLTemplate({ scalarref: simpleTemplate });
    tmpl.param('name', 'World');
    tmpl.output();
  });

  bench('Parse and execute complex template', () => {
    const tmpl = new HTMLTemplate({ scalarref: complexTemplate });
    tmpl.param({
      title: 'Test',
      heading: 'Test Page',
      show_content: true,
      items: [
        { item_name: 'Item 1', item_value: 'Value 1' },
        { item_name: 'Item 2', item_value: 'Value 2' },
        { item_name: 'Item 3', item_value: 'Value 3' }
      ]
    });
    tmpl.output();
  });
});

describe('Cache Performance', () => {
  bench('Without cache - repeated parsing', () => {
    for (let i = 0; i < 10; i++) {
      const tmpl = new HTMLTemplate({
        scalarref: 'Hello <TMPL_VAR NAME="name">!',
        cache: false
      });
      tmpl.param('name', 'World');
      tmpl.output();
    }
  });

  bench('With cache - same template', () => {
    const tmpl = new HTMLTemplate({
      scalarref: 'Hello <TMPL_VAR NAME="name">!',
      cache: true
    });
    for (let i = 0; i < 10; i++) {
      tmpl.param('name', `World ${i}`);
      tmpl.output();
    }
  });
});

describe('Vanguard Syntax', () => {
  bench('Standard TMPL_VAR syntax', () => {
    const tmpl = new HTMLTemplate({
      scalarref: 'Hello <TMPL_VAR NAME="name">!'
    });
    tmpl.param('name', 'World');
    tmpl.output();
  });

  bench('Vanguard %VAR% syntax', () => {
    const tmpl = new HTMLTemplate({
      scalarref: 'Hello %name%!',
      vanguard_compatibility_mode: true
    });
    tmpl.param('name', 'World');
    tmpl.output();
  });

  bench('Mixed syntax', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '%greeting% <TMPL_VAR NAME="name">!',
      vanguard_compatibility_mode: true
    });
    tmpl.param({ greeting: 'Hello', name: 'World' });
    tmpl.output();
  });
});
