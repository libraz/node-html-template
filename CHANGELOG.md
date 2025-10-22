# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [Unreleased]

### Planned

- File cache support (`file_cache` option)
- Additional Perl test suite ports
- Performance improvements
- Documentation enhancements
