# Template syntax

The syntax is Perl HTML::Template 2.98's, unchanged. A template written for the
Perl module parses here and produces the same output, with one deliberate
exception covered under [escaping](#escaping).

## Tag forms

Every tag can be written two ways:

```html
<TMPL_VAR NAME="title">
<!-- TMPL_VAR NAME="title" -->
```

The comment form exists so a template can stay valid HTML on its own, which
matters when it is opened in an editor or a browser before it is rendered. The
two forms mean exactly the same thing and can be mixed freely.

Tag and attribute names are matched without regard to case: `<TMPL_VAR>`,
`<tmpl_var>` and `<Tmpl_Var>` are one tag.

## TMPL_VAR

Writes a value.

```html
<TMPL_VAR NAME="title">
<TMPL_VAR title>
<TMPL_VAR NAME='title'>
```

The `NAME=` prefix is optional, and the value may be quoted with either quote
character or left bare.

An unset name writes nothing.

### DEFAULT

```html
<TMPL_VAR NAME="title" DEFAULT="Untitled">
```

Used when the name is unset. An empty string is a value, so a name set to `''`
renders as empty rather than falling back.

A default is written out exactly as given and is never escaped.

### ESCAPE

```html
<TMPL_VAR NAME="body" ESCAPE="html">
<TMPL_VAR NAME="query" ESCAPE="url">
<TMPL_VAR NAME="text" ESCAPE="js">
<TMPL_VAR NAME="raw" ESCAPE="none">
```

| Value | Effect |
| --- | --- |
| `html` or `1` | `& " ' < >` become entities |
| `url` | percent-encoding |
| `js` | backslash escapes for `\ ' "`, line breaks and U+2028/U+2029 |
| `none` or `0` | written through untouched |

Any other value is a parse error.

## TMPL_IF and TMPL_UNLESS

```html
<TMPL_IF NAME="logged_in">
  welcome
<TMPL_ELSE>
  please sign in
</TMPL_IF>

<TMPL_UNLESS NAME="empty">there is something here</TMPL_UNLESS>
```

`TMPL_ELSE` works with both, and either may be closed with `</TMPL_IF>` or
`</TMPL_UNLESS>`.

Truth follows Perl rather than JavaScript, because that is what the templates
were written against:

| Value | Truth |
| --- | --- |
| `undefined`, `null`, `false` | false |
| `0`, `''`, `'0'` | false |
| `[]` | false |
| anything else | true |

The string `'0'` being false is the difference that catches people out.

## TMPL_LOOP

```html
<TMPL_LOOP NAME="rows">
  <TMPL_VAR NAME="cell">
</TMPL_LOOP>
```

The value is an array of objects, one per iteration, or a function returning
one. An empty or unset loop renders nothing.

### Scope

A loop body sees the names in its own row and nothing else. A name from the
enclosing template is not visible unless `globalVars` is on:

```typescript
compile(source, { globalVars: true });
```

With it on, a name unresolved in a row falls back through the enclosing scopes,
and a row that declares the same name shadows what is outside it.

### Loop context variables

With `loopContextVars: true` on a render, each iteration also gets:

| Name | Value |
| --- | --- |
| `__first__` | `1` on the first iteration, otherwise `0` |
| `__last__` | `1` on the last iteration, otherwise `''` |
| `__inner__` | `1` when neither first nor last, otherwise `0` |
| `__outer__` | `1` on the first and last iterations, otherwise `0` |
| `__odd__` | `1` on odd iterations, otherwise `''` |
| `__even__` | `1` on even iterations, otherwise `''` |
| `__counter__` | iteration number, from 1 |
| `__index__` | iteration number, from 0 |

The mix of `0` and `''` for a false value is Perl's, and a template that writes
one of these out directly can see the difference, so it is reproduced exactly.

They are off by default because they cost work on every iteration.

## TMPL_INCLUDE

```html
<TMPL_INCLUDE NAME="header.tmpl">
<TMPL_INCLUDE header.tmpl>
```

The named template is spliced in where the tag stands, before anything is
parsed, so an include can contain any tag at all — including half of a loop, if
a template is built that way.

A name is resolved relative to the template that referenced it. A template
referenced from several places is read once.

Include handling is configured at compile time:

```typescript
compile(source, {
  loader: nodeFileLoader({ paths: ['./views'] }),
  includes: {
    maxDepth: 10,          // zero or less means unlimited
    onMissing: 'throw',    // or 'ignore'
    searchAllPaths: false  // resolve from the configured paths, not the referrer
  }
});
```

`includes: false` rejects any `TMPL_INCLUDE` in the template outright.

`onMissing: 'ignore'` drops an include naming a template that does not exist.
It does not silence a cycle or an exceeded depth, which are broken templates
either way.

## TMPL_COMMENT

```html
<TMPL_COMMENT>notes for whoever edits this</TMPL_COMMENT>
<TMPL_NOTE>the same thing</TMPL_NOTE>
```

The block and everything in it is removed before parsing, so it can contain
anything, including unbalanced tags.

## Percent variables

Some older templates use `%NAME%` instead of a tag. It is off by default,
because `%` is ordinary text everywhere else:

```typescript
compile('Hello %name%!', { legacy: { percentVars: true } });
```

With it on, `%NAME%` behaves exactly like `<TMPL_VAR NAME="NAME">` and can be
mixed with tags in the same template.

## Name matching

Names are matched case-sensitively by default:

```typescript
compile('<TMPL_VAR NAME="userName">').render({ username: 'x' }); // empty
```

Perl folds case instead. `caseSensitive: false` restores that:

```typescript
compile('<TMPL_VAR NAME="userName">', { caseSensitive: false }).render({ USERNAME: 'x' });
```

## Escaping

Unlike Perl, a variable with no `ESCAPE` attribute is HTML-escaped. The default
is a compile setting:

```typescript
compile(source, { defaultEscape: 'none' });
```

An explicit `ESCAPE` on a tag always wins, `ESCAPE="none"` included, so a
template can opt individual values out of whatever the default is.

## Malformed templates

An unknown `TMPL_` tag, an unclosed block or a closing tag with nothing open is
an error. `strict: false` downgrades an unknown tag to literal text, which is
occasionally what a template that contains prose about templates needs.
