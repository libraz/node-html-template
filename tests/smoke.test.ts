/**
 * Smoke test - Basic functionality verification
 * Tests core features to ensure basic implementation works
 */

import { describe, expect, it } from 'vitest';
import { HTMLTemplate } from '../src/index.js';

describe('HTMLTemplate - Smoke Tests', () => {
  describe('Basic Template Loading', () => {
    it('should create template from string (scalarref)', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Hello World'
      });
      expect(tmpl).toBeDefined();
    });

    it('should create template from array (arrayref)', () => {
      const tmpl = new HTMLTemplate({
        arrayref: ['Hello', 'World']
      });
      expect(tmpl).toBeDefined();
    });
  });

  describe('Basic Variable Substitution', () => {
    it('should substitute simple variable', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Hello <TMPL_VAR NAME="name">'
      });
      tmpl.param('name', 'World');
      const output = tmpl.output();
      expect(output).toBe('Hello World');
    });

    it('should substitute multiple variables', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="greeting"> <TMPL_VAR NAME="name">'
      });
      tmpl.param('greeting', 'Hello');
      tmpl.param('name', 'World');
      const output = tmpl.output();
      expect(output).toBe('Hello World');
    });

    it('should handle missing variables (default empty)', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Hello <TMPL_VAR NAME="name">',
        die_on_bad_params: false
      });
      const output = tmpl.output();
      expect(output).toBe('Hello ');
    });
  });

  describe('HTML Escaping', () => {
    it('should escape HTML entities when requested', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="html" ESCAPE="html">'
      });
      tmpl.param('html', '<script>alert("xss")</script>');
      const output = tmpl.output();
      expect(output).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('should not escape by default', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="html">'
      });
      tmpl.param('html', '<b>bold</b>');
      const output = tmpl.output();
      expect(output).toBe('<b>bold</b>');
    });
  });

  describe('Basic Loops', () => {
    it('should iterate over loop data', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="name">,</TMPL_LOOP>'
      });
      tmpl.param('items', [{ name: 'foo' }, { name: 'bar' }, { name: 'baz' }]);
      const output = tmpl.output();
      expect(output).toBe('foo,bar,baz,');
    });

    it('should handle empty loops', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Before<TMPL_LOOP NAME="items"><TMPL_VAR NAME="name"></TMPL_LOOP>After'
      });
      tmpl.param('items', []);
      const output = tmpl.output();
      expect(output).toBe('BeforeAfter');
    });
  });

  describe('Basic Conditionals', () => {
    it('should render IF block when condition is true', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="show">visible</TMPL_IF>'
      });
      tmpl.param('show', true);
      const output = tmpl.output();
      expect(output).toBe('visible');
    });

    it('should not render IF block when condition is false', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="show">visible</TMPL_IF>'
      });
      tmpl.param('show', false);
      const output = tmpl.output();
      expect(output).toBe('');
    });

    it('should render ELSE block when condition is false', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="show">yes<TMPL_ELSE>no</TMPL_IF>'
      });
      tmpl.param('show', false);
      const output = tmpl.output();
      expect(output).toBe('no');
    });

    it('should render UNLESS block when condition is false', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_UNLESS NAME="hide">visible</TMPL_UNLESS>'
      });
      tmpl.param('hide', false);
      const output = tmpl.output();
      expect(output).toBe('visible');
    });
  });

  describe('Parameter Management', () => {
    it('should set parameters with object syntax', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo"><TMPL_VAR NAME="bar">'
      });
      tmpl.param({
        foo: 'hello',
        bar: 'world'
      });
      const output = tmpl.output();
      expect(output).toBe('helloworld');
    });

    it('should clear parameters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Hello <TMPL_VAR NAME="name">',
        die_on_bad_params: false
      });
      tmpl.param('name', 'World');
      tmpl.clear();
      const output = tmpl.output();
      expect(output).toBe('Hello ');
    });
  });
});
