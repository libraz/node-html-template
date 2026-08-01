# Type generation

A template carries no type information, but it does say which names it uses and
in what role. That is enough to describe the shape of the data it expects, and
to turn a misspelled key into a compile error.

## The command

```bash
npx html-template-codegen views/ -o src/templates.d.ts
```

A path may be a template file or a directory to search. Each template becomes
one exported interface, named after the file:

```typescript
// Generated from template files. Do not edit.
import type { RowSource, ScalarSource } from '@libraz/html-template';

export interface PageData {
  title?: ScalarSource;
  logged_in?: unknown;
  items?: RowSource<{
    'item-name'?: ScalarSource;
    tags?: RowSource<{
      tag?: ScalarSource;
    }>;
  }>;
}
```

### Options

| Option | Effect |
| --- | --- |
| `-o, --out <file>` | Write to a file instead of standard output |
| `--check` | Write nothing; exit 1 if `--out` is missing or out of date |
| `--required` | Make every property required |
| `--split` | Give each loop's row type its own named interface |
| `--ext <list>` | Extensions to pick up when searching a directory (default `.tmpl,.html`) |
| `--suffix <s>` | Appended to each interface name (default `Data`) |
| `--import <mod>` | Module the value types are imported from |

## Using the result

```typescript
import { compile } from '@libraz/html-template';
import type { PageData } from './templates.js';

const template = compile<PageData>(source);

template.render({ titel: 'oops' }); // rejected at compile time
```

## What is generated, and why

**Everything is optional.** A variable the caller never sets renders as an
empty string rather than failing, so optional is what the template actually
promises. `--required` inverts it for a project that would rather be told.

**A name used only as a condition becomes `unknown`.** It is never written to
the output, only tested, so any value is legitimate — narrowing it would reject
correct calls.

**A loop becomes `RowSource<Row>`**, which accepts an array of rows or a
function returning one, matching what the runtime accepts.

**Row types are inlined** unless `--split` is passed, which is the readable
choice for shallow templates and the unreadable one past two levels.

**Loop context variables are left out.** `__first__` and friends come from the
loop, not from the caller.

**Values are `ScalarSource`.** A template says nothing about whether a name
holds a number or a date, so anything narrower would be invented.

**Names that are not identifiers are quoted.** Template names routinely contain
`-`, `.` and `/`, none of which TypeScript allows bare.

## Keeping it current

Commit the generated file and check it in CI:

```bash
html-template-codegen views/ -o src/templates.d.ts --check
```

That exits 1 when the file is missing or no longer matches the templates,
which is the only way a generated artefact stays honest.

## From code

The generator is available without the command, and touches no files:

```typescript
import { generateModule } from '@libraz/html-template/codegen';

const source = generateModule([{ name: 'PageData', source: templateText }]);
```

`generateTypes(source, options)` returns the declarations for a single template
without the module header, for a bundler plugin or a test.
