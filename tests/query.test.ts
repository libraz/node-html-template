/**
 * query() method tests
 * Tests for template structure querying
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

    it('should handle nested parameters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="name"></TMPL_LOOP>'
      });

      expect(tmpl.query({ name: 'items' })).toBe('LOOP');
      expect(tmpl.query({ name: 'name' })).toBe('VAR');
    });

    it('should handle array path for nested query', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="name"></TMPL_LOOP>'
      });

      expect(tmpl.query({ name: ['items', 'name'] })).toBe('VAR');
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

    it('should return undefined for nonexistent loop', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="name"></TMPL_LOOP>'
      });

      const result = tmpl.query({ loop: 'nonexistent' });
      expect(result).toBeUndefined();
    });

    it('should return parameters in nested loop', () => {
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

      const outerResult = tmpl.query({ loop: 'outer' });
      expect(outerResult).toEqual(['inner', 'outer_var']);

      const innerResult = tmpl.query({ loop: 'inner' });
      expect(innerResult).toEqual(['inner_var']);
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
    it('should be case-insensitive by default', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="FooBar">'
      });

      expect(tmpl.query()).toEqual(['FooBar']);
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

      expect(tmpl.query({ loop: 'items' })).toEqual(['Name']);
      expect(tmpl.query({ loop: 'ITEMS' })).toEqual(['Name']);
      expect(tmpl.query({ loop: 'Items' })).toEqual(['Name']);
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

      const allParams = tmpl.query();
      expect(allParams).toEqual(['hide_footer', 'show_list', 'title']);

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
      expect(tmpl.query({ name: 'level2' })).toBe('LOOP');
      expect(tmpl.query({ name: 'level3' })).toBe('LOOP');

      expect(tmpl.query({ loop: 'level1' })).toEqual(['level2', 'var1']);
      expect(tmpl.query({ loop: 'level2' })).toEqual(['level3', 'var2']);
      expect(tmpl.query({ loop: 'level3' })).toEqual(['var3']);
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
      expect(allParams).toEqual(['condition']);

      expect(tmpl.query({ name: 'condition' })).toBe('VAR');
      expect(tmpl.query({ name: 'true_var' })).toBe('VAR');
      expect(tmpl.query({ name: 'false_var' })).toBe('VAR');
    });
  });
});
