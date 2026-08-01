/**
 * Malformed template tests
 *
 * A block tag has to be closed by its own end tag, and Perl HTML::Template
 * says so in the message rather than guessing what was meant. These pin the
 * errors a caller has to work from, since a template only fails to compile
 * once and the message is all they get.
 */

import { describe, expect, it } from 'vitest';
import { compile } from '../../src/index.js';

describe('unclosed blocks', () => {
  it('names the loop that was left open', () => {
    expect(() => compile('<TMPL_LOOP NAME="rows">x')).toThrow('Unclosed LOOP block for "rows"');
  });

  it('names the condition that was left open', () => {
    expect(() => compile('<TMPL_IF NAME="c">x')).toThrow('Unclosed IF block for "c"');
  });

  it('names the outer block when only the inner one is closed', () => {
    expect(() => compile('<TMPL_LOOP NAME="rows"><TMPL_IF NAME="c">x</TMPL_IF>')).toThrow(
      'Unclosed LOOP block for "rows"'
    );
  });
});

describe('mismatched end tags', () => {
  it('rejects a condition closed by the wrong end tag', () => {
    expect(() => compile('<TMPL_IF NAME="c">a</TMPL_UNLESS>')).toThrow(
      'found </TMPL_UNLESS> incorrectly terminating a <TMPL_IF> (use </TMPL_IF>)'
    );
  });

  it('rejects the reverse just as firmly', () => {
    expect(() => compile('<TMPL_UNLESS NAME="c">a</TMPL_IF>')).toThrow(
      'found </TMPL_IF> incorrectly terminating a <TMPL_UNLESS> (use </TMPL_UNLESS>)'
    );
  });

  it('rejects a second ELSE in the same condition', () => {
    expect(() => compile('<TMPL_IF NAME="c">a<TMPL_ELSE>b<TMPL_ELSE>c</TMPL_IF>')).toThrow(
      'Multiple ELSE blocks in IF'
    );
  });

  it('rejects an end tag with nothing open', () => {
    expect(() => compile('a</TMPL_IF>')).toThrow('Unexpected ENDIF without matching IF/UNLESS');
    expect(() => compile('a</TMPL_LOOP>')).toThrow('Unexpected ENDLOOP without matching LOOP');
  });

  it('rejects a condition closed as a loop', () => {
    expect(() => compile('<TMPL_IF NAME="c">a</TMPL_LOOP>')).toThrow('Unexpected ENDLOOP without matching LOOP');
  });

  it('rejects an end tag that closes the outer block from inside the inner one', () => {
    expect(() => compile('<TMPL_LOOP NAME="rows"><TMPL_IF NAME="c">x</TMPL_LOOP>')).toThrow(
      'Unexpected ENDLOOP without matching LOOP'
    );
  });
});

describe('TMPL_INCLUDE', () => {
  it('rejects a tag with no name', () => {
    expect(() => compile('<TMPL_INCLUDE>')).toThrow('HTML::Template->new() : No NAME given to a TMPL_INCLUDE tag');
  });

  it('reports an attribute the tag could not parse', () => {
    expect(() => compile('<TMPL_INCLUDE NAME="a" ESCAPE=>')).toThrow('Syntax error in <TMPL_INCLUDE> tag');
  });
});
