/**
 * ESCAPE tests
 *
 * Escaping is part of the template syntax, so the attribute forms and their
 * exact output are pinned here. The compile-time default that applies when a
 * tag carries no ESCAPE lives in the compile tests.
 */

import { describe, expect, it } from 'vitest';
import { compile } from '../../src/index.js';

/** Compile with escaping off so an ESCAPE attribute is the only thing acting */
const raw = { defaultEscape: 'none' } as const;

describe('ESCAPE=html', () => {
  it('escapes every HTML special character', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE="html">', raw).render({ x: '<>&"\'' })).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('escapes a script tag', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE="html">', raw).render({ x: '<script>alert("XSS")</script>' })).toBe(
      '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
    );
  });

  it('leaves ordinary text alone', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE="html">', raw).render({ x: 'Hello World 123' })).toBe('Hello World 123');
  });

  it('accepts the numeric spelling', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE=1>', raw).render({ x: '<b>' })).toBe('&lt;b&gt;');
  });
});

describe('ESCAPE=js', () => {
  it('escapes quotes', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE="js">', raw).render({ x: 'It\'s "quoted"' })).toBe(
      'It\\\'s \\"quoted\\"'
    );
  });

  it('escapes backslashes', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE="js">', raw).render({ x: 'C:\\Users\\Name' })).toBe(
      'C:\\\\Users\\\\Name'
    );
  });

  it('escapes line breaks', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE="js">', raw).render({ x: 'Line 1\r\nLine 2' })).toBe(
      'Line 1\\r\\nLine 2'
    );
  });

  it('produces a value safe to embed in a script', () => {
    expect(compile('var msg = "<TMPL_VAR NAME="msg" ESCAPE="js">";', raw).render({ msg: 'Say "Hello"' })).toBe(
      'var msg = "Say \\"Hello\\"";'
    );
  });
});

describe('ESCAPE=url', () => {
  it('percent-encodes reserved characters', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE="url">', raw).render({ x: 'hello world?foo=bar&baz' })).toBe(
      'hello%20world%3Ffoo%3Dbar%26baz'
    );
  });

  it('leaves unreserved characters alone', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE="url">', raw).render({ x: 'abc_123.xyz-test' })).toBe('abc_123.xyz-test');
  });

  it('percent-encodes non-ASCII text', () => {
    const output = compile('<TMPL_VAR NAME="x" ESCAPE="url">', raw).render({ x: 'こんにちは' });

    expect(output).not.toBe('こんにちは');
    expect(output).toContain('%');
  });
});

describe('ESCAPE=none', () => {
  it('writes the value through untouched', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE="none">', raw).render({ x: '<script>&"\'</script>' })).toBe(
      '<script>&"\'</script>'
    );
  });

  it('accepts the numeric spelling', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE=0>', raw).render({ x: '<b>bold</b>' })).toBe('<b>bold</b>');
  });
});

describe('ESCAPE attribute handling', () => {
  it('rejects a value the syntax does not define', () => {
    expect(() => compile('<TMPL_VAR NAME="x" ESCAPE="javascript">')).toThrow(/invalid ESCAPE value/);
  });

  it('overrides the compiled default per tag', () => {
    const template = compile('<TMPL_VAR NAME="a" ESCAPE="url"><TMPL_VAR NAME="b">', { defaultEscape: 'html' });

    expect(template.render({ a: 'hello world', b: '<i>' })).toBe('hello%20world&lt;i&gt;');
  });

  it('applies per value inside a loop', () => {
    const template = compile(
      '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="h" ESCAPE="html">|<TMPL_VAR NAME="j" ESCAPE="js"> </TMPL_LOOP>',
      raw
    );

    expect(template.render({ items: [{ h: '<b>', j: '"test"' }] })).toBe('&lt;b&gt;|\\"test\\" ');
  });

  it('escapes an empty value to an empty string', () => {
    expect(compile('<TMPL_VAR NAME="x" ESCAPE="html">', raw).render({ x: '' })).toBe('');
  });
});
