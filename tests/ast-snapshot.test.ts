/**
 * AST snapshots
 *
 * Pins the exact parse tree for a spread of template constructs. Rendered
 * output can stay identical while the tree underneath it drifts, so these
 * snapshots are the regression net for changes that are supposed to leave the
 * AST untouched — reworking include expansion, or moving default-escape
 * resolution out of parse time.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expandIncludes } from '../src/compile/expandIncludes.js';
import { nodeFileLoader } from '../src/loader/nodeFile.js';
import { stripComments } from '../src/parser/comments.js';
import { Parser } from '../src/parser/Parser.js';
import { Tokenizer } from '../src/parser/Tokenizer.js';
import type { ParseNode } from '../src/types.js';

interface ParseSettings {
  vanguard?: boolean;
  strict?: boolean;
}

/**
 * Run the preprocess-and-parse pipeline without the include stage.
 */
function parse(source: string, settings: ParseSettings = {}): ParseNode[] {
  const prepared = stripComments(source);
  const tokens = new Tokenizer(prepared, undefined, settings.vanguard ?? false, settings.strict ?? true).tokenize();
  return new Parser(tokens).parse();
}

const CASES: Array<{ name: string; source: string; settings?: ParseSettings }> = [
  {
    name: 'variables and defaults',
    source: [
      '<TMPL_VAR NAME="title">',
      '<TMPL_VAR bare>',
      '<TMPL_VAR NAME=unquoted>',
      '<TMPL_VAR NAME="greeting" DEFAULT="hello">',
      '<TMPL_VAR NAME="blank" DEFAULT="">'
    ].join('\n')
  },
  {
    // Absent ESCAPE must stay undefined while an explicit NONE records 'none';
    // that distinction is what lets default_escape skip opted-out tags.
    name: 'escape variants',
    source: [
      '<TMPL_VAR NAME="a" ESCAPE=HTML>',
      '<TMPL_VAR NAME="b" ESCAPE=JS>',
      '<TMPL_VAR NAME="c" ESCAPE=URL>',
      '<TMPL_VAR NAME="d" ESCAPE=NONE>',
      '<TMPL_VAR NAME="e" ESCAPE=0>',
      '<TMPL_VAR NAME="f" ESCAPE=1>',
      '<TMPL_VAR NAME="g">'
    ].join('\n')
  },
  {
    name: 'conditionals',
    source: [
      '<TMPL_IF NAME="a">yes<TMPL_ELSE>no</TMPL_IF>',
      '<TMPL_UNLESS NAME="b">not b</TMPL_UNLESS>',
      '<TMPL_IF a><TMPL_IF b>both</TMPL_IF></TMPL_IF>'
    ].join('\n')
  },
  {
    name: 'nested loops',
    source: [
      '<TMPL_LOOP NAME="outer">',
      '  <TMPL_VAR NAME="x">',
      '  <TMPL_LOOP NAME="inner"><TMPL_VAR NAME="y"></TMPL_LOOP>',
      '</TMPL_LOOP>'
    ].join('\n')
  },
  {
    name: 'loop with context vars',
    source:
      '<TMPL_LOOP items><TMPL_IF __first__>[</TMPL_IF><TMPL_VAR name><TMPL_UNLESS __last__>, </TMPL_UNLESS></TMPL_LOOP>'
  },
  {
    name: 'html comment syntax',
    source: [
      '<!-- TMPL_VAR NAME="a" -->',
      '<!-- TMPL_IF NAME="b" -->yes<!-- /TMPL_IF -->',
      '<!-- TMPL_LOOP NAME="c" --><!-- TMPL_VAR NAME="d" --><!-- /TMPL_LOOP -->'
    ].join('\n')
  },
  {
    name: 'tmpl_comment stripping',
    source: 'before<TMPL_COMMENT>hidden <TMPL_VAR NAME="x"></TMPL_COMMENT>after'
  },
  {
    name: 'vanguard percent vars',
    source: '%first% and <TMPL_VAR NAME="second"> and %third%',
    settings: { vanguard: true }
  },
  {
    name: 'whitespace around tags',
    source: ['line one', '  <TMPL_VAR NAME="x">  ', '', 'line four'].join('\n')
  },
  {
    // With strict off an unrecognised TMPL_ tag survives as literal text
    // rather than aborting the parse.
    name: 'unknown tag in lenient mode',
    source: 'a <TMPL_BOGUS NAME="x"> b <TMPL_VAR NAME="real">',
    settings: { strict: false }
  }
];

describe('AST snapshots', () => {
  for (const testCase of CASES) {
    it(testCase.name, () => {
      expect(parse(testCase.source, testCase.settings)).toMatchSnapshot();
    });
  }
});

describe('AST snapshots with includes', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'html-template-ast-'));
    writeFileSync(join(dir, 'level2.tmpl'), '[deepest <TMPL_VAR NAME="deep">]');
    writeFileSync(join(dir, 'level1.tmpl'), '(middle <TMPL_VAR NAME="mid"> <TMPL_INCLUDE NAME="level2.tmpl">)');
    writeFileSync(join(dir, 'root.tmpl'), 'top <TMPL_VAR NAME="top"> <TMPL_INCLUDE NAME="level1.tmpl">');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Expand includes for a template rooted in the fixture directory.
   *
   * @param source - Entry template text
   * @returns Flattened text
   */
  const expand = (source: string): string =>
    expandIncludes(source, join(dir, 'root.tmpl'), {
      loader: nodeFileLoader({ paths: [dir] }),
      maxDepth: 10,
      onMissing: 'throw',
      prepare: (text) => text
    }).text;

  it('expands three levels into a single flat tree', () => {
    expect(parse(expand('top <TMPL_VAR NAME="top"> <TMPL_INCLUDE NAME="level1.tmpl">'))).toMatchSnapshot();
  });

  it('expands a loop body that pulls in an include', () => {
    expect(parse(expand('<TMPL_LOOP rows><TMPL_INCLUDE NAME="level2.tmpl"></TMPL_LOOP>'))).toMatchSnapshot();
  });
});
