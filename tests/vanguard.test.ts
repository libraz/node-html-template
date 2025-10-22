/**
 * Vanguard compatibility mode tests
 * Tests for legacy %VAR% syntax
 */

import { describe, it, expect } from 'vitest';
import { HTMLTemplate } from '../src/index.js';

describe('Vanguard compatibility mode', () => {
  describe('Basic %VAR% syntax', () => {
    it('should recognize %VAR% syntax', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Hello %name%!',
        vanguard_compatibility_mode: true
      });

      tmpl.param('name', 'World');
      expect(tmpl.output()).toBe('Hello World!');
    });

    it('should handle multiple %VAR% in template', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '%greeting% %name%!',
        vanguard_compatibility_mode: true
      });

      tmpl.param('greeting', 'Hello');
      tmpl.param('name', 'World');
      expect(tmpl.output()).toBe('Hello World!');
    });

    it('should handle %VAR% with surrounding text', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'The value is: %value% (end)',
        vanguard_compatibility_mode: true
      });

      tmpl.param('value', '42');
      expect(tmpl.output()).toBe('The value is: 42 (end)');
    });

    it('should not process %VAR% when mode is disabled', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Hello %name%!',
        vanguard_compatibility_mode: false,
        die_on_bad_params: false
      });

      tmpl.param('name', 'World');
      expect(tmpl.output()).toBe('Hello %name%!');
    });
  });

  describe('Mixed syntax', () => {
    it('should support both %VAR% and TMPL_VAR syntax', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '%greeting% <TMPL_VAR NAME="name">!',
        vanguard_compatibility_mode: true
      });

      tmpl.param('greeting', 'Hello');
      tmpl.param('name', 'World');
      expect(tmpl.output()).toBe('Hello World!');
    });

    it('should handle %VAR% in loops', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items">%item% </TMPL_LOOP>',
        vanguard_compatibility_mode: true
      });

      tmpl.param('items', [
        { item: 'a' },
        { item: 'b' },
        { item: 'c' }
      ]);
      expect(tmpl.output()).toBe('a b c ');
    });

    it('should handle %VAR% in conditionals', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="show">Value: %value%</TMPL_IF>',
        vanguard_compatibility_mode: true
      });

      tmpl.param('show', true);
      tmpl.param('value', 'test');
      expect(tmpl.output()).toBe('Value: test');
    });
  });

  describe('Case sensitivity', () => {
    it('should be case-insensitive by default', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '%FooBar%',
        vanguard_compatibility_mode: true
      });

      tmpl.param('foobar', 'test');
      expect(tmpl.output()).toBe('test');
    });

    it('should respect case_sensitive option', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '%FooBar%',
        vanguard_compatibility_mode: true,
        case_sensitive: true
      });

      tmpl.param('FooBar', 'correct');
      tmpl.param('foobar', 'wrong');
      expect(tmpl.output()).toBe('correct');
    });
  });

  describe('die_on_bad_params behavior', () => {
    it('should disable die_on_bad_params by default', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '%foo%',
        vanguard_compatibility_mode: true
      });

      // Should not throw for nonexistent parameter
      expect(() => {
        tmpl.param('bar', 'value');
      }).not.toThrow();
    });

    it('should allow setting nonexistent parameters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '%foo%',
        vanguard_compatibility_mode: true
      });

      tmpl.param('bar', 'value');
      tmpl.param('foo', 'test');
      expect(tmpl.output()).toBe('test');
    });
  });

  describe('Edge cases', () => {
    it('should handle adjacent %VAR% patterns', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '%a%%b%%c%',
        vanguard_compatibility_mode: true
      });

      tmpl.param('a', '1');
      tmpl.param('b', '2');
      tmpl.param('c', '3');
      expect(tmpl.output()).toBe('123');
    });

    it('should handle %VAR% at start and end', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '%start% middle %end%',
        vanguard_compatibility_mode: true
      });

      tmpl.param('start', 'A');
      tmpl.param('end', 'Z');
      expect(tmpl.output()).toBe('A middle Z');
    });

    it('should handle empty variable value', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Value: %empty%.',
        vanguard_compatibility_mode: true
      });

      tmpl.param('empty', '');
      expect(tmpl.output()).toBe('Value: .');
    });

    it('should handle undefined variable', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Value: %missing%.',
        vanguard_compatibility_mode: true
      });

      // Should output empty string for missing variable
      expect(tmpl.output()).toBe('Value: .');
    });

    it('should handle numeric values', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Count: %count%',
        vanguard_compatibility_mode: true
      });

      tmpl.param('count', 42);
      expect(tmpl.output()).toBe('Count: 42');
    });

    it('should handle zero value', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Value: %zero%',
        vanguard_compatibility_mode: true
      });

      tmpl.param('zero', 0);
      expect(tmpl.output()).toBe('Value: 0');
    });
  });

  describe('Complex templates', () => {
    it('should handle template with multiple features', () => {
      const tmpl = new HTMLTemplate({
        scalarref: `
          <h1>%title%</h1>
          <TMPL_IF NAME="show_items">
            <TMPL_LOOP NAME="items">
              <p>%item_name%: <TMPL_VAR NAME="item_value"></p>
            </TMPL_LOOP>
          </TMPL_IF>
          <footer>%footer_text%</footer>
        `,
        vanguard_compatibility_mode: true
      });

      tmpl.param('title', 'Test Page');
      tmpl.param('show_items', true);
      tmpl.param('items', [
        { item_name: 'Item 1', item_value: 'Value 1' },
        { item_name: 'Item 2', item_value: 'Value 2' }
      ]);
      tmpl.param('footer_text', 'Copyright 2025');

      const output = tmpl.output();
      expect(output).toContain('Test Page');
      expect(output).toContain('Item 1: Value 1');
      expect(output).toContain('Item 2: Value 2');
      expect(output).toContain('Copyright 2025');
    });
  });

  describe('Query with Vanguard syntax', () => {
    it('should query parameters using %VAR% syntax', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '%foo% <TMPL_VAR NAME="bar">',
        vanguard_compatibility_mode: true
      });

      const params = tmpl.query();
      expect(params).toEqual(['bar', 'foo']);
    });

    it('should return VAR type for %VAR% parameters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '%foo%',
        vanguard_compatibility_mode: true
      });

      expect(tmpl.query({ name: 'foo' })).toBe('VAR');
    });
  });
});
