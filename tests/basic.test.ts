/**
 * Basic template tests
 * Port of Perl HTML::Template basic functionality tests
 */

import { describe, expect, it } from 'vitest';
import { HTMLTemplate } from '../src/index.js';

describe('Basic Template Functionality', () => {
  describe('Simple variable substitution', () => {
    it('should substitute a single variable', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Hello <TMPL_VAR NAME="name">'
      });
      tmpl.param('name', 'Sam');
      expect(tmpl.output()).toBe('Hello Sam');
    });

    it('should substitute multiple variables', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo"> <TMPL_VAR NAME="bar"> <TMPL_VAR NAME="baz">'
      });
      tmpl.param('foo', '1');
      tmpl.param('bar', '2');
      tmpl.param('baz', '3');
      expect(tmpl.output()).toBe('1 2 3');
    });

    it('should substitute the same variable multiple times', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo"> <TMPL_VAR NAME="foo"> <TMPL_VAR NAME="foo">'
      });
      tmpl.param('foo', 'bar');
      expect(tmpl.output()).toBe('bar bar bar');
    });

    it('should handle numeric values', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Count: <TMPL_VAR NAME="count">'
      });
      tmpl.param('count', 42);
      expect(tmpl.output()).toBe('Count: 42');
    });

    it('should handle zero values', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Value: <TMPL_VAR NAME="value">'
      });
      tmpl.param('value', 0);
      expect(tmpl.output()).toBe('Value: 0');
    });

    it('should handle boolean false as empty string in output', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Value: <TMPL_VAR NAME="value">'
      });
      tmpl.param('value', false);
      expect(tmpl.output()).toBe('Value: false');
    });
  });

  describe('Default values', () => {
    it('should use default value when variable is undefined', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Hello <TMPL_VAR NAME="name" DEFAULT="World">',
        die_on_bad_params: false
      });
      expect(tmpl.output()).toBe('Hello World');
    });

    it('should override default with actual value', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Hello <TMPL_VAR NAME="name" DEFAULT="World">'
      });
      tmpl.param('name', 'Sam');
      expect(tmpl.output()).toBe('Hello Sam');
    });

    it('should handle empty string default', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Value: [<TMPL_VAR NAME="foo" DEFAULT="">]',
        die_on_bad_params: false
      });
      expect(tmpl.output()).toBe('Value: []');
    });
  });

  describe('Case sensitivity', () => {
    it('should be case-insensitive by default', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="FoO">'
      });
      tmpl.param('foo', 'bar');
      expect(tmpl.output()).toBe('bar');
    });

    it('should be case-insensitive for param names', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">'
      });
      tmpl.param('FOO', 'bar');
      expect(tmpl.output()).toBe('bar');
    });

    it('should be case-sensitive when option enabled', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">',
        case_sensitive: true,
        die_on_bad_params: false
      });
      tmpl.param('FOO', 'bar');
      expect(tmpl.output()).toBe(''); // No match
    });

    it('should match exactly in case-sensitive mode', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">',
        case_sensitive: true
      });
      tmpl.param('foo', 'bar');
      expect(tmpl.output()).toBe('bar');
    });
  });

  describe('Parameter setting methods', () => {
    it('should set parameter with name and value', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">'
      });
      tmpl.param('foo', 'bar');
      expect(tmpl.output()).toBe('bar');
    });

    it('should set multiple parameters with object', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="a"><TMPL_VAR NAME="b"><TMPL_VAR NAME="c">'
      });
      tmpl.param({
        a: '1',
        b: '2',
        c: '3'
      });
      expect(tmpl.output()).toBe('123');
    });

    it('should overwrite previous parameter values', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">'
      });
      tmpl.param('foo', 'bar');
      tmpl.param('foo', 'baz');
      expect(tmpl.output()).toBe('baz');
    });
  });

  describe('Template whitespace handling', () => {
    it('should preserve whitespace in templates', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '  <TMPL_VAR NAME="foo">  '
      });
      tmpl.param('foo', 'bar');
      expect(tmpl.output()).toBe('  bar  ');
    });

    it('should preserve newlines', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Line 1\n<TMPL_VAR NAME="foo">\nLine 3'
      });
      tmpl.param('foo', 'Line 2');
      expect(tmpl.output()).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  describe('HTML comment syntax', () => {
    it('should support HTML comment form of tags', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Hello <!-- TMPL_VAR NAME="name" -->'
      });
      tmpl.param('name', 'World');
      expect(tmpl.output()).toBe('Hello World');
    });

    it('should mix regular and comment forms', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="a"> <!-- TMPL_VAR NAME="b" -->'
      });
      tmpl.param('a', '1');
      tmpl.param('b', '2');
      expect(tmpl.output()).toBe('1 2');
    });
  });

  describe('Array source', () => {
    it('should join array lines with newlines', () => {
      const tmpl = new HTMLTemplate({
        arrayref: ['Line 1', '<TMPL_VAR NAME="foo">', 'Line 3']
      });
      tmpl.param('foo', 'Line 2');
      expect(tmpl.output()).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  describe('Empty templates', () => {
    it('should handle empty template', () => {
      const tmpl = new HTMLTemplate({
        scalarref: ''
      });
      expect(tmpl.output()).toBe('');
    });

    it('should handle template with only whitespace', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '   \n  \t  '
      });
      expect(tmpl.output()).toBe('   \n  \t  ');
    });
  });

  describe('Special characters in values', () => {
    it('should handle special characters without escaping', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">'
      });
      tmpl.param('foo', '<>&"\'');
      expect(tmpl.output()).toBe('<>&"\'');
    });

    it('should handle unicode characters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">'
      });
      tmpl.param('foo', 'こんにちは世界');
      expect(tmpl.output()).toBe('こんにちは世界');
    });

    it('should handle emoji', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">'
      });
      tmpl.param('foo', '🎉🚀');
      expect(tmpl.output()).toBe('🎉🚀');
    });
  });
});
