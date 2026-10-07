/**
 * Type generation
 *
 * Turns what a template declares into a TypeScript interface, so a typo in the
 * data a caller passes is caught before the template is ever rendered.
 *
 * Nothing here touches the filesystem: it takes template text and returns
 * source text, which is what lets it run from a CLI, a bundler plugin, or a
 * test.
 *
 * @module codegen/generate
 */

import { compile } from '../api/compile.js';
import type { CompileOptions, ParamInfo, TemplateShape } from '../api/types.js';

/** Name of the package the generated types import from */
const RUNTIME_MODULE = '@libraz/html-template';

/** A name that can be used as a TypeScript interface name */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Row type of a loop whose body reads no row member: any row the runtime renders is accepted */
const EMPTY_ROW = 'RowSource<{}>';

/**
 * Names a loop body gets for free when loop context variables are on.
 *
 * A template may reference them, but no caller supplies them, so they must not
 * appear in the generated row type.
 */
const CONTEXT_VARS = new Set([
  '__first__',
  '__last__',
  '__inner__',
  '__outer__',
  '__odd__',
  '__even__',
  '__counter__',
  '__index__'
]);

/**
 * How a template's declarations are turned into TypeScript.
 */
export interface CodegenOptions {
  /** Name of the generated interface. Defaults to `TemplateData`. */
  name?: string;

  /**
   * Make every property required.
   *
   * Off by default: a variable the caller never sets renders as the empty
   * string rather than failing, so optional describes the template's actual
   * contract.
   */
  required?: boolean;

  /** Give each loop's row type its own named interface instead of inlining it */
  split?: boolean;

  /** Module the value types are imported from */
  importFrom?: string;

  /** Settings used to read the template */
  compile?: CompileOptions;
}

/**
 * One template to generate types for.
 */
export interface TemplateEntry {
  /** Name of the generated interface */
  name: string;

  /** Template text */
  source: string;

  /** Where the text came from, so its includes resolve relative to it */
  filename?: string;
}

/**
 * Generate the interface declarations for one template.
 *
 * @param source - Template text
 * @param options - Generation settings
 * @returns TypeScript declarations, without imports
 * @throws {Error} When an interface name is not a valid identifier or is used twice
 */
export function generateTypes(source: string, options: CodegenOptions = {}): string {
  const template = compile(source, options.compile);

  const name = options.name ?? 'TemplateData';

  return declare(template.shape, name, { taken: new Map(), origin: name }, options).join('\n\n');
}

/**
 * Generate a complete module for a set of templates.
 *
 * @param entries - Templates to describe
 * @param options - Generation settings
 * @returns TypeScript source, ready to write to a `.d.ts`
 * @throws {Error} When an interface name is not a valid identifier, or two
 *   templates produce the same name
 */
export function generateModule(entries: readonly TemplateEntry[], options: CodegenOptions = {}): string {
  const taken = new Map<string, string>();
  const blocks = entries.flatMap((entry) =>
    declare(
      compile(entry.source, { ...options.compile, filename: entry.filename }).shape,
      entry.name,
      { taken, origin: entry.filename ?? entry.name },
      options
    )
  );

  const needed = new Set<string>();
  for (const block of blocks) {
    if (block.includes('ScalarSource')) needed.add('ScalarSource');
    if (block.includes('RowSource')) needed.add('RowSource');
  }

  const header = ['// Generated from template files. Do not edit.'];
  if (needed.size > 0) {
    header.push(`import type { ${[...needed].sort().join(', ')} } from '${options.importFrom ?? RUNTIME_MODULE}';`);
  }

  return `${[header.join('\n'), ...blocks].join('\n\n')}\n`;
}

/** Interface names already emitted into one module, and where the current template came from */
interface Scope {
  /** Interface name to the origin that claimed it */
  taken: Map<string, string>;
  origin: string;
}

