/**
 * Cache validation
 *
 * @module cache/validate
 */

import { fileVersion } from '../loader/nodeFile.js';

/**
 * Check whether every template a cached entry was built from is unchanged.
 *
 * An undefined version is the loader declaring that resource immutable, so
 * there is nothing to recheck.
 *
 * @param versions - Version recorded per template id at compile time
 * @returns True when the entry is still valid
 */
export function versionsUnchanged(versions: Map<string, string | undefined>): boolean {
  for (const [id, expected] of versions) {
    if (expected === undefined) continue;
    if (fileVersion(id) !== expected) return false;
  }

  return true;
}
