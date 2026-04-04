/**
 * Conditional tests
 * Port of Perl HTML::Template TMPL_IF, TMPL_UNLESS, TMPL_ELSE tests
 */

import { describe, expect, it } from 'vitest';
import { HTMLTemplate } from '../src/index.js';

describe('TMPL_IF / TMPL_UNLESS Tests', () => {
  describe('TMPL_IF basic functionality', () => {
    it('should render IF block when condition is true', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">yes</TMPL_IF>'
      });
      tmpl.param('foo', true);
      expect(tmpl.output()).toBe('yes');
    });

    it('should not render IF block when condition is false', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">yes</TMPL_IF>'
      });
      tmpl.param('foo', false);
      expect(tmpl.output()).toBe('');
    });

    it('should not render IF block when condition is undefined', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">yes</TMPL_IF>',
        die_on_bad_params: false
      });
      expect(tmpl.output()).toBe('');
    });

    it('should treat non-zero number as true', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">yes</TMPL_IF>'
      });
      tmpl.param('foo', 42);
      expect(tmpl.output()).toBe('yes');
    });

    it('should treat zero as false', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">yes</TMPL_IF>'
      });
      tmpl.param('foo', 0);
      expect(tmpl.output()).toBe('');
    });

    it('should treat empty string as false', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">yes</TMPL_IF>'
      });
      tmpl.param('foo', '');
      expect(tmpl.output()).toBe('');
    });

    it('should treat non-empty string as true', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">yes</TMPL_IF>'
      });
      tmpl.param('foo', 'hello');
      expect(tmpl.output()).toBe('yes');
    });

    it('should treat string "0" as false (Perl-like)', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">yes</TMPL_IF>'
      });
      tmpl.param('foo', '0');
      expect(tmpl.output()).toBe('');
    });

    it('should treat empty array as false', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">yes</TMPL_IF>'
      });
      tmpl.param('foo', []);
      expect(tmpl.output()).toBe('');
    });

    it('should treat non-empty array as true', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">yes</TMPL_IF>'
      });
      tmpl.param('foo', [{ x: 1 }]);
      expect(tmpl.output()).toBe('yes');
    });
  });

  describe('TMPL_ELSE functionality', () => {
    it('should render ELSE block when condition is false', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">yes<TMPL_ELSE>no</TMPL_IF>'
      });
      tmpl.param('foo', false);
      expect(tmpl.output()).toBe('no');
    });

    it('should not render ELSE block when condition is true', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">yes<TMPL_ELSE>no</TMPL_IF>'
      });
      tmpl.param('foo', true);
      expect(tmpl.output()).toBe('yes');
    });

    it('should handle ELSE with complex content', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="foo">IF:<TMPL_VAR NAME="a"><TMPL_ELSE>ELSE:<TMPL_VAR NAME="b"></TMPL_IF>'
      });
      tmpl.param('foo', false);
      tmpl.param('a', 'AAA');
      tmpl.param('b', 'BBB');
      expect(tmpl.output()).toBe('ELSE:BBB');
    });
  });

  describe('TMPL_UNLESS basic functionality', () => {
    it('should render UNLESS block when condition is false', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_UNLESS NAME="foo">yes</TMPL_UNLESS>'
      });
      tmpl.param('foo', false);
      expect(tmpl.output()).toBe('yes');
    });

    it('should not render UNLESS block when condition is true', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_UNLESS NAME="foo">yes</TMPL_UNLESS>'
      });
      tmpl.param('foo', true);
      expect(tmpl.output()).toBe('');
    });

    it('should render UNLESS block when condition is undefined', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_UNLESS NAME="foo">yes</TMPL_UNLESS>',
        die_on_bad_params: false
      });
      expect(tmpl.output()).toBe('yes');
    });

    it('should work with ELSE', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_UNLESS NAME="foo">no<TMPL_ELSE>yes</TMPL_UNLESS>'
      });
      tmpl.param('foo', true);
      expect(tmpl.output()).toBe('yes');
    });
  });

  describe('Nested conditionals', () => {
    it('should handle nested IF statements', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="outer">O<TMPL_IF NAME="inner">I</TMPL_IF></TMPL_IF>'
      });
      tmpl.param('outer', true);
      tmpl.param('inner', true);
      expect(tmpl.output()).toBe('OI');
    });

    it('should handle nested IF with false inner', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="outer">O<TMPL_IF NAME="inner">I</TMPL_IF></TMPL_IF>'
      });
      tmpl.param('outer', true);
      tmpl.param('inner', false);
      expect(tmpl.output()).toBe('O');
    });

    it('should handle nested IF/UNLESS mix', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="a"><TMPL_UNLESS NAME="b">yes</TMPL_UNLESS></TMPL_IF>'
      });
      tmpl.param('a', true);
      tmpl.param('b', false);
      expect(tmpl.output()).toBe('yes');
    });

    it('should handle deeply nested conditionals', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="a"><TMPL_IF NAME="b"><TMPL_IF NAME="c">ABC</TMPL_IF></TMPL_IF></TMPL_IF>'
      });
      tmpl.param('a', true);
      tmpl.param('b', true);
      tmpl.param('c', true);
      expect(tmpl.output()).toBe('ABC');
    });
  });

  describe('Conditionals in loops', () => {
    it('should evaluate condition per iteration', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_IF NAME="show"><TMPL_VAR NAME="val"></TMPL_IF></TMPL_LOOP>'
      });
      tmpl.param('items', [
        { show: true, val: 'A' },
        { show: false, val: 'B' },
        { show: true, val: 'C' }
      ]);
      expect(tmpl.output()).toBe('AC');
    });

    it('should handle conditionals with loop context vars', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_IF NAME="__first__">F</TMPL_IF><TMPL_VAR NAME="x"></TMPL_LOOP>',
        loop_context_vars: true
      });
      tmpl.param('items', [{ x: '1' }, { x: '2' }]);
      expect(tmpl.output()).toBe('F12');
    });
  });

  describe('Conditionals with global_vars', () => {
    it('should see outer variables in IF with global_vars', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_IF NAME="outer">yes</TMPL_IF></TMPL_LOOP>',
        global_vars: true
      });
      tmpl.param('outer', true);
      tmpl.param('items', [{}]);
      expect(tmpl.output()).toBe('yes');
    });

    it('should allow inner values to shadow outer in conditionals', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_IF NAME="foo">Y<TMPL_ELSE>N</TMPL_IF></TMPL_LOOP>',
        global_vars: true
      });
      tmpl.param('foo', true);
      tmpl.param('items', [{ foo: false }]);
      expect(tmpl.output()).toBe('N'); // Inner value shadows outer
    });
  });

  describe('HTML comment syntax', () => {
    it('should support HTML comment form for IF', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<!-- TMPL_IF NAME="foo" -->yes<!-- /TMPL_IF -->'
      });
      tmpl.param('foo', true);
      expect(tmpl.output()).toBe('yes');
    });

    it('should support HTML comment form for UNLESS', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<!-- TMPL_UNLESS NAME="foo" -->yes<!-- /TMPL_UNLESS -->'
      });
      tmpl.param('foo', false);
      expect(tmpl.output()).toBe('yes');
    });

    it('should support HTML comment form for ELSE', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<!-- TMPL_IF NAME="foo" -->yes<!-- TMPL_ELSE -->no<!-- /TMPL_IF -->'
      });
      tmpl.param('foo', false);
      expect(tmpl.output()).toBe('no');
    });
  });

  describe('Complex conditional scenarios', () => {
    it('should handle multiple sequential conditionals', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="a">A</TMPL_IF><TMPL_IF NAME="b">B</TMPL_IF><TMPL_IF NAME="c">C</TMPL_IF>'
      });
      tmpl.param('a', true);
      tmpl.param('b', false);
      tmpl.param('c', true);
      expect(tmpl.output()).toBe('AC');
    });

    it('should handle conditional surrounding loop', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="show"><TMPL_LOOP NAME="items"><TMPL_VAR NAME="x"></TMPL_LOOP></TMPL_IF>'
      });
      tmpl.param('show', true);
      tmpl.param('items', [{ x: 'a' }, { x: 'b' }]);
      expect(tmpl.output()).toBe('ab');
    });

    it('should handle conditional with variables in both branches', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="flag">TRUE:<TMPL_VAR NAME="a"><TMPL_ELSE>FALSE:<TMPL_VAR NAME="b"></TMPL_IF>'
      });
      tmpl.param('flag', true);
      tmpl.param('a', 'AAA');
      tmpl.param('b', 'BBB');
      expect(tmpl.output()).toBe('TRUE:AAA');
    });
  });
});
