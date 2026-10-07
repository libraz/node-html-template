# API reference

## compile

```typescript
compile<T>(source: string, options?: CompileOptions): Template<T>
```

Tokenizes, parses and expands includes, returning an immutable template.

```typescript
compileAsync<T>(source: string, options?: AsyncCompileOptions): Promise<Template<T>>
```

The same, for a loader that answers with promises. Includes are read one level
at a time, in parallel within each level.

The type parameter describes the data the template expects; see
[type generation](type-generation.md).

## render

```typescript
render<T>(source: string, data: T, options?: CompileOptions & RenderOptions): string
```

Compiles and renders in one call. Use `compile` when the same template is
rendered more than once — this reparses every time.

## CompileOptions

| Option | Default | Effect |
| --- | --- | --- |
| `filename` | — | Name reported in errors and used to resolve relative includes |
| `strict` | `true` | Treat a malformed `TMPL_` tag as an error rather than as text |
| `defaultEscape` | `'html'` | Escape applied to a tag with no `ESCAPE` attribute: `html`, `url`, `js` or `none`, in any case; anything else throws |
| `caseSensitive` | `true` | Whether names keep their case when matched |
| `globalVars` | `false` | Let a name unresolved in a loop fall back to enclosing scopes |
| `includes` | `true` | Include handling; `false` rejects any `TMPL_INCLUDE` |
| `filters` | `[]` | Transformations applied to the source text before parsing |
| `legacy.percentVars` | `false` | Substitute `%NAME%` as well as tags |
| `loader` | — | Where included templates are read from. There is no default: a template with `TMPL_INCLUDE` needs one |

Everything here affects what a template *is*, which is why it is fixed at
compile time: a name that exists under one setting and not under another cannot
be decided per render.

### IncludeOptions

Passed as `includes` when more than `true` is needed. Where an included name
is looked up belongs to the loader: for files, `nodeFileLoader`'s `paths` and
`searchAllPaths`.

| Option | Default | Effect |
| --- | --- | --- |
| `maxDepth` | `10` | Maximum nesting depth; zero or less means unlimited |
| `onMissing` | `'throw'` | What to do about an include naming a template that does not exist |

## Template

A compiled template. Obtained from `compile`, never constructed directly.

### render

```typescript
render(data: T, options?: RenderOptions): string
```

### renderTo

```typescript
renderTo(sink: OutputSink, data: T, options?: RenderOptions): void
```

Writes each piece as it is produced. A sink is anything with a
`write(chunk: string)` method, which a `node:stream.Writable` already is.

### renderChunks

```typescript
renderChunks(data: T, options?: RenderOptions): Generator<string>
```

Yields the output one piece at a time, computing nothing until a piece is asked
for. A consumer that stops early stops the work with it.

Fully consumed it is slower than `render`, because suspending per chunk is not
free. Reach for it when the consumer benefits from early output, not to make a
whole render faster.

### shape

```typescript
readonly shape: TemplateShape
```

