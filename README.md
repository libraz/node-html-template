# @libraz/html-template

[![npm version](https://img.shields.io/npm/v/@libraz/html-template.svg)](https://www.npmjs.com/package/@libraz/html-template)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Complete TypeScript/ESM port of Perl's **HTML::Template v2.98** with 100% API compatibility.

A fast, powerful, and flexible template engine designed for web applications. Perfect for migrating legacy Perl applications to modern JavaScript/TypeScript while maintaining template compatibility.

## Features

- ✅ **100% Compatible** with Perl HTML::Template v2.98
- ✅ **Type-Safe** - Full TypeScript definitions
- ✅ **ESM-First** - Modern ES Module support
- ✅ **Fast** - Highly optimized parser and executor
- ✅ **Zero Dependencies** - No external runtime dependencies
- ✅ **Well-Tested** - 240+ tests covering all features
- ✅ **Secure** - Built-in XSS protection with HTML/URL/JS escaping

## Installation

```bash
npm install @libraz/html-template
```

```bash
yarn add @libraz/html-template
```

## Quick Start

```typescript
import { HTMLTemplate } from '@libraz/html-template';

// From string
const tmpl = new HTMLTemplate({
  scalarref: `
    <h1><TMPL_VAR NAME="title"></h1>
    <TMPL_LOOP NAME="items">
      <p><TMPL_VAR NAME="name">: <TMPL_VAR NAME="value"></p>
    </TMPL_LOOP>
  `
});

// Set parameters
tmpl.param('title', 'Hello World');
tmpl.param('items', [
  { name: 'Item 1', value: 'Value 1' },
  { name: 'Item 2', value: 'Value 2' }
]);

// Generate output
console.log(tmpl.output());
```

## Core Features

### Variables

```typescript
const tmpl = new HTMLTemplate({
  scalarref: 'Hello <TMPL_VAR NAME="name">!'
});
tmpl.param('name', 'World');
console.log(tmpl.output()); // Hello World!
```

### Loops

```typescript
const tmpl = new HTMLTemplate({
  scalarref: `
    <TMPL_LOOP NAME="users">
      <p><TMPL_VAR NAME="username"></p>
    </TMPL_LOOP>
  `
});

tmpl.param('users', [
  { username: 'Alice' },
  { username: 'Bob' },
  { username: 'Charlie' }
]);
```

### Conditionals

```typescript
const tmpl = new HTMLTemplate({
  scalarref: `
    <TMPL_IF NAME="show_message">
      <p><TMPL_VAR NAME="message"></p>
    <TMPL_ELSE>
      <p>No message</p>
    </TMPL_IF>
  `
});

tmpl.param({ show_message: true, message: 'Hello!' });
```

### Escaping (XSS Protection)

```typescript
const tmpl = new HTMLTemplate({
  scalarref: `
    <div><TMPL_VAR NAME="content" ESCAPE="HTML"></div>
    <a href="?q=<TMPL_VAR NAME="query" ESCAPE="URL">">Link</a>
    <script>var data = "<TMPL_VAR NAME="data" ESCAPE="JS">";</script>
  `
});

tmpl.param({
  content: '<script>alert("XSS")</script>',  // Escaped
  query: 'hello world',                       // URL encoded
  data: 'Some "quoted" text'                  // JS escaped
});
```

`ESCAPE=1` is also supported as a Perl-compatible shorthand for `ESCAPE="HTML"`.

### Default Escaping

```typescript
const tmpl = new HTMLTemplate({
  scalarref: '<TMPL_VAR NAME="html">',
  default_escape: 'html'  // All vars HTML-escaped by default
});
```

### Template Comments

```typescript
// TMPL_COMMENT and TMPL_NOTE blocks are stripped from output
const tmpl = new HTMLTemplate({
  scalarref: `
    Visible content
    <TMPL_COMMENT>This will not appear in output</TMPL_COMMENT>
    More visible content
  `
});
```

### File Includes

```typescript
// template.html
<TMPL_INCLUDE NAME="header.html">
<TMPL_VAR NAME="content">
<TMPL_INCLUDE NAME="footer.html">
```

```typescript
const tmpl = new HTMLTemplate({
  filename: 'template.html',
  path: ['./templates']  // Search path
});
```

### Template Query

```typescript
const tmpl = new HTMLTemplate({
  scalarref: '<TMPL_VAR NAME="foo"> <TMPL_LOOP NAME="items"><TMPL_VAR NAME="x"></TMPL_LOOP>'
});

// Get all top-level parameter names
console.log(tmpl.query());  // ['foo', 'items']

// Check parameter type
console.log(tmpl.query({ name: 'foo' }));     // 'VAR'
console.log(tmpl.query({ name: 'items' }));   // 'LOOP'

// Get parameters within a loop
console.log(tmpl.query({ loop: 'items' }));   // ['x']
```

## Advanced Features

### Lazy Values

Defer computation until a variable or loop is actually used in the template:

```typescript
const tmpl = new HTMLTemplate({
  scalarref: '<TMPL_VAR NAME="expensive">',
  die_on_bad_params: false
});

// Function is only called when the variable is rendered
tmpl.param('expensive', () => computeExpensiveValue());
```

### Associate Objects

Pull parameters from external objects with a `param()` method (CGI.pm compatibility):

```typescript
const cgi = {
  param: (name: string) => {
    if (name === 'user') return 'alice';
    return undefined;
  }
};

const tmpl = new HTMLTemplate({
  scalarref: '<TMPL_VAR NAME="user">',
  associate: cgi,
  die_on_bad_params: false
});
```

### Content Filters

Transform template content before parsing:

```typescript
const tmpl = new HTMLTemplate({
  scalarref: 'hello <TMPL_VAR NAME="name">',
  filter: {
    sub: (content) => (content as string).toUpperCase(),
    format: 'scalar'
  }
});
```

### Vanguard Compatibility Mode

Support for legacy `%VAR%` syntax:

```typescript
const tmpl = new HTMLTemplate({
  scalarref: 'Hello %name%!',
  vanguard_compatibility_mode: true
});
tmpl.param('name', 'World');
console.log(tmpl.output());  // Hello World!
```

### Cache Support

```typescript
const tmpl = new HTMLTemplate({
  filename: 'template.html',
  cache: true  // Enable in-memory caching
});
```

### Loop Context Variables

```typescript
const tmpl = new HTMLTemplate({
  scalarref: `
    <TMPL_LOOP NAME="items">
      Item <TMPL_VAR NAME="__counter__">
      <TMPL_IF NAME="__first__">First!</TMPL_IF>
      <TMPL_IF NAME="__last__">Last!</TMPL_IF>
      <TMPL_IF NAME="__odd__">Odd row</TMPL_IF>
    </TMPL_LOOP>
  `,
  loop_context_vars: true
});
```

Available context variables: `__first__`, `__last__`, `__inner__`, `__outer__`, `__odd__`, `__even__`, `__counter__` (1-based), `__index__` (0-based).

### Global Variables

```typescript
const tmpl = new HTMLTemplate({
  scalarref: `
    <TMPL_VAR NAME="site_name">
    <TMPL_LOOP NAME="items">
      <TMPL_VAR NAME="site_name"> - <TMPL_VAR NAME="item">
    </TMPL_LOOP>
  `,
  global_vars: true  // Access parent scope variables in loops
});
```

## API Reference

### Constructor Options

```typescript
interface HTMLTemplateOptions {
  // Template Source (one required)
  filename?: string;           // Load from file
  scalarref?: string;          // Template string
  arrayref?: string[];         // Template as array of lines
  filehandle?: Readable;       // Node.js readable stream

  // File System
  path?: string[];             // Search paths for includes
  utf8?: boolean;              // Use UTF-8 encoding

  // Behavior
  case_sensitive?: boolean;    // Case-sensitive parameter names
  loop_context_vars?: boolean; // Enable __first__, __last__, etc.
  global_vars?: boolean;       // Access parent vars in loops
  no_includes?: boolean;       // Disable TMPL_INCLUDE processing
  max_includes?: number;       // Max include depth (default: 10)
  die_on_missing_include?: boolean; // Throw on missing includes

  // Error Detection
  die_on_bad_params?: boolean; // Throw on nonexistent params

  // Escaping
  default_escape?: 'html' | 'js' | 'url' | 'none';

  // Cache
  cache?: boolean;             // Enable in-memory cache

  // Compatibility
  vanguard_compatibility_mode?: boolean; // Enable %VAR% syntax
  associate?: AssociateObject | AssociateObject[];

  // Filters
  filter?: Filter | Filter[];
}
```

### Methods

#### `param(name: string, value: ParamValue): void`
Set a single parameter value.

#### `param(params: Record<string, ParamValue>): void`
Set multiple parameters at once.

#### `output(): string`
Generate and return the rendered template.

#### `output({ print_to: Writable }): void`
Write rendered output to a stream.

#### `query(): string[]`
Get all top-level parameter names.

#### `query({ name: string }): 'VAR' | 'LOOP' | undefined`
Check parameter type.

#### `query({ loop: string }): string[] | undefined`
Get parameters within a loop.

#### `clear(): void`
Clear all parameter values.

## Performance

Run benchmarks:

```bash
yarn bench
```

Sample results:
- Simple variable substitution: ~50,000 ops/sec
- Loop with 100 items: ~5,000 ops/sec
- Complex template parsing: ~10,000 ops/sec

## Compatibility

- **Node.js**: >= 22.0.0
- **Perl HTML::Template**: v2.98 (100% compatible)

## Migration from Perl

This library is designed for drop-in compatibility:

```perl
# Perl
use HTML::Template;
my $template = HTML::Template->new(filename => 'template.tmpl');
$template->param(name => 'World');
print $template->output();
```

```typescript
// TypeScript/JavaScript
import { HTMLTemplate } from '@libraz/html-template';
const template = new HTMLTemplate({ filename: 'template.tmpl' });
template.param('name', 'World');
console.log(template.output());
```

## Testing

```bash
yarn test             # Run all tests
yarn test:watch       # Watch mode
yarn test:coverage    # Generate coverage report
```

## Development

```bash
yarn dev             # Watch mode for development
yarn build           # Build for production
yarn lint            # Run Biome lint
yarn format          # Format with Biome
yarn type-check      # TypeScript type checking
```

## License

MIT

## Credits

This is a complete TypeScript port of the Perl [HTML::Template](https://metacpan.org/pod/HTML::Template) module by Sam Tregar. All credit for the original design and API goes to the Perl community.

## Links

- [npm package](https://www.npmjs.com/package/@libraz/html-template)
- [GitHub repository](https://github.com/libraz/node-perl-html-template)
- [Original Perl HTML::Template](https://metacpan.org/pod/HTML::Template)
