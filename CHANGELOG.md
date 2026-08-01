# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-08-01

The template syntax and the API are unchanged.

### Internal

- Tests for the encoding names the filesystem loader accepts, the errors a
  malformed template reports, how often a function value is called, and the
  loader paths that answer with `TemplateNotFoundError`
- Unused helpers removed from the utility modules

## [1.0.0] - 2026-08-01

First release.

Perl HTML::Template 2.98's template syntax, with an API designed for
TypeScript rather than ported from Perl.

### Template syntax

Every tag, attribute and both tag forms, verified case by case against output
recorded from Perl HTML::Template 2.98:

- `TMPL_VAR`, with `ESCAPE` and `DEFAULT`
- `TMPL_IF`, `TMPL_UNLESS` and `TMPL_ELSE`, using Perl's truthiness
- `TMPL_LOOP`, with nesting, `globalVars` scoping and loop context variables
- `TMPL_INCLUDE`, with cycle detection and a depth limit
- `TMPL_COMMENT` and `TMPL_NOTE`
- `%NAME%` substitution, behind `legacy.percentVars`

### API

- `compile()` returns an immutable template that renders any number of times;
  every render builds its own state, so one template can serve concurrent work
- `compileAsync()` reads includes through a loader that answers with promises,
  one level at a time and in parallel within each level
- `Environment` holds a loader, compile defaults and a cache together
- `renderTo(sink, data)` writes output as it is produced, and
  `renderChunks(data)` yields it lazily
- `template.shape` reports what a template declares: names in declaration
  order, their kind, how each is used, and where each first appears
- Templates reach their sources only through a loader, so the main entry
  carries no `node:fs` import; the filesystem loader is a subpath export

### Type generation

- `html-template-codegen` turns templates into TypeScript interfaces, with
  `--check` for CI
- The generator is also available as a library and touches no files

### Defaults that differ from Perl

Each is one option away from the Perl behaviour:

- Variables are HTML-escaped unless a tag says otherwise (`defaultEscape`)
- Parameter names are matched case-sensitively (`caseSensitive`)
- Data keys the template does not declare are ignored (`strictData`)

[1.0.1]: https://github.com/libraz/node-html-template/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/libraz/node-html-template/releases/tag/v1.0.0
