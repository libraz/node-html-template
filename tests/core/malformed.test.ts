/**
 * Malformed template tests
 *
 * A block tag has to be closed by its own end tag, and Perl HTML::Template
 * says so in the message rather than guessing what was meant. These pin the
 * errors a caller has to work from, since a template only fails to compile
 * once and the message is all they get.
 */

import { describe, expect, it } from 'vitest';
import { compile, compileAsync, memoryLoader } from '../../src/index.js';

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

  it('rejects ESCAPE and DEFAULT as it does on any other non-VAR tag', () => {
    const loader = memoryLoader({ 'part.tmpl': 'x' });

    expect(() => compile('<TMPL_INCLUDE NAME="part.tmpl" ESCAPE=HTML>', { loader })).toThrow(
      'ESCAPE option invalid in a TMPL_INCLUDE tag'
    );
    expect(() => compile('<TMPL_INCLUDE NAME="part.tmpl" DEFAULT=x>', { loader })).toThrow(
      'DEFAULT option invalid in a TMPL_INCLUDE tag'
    );
  });
});

describe('error locations', () => {
  const COMMENT = '<TMPL_COMMENT>\none\ntwo\n</TMPL_COMMENT>';

  it('reports the line of a malformed tag, not of the text before it', () => {
    expect(() => compile('one\ntwo\nthree\nfour\n<TMPL_VAR x', { filename: 'page.tmpl' })).toThrow(
      'malformed tag in file page.tmpl at line 5'
    );
  });

  it('names the template and line of a malformed include tag', () => {
    expect(() => compile('a\nb\n<TMPL_INCLUDE NAME="a" ESCAPE=>', { filename: 'page.tmpl' })).toThrow(
      /Syntax error in <TMPL_INCLUDE> tag: .* in file page\.tmpl at line 3$/
    );
    expect(() => compile('a\n<TMPL_INCLUDE>', { filename: 'page.tmpl' })).toThrow(
      'No NAME given to a TMPL_INCLUDE tag in file page.tmpl at line 2'
    );
  });

  it('counts the lines of a removed comment block', () => {
    expect(() => compile(`${COMMENT}\nx\n<TMPL_IF NAME="c">`, { filename: 'page.tmpl' })).toThrow(
      'Unclosed IF block for "c" in file page.tmpl at line 6'
    );
    expect(() => compile(`${COMMENT}<TMPL_VAR>`, { filename: 'page.tmpl' })).toThrow('in file page.tmpl at line 4');
  });

  it('names the included template and its own line for an error inside it', async () => {
    const loader = memoryLoader({
      'part.tmpl': `${COMMENT}\n<TMPL_IF NAME="c">`,
      'mid.tmpl': 'mid\n<TMPL_INCLUDE NAME="part.tmpl">'
    });
    const source = 'a\nb\n<TMPL_INCLUDE NAME="mid.tmpl">';
    const expected = 'Unclosed IF block for "c" in file part.tmpl at line 5';

    expect(() => compile(source, { filename: 'page.tmpl', loader })).toThrow(expected);
    await expect(compileAsync(source, { filename: 'page.tmpl', loader })).rejects.toThrow(expected);
  });

  it('names the included template for a malformed tag inside it', () => {
    const loader = memoryLoader({ 'part.tmpl': 'x\ny\n<TMPL_VAR NAME="v" ESCAPE=bogus>' });

    expect(() => compile('<TMPL_INCLUDE NAME="part.tmpl">', { filename: 'page.tmpl', loader })).toThrow(
      /in file part\.tmpl at line 3$/
    );
  });
});
