/**
 * Advanced feature tests
 * Covers: TMPL_COMMENT, ESCAPE=1, associate, filter, lazy values,
 * nested loop scoping, malformed templates, streaming output, etc.
 */

import { Readable, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { HTMLTemplate } from '../src/index.js';

// ============================================================================
// TMPL_COMMENT / TMPL_NOTE
// ============================================================================

describe('TMPL_COMMENT', () => {
  it('should strip TMPL_COMMENT blocks', () => {
    const tmpl = new HTMLTemplate({
      scalarref: 'Hello <TMPL_COMMENT>this is a comment</TMPL_COMMENT>World'
    });
    expect(tmpl.output()).toBe('Hello World');
  });

  it('should strip TMPL_NOTE blocks', () => {
    const tmpl = new HTMLTemplate({
      scalarref: 'A<TMPL_NOTE>note here</TMPL_NOTE>B'
    });
    expect(tmpl.output()).toBe('AB');
  });

  it('should strip HTML comment form', () => {
    const tmpl = new HTMLTemplate({
      scalarref: 'X<!-- TMPL_COMMENT -->hidden<!-- /TMPL_COMMENT -->Y'
    });
    expect(tmpl.output()).toBe('XY');
  });

  it('should strip multiline comments', () => {
    const tmpl = new HTMLTemplate({
      scalarref: `Before
<TMPL_COMMENT>
  This entire block
  should be removed
</TMPL_COMMENT>
After`
    });
    expect(tmpl.output()).toBe('Before\n\nAfter');
  });

  it('should handle multiple comment blocks', () => {
    const tmpl = new HTMLTemplate({
      scalarref: 'A<TMPL_COMMENT>1</TMPL_COMMENT>B<TMPL_COMMENT>2</TMPL_COMMENT>C'
    });
    expect(tmpl.output()).toBe('ABC');
  });
});

// ============================================================================
// ESCAPE=1
// ============================================================================

describe('ESCAPE=1', () => {
  it('should treat ESCAPE=1 as HTML escaping', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="val" ESCAPE=1>'
    });
    tmpl.param('val', '<script>alert("xss")</script>');
    expect(tmpl.output()).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('should treat ESCAPE=0 as no escaping', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="val" ESCAPE=0>'
    });
    tmpl.param('val', '<b>bold</b>');
    expect(tmpl.output()).toBe('<b>bold</b>');
  });
});

// ============================================================================
// Associate option
// ============================================================================

describe('associate option', () => {
  it('should pull params from associate object', () => {
    const cgi = {
      param: (name: string) => {
        if (name === 'username') return 'alice';
        if (name === 'role') return 'admin';
        return undefined;
      }
    };

    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="username"> (<TMPL_VAR NAME="role">)',
      associate: cgi,
      die_on_bad_params: false
    });
    expect(tmpl.output()).toBe('alice (admin)');
  });

  it('should give last associate highest priority', () => {
    const obj1 = { param: (name: string) => (name === 'x' ? 'from1' : undefined) };
    const obj2 = { param: (name: string) => (name === 'x' ? 'from2' : undefined) };

    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="x">',
      associate: [obj1, obj2],
      die_on_bad_params: false
    });
    expect(tmpl.output()).toBe('from2');
  });

  it('should prefer explicit param over associate', () => {
    const cgi = { param: (name: string) => (name === 'val' ? 'from_cgi' : undefined) };

    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="val">',
      associate: cgi,
      die_on_bad_params: false
    });
    tmpl.param('val', 'explicit');
    expect(tmpl.output()).toBe('explicit');
  });
});

// ============================================================================
// Filter option
// ============================================================================

describe('filter option', () => {
  it('should apply scalar filter', () => {
    const tmpl = new HTMLTemplate({
      scalarref: 'hello <TMPL_VAR NAME="name">',
      filter: {
        sub: (content) => (content as string).toUpperCase(),
        format: 'scalar'
      }
    });
    tmpl.param('name', 'world');
    expect(tmpl.output()).toBe('HELLO world');
  });

  it('should apply array filter', () => {
    const tmpl = new HTMLTemplate({
      scalarref: 'line1\nline2\nline3',
      filter: {
        sub: (content) => (content as string[]).filter((line) => line.includes('2')),
        format: 'array'
      }
    });
    expect(tmpl.output()).toBe('line2\n');
  });

  it('should apply multiple filters in order', () => {
    const tmpl = new HTMLTemplate({
      scalarref: 'hello',
      filter: [{ sub: (c) => (c as string) + ' world' }, { sub: (c) => (c as string).toUpperCase() }]
    });
    expect(tmpl.output()).toBe('HELLO WORLD');
  });
});

