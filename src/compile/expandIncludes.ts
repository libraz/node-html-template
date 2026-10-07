/**
 * Include expansion
 *
 * Runs in two passes. The first walks the include graph and reads each
 * template once, which is the only pass that touches the loader. The second
 * splices the texts together and is pure: depth and cycle state travel as
 * arguments, so there is no mutable context to restore and no way for a thrown
 * error to leave the expander in a bad state.
 *
 * Reading every template before assembling also means the same file included
 * twice is read once, and it is what will let an asynchronous loader fetch a
 * whole level in parallel.
 *
 * @module compile/expandIncludes
 */

import { TemplateNotFoundError } from '../loader/errors.js';
import type { SyncTemplateLoader, TemplateLoader, TemplateResource } from '../loader/types.js';
import { type IncludeRef, scanIncludes } from '../parser/scanIncludes.js';
import { type MappedStretch, SourceMap, TemplateText, templateError } from '../parser/sourceMap.js';

/**
 * Where a stretch of the expanded text came from.
 */
export interface SourceSegment {
  /** Offset in the expanded text where this stretch begins */
  outputStart: number;

  /** Canonical id of the template it came from */
  id: string;

  /** Offset within that template */
  sourceStart: number;
}

/**
 * Settings for {@link expandIncludes}.
 */
export interface ExpandOptions {
  /** Source of included templates */
  loader: SyncTemplateLoader;

  /** Maximum include nesting; zero or less means unlimited */
  maxDepth: number;

  /** What to do when an include names a template that does not exist */
  onMissing: 'throw' | 'ignore';

  /**
   * Transformation applied to every template's text before its comment
   * blocks are removed.
   */
  filter(text: string): string;
}

/**
 * The template expansion starts from.
 */
export interface EntryTemplate {
  /** Canonical id, when the template has one */
  id?: string;

  /** Template text as written */
  text: string;

  /**
   * The loader read that produced `text`. Absent for text the caller supplied,
   * which has no version a cache could check.
   */
  resource?: TemplateResource;
}

/**
 * Settings for {@link expandIncludesAsync}, which accepts a loader whose
 * methods may return promises.
 */
export interface AsyncExpandOptions extends Omit<ExpandOptions, 'loader'> {
  loader: TemplateLoader;
}

/**
 * A template with all of its includes expanded.
 */
export interface ExpandedSource {
  /** Flattened template text */
  text: string;

  /**
   * Version of every template read through the loader, each taken from the
   * same read as the text compiled, for cache validation
   */
  versions: Map<string, string | undefined>;

  /** Map from offsets in `text` back to the templates they came from */
  segments: SourceSegment[];

  /** Map from offsets in `text` back to where they were written */
  map: SourceMap;
}

/**
 * One template's text and the includes found in it.
 */
interface Unit {
  id: string;
  template: TemplateText;
  refs: IncludeRef[];

  /** Resolved id per ref index; absent when the include was missing and ignored */
  targets: Map<number, string>;

  /** Loader read the text came from; absent for caller-supplied text */
  resource?: TemplateResource;
}

/**
 * Expand every include in a template.
 *
 * @param entry - Entry template
 * @param options - Expansion settings
 * @returns Flattened text with its provenance
 * @throws Error on a cycle, on exceeding the depth limit, or on a missing
 *   include when `onMissing` is `throw`
 */
export function expandIncludes(entry: EntryTemplate, options: ExpandOptions): ExpandedSource {
  const root = unitOf(entry.id ?? '', entry.text, entry.resource, options.filter, true);
  return finish(root, collect(root, options), options.maxDepth);
}

/**
 * Expand every include in a template, reading through an asynchronous loader.
 *
 * Each level of the include graph is resolved and read concurrently, so depth
 * rather than template count bounds the wait. The assembly pass is the same
 * pure code the synchronous entry point uses, so both produce identical text.
 *
 * @param entry - Entry template
 * @param options - Expansion settings
 * @returns Flattened text with its provenance
 * @throws Error on a cycle, on exceeding the depth limit, or on a missing
 *   include when `onMissing` is `throw`
 */
export async function expandIncludesAsync(entry: EntryTemplate, options: AsyncExpandOptions): Promise<ExpandedSource> {
  const root = unitOf(entry.id ?? '', entry.text, entry.resource, options.filter, true);
  return finish(root, await collectAsync(root, options), options.maxDepth);
}

