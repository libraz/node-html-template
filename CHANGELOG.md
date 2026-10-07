# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `IncludeOptions.paths` and `IncludeOptions.searchAllPaths` are removed. They
  were never applied; configure include lookup on the loader instead, with
  `nodeFileLoader({ paths, searchAllPaths })`
- An unknown `defaultEscape` now throws at compile time instead of disabling
  escaping. Perl's upper-case spellings (`HTML`, `URL`, `JS`) are accepted
- `ESCAPE` and `DEFAULT` on `TMPL_INCLUDE` are rejected, as on every tag other
  than `TMPL_VAR`
- A `<` followed by a space (`< TMPL_VAR x>`) is literal text, as in Perl,
  rather than a tag
- An encoding name `nodeFileLoader` cannot decode throws when the loader is
  created instead of silently loading as UTF-8
- `memoryLoader` normalizes its keys, so `./a.tmpl` is found, and two keys that
  name the same template throw

### Fixed

- `ESCAPE=URL` percent-encodes `! ' ( ) *` as Perl does, and a lone surrogate in
  a value is encoded as U+FFFD instead of throwing `URIError`
- `TMPL_IF` and `TMPL_UNLESS` on a loop supplied as a function pick the right
  branch, with or without `memoizeLazy`
- Objects and non-zero bigints are true in `TMPL_IF` and `TMPL_UNLESS`; `0n` is
  false like `0`
- Function values inside loop rows and values returned by `resolve` are called
  once per render, like top-level function values
- A per-call `loader` option on `Environment` file methods is honoured for the
  entry, its includes and the cache
- `Environment.compile` and `render` with an asynchronous loader throw a clear
  "use compileFileAsync or renderFileAsync" error instead of a `TypeError`
- With `includes: false`, a cached `Environment` template is revalidated and
  recompiled after its file changes
- The version cached for a template comes from the same read as its text, so an
  edit racing a compile is no longer served stale
- Compiling an unclosed tag followed by a long run of whitespace no longer hangs
- UTF-16BE templates decode correctly
- Errors and `ParamInfo.loc` name the file and line where the tag is written,
  including inside included templates and after `TMPL_COMMENT` blocks; a
  malformed-tag error reports the tag's own line, and `TMPL_INCLUDE` tag errors
  name the template and line

### Type generation

- Generated interfaces can be passed to `compile<T>` and `env.compileFile<T>`
- Templates that share a file stem, or an interface name that is not a valid
  identifier, make the CLI exit 1 with a message naming the files
- A directory argument with a trailing slash or a leading `./` finds templates
  with correct paths
- An empty loop body is typed the same inline and with `--split`, and split row
  interfaces no longer collide

### Documentation

- `__last__` is `0` on middle iterations and `''` only on the first of several
- `TMPL_IF` and `TMPL_UNLESS` must each be closed by their own tag
- `TemplateShape.names` are lookup keys, lowercased when `caseSensitive` is off
- The Perl comparison lists the remaining differences, and the README and syntax
  guide name both output-affecting defaults

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
- `TMPL_COMMENT` and `TMPL_NOTE`, covered by this package's own tests rather
  than a recorded Perl case
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
