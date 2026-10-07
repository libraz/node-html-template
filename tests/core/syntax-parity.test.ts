/**
 * Template syntax parity
 *
 * Every recorded Perl case is asserted against the new API configured to match
 * Perl's defaults: ok:1 cases must render byte for byte what Perl produced,
 * ok:0 cases must throw. A case is left out only when it appears in
 * EXCLUDED with a reason; cases that exercise Perl's own API (param(),
 * associate, query, get, clear) have no counterpart here and are listed there.
 */

import { describe, expect, it } from 'vitest';
import type { EscapeType } from '../../src/index.js';
import { compile, memoryLoader } from '../../src/index.js';
import cases from '../perl-compat/cases.json' with { type: 'json' };
import goldens from '../perl-compat/goldens.json' with { type: 'json' };

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

/**
 * The only cases not asserted, each with the reason it has no counterpart.
 */
const EXCLUDED: Record<string, string> = {
  'associate-fills-top-level': 'Perl associate option (CGI object lookup); the new API has no association',
  'associate-case-insensitive': 'Perl associate option (CGI object lookup); the new API has no association',
  'associate-not-visible-in-loop': 'Perl associate option (CGI object lookup); the new API has no association',
  'query-top-level-names': 'Perl query() introspection; the new API exposes shape instead',
  'param-lists-top-level-names': 'Perl param() name listing; the new API exposes shape instead',
  'query-loop-names': 'Perl query(loop) introspection; the new API exposes shape instead',
  'query-loop-names-nested': 'Perl query(loop) introspection; the new API exposes shape instead',
  'query-name-path': 'Perl query(name) introspection; the new API exposes shape instead',
  'query-name-loop-scoped-without-path': 'Perl query(name) introspection; the new API exposes shape instead',
  'get-nonexistent-param-dies': 'Perl param() getter on a stateful object; render takes data directly',
  'loop-set-with-scalar-dies':
    'Perl rejects a non-array value for a loop at param() time; render treats a scalar loop value as an empty loop and does not throw',
  'if-on-empty-loop':
    'Perl rejects an array ref for a name only used by TMPL_IF at param() time; render accepts it and takes the else branch',
  'clear-params-resets': 'Perl clear_params() on a stateful object; render takes data directly'
};

const compatCases = cases as CompatCase[];
const compatGoldens = goldens as Record<string, Golden>;

describe('template syntax parity with Perl HTML::Template 2.98', () => {
  it('has a golden for every case and no stale exclusion', () => {
    expect(compatCases.map((c) => c.id).sort()).toEqual(Object.keys(compatGoldens).sort());
    expect(Object.keys(EXCLUDED).filter((id) => !(id in compatGoldens))).toEqual([]);
  });

  for (const compatCase of compatCases) {
    const golden = compatGoldens[compatCase.id] as Golden;
    const title = compatCase.note ? `${compatCase.id} - ${compatCase.note}` : compatCase.id;
    const reason = EXCLUDED[compatCase.id];

    if (reason !== undefined) continue;

    it(title, () => {
      if (golden.ok) expect(render(compatCase)).toBe(golden.out);
      else expect(() => render(compatCase)).toThrow();
    });
  }
});

/**
 * Render a case through the new API, configured to match Perl's defaults.
 *
 * @param compatCase - Case definition
 * @returns Rendered output
 */
function render(compatCase: CompatCase): string {
  const opts = compatCase.opts ?? {};
  const includes = compatCase.includes;

  const template = compile(compatCase.tmpl, {
    // Perl folds parameter names and escapes nothing unless told to; the new
    // API defaults the other way, so both are set explicitly here.
    caseSensitive: Boolean(opts.case_sensitive ?? 0),
    // Perl accepts ESCAPE names in any case; the typed API takes them
    // lowercase, so the recorded spelling is normalized here.
    defaultEscape: (String(opts.default_escape ?? 'none').toLowerCase() as EscapeType) ?? 'none',
    strict: opts.strict === undefined ? true : Boolean(opts.strict),
    globalVars: Boolean(opts.global_vars ?? 0),
    legacy: { percentVars: Boolean(opts.vanguard_compatibility_mode ?? 0) },
    includes: opts.no_includes
      ? false
      : {
          maxDepth: (opts.max_includes as number) ?? 10,
          onMissing: opts.die_on_missing_include === 0 ? 'ignore' : 'throw'
        },
    loader: memoryLoader(includes ?? {}),
    filters: compatCase.filter ? [{ sub: (content) => namedFilter(compatCase.filter, content), format: 'scalar' }] : []
  });

  return template.render(compatCase.params ?? {}, {
    // Perl dies on parameters the template never declares unless told not to.
    strictData: opts.die_on_bad_params !== 0,
    loopContextVars: Boolean(opts.loop_context_vars ?? 0)
  });
}

/**
 * Apply a filter referenced by name, mirroring the Perl recorder.
 *
 * @param name - Filter name from the case
 * @param content - Template text
 * @returns Filtered text
 */
function namedFilter(name: string | undefined, content: string | string[]): string {
  if (name !== 'xx-to-tag') throw new Error(`unknown filter '${name}'`);

  return String(content).replace(/XX(\w+)XX/g, '<TMPL_VAR NAME=$1>');
}
