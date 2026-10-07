# Coming from Perl HTML::Template

The asset worth carrying across is the template syntax, not the API around it.
Templates come over unchanged; the code that renders them does not.

The syntax is checked against output recorded from Perl HTML::Template 2.98.
Every recorded case is asserted except those that exercise Perl's own API
(`param()`, `associate`, `query()`, `clear_params()`), which have no
counterpart here, and two that differ in behaviour, listed under
[differences that remain](#differences-that-remain). `TMPL_COMMENT` and
`TMPL_NOTE` have no recorded case.

## The API

Perl builds an object, mutates it, and asks for output:

```perl
my $tmpl = HTML::Template->new(filename => 'page.tmpl');
$tmpl->param(title => 'Hello');
$tmpl->param(items => \@items);
print $tmpl->output;
```

Here a template is compiled once and rendered with data:

```typescript
const template = compile(source);
const html = template.render({ title: 'Hello', items });
```

The difference is not cosmetic. In the Perl shape, parsing and data are bound
to the same object, so serving two requests from one template means either
recompiling or clearing state between them. Splitting them makes the compiled
template immutable and the data per call, which is what a server actually
wants.

`param()`, `output()`, `query()`, `clear()` and the constructor helpers have no
equivalents. What they did is covered by `render`, `renderTo` and
`template.shape`.

## Defaults that changed

Three defaults are deliberately different. Each is a compile or render setting,
so the Perl behaviour is one option away.

| Setting | Perl | Here | Restore it with |
| --- | --- | --- | --- |
| Escaping | none | HTML | `defaultEscape: 'none'` |
| Name matching | folds case | case-sensitive | `caseSensitive: false` |
| Undeclared data | fatal | ignored | `strictData: true` on a render |

**Escaping** is the one that changes output. A template that already writes
`ESCAPE="html"` is unaffected — an explicit attribute always wins. A template
that relied on raw output needs `defaultEscape: 'none'`, and is worth reading
again before it gets one.

**Name matching** is stricter, so a template that says `userName` no longer
finds `username`. Set `caseSensitive: false` while porting, and drop it once
the names agree.

**Undeclared data** no longer throws by default, because passing an object
wider than the template uses is ordinary in TypeScript and generated types
catch genuine typos before the code runs.

## Options, renamed

| Perl | Here |
| --- | --- |
| `filename` | `Environment#compileFile(name)` |
| `scalarref`, `arrayref`, `filehandle`, `type` + `source` | `compile(source)` |
| `path` | `nodeFileLoader`'s `paths` |
| `search_path_on_include` | `nodeFileLoader`'s `searchAllPaths` |
| `max_includes` | `IncludeOptions.maxDepth` |
| `die_on_missing_include` | `IncludeOptions.onMissing` |
| `no_includes` | `includes: false` |
| `die_on_bad_params` | `strictData` on a render |
| `case_sensitive` | `caseSensitive` |
| `global_vars` | `globalVars` |
| `loop_context_vars` | `loopContextVars` on a render |
| `default_escape` | `defaultEscape` |
| `vanguard_compatibility_mode` | `legacy.percentVars` |
| `filter` | `filters` |
| `cache`, `blind_cache` | `Environment`'s `cache` |
| `file_cache`, `double_file_cache` | — |
| `associate` | `resolve` on a render |
| `print_to` | `renderTo(sink, data)` |
| `utf8`, `open_mode` | `nodeFileLoader`'s `encoding` |
| `HTML::Template->config` | `Environment` |
| `force_untaint`, `debug`, `stack_debug`, `shared_cache`, … | — |

Options that Perl accepted but this package never implemented are gone from the
types as well as from the code: an option that silently does nothing is worse
than one that does not exist.

**File caching** is not carried over. Serializing a parse tree to disk pays off
when a process handles one request and exits, which is not how a Node server
runs. In-memory caching on an `Environment` covers the case that remains.

**`associate`** existed to pull values from a CGI.pm object. The replacement is
a plain hook, so the library no longer knows about any particular external
module:

```typescript
template.render(data, { resolve: (name) => request.query[name] });
```

## Differences that remain

- **A scalar given for a loop name** renders as an empty loop. Perl dies when
  the value is set.
- **An array given for a name used only in `TMPL_IF`** is accepted and judged by
  the [truth rules](template-syntax.md#tmpl_if-and-tmpl_unless), so an empty array takes the else branch. Perl rejects it
  when the value is set.
- **Tag closers are more lenient.** A self-closing slash straight after the
  last attribute (`<TMPL_VAR x/>`) and a comment closer straight after it
  (`<!-- TMPL_VAR x-->`) are accepted; Perl does not treat them the same way.
- **A space after `<` makes the text literal.** `< TMPL_VAR x>` is ordinary
  text, as in Perl, even though a space before the closing `>` is fine.

## Behaviour that is unchanged

- Every tag, attribute and both tag forms
- Perl's truthiness, including `'0'` being false
- `DEFAULT` never being escaped
- Loop scoping, and what `global_vars` does to it
- The exact strings the loop context variables render as
- `%NAME%` substitution, under `legacy.percentVars`
- Include resolution order, and reading a shared include once

## A porting checklist

1. Compile with `defaultEscape: 'none'` and `caseSensitive: false`, so the
   first run is a straight comparison against the old output.
2. Diff the output against Perl's for real data.
3. Generate types and pass them to `compile`, which surfaces every name the
   templates actually expect.
4. Drop `caseSensitive: false` once the names agree.
5. Drop `defaultEscape: 'none'` last, adding `ESCAPE="none"` to the tags that
   genuinely emit markup. This is the step that is worth doing slowly.
