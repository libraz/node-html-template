/**
 * query() method tests
 *
 * Expected values in this file were taken from Perl HTML::Template 2.98.
 * The governing rules are:
 * - every TMPL_LOOP opens a namespace; conditionals do not
 * - reported names are normalized for case unless case_sensitive is set
 * - lookups are exact, so a path must name every enclosing loop
 */

import { describe, expect, it } from 'vitest';
import { HTMLTemplate } from '../src/index.js';

describe('query() method', () => {
  describe('Query all parameters', () => {
    it('should return empty array for template with no parameters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Hello World'
      });

      const result = tmpl.query();
      expect(result).toEqual([]);
    });

    it('should return all parameter names', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo"> <TMPL_VAR NAME="bar"> <TMPL_VAR NAME="baz">'
      });

      const result = tmpl.query();
      expect(result).toEqual(['bar', 'baz', 'foo']); // Sorted alphabetically
    });

    it('should include loop names but not nested params', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="title"> <TMPL_LOOP NAME="items"><TMPL_VAR NAME="item"></TMPL_LOOP>'
      });

      const result = tmpl.query();
      expect(result).toEqual(['items', 'title']);
    });

    it('should include conditional names', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="show">content</TMPL_IF> <TMPL_UNLESS NAME="hide">text</TMPL_UNLESS>'
      });

      const result = tmpl.query();
      expect(result).toEqual(['hide', 'show']);
    });

    it('should include names used inside a conditional at the same level', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="cond"><TMPL_VAR NAME="inside"></TMPL_IF><TMPL_VAR NAME="top">'
      });

      expect(tmpl.query()).toEqual(['cond', 'inside', 'top']);
    });

    it('should return only top-level parameters (Perl-compatible)', () => {
      const tmpl = new HTMLTemplate({
        scalarref: `
          <TMPL_VAR NAME="title">
          <TMPL_LOOP NAME="outer">
            <TMPL_VAR NAME="outer_var">
            <TMPL_LOOP NAME="inner">
              <TMPL_VAR NAME="inner_var">
            </TMPL_LOOP>
          </TMPL_LOOP>
        `
      });

      const result = tmpl.query();
      expect(result).toEqual(['outer', 'title']);
    });

    it('should not include duplicates', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo"> <TMPL_VAR NAME="foo"> <TMPL_VAR NAME="foo">'
      });

      const result = tmpl.query();
      expect(result).toEqual(['foo']);
    });
  });

  describe('Query parameter type', () => {
    it('should return VAR for variable', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">'
      });

      expect(tmpl.query({ name: 'foo' })).toBe('VAR');
    });

    it('should return LOOP for loop', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="item"></TMPL_LOOP>'
      });

      expect(tmpl.query({ name: 'items' })).toBe('LOOP');
    });

    it('should return VAR for conditional', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_IF NAME="show">content</TMPL_IF>'
      });

      expect(tmpl.query({ name: 'show' })).toBe('VAR');
    });

    it('should return undefined for nonexistent parameter', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">'
      });

      expect(tmpl.query({ name: 'bar' })).toBeUndefined();
    });

    it('should not find loop-scoped names without a path', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="name"></TMPL_LOOP>'
      });

      expect(tmpl.query({ name: 'items' })).toBe('LOOP');
      expect(tmpl.query({ name: 'name' })).toBeUndefined();
    });

    it('should handle array path for nested query', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="name"></TMPL_LOOP>'
      });

      expect(tmpl.query({ name: ['items', 'name'] })).toBe('VAR');
    });

    it('should require array paths to follow each nested loop exactly', () => {
      const tmpl = new HTMLTemplate({
        scalarref: `
          <TMPL_LOOP NAME="outer">
            <TMPL_LOOP NAME="inner">
              <TMPL_VAR NAME="only_inner">
            </TMPL_LOOP>
            <TMPL_VAR NAME="outer_var">
          </TMPL_LOOP>
        `
      });

      expect(tmpl.query({ name: ['outer', 'inner', 'only_inner'] })).toBe('VAR');
      expect(tmpl.query({ name: ['outer', 'missing', 'only_inner'] })).toBeUndefined();
      expect(tmpl.query({ loop: ['outer', 'inner'] })).toEqual(['only_inner']);
      expect(tmpl.query({ loop: ['outer', 'missing'] })).toBeUndefined();
    });
  });

  describe('Query loop parameters', () => {
    it('should return parameters within a loop', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="name"> <TMPL_VAR NAME="value"></TMPL_LOOP>'
      });

      const result = tmpl.query({ loop: 'items' });
      expect(result).toEqual(['name', 'value']);
    });

    it('should return undefined for a nonexistent loop', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="name"></TMPL_LOOP>'
      });

      expect(tmpl.query({ loop: 'nonexistent' })).toBeUndefined();
    });

    it('should throw when the path names a variable instead of a loop', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="plain">'
      });

      expect(() => tmpl.query({ loop: 'plain' })).toThrow(/doesn't end in a TMPL_LOOP/);
    });

    it('should require a path to reach a nested loop', () => {
      const tmpl = new HTMLTemplate({
        scalarref: `
          <TMPL_LOOP NAME="outer">
            <TMPL_VAR NAME="outer_var">
            <TMPL_LOOP NAME="inner">
              <TMPL_VAR NAME="inner_var">
            </TMPL_LOOP>
          </TMPL_LOOP>
        `
      });

      expect(tmpl.query({ loop: 'outer' })).toEqual(['inner', 'outer_var']);
      expect(tmpl.query({ loop: 'inner' })).toBeUndefined();
      expect(tmpl.query({ loop: ['outer', 'inner'] })).toEqual(['inner_var']);
    });

    it('should include conditionals in loop query', () => {
      const tmpl = new HTMLTemplate({
        scalarref: `
          <TMPL_LOOP NAME="items">
            <TMPL_VAR NAME="name">
            <TMPL_IF NAME="show_value">
              <TMPL_VAR NAME="value">
            </TMPL_IF>
          </TMPL_LOOP>
        `
      });

      const result = tmpl.query({ loop: 'items' });
      expect(result).toEqual(['name', 'show_value', 'value']);
    });

    it('should include nested loops in query result', () => {
      const tmpl = new HTMLTemplate({
        scalarref: `
          <TMPL_LOOP NAME="outer">
            <TMPL_VAR NAME="title">
            <TMPL_LOOP NAME="inner">
              <TMPL_VAR NAME="item">
            </TMPL_LOOP>
          </TMPL_LOOP>
        `
      });

      const result = tmpl.query({ loop: 'outer' });
      expect(result).toEqual(['inner', 'title']);
    });
  });

  describe('Case sensitivity', () => {
    it('should report normalized names by default', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="FooBar">'
      });

      expect(tmpl.query()).toEqual(['foobar']);
      expect(tmpl.query({ name: 'foobar' })).toBe('VAR');
      expect(tmpl.query({ name: 'FOOBAR' })).toBe('VAR');
      expect(tmpl.query({ name: 'FooBar' })).toBe('VAR');
    });

    it('should be case-sensitive when enabled', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="FooBar">',
        case_sensitive: true
      });

      expect(tmpl.query()).toEqual(['FooBar']);
      expect(tmpl.query({ name: 'FooBar' })).toBe('VAR');
      expect(tmpl.query({ name: 'foobar' })).toBeUndefined();
      expect(tmpl.query({ name: 'FOOBAR' })).toBeUndefined();
    });

    it('should handle case-insensitive loop queries', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="Items"><TMPL_VAR NAME="Name"></TMPL_LOOP>'
      });

      expect(tmpl.query({ loop: 'items' })).toEqual(['name']);
      expect(tmpl.query({ loop: 'ITEMS' })).toEqual(['name']);
      expect(tmpl.query({ loop: 'Items' })).toEqual(['name']);
    });
  });

  describe('Complex templates', () => {
    it('should handle template with all types of parameters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: `
          <TMPL_VAR NAME="title">
          <TMPL_IF NAME="show_list">
            <TMPL_LOOP NAME="items">
              <TMPL_VAR NAME="item_name">
              <TMPL_VAR NAME="item_value">
            </TMPL_LOOP>
          </TMPL_IF>
          <TMPL_UNLESS NAME="hide_footer">
            <TMPL_VAR NAME="footer">
          </TMPL_UNLESS>
        `
      });

      // The loop and the names inside both conditionals all live at the top
      // level, because only TMPL_LOOP opens a namespace.
      const allParams = tmpl.query();
      expect(allParams).toEqual(['footer', 'hide_footer', 'items', 'show_list', 'title']);

      expect(tmpl.query({ name: 'title' })).toBe('VAR');
      expect(tmpl.query({ name: 'show_list' })).toBe('VAR');
      expect(tmpl.query({ name: 'items' })).toBe('LOOP');
      expect(tmpl.query({ name: 'hide_footer' })).toBe('VAR');

      const loopParams = tmpl.query({ loop: 'items' });
      expect(loopParams).toEqual(['item_name', 'item_value']);
    });

    it('should handle deeply nested structures', () => {
      const tmpl = new HTMLTemplate({
        scalarref: `
          <TMPL_LOOP NAME="level1">
            <TMPL_VAR NAME="var1">
            <TMPL_LOOP NAME="level2">
              <TMPL_VAR NAME="var2">
              <TMPL_LOOP NAME="level3">
                <TMPL_VAR NAME="var3">
              </TMPL_LOOP>
            </TMPL_LOOP>
          </TMPL_LOOP>
        `
      });

      expect(tmpl.query({ name: 'level1' })).toBe('LOOP');
      expect(tmpl.query({ name: 'level2' })).toBeUndefined();
      expect(tmpl.query({ name: ['level1', 'level2'] })).toBe('LOOP');
      expect(tmpl.query({ name: ['level1', 'level2', 'level3'] })).toBe('LOOP');

      expect(tmpl.query({ loop: 'level1' })).toEqual(['level2', 'var1']);
      expect(tmpl.query({ loop: ['level1', 'level2'] })).toEqual(['level3', 'var2']);
      expect(tmpl.query({ loop: ['level1', 'level2', 'level3'] })).toEqual(['var3']);
    });

    it('should handle conditionals with else branches', () => {
      const tmpl = new HTMLTemplate({
        scalarref: `
          <TMPL_IF NAME="condition">
            <TMPL_VAR NAME="true_var">
          <TMPL_ELSE>
            <TMPL_VAR NAME="false_var">
          </TMPL_IF>
        `
      });

      const allParams = tmpl.query();
      expect(allParams).toEqual(['condition', 'false_var', 'true_var']);

      expect(tmpl.query({ name: 'condition' })).toBe('VAR');
      expect(tmpl.query({ name: 'true_var' })).toBe('VAR');
      expect(tmpl.query({ name: 'false_var' })).toBe('VAR');
    });
  });
});
