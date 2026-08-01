# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Behaviour is now pinned by a suite that replays a shared case set against output
recorded from Perl HTML::Template 2.98 (`yarn goldens:record`). Every item below
was found by that comparison.

### Fixed

- Parse a bare NAME alongside other attributes. `<TMPL_VAR foo ESCAPE=HTML>`,
  `<TMPL_VAR foo DEFAULT=D>`, `<TMPL_VAR ESCAPE=HTML foo>` and `<TMPL_VAR "foo">`
  raised "NAME attribute required" instead of resolving the variable.
- `ESCAPE=NONE` and `ESCAPE=0` now suppress `default_escape` instead of being
  treated the same as an absent attribute.
- `DEFAULT` values are written out unescaped, matching `HTML::Template::DEF`.
- Vanguard `%NAME%` substitution accepts the full `[-\w/.+]+` name class, so
  dotted, hyphenated and path-like legacy names are replaced.
- `associate` objects are consulted only for top-level parameters, not inside
  loop iterations.
- `loop_context_vars` reproduce Perl's per-branch truth values, including
  `__last__` differing between a single-iteration and a multi-iteration loop.
- `query()` and `param()` with no arguments report every top-level name,
  including names used inside conditionals, normalized for case.
- `TMPL_COMMENT` / `TMPL_NOTE` blocks are stripped inside included files too,
  where they previously caused a parse error.

### Changed

- **Breaking.** Parameter names are scoped per `TMPL_LOOP`, as in Perl.
  `die_on_bad_params` no longer accepts a loop-scoped name at the top level, and
  `query({ name })` resolves an exact path rather than searching nested loops.
  Enable `global_vars` to publish loop variables to the top level.
- **Breaking.** With `die_on_bad_params` on, loop iteration data may only carry
  keys the loop body declares.
- **Breaking.** Stricter parsing, matching Perl: `ESCAPE` / `DEFAULT` outside
  `TMPL_VAR`, an empty `NAME`, an unrecognized `ESCAPE` value, a duplicate
  attribute, and `</TMPL_IF>` closing a `TMPL_UNLESS` are all errors.
  `ESCAPE=javascript` is no longer accepted; use `ESCAPE=JS`.
- With `strict: false`, an unparsable `TMPL_*` tag is emitted as literal text
  rather than dropped.

### Planned

- Additional Perl test suite ports
- Performance improvements
- Documentation enhancements

## [1.0.0] - 2025-01-23

### Added

- Initial release with complete Perl HTML::Template v2.98 compatibility
- Core template features:
  - `TMPL_VAR` - Variable substitution with HTML/URL/JS escaping
  - `TMPL_LOOP` - Loop constructs with nested loop support
  - `TMPL_IF` / `TMPL_UNLESS` / `TMPL_ELSE` - Conditional rendering
  - `TMPL_INCLUDE` - File inclusion with circular detection
- Advanced features:
  - `die_on_bad_params` - Parameter validation
  - `query()` method - Template structure introspection
  - `vanguard_compatibility_mode` - Legacy %VAR% syntax support
  - `loop_context_vars` - Context variables (__FIRST__, __LAST__, __COUNTER__, etc.)
  - `global_vars` - Access parent scope variables in loops
  - `default_escape` - Default escaping for all variables
  - In-memory caching with mtime-based invalidation
  - File search path resolution
  - Multiple encoding support (UTF-8, custom encodings)
  - Case-sensitive/insensitive parameter names
- Performance optimizations:
  - Single-pass tokenizer
  - Precompiled regular expressions
  - Efficient AST-based execution
- Complete test suite:
  - 200+ tests covering all features
  - Unit tests for all major components
  - Integration tests for complex scenarios
  - Edge case coverage
- Comprehensive documentation:
  - English README with examples
  - Japanese README (README.ja.md)
  - Full API reference
  - Migration guide from Perl
  - Benchmark suite

### Technical Details

- **Language**: TypeScript 5.9+
- **Module System**: ESM (ES Modules)
- **Node.js**: ≥22.0.0
- **Bundle Size**: ~63KB (13KB gzipped)
- **Dependencies**: Zero runtime dependencies
- **License**: MIT

### Compatibility

- 100% compatible with Perl HTML::Template v2.98 API
- All Perl HTML::Template features implemented
- Drop-in replacement for existing Perl templates
- Maintains template syntax compatibility