/**
 * Prepare a template whose includes are disabled, without scanning for them.
 *
 * @param entry - Entry template
 * @param filter - Transformation applied before comment removal
 * @returns The template's own text with its provenance
 */
export function withoutIncludes(entry: EntryTemplate, filter: (text: string) => string): ExpandedSource {
  const root = unitOf(entry.id ?? '', entry.text, entry.resource, filter, false);
  return finish(root, new Map([[root.id, root]]), 0);
}

/**
 * Prepare one template's text.
 *
 * @param id - Canonical id, or an empty string for an anonymous entry
 * @param text - Text as written
 * @param resource - Loader read the text came from, if any
 * @param filter - Transformation applied before comment removal
 * @param scan - Whether to look for includes
 * @returns Unit ready for expansion
 */
function unitOf(
  id: string,
  text: string,
  resource: TemplateResource | undefined,
  filter: (text: string) => string,
  scan: boolean
): Unit {
  const template = TemplateText.prepare(filter(text), id === '' ? undefined : id);
  return { id, template, refs: scan ? scanIncludes(template) : [], targets: new Map(), resource };
}

/**
 * Assemble the collected templates and record their versions.
 *
 * @param root - Entry template
 * @param units - Every reachable template
 * @param maxDepth - Maximum include nesting; zero or less means unlimited
 * @returns Flattened text with its provenance
 */
function finish(root: Unit, units: Map<string, Unit>, maxDepth: number): ExpandedSource {
  const versions = new Map<string, string | undefined>();
  for (const unit of units.values()) {
    if (unit.resource) versions.set(unit.id, unit.resource.version);
  }

  return { ...assemble(root, units, maxDepth), versions };
}

/**
 * Read every template reachable from the entry point, breadth first.
 *
 * Each template is read at most once, so a header included from a dozen places
 * costs one read, and a cycle terminates here rather than looping.
 *
 * @param root - Entry template
 * @param options - Expansion settings
 * @returns Every reachable template, keyed by id
 */
function collect(root: Unit, options: ExpandOptions): Map<string, Unit> {
  const units = new Map<string, Unit>([[root.id, root]]);

  let level: Unit[] = [root];

  while (level.length > 0) {
    const next: Unit[] = [];

    for (const unit of level) {
      for (const [index, ref] of unit.refs.entries()) {
        const targetId = resolveRef(ref, unit, options);
        if (targetId === undefined) continue;

        unit.targets.set(index, targetId);
        if (units.has(targetId)) continue;

        const resource = options.loader.read(targetId);
        const child = unitOf(targetId, resource.text, resource, options.filter, true);

        units.set(targetId, child);
        next.push(child);
      }
    }

    level = next;
  }

  return units;
}

/**
 * Read every reachable template, one graph level at a time.
 *
 * @param root - Entry template
 * @param options - Expansion settings
 * @returns Every reachable template, keyed by id
 */
async function collectAsync(root: Unit, options: AsyncExpandOptions): Promise<Map<string, Unit>> {
  const units = new Map<string, Unit>([[root.id, root]]);

  let level: Unit[] = [root];

  while (level.length > 0) {
    const pending: Array<{ unit: Unit; index: number; ref: IncludeRef }> = [];
    for (const unit of level) {
      for (const [index, ref] of unit.refs.entries()) {
        pending.push({ unit, index, ref });
      }
    }

    const targets = await Promise.all(pending.map(({ unit, ref }) => resolveRefAsync(ref, unit, options)));

    const toRead: string[] = [];
    const queued = new Set<string>();

    for (const [position, targetId] of targets.entries()) {
      const request = pending[position];
      if (targetId === undefined || !request) continue;

      request.unit.targets.set(request.index, targetId);
      if (units.has(targetId) || queued.has(targetId)) continue;

      queued.add(targetId);
      toRead.push(targetId);
    }

    const resources = await Promise.all(toRead.map((id) => options.loader.read(id)));
    const next: Unit[] = [];

    for (const [position, resource] of resources.entries()) {
      const id = toRead[position];
      if (id === undefined) continue;

      const child = unitOf(id, resource.text, resource, options.filter, true);

      units.set(id, child);
      next.push(child);
    }

    level = next;
  }

  return units;
}