// ============================================================================
// Lazy values
// ============================================================================

describe('lazy values', () => {
  it('should evaluate lazy var on access', () => {
    let called = false;
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="lazy_val">',
      die_on_bad_params: false
    });
    tmpl.param('lazy_val', () => {
      called = true;
      return 'computed';
    });
    expect(called).toBe(false);
    expect(tmpl.output()).toBe('computed');
    expect(called).toBe(true);
  });

  it('should evaluate lazy loop on access', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="n">,</TMPL_LOOP>',
      die_on_bad_params: false
    });
    tmpl.param('items', () => [{ n: 'a' }, { n: 'b' }]);
    expect(tmpl.output()).toBe('a,b,');
  });

  it('should not call lazy var if not used in output', () => {
    let called = false;
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_IF NAME="show"><TMPL_VAR NAME="lazy_val"></TMPL_IF>',
      die_on_bad_params: false
    });
    tmpl.param('show', false);
    tmpl.param('lazy_val', () => {
      called = true;
      return 'never';
    });
    tmpl.output();
    expect(called).toBe(false);
  });
});

// ============================================================================
// Nested loop scope (without global_vars)
// ============================================================================

describe('nested loop scope isolation', () => {
  it('should preserve outer loop scope after inner loop', () => {
    const tmpl = new HTMLTemplate({
      scalarref: `<TMPL_LOOP NAME="outer"><TMPL_VAR NAME="a">-<TMPL_LOOP NAME="inner"><TMPL_VAR NAME="b"></TMPL_LOOP>-<TMPL_VAR NAME="a">|</TMPL_LOOP>`
    });
    tmpl.param('outer', [
      { a: 'X', inner: [{ b: '1' }, { b: '2' }] },
      { a: 'Y', inner: [{ b: '3' }] }
    ]);
    expect(tmpl.output()).toBe('X-12-X|Y-3-Y|');
  });

  it('should handle deeply nested loops correctly', () => {
    const tmpl = new HTMLTemplate({
      scalarref:
        '<TMPL_LOOP NAME="l1"><TMPL_LOOP NAME="l2"><TMPL_LOOP NAME="l3"><TMPL_VAR NAME="v"></TMPL_LOOP></TMPL_LOOP><TMPL_VAR NAME="x"></TMPL_LOOP>'
    });
    tmpl.param('l1', [
      { x: 'A', l2: [{ l3: [{ v: '1' }] }] },
      { x: 'B', l2: [{ l3: [{ v: '2' }, { v: '3' }] }] }
    ]);
    expect(tmpl.output()).toBe('1A23B');
  });
});

// ============================================================================
// Loop context vars with Perl-compatible values
// ============================================================================

describe('loop context vars Perl compatibility', () => {
  it('should render __first__ as 1 and empty string', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_LOOP NAME="items">[<TMPL_VAR NAME="__first__">]</TMPL_LOOP>',
      loop_context_vars: true
    });
    tmpl.param('items', [{}, {}, {}]);
    expect(tmpl.output()).toBe('[1][][]');
  });

  it('should render __counter__ as number', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="__counter__"></TMPL_LOOP>',
      loop_context_vars: true
    });
    tmpl.param('items', [{}, {}, {}]);
    expect(tmpl.output()).toBe('123');
  });

  it('should render __odd__/__even__ as 1/empty', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="__odd__"><TMPL_VAR NAME="__even__">|</TMPL_LOOP>',
      loop_context_vars: true
    });
    tmpl.param('items', [{}, {}, {}]);
    expect(tmpl.output()).toBe('1|1|1|');
  });
});

// ============================================================================
// Malformed template error handling
// ============================================================================

