/**
 * die_on_bad_params option tests
 * Tests for parameter validation
 */

import { describe, it, expect } from 'vitest';
import { HTMLTemplate } from '../src/index.js';

describe('die_on_bad_params option', () => {
  describe('When enabled (default)', () => {
    it('should throw error for nonexistent parameter', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">'
      });

      expect(() => {
        tmpl.param('bar', 'value');
      }).toThrow(/param\(\) called for nonexistent parameter.*bar/);
    });

    it('should allow existing parameters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">'
      });

      expect(() => {
        tmpl.param('foo', 'value');
      }).not.toThrow();

      expect(tmpl.output()).toBe('value');
    });

    it('should work with multiple parameters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo"> <TMPL_VAR NAME="bar">'
      });

      expect(() => {
        tmpl.param({ foo: '1', bar: '2' });
      }).not.toThrow();

      expect(tmpl.output()).toBe('1 2');
    });

    it('should throw error for one bad parameter in batch', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">'
      });

      expect(() => {
        tmpl.param({ foo: '1', bar: '2' });
      }).toThrow(/param\(\) called for nonexistent parameter.*bar/);
    });

    it('should validate loop names', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="item"></TMPL_LOOP>'
      });

      expect(() => {
        tmpl.param('items', [{ item: 'a' }]);
      }).not.toThrow();

      const result = expect(() => {
        tmpl.param('other', [{ item: 'b' }]);
      });
      result.toThrow(/param\(\) called for nonexistent parameter/);
    });

    it('should validate conditional names', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="show">content</TMPL_IF>'
      });

      expect(() => {
        tmpl.param('show', true);
      }).not.toThrow();

      const result = expect(() => {
        tmpl.param('hide', false);
      });
      result.toThrow(/param\(\) called for nonexistent parameter/);
    });

    it('should validate nested parameters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="name"> <TMPL_VAR NAME="value"></TMPL_LOOP>'
      });

      expect(() => {
        tmpl.param('items', [{ name: 'a', value: '1' }]);
      }).not.toThrow();

      // Loop variables are also valid parameter names
      expect(() => {
        tmpl.param('name', 'test');
      }).not.toThrow();

      expect(() => {
        tmpl.param('value', '123');
      }).not.toThrow();

      // But truly nonexistent parameters should fail
      expect(() => {
        tmpl.param('nonexistent', 'test');
      }).toThrow(/param\(\) called for nonexistent parameter/);
    });
  });

  describe('When disabled', () => {
    it('should not throw error for nonexistent parameter', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">',
        die_on_bad_params: false
      });

      expect(() => {
        tmpl.param('bar', 'value');
      }).not.toThrow();

      expect(tmpl.output()).toBe('');
    });

    it('should still set valid parameters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">',
        die_on_bad_params: false
      });

      tmpl.param('foo', 'value1');
      tmpl.param('bar', 'value2'); // Should not throw

      expect(tmpl.output()).toBe('value1');
    });

    it('should allow setting any parameter', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="a">',
        die_on_bad_params: false
      });

      expect(() => {
        tmpl.param({
          a: '1',
          b: '2',
          c: '3',
          xyz: 'test'
        });
      }).not.toThrow();

      expect(tmpl.output()).toBe('1');
    });
  });

  describe('Case sensitivity', () => {
    it('should be case-insensitive by default', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="FooBar">'
      });

      expect(() => {
        tmpl.param('foobar', 'value');
      }).not.toThrow();

      expect(() => {
        tmpl.param('FOOBAR', 'value');
      }).not.toThrow();

      expect(() => {
        tmpl.param('FooBar', 'value');
      }).not.toThrow();
    });

    it('should be case-sensitive when enabled', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="FooBar">',
        case_sensitive: true
      });

      expect(() => {
        tmpl.param('FooBar', 'value');
      }).not.toThrow();

      const result1 = expect(() => {
        tmpl.param('foobar', 'value');
      });
      result1.toThrow(/param\(\) called for nonexistent parameter/);

      const result2 = expect(() => {
        tmpl.param('FOOBAR', 'value');
      });
      result2.toThrow(/param\(\) called for nonexistent parameter/);
    });
  });

  describe('Complex templates', () => {
    it('should validate all parameter types', () => {
      const tmpl = new HTMLTemplate({
        scalarref: `
          <TMPL_VAR NAME="title">
          <TMPL_IF NAME="show_list">
            <TMPL_LOOP NAME="items">
              <TMPL_VAR NAME="item">
            </TMPL_LOOP>
          </TMPL_IF>
          <TMPL_UNLESS NAME="hide_footer">
            <TMPL_VAR NAME="footer">
          </TMPL_UNLESS>
        `
      });

      // Valid parameters
      expect(() => {
        tmpl.param('title', 'Test');
      }).not.toThrow();

      expect(() => {
        tmpl.param('show_list', true);
      }).not.toThrow();

      expect(() => {
        tmpl.param('items', [{ item: 'a' }]);
      }).not.toThrow();

      expect(() => {
        tmpl.param('hide_footer', false);
      }).not.toThrow();

      expect(() => {
        tmpl.param('footer', 'Footer text');
      }).not.toThrow();

      // Invalid parameter
      const result = expect(() => {
        tmpl.param('nonexistent', 'value');
      });
      result.toThrow(/param\(\) called for nonexistent parameter/);
    });

    it('should handle parameters in nested structures', () => {
      const tmpl = new HTMLTemplate({
        scalarref: `
          <TMPL_LOOP NAME="outer">
            <TMPL_VAR NAME="outer_var">
            <TMPL_IF NAME="has_inner">
              <TMPL_LOOP NAME="inner">
                <TMPL_VAR NAME="inner_var">
              </TMPL_LOOP>
            </TMPL_IF>
          </TMPL_LOOP>
        `
      });

      // Top-level loop is valid
      expect(() => {
        tmpl.param('outer', [{
          outer_var: 'test',
          has_inner: true,
          inner: [{ inner_var: 'nested' }]
        }]);
      }).not.toThrow();

      // All parameter names found in template are valid
      expect(() => {
        tmpl.param('outer_var', 'test');
      }).not.toThrow();

      expect(() => {
        tmpl.param('inner_var', 'test');
      }).not.toThrow();

      expect(() => {
        tmpl.param('has_inner', true);
      }).not.toThrow();

      expect(() => {
        tmpl.param('inner', [{ inner_var: 'test' }]);
      }).not.toThrow();

      // But truly nonexistent parameters should fail
      expect(() => {
        tmpl.param('completely_unknown', 'test');
      }).toThrow(/param\(\) called for nonexistent parameter/);
    });
  });
});