/**
 * Resolve one include reference.
 *
 * Only a genuinely missing template may be ignored. A malformed tag, an
 * unreadable file or any other failure stays fatal, so `onMissing: 'ignore'`
 * cannot quietly turn a broken template into empty output.
 *
 * @param ref - Include reference
 * @param unit - Template the reference appears in
 * @param options - Expansion settings
 * @returns Canonical id, or undefined when the template is missing and ignored
 */
function resolveRef(ref: IncludeRef, unit: Unit, options: ExpandOptions): string | undefined {
  try {
    return options.loader.resolve(requestFor(ref, unit));
  } catch (error) {
    return rethrowUnlessIgnorable(error, options);
  }
}

/**
 * Resolve one include reference through an asynchronous loader.
 *
 * @param ref - Include reference
 * @param unit - Template the reference appears in
 * @param options - Expansion settings
 * @returns Canonical id, or undefined when the template is missing and ignored
 */
async function resolveRefAsync(ref: IncludeRef, unit: Unit, options: AsyncExpandOptions): Promise<string | undefined> {
  try {
    return await options.loader.resolve(requestFor(ref, unit));
  } catch (error) {
    return rethrowUnlessIgnorable(error, options);
  }
}

/**
 * Build the resolve request for an include reference.
 *
 * @param ref - Include reference
 * @param unit - Template the reference appears in
 * @returns Resolve request
 */
function requestFor(ref: IncludeRef, unit: Unit): { name: string; from?: string; include: true } {
  return { name: ref.name, from: unit.id === '' ? undefined : unit.id, include: true };
}

/**
 * Decide whether a resolution failure may be ignored.
 *
 * @param error - Failure from the loader
 * @param options - Expansion settings
 * @returns undefined when the failure is an ignorable missing template
 * @throws The original error otherwise
 */
function rethrowUnlessIgnorable(error: unknown, options: { onMissing: 'throw' | 'ignore' }): undefined {
  if (error instanceof TemplateNotFoundError && options.onMissing === 'ignore') {
    return undefined;
  }
  throw error;
}

/**
 * Splice the collected templates into one text.
 *
 * @param root - Entry template
 * @param units - Every reachable template
 * @param maxDepth - Maximum include nesting; zero or less means unlimited
 * @returns Flattened text, its segment map and its source map
 */
function assemble(
  root: Unit,
  units: Map<string, Unit>,
  maxDepth: number
): { text: string; segments: SourceSegment[]; map: SourceMap } {
  const parts: string[] = [];
  const segments: SourceSegment[] = [];
  const stretches: MappedStretch[] = [];
  let length = 0;

  /**
   * Append one stretch of a template's own text.
   *
   * @param unit - Template it came from
   * @param start - Offset within that template
   * @param end - Offset just past the stretch
   */
  function push(unit: Unit, start: number, end?: number): void {
    const text = unit.template.text.slice(start, end);
    if (text.length === 0) return;

    segments.push({ outputStart: length, id: unit.id, sourceStart: start });
    stretches.push({ outputStart: length, template: unit.template, sourceStart: start });
    parts.push(text);
    length += text.length;
  }

  /**
   * Emit one template, recursing through its includes.
   *
   * @param unit - Template to emit
   * @param depth - Include nesting depth
   * @param stack - Templates currently being emitted, for cycle detection
   */
  function emit(unit: Unit, depth: number, stack: ReadonlySet<string>): void {
    if (maxDepth > 0 && depth >= maxDepth) {
      throw templateError(
        `HTML::Template->new() : likely recursive includes - parsed ${maxDepth} files deep and giving up (set max_includes higher to allow deeper recursion).`
      );
    }

    if (stack.has(unit.id)) {
      throw templateError(
        `HTML::Template->new() : likely recursive includes - ${unit.id} includes itself directly or indirectly.`
      );
    }

    const nested = new Set(stack).add(unit.id);
    let cursor = 0;

    for (const [index, ref] of unit.refs.entries()) {
      push(unit, cursor, ref.start);

      const targetId = unit.targets.get(index);
      const target = targetId === undefined ? undefined : units.get(targetId);
      if (target) {
        emit(target, depth + 1, nested);
      }

      cursor = ref.end;
    }

    push(unit, cursor);
  }

  emit(root, 0, new Set());

  return { text: parts.join(''), segments, map: new SourceMap(stretches) };
}