describe('malformed templates', () => {
  it('should throw on unclosed TMPL_LOOP', () => {
    expect(() => {
      new HTMLTemplate({ scalarref: '<TMPL_LOOP NAME="items">body' });
    }).toThrow(/Unclosed LOOP/);
  });

  it('should throw on unclosed TMPL_IF', () => {
    expect(() => {
      new HTMLTemplate({ scalarref: '<TMPL_IF NAME="x">body' });
    }).toThrow(/Unclosed IF/);
  });

  it('should throw on unexpected ENDLOOP', () => {
    expect(() => {
      new HTMLTemplate({ scalarref: '</TMPL_LOOP>' });
    }).toThrow(/Unexpected ENDLOOP/);
  });

  it('should throw on unexpected ELSE', () => {
    expect(() => {
      new HTMLTemplate({ scalarref: '<TMPL_ELSE>' });
    }).toThrow(/Unexpected ELSE/);
  });

  it('should throw on unexpected ENDIF', () => {
    expect(() => {
      new HTMLTemplate({ scalarref: '</TMPL_IF>' });
    }).toThrow(/Unexpected ENDIF/);
  });

  it('should throw on missing NAME in TMPL_VAR', () => {
    expect(() => {
      new HTMLTemplate({ scalarref: '<TMPL_VAR>' });
    }).toThrow(/NAME attribute required/);
  });
});

// ============================================================================
// type + source constructor
// ============================================================================

describe('type + source constructor', () => {
  it('should accept type=scalarref', () => {
    const tmpl = new HTMLTemplate({
      type: 'scalarref',
      source: 'Hello <TMPL_VAR NAME="n">'
    });
    tmpl.param('n', 'World');
    expect(tmpl.output()).toBe('Hello World');
  });

  it('should accept type=arrayref', () => {
    const tmpl = new HTMLTemplate({
      type: 'arrayref',
      source: ['Line1 <TMPL_VAR NAME="x">', 'Line2']
    });
    tmpl.param('x', 'val');
    expect(tmpl.output()).toBe('Line1 valLine2');
  });
});

// ============================================================================
// output({ print_to }) streaming
// ============================================================================

describe('output with print_to', () => {
  it('should write to writable stream and return undefined', () => {
    const chunks: string[] = [];
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      }
    });

    const tmpl = new HTMLTemplate({
      scalarref: 'Hello <TMPL_VAR NAME="name">'
    });
    tmpl.param('name', 'Stream');

    const result = tmpl.output({ print_to: writable });
    expect(result).toBeUndefined();
    expect(chunks.join('')).toBe('Hello Stream');
  });
});

// ============================================================================
// no_includes with templates containing INCLUDE tags
// ============================================================================

describe('no_includes option', () => {
  it('should throw when INCLUDE tags are used and no_includes is true', () => {
    expect(() => {
      new HTMLTemplate({
        scalarref: 'A<TMPL_INCLUDE NAME="nonexistent.tmpl">B',
        no_includes: true
      });
    }).toThrow(/no_includes => 1/);
  });
});

// ============================================================================
// clear() method
// ============================================================================

describe('clear()', () => {
  it('should reset all params', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="a"><TMPL_VAR NAME="b">'
    });
    tmpl.param({ a: 'X', b: 'Y' });
    expect(tmpl.output()).toBe('XY');

    tmpl.clear();
    expect(tmpl.output()).toBe('');
  });

  it('should allow re-setting params after clear', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="v">'
    });
    tmpl.param('v', 'first');
    tmpl.clear();
    tmpl.param('v', 'second');
    expect(tmpl.output()).toBe('second');
  });
});

// ============================================================================
// filehandle (Readable stream)
// ============================================================================

describe('filehandle option', () => {
  it('should read template from Readable stream', () => {
    const stream = Readable.from(['Hello ', '<TMPL_VAR NAME="name">']);

    const tmpl = new HTMLTemplate({
      filehandle: stream
    });
    tmpl.param('name', 'Stream');
    expect(tmpl.output()).toBe('Hello Stream');
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('edge cases', () => {
  it('should handle empty loop data items gracefully', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="x" DEFAULT="none">,</TMPL_LOOP>'
    });
    tmpl.param('items', [{}, { x: 'a' }, {}]);
    expect(tmpl.output()).toBe('none,a,none,');
  });

  it('should handle template with only whitespace', () => {
    const tmpl = new HTMLTemplate({ scalarref: '   \n\t  ' });
    expect(tmpl.output()).toBe('   \n\t  ');
  });

  it('should handle param value of 0', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="val">'
    });
    tmpl.param('val', 0);
    expect(tmpl.output()).toBe('0');
  });

  it('should handle param value of empty string', () => {
    const tmpl = new HTMLTemplate({
      scalarref: '<TMPL_VAR NAME="val" DEFAULT="default">'
    });
    tmpl.param('val', '');
    expect(tmpl.output()).toBe('');
  });
});
