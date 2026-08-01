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
import type { SyncTemplateLoader, TemplateLoader } from '../loader/types.js';
import { type IncludeRef, scanIncludes } from '../parser/scanIncludes.js';
import { createError } from '../utils/helpers.js';

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
   * Preprocessing applied to each included template, matching whatever the
   * entry template already went through.
   */
  prepare(text: string): string;
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

  /** Version of every template that went into it, for cache validation */
  versions: Map<string, string | undefined>;

  /** Map from offsets in `text` back to the templates they came from */
  segments: SourceSegment[];
}

/**
 * One template's text and the includes found in it.
 */
interface Unit {
  id: string;
  text: string;
  refs: IncludeRef[];

  /** Resolved id per ref index; absent when the include was missing and ignored */
  targets: Map<number, string>;

  version?: string;
}

/**
 * Expand every include in a template.
 *
 * @param rootText - Entry template text, already preprocessed
 * @param rootId - Canonical id of the entry template, when it came from a loader
 * @param options - Expansion settings
 * @returns Flattened text with its provenance
 * @throws Error on a cycle, on exceeding the depth limit, or on a missing
 *   include when `onMissing` is `throw`
 */
export function expandIncludes(rootText: string, rootId: string | undefined, options: ExpandOptions): ExpandedSource {
  const id = rootId ?? '';
  const units = collect(rootText, id, options);
  const root = units.get(id);

  if (!root) {
    return { text: rootText, versions: new Map(), segments: [] };
  }

  const versions = new Map<string, string | undefined>();
  for (const unit of units.values()) {
    if (unit.id !== '') {
      versions.set(unit.id, unit.id === id ? options.loader.version?.(id) : unit.version);
    }
  }

  return { ...assemble(root, units, options), versions };
}

/**
 * Expand every include in a template, reading through an asynchronous loader.
 *
 * Each level of the include graph is resolved and read concurrently, so depth
 * rather than template count bounds the wait. The assembly pass is the same
 * pure code the synchronous entry point uses, so both produce identical text.
 *
 * @param rootText - Entry template text, already preprocessed
 * @param rootId - Canonical id of the entry template, when it came from a loader
 * @param options - Expansion settings
 * @returns Flattened text with its provenance
 * @throws Error on a cycle, on exceeding the depth limit, or on a missing
 *   include when `onMissing` is `throw`
 */
export async function expandIncludesAsync(
  rootText: string,
  rootId: string | undefined,
  options: AsyncExpandOptions
): Promise<ExpandedSource> {
  const id = rootId ?? '';
  const units = await collectAsync(rootText, id, options);
  const root = units.get(id);

  if (!root) {
    return { text: rootText, versions: new Map(), segments: [] };
  }

  const versions = new Map<string, string | undefined>();
  for (const unit of units.values()) {
    if (unit.id !== '') {
      versions.set(unit.id, unit.id === id ? await options.loader.version?.(id) : unit.version);
    }
  }

  return { ...assemble(root, units, options), versions };
}

/**
 * Read every template reachable from the entry point, breadth first.
 *
 * Each template is read at most once, so a header included from a dozen places
 * costs one read, and a cycle terminates here rather than looping.
 *
 * @param rootText - Entry template text
 * @param rootId - Canonical id of the entry template
 * @param options - Expansion settings
 * @returns Every reachable template, keyed by id
 */
function collect(rootText: string, rootId: string, options: ExpandOptions): Map<string, Unit> {
  const units = new Map<string, Unit>();
  const root: Unit = { id: rootId, text: rootText, refs: scanIncludes(rootText), targets: new Map() };
  units.set(rootId, root);

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
        const text = options.prepare(resource.text);
        const child: Unit = {
          id: targetId,
          text,
          refs: scanIncludes(text),
          targets: new Map(),
          version: resource.version
        };

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
 * @param rootText - Entry template text
 * @param rootId - Canonical id of the entry template
 * @param options - Expansion settings
 * @returns Every reachable template, keyed by id
 */
async function collectAsync(rootText: string, rootId: string, options: AsyncExpandOptions): Promise<Map<string, Unit>> {
  const units = new Map<string, Unit>();
  const root: Unit = { id: rootId, text: rootText, refs: scanIncludes(rootText), targets: new Map() };
  units.set(rootId, root);

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

      const text = options.prepare(resource.text);
      const child: Unit = {
        id,
        text,
        refs: scanIncludes(text),
        targets: new Map(),
        version: resource.version
      };

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
 * @param options - Expansion settings
 * @returns Flattened text and its segment map
 */
function assemble(
  root: Unit,
  units: Map<string, Unit>,
  options: Pick<ExpandOptions, 'maxDepth'>
): { text: string; segments: SourceSegment[] } {
  const parts: string[] = [];
  const segments: SourceSegment[] = [];
  let length = 0;

  /**
   * Append one stretch of a template's own text.
   *
   * @param text - Text to append
   * @param id - Template it came from
   * @param sourceStart - Offset within that template
   */
  function push(text: string, id: string, sourceStart: number): void {
    if (text.length === 0) return;

    segments.push({ outputStart: length, id, sourceStart });
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
    if (options.maxDepth > 0 && depth >= options.maxDepth) {
      throw createError(
        `HTML::Template->new() : likely recursive includes - parsed ${options.maxDepth} files deep and giving up (set max_includes higher to allow deeper recursion).`
      );
    }

    if (stack.has(unit.id)) {
      throw createError(
        `HTML::Template->new() : likely recursive includes - ${unit.id} includes itself directly or indirectly.`
      );
    }

    const nested = new Set(stack).add(unit.id);
    let cursor = 0;

    for (const [index, ref] of unit.refs.entries()) {
      push(unit.text.slice(cursor, ref.start), unit.id, cursor);

      const targetId = unit.targets.get(index);
      const target = targetId === undefined ? undefined : units.get(targetId);
      if (target) {
        emit(target, depth + 1, nested);
      }

      cursor = ref.end;
    }

    push(unit.text.slice(cursor), unit.id, cursor);
  }

  emit(root, 0, new Set());

  return { text: parts.join(''), segments };
}
