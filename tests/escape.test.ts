/**
 * Escape tests
 * Port of Perl HTML::Template ESCAPE option tests
 */

import { describe, expect, it } from 'vitest';
import { HTMLTemplate } from '../src/index.js';

describe('ESCAPE Tests', () => {
  describe('HTML escaping', () => {
    it('should escape HTML entities', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="html">'
      });
      tmpl.param('foo', '<script>alert("XSS")</script>');
      expect(tmpl.output()).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    it('should escape ampersands', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="html">'
      });
      tmpl.param('foo', 'Tom & Jerry');
      expect(tmpl.output()).toBe('Tom &amp; Jerry');
    });

    it('should escape quotes', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="html">'
      });
      tmpl.param('foo', 'It\'s "quoted"');
      expect(tmpl.output()).toBe('It&#39;s &quot;quoted&quot;');
    });

    it('should escape all HTML special characters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="html">'
      });
      tmpl.param('foo', '<>&"\'');
      expect(tmpl.output()).toBe('&lt;&gt;&amp;&quot;&#39;');
    });

    it('should not escape when ESCAPE=html not specified', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo">'
      });
      tmpl.param('foo', '<b>bold</b>');
      expect(tmpl.output()).toBe('<b>bold</b>');
    });

    it('should handle empty strings with HTML escape', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="html">'
      });
      tmpl.param('foo', '');
      expect(tmpl.output()).toBe('');
    });

    it('should handle text without special characters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="html">'
      });
      tmpl.param('foo', 'Hello World 123');
      expect(tmpl.output()).toBe('Hello World 123');
    });
  });

  describe('JavaScript escaping', () => {
    it('should escape JavaScript quotes', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="js">'
      });
      tmpl.param('foo', 'It\'s "quoted"');
      expect(tmpl.output()).toBe('It\\\'s \\"quoted\\"');
    });

    it('should escape backslashes', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="js">'
      });
      tmpl.param('foo', 'C:\\Users\\Name');
      expect(tmpl.output()).toBe('C:\\\\Users\\\\Name');
    });

    it('should escape newlines', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="js">'
      });
      tmpl.param('foo', 'Line 1\nLine 2');
      expect(tmpl.output()).toBe('Line 1\\nLine 2');
    });

    it('should escape carriage returns', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="js">'
      });
      tmpl.param('foo', 'Line 1\r\nLine 2');
      expect(tmpl.output()).toBe('Line 1\\r\\nLine 2');
    });

    it('should handle empty strings with JS escape', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="js">'
      });
      tmpl.param('foo', '');
      expect(tmpl.output()).toBe('');
    });

    it('should handle text without special characters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="js">'
      });
      tmpl.param('foo', 'Hello World 123');
      expect(tmpl.output()).toBe('Hello World 123');
    });

    it('should work in JavaScript context', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'var msg = "<TMPL_VAR NAME="msg" ESCAPE="js">";'
      });
      tmpl.param('msg', 'Say "Hello"');
      expect(tmpl.output()).toBe('var msg = "Say \\"Hello\\"";');
    });

    it('should reject ESCAPE values Perl does not accept', () => {
      expect(
        () =>
          new HTMLTemplate({
            scalarref: '<TMPL_VAR NAME="foo" ESCAPE="javascript">'
          })
      ).toThrow(/invalid ESCAPE value/);
    });
  });

  describe('URL escaping', () => {
    it('should escape URL special characters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="url">'
      });
      tmpl.param('foo', 'hello world?foo=bar&baz');
      expect(tmpl.output()).toBe('hello%20world%3Ffoo%3Dbar%26baz');
    });

    it('should escape spaces as %20', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="url">'
      });
      tmpl.param('foo', 'hello world');
      expect(tmpl.output()).toBe('hello%20world');
    });

    it('should not escape safe characters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="url">'
      });
      tmpl.param('foo', 'abc_123.xyz-test');
      expect(tmpl.output()).toBe('abc_123.xyz-test');
    });

    it('should escape special URL characters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="url">'
      });
      tmpl.param('foo', '?&=#');
      expect(tmpl.output()).toBe('%3F%26%3D%23');
    });

    it('should handle empty strings with URL escape', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="url">'
      });
      tmpl.param('foo', '');
      expect(tmpl.output()).toBe('');
    });

    it('should work in URL context', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<a href="/search?q=<TMPL_VAR NAME="query" ESCAPE="url">">Search</a>'
      });
      tmpl.param('query', 'hello world');
      expect(tmpl.output()).toBe('<a href="/search?q=hello%20world">Search</a>');
    });

    it('should escape unicode characters', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="url">'
      });
      tmpl.param('foo', 'こんにちは');
      const output = tmpl.output();
      // Should be percent-encoded
      expect(output).not.toBe('こんにちは');
      expect(output).toContain('%');
    });
  });

  describe('ESCAPE=none', () => {
    it('should not escape with ESCAPE="none"', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="none">'
      });
      tmpl.param('foo', '<script>&"\'</script>');
      expect(tmpl.output()).toBe('<script>&"\'</script>');
    });

    it('should not escape with ESCAPE="0"', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="0">'
      });
      tmpl.param('foo', '<script>&"\'</script>');
      expect(tmpl.output()).toBe('<script>&"\'</script>');
    });
  });

  describe('Default escape option', () => {
    it('should apply default_escape to all variables', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo"><TMPL_VAR NAME="bar">',
        default_escape: 'html'
      });
      tmpl.param('foo', '<script>');
      tmpl.param('bar', '</script>');
      expect(tmpl.output()).toBe('&lt;script&gt;&lt;/script&gt;');
    });

    it('should allow per-variable override of default_escape', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_VAR NAME="foo" ESCAPE="url"><TMPL_VAR NAME="bar">',
        default_escape: 'html'
      });
      tmpl.param('foo', 'hello world');
      tmpl.param('bar', '<i>');
      expect(tmpl.output()).toBe('hello%20world&lt;i&gt;');
    });
  });

  describe('Escape in loops', () => {
    it('should escape values in loops', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="value" ESCAPE="html">,</TMPL_LOOP>'
      });
      tmpl.param('items', [{ value: '<a>' }, { value: '<b>' }, { value: '<c>' }]);
      expect(tmpl.output()).toBe('&lt;a&gt;,&lt;b&gt;,&lt;c&gt;,');
    });

    it('should respect different escape types per variable in loop', () => {
      const tmpl = new HTMLTemplate({
        scalarref:
          '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="html" ESCAPE="html">|<TMPL_VAR NAME="js" ESCAPE="js"> </TMPL_LOOP>'
      });
      tmpl.param('items', [{ html: '<b>', js: '"test"' }]);
      expect(tmpl.output()).toBe('&lt;b&gt;|\\"test\\" ');
    });
  });

  describe('Multiple escape types in same template', () => {
    it('should handle different escape types correctly', () => {
      const tmpl = new HTMLTemplate({
        scalarref:
          'HTML:<TMPL_VAR NAME="a" ESCAPE="html"> JS:<TMPL_VAR NAME="b" ESCAPE="js"> URL:<TMPL_VAR NAME="c" ESCAPE="url">'
      });
      tmpl.param('a', '<tag>');
      tmpl.param('b', '"quote"');
      tmpl.param('c', 'hello world');
      expect(tmpl.output()).toBe('HTML:&lt;tag&gt; JS:\\"quote\\" URL:hello%20world');
    });
  });
});
