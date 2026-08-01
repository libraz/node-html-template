/**
 * Template syntax parity
 *
 * The asset being ported is the template syntax, not Perl's API. This runs the
 * subset of the recorded Perl cases that exercise syntax alone — no
 * introspection, no CGI association, no param() semantics — through the new
 * API configured to match Perl's defaults, and checks the rendered output byte
 * for byte against what Perl produced.
 *
 * Cases outside that subset are covered by the Perl-compatibility suite
 * against the legacy API; running them here would pin Perl's API quirks to the
 * new surface, which is exactly what this port is moving away from.
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
 * Options whose meaning carries over to the new API unchanged.
 *
 * A case using anything else is about Perl's API rather than its syntax.
 */
const SYNTAX_OPTIONS = new Set([
  'strict',
  'default_escape',
  'vanguard_compatibility_mode',
  'no_includes',
  'max_includes',
  'search_path_on_include',
  'die_on_missing_include',
  'case_sensitive',
  'global_vars',
  'loop_context_vars'
]);

const compatCases = cases as CompatCase[];
const compatGoldens = goldens as Record<string, Golden>;

/**
 * Decide whether a case exercises template syntax alone.
 *
 * @param compatCase - Case definition
 * @returns True when the case belongs in this suite
 */
function isSyntaxCase(compatCase: CompatCase): boolean {
  const golden = compatGoldens[compatCase.id];
  if (!golden?.ok) return false;

  if (compatCase.query || compatCase.paramlist || compatCase.queryloop || compatCase.queryname) return false;
  if (compatCase.get || compatCase.clear || compatCase.associate) return false;

  return Object.keys(compatCase.opts ?? {}).every((key) => SYNTAX_OPTIONS.has(key));
}

const syntaxCases = compatCases.filter(isSyntaxCase);

describe('template syntax parity with Perl HTML::Template 2.98', () => {
  it('covers a meaningful share of the recorded cases', () => {
    expect(syntaxCases.length).toBeGreaterThan(40);
  });

  for (const compatCase of syntaxCases) {
    const golden = compatGoldens[compatCase.id];
    const title = compatCase.note ? `${compatCase.id} - ${compatCase.note}` : compatCase.id;

    it(title, () => {
      expect(render(compatCase)).toBe(golden?.out);
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
