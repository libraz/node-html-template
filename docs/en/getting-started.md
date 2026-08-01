# Getting started

## Install

```bash
npm install @libraz/html-template
```

Node 22 or newer. The package is ESM only and has no runtime dependencies.

## Compile once, render many times

```typescript
import { compile } from '@libraz/html-template';

const template = compile('<h1><TMPL_VAR NAME="title"></h1>');

template.render({ title: 'First' });
template.render({ title: 'Second' });
```

Compiling tokenizes, parses and expands includes. Rendering walks the result.
The first is the expensive half, so a template that is used more than once
should be compiled once and kept.

A compiled template is immutable. Every render builds its own state, so the
same template can serve concurrent work, and a render that throws leaves
nothing behind for the next one.

For a template rendered exactly once, `render(source, data)` compiles and
renders in a single call.

## Supplying data

Data is a plain object. Names in it match the names in the template:

```typescript
compile('<TMPL_VAR NAME="name">').render({ name: 'World' });
```

An unset name renders as an empty string rather than failing, which is what
lets a template be filled in progressively. `strictData: true` on a render
turns an undeclared key into an error instead:

```typescript
template.render({ nmae: 'typo' }, { strictData: true }); // throws
```

Generated types catch the same mistake before the code runs — see
[type generation](type-generation.md).

## Deferring work

A function is called only if the template actually reaches it, and at most once
per render:

```typescript
compile('<TMPL_IF NAME="show"><TMPL_VAR NAME="report"></TMPL_IF>').render({
  show: false,
  report: () => buildExpensiveReport() // never called
});
```

The same works for loops: a function returning rows is resolved when the loop
is reached.

Functions must return a value directly. Rendering is synchronous, so resolve
anything asynchronous before calling `render`.

## Reading templates from files

The compiler reaches templates through a loader. Node's reads from disk:

```typescript
import { Environment } from '@libraz/html-template';
import { nodeFileLoader } from '@libraz/html-template/loaders';

const env = new Environment({
  loader: nodeFileLoader({ paths: ['./views'] })
});

const html = env.renderFile('page.tmpl', { title: 'Hello' });
```

Without a loader, `compile` still works on template text — it only needs one
when the text contains a `TMPL_INCLUDE`.

## Caching compiled templates

An environment can keep what it compiles:

```typescript
const env = new Environment({
  loader: nodeFileLoader({ paths: ['./views'] }),
  cache: true
});
```

Before reusing an entry the environment asks the loader whether the templates
it was built from have changed, includes as well as the template itself. A
loader that reports no version is promising its templates never change, and its
entries are reused without a check.

Caching is off by default, because a cache that outlives an edit is surprising
while developing.

## Where to go next

- [Template syntax](template-syntax.md) — every tag and attribute
- [API reference](api.md) — the full surface
- [Type generation](type-generation.md) — turning templates into interfaces
- [Coming from Perl HTML::Template](from-perl.md) — what changed and why
