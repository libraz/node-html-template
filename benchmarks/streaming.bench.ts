/**
 * Streaming benchmarks
 *
 * Compares the two walks that produce output: the recursive one writing into
 * a sink, and the explicit-stack one yielding chunks. They exist separately
 * only if the difference is worth two implementations.
 */

import { bench, describe } from 'vitest';
import { compile } from '../src/index.js';

/**
 * A sink that measures what it is given.
 *
 * Every benchmark feeds its output through this so the work being timed is
 * observed rather than discarded, and so the three variants are all charged
 * for touching each chunk.
 */
const counter = {
  written: 0,

  /**
   * Count a chunk.
   *
   * @param chunk - Text written
   */
  write(chunk: string): void {
    counter.written += chunk.length;
  }
};

const FLAT = compile('<TMPL_LOOP NAME="rows">[<TMPL_VAR NAME="c">]</TMPL_LOOP>', { defaultEscape: 'none' });
const DEEP = compile(
  '<TMPL_LOOP NAME="a"><TMPL_LOOP NAME="b"><TMPL_LOOP NAME="c"><TMPL_LOOP NAME="d">[<TMPL_VAR NAME="v">]</TMPL_LOOP></TMPL_LOOP></TMPL_LOOP></TMPL_LOOP>',
  { defaultEscape: 'none' }
);

const FLAT_DATA = { rows: Array.from({ length: 200 }, (_, i) => ({ c: `${i}` })) };
const DEEP_DATA = {
  a: Array.from({ length: 5 }, () => ({
    b: Array.from({ length: 5 }, () => ({
      c: Array.from({ length: 5 }, () => ({
        d: Array.from({ length: 5 }, (_, i) => ({ v: `${i}` }))
      }))
    }))
  }))
};

describe('flat loop, 200 rows', () => {
  bench('render', () => {
    counter.write(FLAT.render(FLAT_DATA));
  });

  bench('renderTo a sink', () => {
    FLAT.renderTo(counter, FLAT_DATA);
  });

  bench('renderChunks, fully consumed', () => {
    for (const chunk of FLAT.renderChunks(FLAT_DATA)) counter.write(chunk);
  });
});

describe('four nested loops, 625 leaves', () => {
  bench('render', () => {
    counter.write(DEEP.render(DEEP_DATA));
  });

  bench('renderTo a sink', () => {
    DEEP.renderTo(counter, DEEP_DATA);
  });

  bench('renderChunks, fully consumed', () => {
    for (const chunk of DEEP.renderChunks(DEEP_DATA)) counter.write(chunk);
  });
});
