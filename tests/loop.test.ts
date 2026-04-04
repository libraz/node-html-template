/**
 * Loop tests
 * Port of Perl HTML::Template TMPL_LOOP tests
 */

import { describe, expect, it } from 'vitest';
import { HTMLTemplate } from '../src/index.js';

describe('TMPL_LOOP Tests', () => {
  describe('Basic loop functionality', () => {
    it('should iterate over simple loop', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="value"></TMPL_LOOP>'
      });
      tmpl.param('items', [{ value: 'a' }, { value: 'b' }, { value: 'c' }]);
      expect(tmpl.output()).toBe('abc');
    });

    it('should handle empty loop', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'before<TMPL_LOOP NAME="items">content</TMPL_LOOP>after'
      });
      tmpl.param('items', []);
      expect(tmpl.output()).toBe('beforeafter');
    });

    it('should handle loop with single iteration', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="x"></TMPL_LOOP>'
      });
      tmpl.param('items', [{ x: 'only' }]);
      expect(tmpl.output()).toBe('only');
    });

    it('should handle multiple variables in loop', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="a">-<TMPL_VAR NAME="b"> </TMPL_LOOP>'
      });
      tmpl.param('items', [
        { a: '1', b: 'one' },
        { a: '2', b: 'two' },
        { a: '3', b: 'three' }
      ]);
      expect(tmpl.output()).toBe('1-one 2-two 3-three ');
    });
  });

  describe('Loop with text content', () => {
    it('should preserve whitespace in loop body', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items">  <TMPL_VAR NAME="x">  </TMPL_LOOP>'
      });
      tmpl.param('items', [{ x: 'a' }, { x: 'b' }]);
      expect(tmpl.output()).toBe('  a    b  ');
    });

    it('should handle static content in loop', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items">Item: <TMPL_VAR NAME="name">\n</TMPL_LOOP>'
      });
      tmpl.param('items', [{ name: 'foo' }, { name: 'bar' }]);
      expect(tmpl.output()).toBe('Item: foo\nItem: bar\n');
    });
  });

  describe('Nested loops', () => {
    it('should handle nested loops', () => {
      const tmpl = new HTMLTemplate({
        scalarref: `<TMPL_LOOP NAME="outer">
<TMPL_VAR NAME="name">:
<TMPL_LOOP NAME="inner"><TMPL_VAR NAME="value">,</TMPL_LOOP>
</TMPL_LOOP>`
      });
      tmpl.param('outer', [
        {
          name: 'A',
          inner: [{ value: '1' }, { value: '2' }]
        },
        {
          name: 'B',
          inner: [{ value: '3' }, { value: '4' }]
        }
      ]);
      const output = tmpl.output();
      expect(output).toContain('A:\n1,2,');
      expect(output).toContain('B:\n3,4,');
    });

    it('should handle deeply nested loops', () => {
      const tmpl = new HTMLTemplate({
        scalarref:
          '<TMPL_LOOP NAME="l1"><TMPL_LOOP NAME="l2"><TMPL_LOOP NAME="l3"><TMPL_VAR NAME="v"></TMPL_LOOP></TMPL_LOOP></TMPL_LOOP>'
      });
      tmpl.param('l1', [
        {
          l2: [
            {
              l3: [{ v: 'x' }]
            }
          ]
        }
      ]);
      expect(tmpl.output()).toBe('x');
    });
  });

  describe('Loop context variables', () => {
    it('should provide __first__ variable', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_IF NAME="__first__">F</TMPL_IF><TMPL_VAR NAME="x"></TMPL_LOOP>',
        loop_context_vars: true
      });
      tmpl.param('items', [{ x: '1' }, { x: '2' }, { x: '3' }]);
      expect(tmpl.output()).toBe('F123');
    });

    it('should provide __last__ variable', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="x"><TMPL_IF NAME="__last__">L</TMPL_IF></TMPL_LOOP>',
        loop_context_vars: true
      });
      tmpl.param('items', [{ x: '1' }, { x: '2' }, { x: '3' }]);
      expect(tmpl.output()).toBe('123L');
    });

    it('should provide __inner__ variable', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_IF NAME="__inner__">I</TMPL_IF></TMPL_LOOP>',
        loop_context_vars: true
      });
      tmpl.param('items', [{ x: '1' }, { x: '2' }, { x: '3' }, { x: '4' }]);
      expect(tmpl.output()).toBe('II'); // Inner is true for 2nd and 3rd items
    });

    it('should provide __outer__ variable', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_IF NAME="__outer__">O</TMPL_IF></TMPL_LOOP>',
        loop_context_vars: true
      });
      tmpl.param('items', [{ x: '1' }, { x: '2' }, { x: '3' }]);
      expect(tmpl.output()).toBe('OO'); // Outer is true for 1st and 3rd items
    });

    it('should provide __odd__ variable', () => {
      const tmpl = new HTMLTemplate({
        scalarref:
          '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="__counter__"><TMPL_IF NAME="__odd__">O</TMPL_IF> </TMPL_LOOP>',
        loop_context_vars: true
      });
      tmpl.param('items', [{}, {}, {}, {}]);
      expect(tmpl.output()).toBe('1O 2 3O 4 ');
    });

    it('should provide __even__ variable', () => {
      const tmpl = new HTMLTemplate({
        scalarref:
          '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="__counter__"><TMPL_IF NAME="__even__">E</TMPL_IF> </TMPL_LOOP>',
        loop_context_vars: true
      });
      tmpl.param('items', [{}, {}, {}, {}]);
      expect(tmpl.output()).toBe('1 2E 3 4E ');
    });

    it('should provide __counter__ variable (1-based)', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="__counter__">,</TMPL_LOOP>',
        loop_context_vars: true
      });
      tmpl.param('items', [{}, {}, {}]);
      expect(tmpl.output()).toBe('1,2,3,');
    });

    it('should provide __index__ variable (0-based)', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="__index__">,</TMPL_LOOP>',
        loop_context_vars: true
      });
      tmpl.param('items', [{}, {}, {}]);
      expect(tmpl.output()).toBe('0,1,2,');
    });
  });

  describe('Loop scope isolation', () => {
    it('should isolate loop variables by default', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="outer"><TMPL_LOOP NAME="items"><TMPL_VAR NAME="inner"></TMPL_LOOP>',
        die_on_bad_params: false
      });
      tmpl.param('outer', 'OUTER');
      tmpl.param('items', [{ inner: 'inner1' }, { inner: 'inner2' }]);
      expect(tmpl.output()).toBe('OUTERinner1inner2');
    });

    it('should not see outer variables in loop by default', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="outer"></TMPL_LOOP>',
        die_on_bad_params: false
      });
      tmpl.param('outer', 'OUTER');
      tmpl.param('items', [{}]);
      expect(tmpl.output()).toBe(''); // outer not visible in loop
    });
  });

  describe('Global variables', () => {
    it('should see outer variables with global_vars', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="outer">-<TMPL_VAR NAME="inner"> </TMPL_LOOP>',
        global_vars: true
      });
      tmpl.param('outer', 'OUT');
      tmpl.param('items', [{ inner: '1' }, { inner: '2' }]);
      expect(tmpl.output()).toBe('OUT-1 OUT-2 ');
    });

    it('should allow inner variables to shadow outer with global_vars', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="foo"></TMPL_LOOP>',
        global_vars: true
      });
      tmpl.param('foo', 'outer');
      tmpl.param('items', [{ foo: 'inner1' }, { foo: 'inner2' }]);
      expect(tmpl.output()).toBe('inner1inner2');
    });

    it('should handle nested loops with global_vars', () => {
      const tmpl = new HTMLTemplate({
        scalarref:
          '<TMPL_LOOP NAME="outer"><TMPL_VAR NAME="top">.<TMPL_LOOP NAME="inner"><TMPL_VAR NAME="top"><TMPL_VAR NAME="mid"></TMPL_LOOP></TMPL_LOOP>',
        global_vars: true
      });
      tmpl.param('top', 'T');
      tmpl.param('outer', [
        {
          mid: 'M',
          inner: [{}]
        }
      ]);
      expect(tmpl.output()).toBe('T.TM');
    });
  });

  describe('Loop HTML comment syntax', () => {
    it('should support HTML comment form', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<!-- TMPL_LOOP NAME="items" --><TMPL_VAR NAME="x"><!-- /TMPL_LOOP -->'
      });
      tmpl.param('items', [{ x: 'a' }, { x: 'b' }]);
      expect(tmpl.output()).toBe('ab');
    });
  });
});
