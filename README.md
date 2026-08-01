# @libraz/html-template

[![CI](https://github.com/libraz/node-perl-html-template/actions/workflows/ci.yml/badge.svg)](https://github.com/libraz/node-perl-html-template/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@libraz/html-template.svg)](https://www.npmjs.com/package/@libraz/html-template)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)

Perl HTML::Template's template syntax, with a TypeScript API.

Existing `.tmpl` files render unchanged. The API around them is not a port of
the Perl one: templates are compiled once and rendered many times, everything a
render touches is its own, and a template's parameters can be turned into a
TypeScript interface.

## Installation

```bash
npm install @libraz/html-template
```

Node 22 or newer. No runtime dependencies.

## Quick start

```typescript
import { compile } from '@libraz/html-template';

const template = compile(`
  <h1><TMPL_VAR NAME="title"></h1>
  <TMPL_LOOP NAME="items">
    <p><TMPL_VAR NAME="name">: <TMPL_VAR NAME="value"></p>
  </TMPL_LOOP>
`);

const html = template.render({
  title: 'Hello World',
  items: [
    { name: 'Item 1', value: 'Value 1' },
    { name: 'Item 2', value: 'Value 2' }
  ]
});
```

Compiling is the expensive half, so keep the compiled template and render it as
often as you like — it is immutable and safe to share across concurrent work.

For a one-off, `render(source, data)` does both in a single call.

## Reading templates from disk

The core reaches templates only through a loader, which is what keeps it free
of any filesystem dependency. Node's loader lives in its own subpath:

```typescript
import { Environment } from '@libraz/html-template';
import { nodeFileLoader } from '@libraz/html-template/loaders';

const env = new Environment({
  loader: nodeFileLoader({ paths: ['./views'] }),
  cache: true
});

const html = env.renderFile('page.tmpl', { title: 'Hello' });
```

An environment holds the loader, the compile settings and the cache together,
so nothing has to be configured twice and nothing lives in a process-wide
global.

## Template syntax

```html
<TMPL_VAR NAME="title">
<TMPL_VAR NAME="raw" ESCAPE="none">
<TMPL_VAR NAME="missing" DEFAULT="fallback">

<TMPL_IF NAME="logged_in">welcome<TMPL_ELSE>please sign in</TMPL_IF>
<TMPL_UNLESS NAME="empty">there is something here</TMPL_UNLESS>

<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="cell"></TMPL_LOOP>

<TMPL_INCLUDE NAME="header.tmpl">
<TMPL_COMMENT>never rendered</TMPL_COMMENT>
```

Every tag also has an HTML comment form — `<!-- TMPL_VAR NAME="x" -->` — for
templates that have to stay valid HTML on their own.

See the [syntax reference](docs/en/template-syntax.md) for the full set.

## Escaping

Variables are HTML-escaped by default. `ESCAPE="none"` on a tag opts that one
tag out, and `defaultEscape` at compile time changes the default:

```typescript
compile('<TMPL_VAR NAME="x">').render({ x: '<b>' }); // '&lt;b&gt;'
compile('<TMPL_VAR NAME="x">', { defaultEscape: 'none' }).render({ x: '<b>' }); // '<b>'
```

This is the one place the library deliberately differs from Perl, which escapes
nothing unless told to. Templates that already write `ESCAPE="html"` keep
working; templates that relied on raw output need `defaultEscape: 'none'`.

## Generated types

A template declares which names it uses and in what role, which is enough to
describe the data it expects:

```bash
npx html-template-codegen views/ -o src/templates.d.ts
```

```typescript
export interface PageData {
  title?: ScalarSource;
  items?: RowSource<{
    name?: ScalarSource;
  }>;
}
```

Pass the interface to `compile` and a typo in the data becomes a type error:

```typescript
const template = compile<PageData>(source);
```

Add `--check` to a CI step to catch a generated file that has fallen behind.

## Streaming

`renderTo(sink, data)` writes each piece as it is produced, and
`renderChunks(data)` hands them back one at a time:

```typescript
template.renderTo(response, data);

for (const chunk of template.renderChunks(data)) {
  // ...
}
```

## Documentation

- [Getting started](docs/en/getting-started.md)
- [Template syntax](docs/en/template-syntax.md)
- [API reference](docs/en/api.md)
- [Type generation](docs/en/type-generation.md)
- [Coming from Perl HTML::Template](docs/en/from-perl.md)

## License

MIT