/**
 * Build the declarations for one shape, outermost interface first.
 *
 * The only place an interface name is emitted: it must be a valid identifier
 * and unique within the module, whether the interface is a template's own or
 * a split row.
 *
 * @param shape - Parameters the template declares
 * @param name - Interface name
 * @param scope - Names claimed so far in the module
 * @param options - Generation settings
 * @returns One block of source per interface
 * @throws {Error} When the name is not an identifier or is already taken
 */
function declare(shape: TemplateShape, name: string, scope: Scope, options: CodegenOptions): string[] {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Interface name '${name}' for ${scope.origin} is not a valid TypeScript identifier.`);
  }

  const owner = scope.taken.get(name);
  if (owner !== undefined) {
    throw new Error(`Interface name '${name}' is produced by both ${owner} and ${scope.origin}.`);
  }
  scope.taken.set(name, scope.origin);

  const extra: string[] = [];
  const body = members(shape, name, scope, options, extra, 1);

  const main = `export interface ${name} {${body.length === 0 ? '' : `\n${body}\n`}}`;

  return [main, ...extra];
}

/**
 * Render the members of one interface body.
 *
 * @param shape - Parameters declared at this level
 * @param name - Name of the interface being built, used to name split rows
 * @param scope - Names claimed so far in the module
 * @param options - Generation settings
 * @param extra - Collects split row interfaces
 * @param depth - Indentation depth
 * @returns Indented member lines
 */
function members(
  shape: TemplateShape,
  name: string,
  scope: Scope,
  options: CodegenOptions,
  extra: string[],
  depth: number
): string {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];

  for (const paramName of shape.names) {
    if (CONTEXT_VARS.has(paramName.toLowerCase())) continue;

    const info = shape.get(paramName);
    if (!info) continue;

    const optional = options.required ? '' : '?';
    lines.push(
      `${indent}${property(paramName)}${optional}: ${valueType(shape, info, name, scope, options, extra, depth)};`
    );
  }

  return lines.join('\n');
}

/**
 * Decide the type of one parameter.
 *
 * @param shape - Parameters declared at this level
 * @param info - The parameter's declaration
 * @param name - Name of the interface being built
 * @param scope - Names claimed so far in the module
 * @param options - Generation settings
 * @param extra - Collects split row interfaces
 * @param depth - Indentation depth
 * @returns TypeScript type
 */
function valueType(
  shape: TemplateShape,
  info: ParamInfo,
  name: string,
  scope: Scope,
  options: CodegenOptions,
  extra: string[],
  depth: number
): string {
  if (info.kind === 'loop') {
    const rows = shape.loop(info.name) ?? shape.loop(info.key);
    if (!rows) return EMPTY_ROW;

    if (options.split) {
      const rowName = `${name}${pascalCase(info.name)}Row`;
      extra.push(...declare(rows, rowName, { ...scope, origin: `${scope.origin} (loop '${info.name}')` }, options));
      return `RowSource<${rowName}>`;
    }

    const body = members(rows, name, scope, options, extra, depth + 1);
    const close = '  '.repeat(depth);

    return body.length === 0 ? EMPTY_ROW : `RowSource<{\n${body}\n${close}}>`;
  }

  // A name used only as a condition is never written to the output, so any
  // value is legitimate and narrowing it would reject correct calls.
  const conditionOnly = !info.usages.has('var');

  return conditionOnly ? 'unknown' : 'ScalarSource';
}

/**
 * Write a property name, quoting it when it is not a bare identifier.
 *
 * Template names routinely contain characters TypeScript does not allow in an
 * identifier, such as `-`, `.` and `/`.
 *
 * @param name - Parameter name
 * @returns Property name as it appears in the interface
 */
function property(name: string): string {
  if (IDENTIFIER.test(name)) return name;

  return `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Convert a name to PascalCase for use in an interface name.
 *
 * @param name - Source name
 * @returns PascalCase name, or `Row` when nothing usable remains
 */
export function pascalCase(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const joined = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');

  return /^[A-Za-z]/.test(joined) ? joined : `T${joined}`;
}
