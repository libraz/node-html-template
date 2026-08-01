/**
 * Perl compatibility suite
 *
 * Every case in `tests/perl-compat/cases.json` is checked against output
 * recorded from Perl HTML::Template 2.98 in `tests/perl-compat/goldens.json`.
 * Regenerate the goldens with `yarn goldens:record` (requires a Perl install)
 * whenever a case is added or changed - never by hand, and never from this
 * implementation's own output.
 *
 * Cases that die in Perl only assert that the port also throws. The two
 * projects word their messages differently on purpose, so the recorded Perl
 * message is documentation rather than an expectation.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HTMLTemplate } from '../src/index.js';
import type { HTMLTemplateOptions, ParamValue } from '../src/types.js';
import cases from './perl-compat/cases.json' with { type: 'json' };
import goldens from './perl-compat/goldens.json' with { type: 'json' };

/** One entry of cases.json */
interface CompatCase {
  id: string;
  note?: string;
  tmpl: string;
  params?: Record<string, unknown>;
  opts?: Record<string, unknown>;
  associate?: Record<string, string>;
  filter?: string;
  includes?: Record<string, string>;
  query?: boolean;
  paramlist?: boolean;
  queryloop?: string[];
  queryname?: string[];
  get?: string;
  clear?: boolean;
}

/** One entry of goldens.json */
interface Golden {
  ok: number;
  out?: string;
  err?: string;
}

/** Options written as Perl-style 0/1 in cases.json */
const BOOLEAN_OPTIONS = new Set([
  'case_sensitive',
  'die_on_bad_params',
  'die_on_missing_include',
  'global_vars',
  'loop_context_vars',
  'no_includes',
  'search_path_on_include',
  'strict',
  'utf8',
  'vanguard_compatibility_mode'
]);

/** Filters referenced by name, mirroring scripts/record-perl-goldens.pl */
const NAMED_FILTERS: Record<string, (content: string) => string> = {
  'xx-to-tag': (content) => content.replace(/XX(\w+)XX/g, '<TMPL_VAR NAME=$1>')
};

const compatCases = cases as CompatCase[];
const compatGoldens = goldens as Record<string, Golden>;

describe('Perl HTML::Template 2.98 compatibility', () => {
  it('has a golden recording for every case', () => {
    const missing = compatCases.filter((entry) => compatGoldens[entry.id] === undefined).map((entry) => entry.id);
    expect(missing).toEqual([]);
  });

  it('has no golden recording without a case', () => {
    const ids = new Set(compatCases.map((entry) => entry.id));
    expect(Object.keys(compatGoldens).filter((id) => !ids.has(id))).toEqual([]);
  });

  for (const compatCase of compatCases) {
    const golden = compatGoldens[compatCase.id];
    if (!golden) continue;

    const title = compatCase.note ? `${compatCase.id} - ${compatCase.note}` : compatCase.id;

    if (golden.ok) {
      it(title, () => {
        expect(runCase(compatCase)).toBe(golden.out);
      });
    } else {
      it(`${title} (rejected by Perl: ${golden.err})`, () => {
        expect(() => runCase(compatCase)).toThrow();
      });
    }
  }
});

/**
 * Build the template described by a case and perform its action.
 *
 * @param compatCase - Case definition
 * @returns The case's observable result as a string
 */
function runCase(compatCase: CompatCase): string {
  const options = buildOptions(compatCase);
  const template = new HTMLTemplate({ scalarref: compatCase.tmpl, ...options });

  for (const name of Object.keys(compatCase.params ?? {}).sort()) {
    template.param(name, compatCase.params?.[name] as ParamValue);
  }

  if (compatCase.clear) {
    template.clear_params();
  }

  return readResult(template, compatCase);
}

/**
 * Translate a case's option bag into constructor options.
 *
 * @param compatCase - Case definition
 * @returns Constructor options
 */
function buildOptions(compatCase: CompatCase): HTMLTemplateOptions {
  const options: Record<string, unknown> = { ...(compatCase.opts ?? {}) };

  for (const [key, value] of Object.entries(options)) {
    if (BOOLEAN_OPTIONS.has(key)) {
      options[key] = Boolean(value);
    }
  }

  if (compatCase.associate) {
    const values = compatCase.associate;
    options.associate = {
      param: (name?: string) => (name === undefined ? Object.keys(values) : values[name])
    };
  }

  if (compatCase.filter) {
    const filter = NAMED_FILTERS[compatCase.filter];
    if (!filter) throw new Error(`unknown filter '${compatCase.filter}'`);
    options.filter = { sub: (content: string | string[]) => filter(String(content)), format: 'scalar' };
  }

  if (compatCase.includes) {
    options.path = [writeIncludes(compatCase.includes)];
  }

  return options as HTMLTemplateOptions;
}

/**
 * Materialize a case's include files in a temporary directory.
 *
 * @param includes - Filename to contents
 * @returns Directory to put on the template search path
 */
function writeIncludes(includes: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'html-template-compat-'));

  for (const [name, body] of Object.entries(includes)) {
    writeFileSync(join(dir, name), body);
  }

  return dir;
}

/**
 * Perform the case's action and normalize the result to a string, using the
 * same conventions as the Perl recorder.
 *
 * @param template - Template under test
 * @param compatCase - Case definition
 * @returns Result string
 */
function readResult(template: HTMLTemplate, compatCase: CompatCase): string {
  if (compatCase.query) {
    return sortedJoin(template.query() as string[]);
  }

  if (compatCase.paramlist) {
    return sortedJoin(template.param());
  }

  if (compatCase.queryloop) {
    return sortedJoin((template.query({ loop: compatCase.queryloop }) as string[] | undefined) ?? []);
  }

  if (compatCase.queryname) {
    return (template.query({ name: compatCase.queryname }) as string | undefined) ?? '(undef)';
  }

  if (compatCase.get) {
    const value = template.param(compatCase.get);
    return value === undefined || value === null ? '(undef)' : String(value);
  }

  return template.output() as string;
}

/**
 * Join a list of names the way the Perl recorder does.
 *
 * @param values - Names to join
 * @returns Comma-separated, sorted names
 */
function sortedJoin(values: string[]): string {
  return [...values].sort().join(',');
}