What the template declares. See [TemplateShape](#templateshape).

### filename

```typescript
readonly filename: string | undefined
```

## RenderOptions

| Option | Default | Effect |
| --- | --- | --- |
| `strictData` | `false` | Reject data keys the template never declares |
| `loopContextVars` | `false` | Provide `__first__` and friends inside loops |
| `memoizeLazy` | `true` | Call a function value at most once per render, wherever it appears |
| `resolve` | — | Fallback for top-level names absent from the data |

`resolve` is consulted only at the top level, never inside a loop iteration: a
name missing from a row is missing, not something to go looking for elsewhere.

With `memoizeLazy` on, a function value is called once however often it is
referenced: at the top level, in loop rows, and as a value `resolve` returns.
`resolve` itself is called once per name. With it off, both are called on
every reference.

## Environment

Holds a loader, a set of compile defaults and a cache.

```typescript
new Environment(options?: EnvironmentOptions)
```

`EnvironmentOptions` is `CompileOptions` without `filename`, plus:

| Option | Default | Effect |
| --- | --- | --- |
| `loader` | — | Where templates are read from |
| `cache` | `false` | Reuse compiled templates; `true` or `CacheOptions` |

| Method | Returns |
| --- | --- |
| `compile(source, options?)` | `Template` |
| `compileFile(name, options?)` | `Template` |
| `compileFileAsync(name, options?)` | `Promise<Template>` |
| `render(source, data, options?)` | `string` |
| `renderFile(name, data, options?)` | `string` |
| `renderFileAsync(name, data, options?)` | `Promise<string>` |
| `clearCache()` | `void` |
| `cacheSize` | `number` |

Per-call options override the environment's defaults. That includes `loader`,
which the file methods honour for the template itself, its includes and the
cache. `compileFileAsync` and `renderFileAsync` take `AsyncCompileOptions`, so
their `loader` may answer with promises.

The synchronous methods throw "The loader is asynchronous; use compileFileAsync
or renderFileAsync" the first time an asynchronous loader is asked for a
template.

### CacheOptions

| Option | Default | Effect |
| --- | --- | --- |
| `maxSize` | `100` | Templates kept before the least recently used one is dropped |
| `revalidate` | `true` | Check an entry against its sources before reusing it |

An entry is keyed on the template's id and every setting that changes what
compiling it produces. A compilation with filters is never cached: a filter
rewrites the source and a function carries no identity a key can record.

## Loaders

```typescript
interface TemplateLoader<Sync extends boolean = boolean> {
  readonly sync: Sync;
  resolve(request: ResolveRequest): string | Promise<string>;
  read(id: string): TemplateResource | Promise<TemplateResource>;
  version?(id: string): (string | undefined) | Promise<string | undefined>;
}
```

`sync` is a type-level marker as much as a runtime one: a loader declaring
`sync: true` promises every method answers directly, which is what lets
`compile` accept it and reject one that can only answer with a promise.

`version` returns an opaque identifier compared verbatim to decide whether a
cached compilation is still valid. Returning `undefined` promises the template
never changes.

### memoryLoader

```typescript
memoryLoader(files: Record<string, string> | ReadonlyMap<string, string>): SyncTemplateLoader
```

Reads from an object or a `Map`. Its templates are treated as immutable.

Keys are normalized the way names are, so `./a.tmpl` and `dir//b.tmpl` are
found under their own spelling. Two keys that name the same template once
normalized throw.

### nodeFileLoader

Exported from `@libraz/html-template/loaders`, so that importing the main entry
never pulls in `node:fs`.

```typescript
nodeFileLoader(options?: NodeFileLoaderOptions): SyncTemplateLoader
```

| Option | Default | Effect |
| --- | --- | --- |
| `paths` | `[]` | Directories searched for template files |
| `searchAllPaths` | `false` | Search the configured paths rather than the referring file's directory |
| `root` | `HTML_TEMPLATE_ROOT` | Prefix prepended to the search paths |
| `cwd` | working directory | Directory used as the last resort |
| `encoding` | `utf-8` | An encoding Node's `Buffer` or `TextDecoder` can decode, in Node or Perl spelling |

Everything read from the environment is captured when the loader is built, so
resolution cannot shift under a long-lived process.

Perl names such as `shiftjis` and `cp932` map to `shift_jis`. An encoding name
that cannot be decoded throws when the loader is created. A bare `utf16`
requires a byte order mark; name `utf-16le` or `utf-16be` for text without one.

```typescript
fileVersion(path: string): string | undefined
```

Also exported from `@libraz/html-template/loaders`: the version string
`nodeFileLoader` reports for a file, built from its modification time and size,
or `undefined` when the file cannot be read. Useful for a custom loader's
`version`.

## TemplateShape

A read-only view of what a template declares.

| Member | Returns |
| --- | --- |
| `names` | Lookup keys at this level (lowercased when `caseSensitive` is off), in declaration order |
| `get(name)` | `ParamInfo`, or undefined |
| `has(name)` | `boolean` |
| `kind(name)` | `'var'`, `'loop'` or undefined |
| `loop(name)` | The loop body's own shape, or undefined |
| `at(path)` | The shape at a path of loop names |

`ParamInfo` carries the name as first written, the normalized key, the kind,
every form the name is used in, whether any tag gave it a `DEFAULT`, the
`ESCAPE` values seen on it, and where it first appears. That location, `loc`,
carries `file`, the template that physically contains the tag, with that
file's own line and column.

The shape always describes the template's real nesting, even with `globalVars`
on — that setting changes how names resolve at render time, not what the
template says.

## Errors

`TemplateNotFoundError` is thrown by a loader when a name resolves to nothing.
It is the only error `onMissing: 'ignore'` swallows.

Everything else is a plain `Error` naming the template and, where the parser
knows it, the line. For a tag inside an included template, that is the included
template and its own line.

## Type generation

Exported from `@libraz/html-template/codegen`; see [type generation](type-generation.md).

```typescript
generateTypes(source: string, options?: CodegenOptions): string
generateModule(entries: TemplateEntry[], options?: CodegenOptions): string
pascalCase(name: string): string
```

`pascalCase` is how the command turns a file stem into an interface name.

| `CodegenOptions` | Default | Effect |
| --- | --- | --- |
| `name` | `TemplateData` | Interface name, for `generateTypes` |
| `required` | `false` | Make every property required |
| `split` | `false` | Give each loop's row type its own named interface |
| `importFrom` | `@libraz/html-template` | Module the value types are imported from |
| `compile` | — | `CompileOptions` used to read the template |

A `TemplateEntry` is `{ name, source, filename? }`; `filename` lets its includes
resolve relative to it. Interface names, split row interfaces included, must be
valid identifiers and unique within the generated module, or generation throws.

## version

```typescript
version: string
```

The package version, exported from `@libraz/html-template`.
