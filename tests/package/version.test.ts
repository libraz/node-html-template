/**
 * Package metadata tests
 * Pins the invariants that keep the published artifact honest
 */

import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { version } from '../../src/index.js';

describe('version', () => {
  it('matches package.json', () => {
    expect(version).toBe(pkg.version);
  });

  it('is a semver string', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
  });
});
