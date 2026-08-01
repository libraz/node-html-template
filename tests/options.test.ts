/**
 * Option handling tests
 *
 * Covers the parts of src/options.ts that the Perl compatibility suite cannot
 * reach, because they concern process-wide state rather than one template.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { HTMLTemplate } from '../src/index.js';
import { resetGlobalOptions } from '../src/options.js';

describe('HTMLTemplate.config()', () => {
  afterEach(() => {
    resetGlobalOptions();
  });

  it('applies global defaults to templates created afterwards', () => {
    HTMLTemplate.config({ default_escape: 'html' });

    const tmpl = new HTMLTemplate({ scalarref: '<TMPL_VAR NAME="v">' });
    tmpl.param('v', '<x>');

    expect(tmpl.output()).toBe('&lt;x&gt;');
  });

  it('lets a constructor option override a global default', () => {
    HTMLTemplate.config({ default_escape: 'html' });

    const tmpl = new HTMLTemplate({ scalarref: '<TMPL_VAR NAME="v">', default_escape: 'none' });
    tmpl.param('v', '<x>');

    expect(tmpl.output()).toBe('<x>');
  });

  it('accumulates list-valued options instead of replacing them', () => {
    HTMLTemplate.config({ path: ['/first'] });
    HTMLTemplate.config({ path: ['/second'] });

    expect(HTMLTemplate.config().path).toEqual(['/first', '/second']);
  });

  it('replaces scalar options', () => {
    HTMLTemplate.config({ max_includes: 3 });
    HTMLTemplate.config({ max_includes: 7 });

    expect(HTMLTemplate.config().max_includes).toBe(7);
  });

  it('returns the current options without changing them', () => {
    const before = HTMLTemplate.config();
    expect(HTMLTemplate.config()).toEqual(before);
  });

  it('is restored to defaults by resetGlobalOptions', () => {
    HTMLTemplate.config({ default_escape: 'html', path: ['/somewhere'] });
    resetGlobalOptions();

    expect(HTMLTemplate.config().default_escape).toBe('none');
    expect(HTMLTemplate.config().path).toEqual([]);
  });
});

describe('option validation', () => {
  it('rejects a template with no source', () => {
    expect(() => new HTMLTemplate({})).toThrow(/multiple \(or no\) template sources/);
  });

  it('rejects a template with two sources', () => {
    expect(() => new HTMLTemplate({ scalarref: 'a', arrayref: ['b'] })).toThrow(/multiple \(or no\) template sources/);
  });

  it('rejects caching a non-file source', () => {
    expect(() => new HTMLTemplate({ scalarref: 'a', cache: true })).toThrow(/Cannot have caching/);
  });

  it('rejects file_cache without a directory', () => {
    expect(() => new HTMLTemplate({ filename: 'x.tmpl', file_cache: true })).toThrow(/file_cache_dir/);
  });

  it('rejects utf8 combined with open_mode', () => {
    expect(() => new HTMLTemplate({ scalarref: 'a', utf8: true, open_mode: 'latin1' })).toThrow(
      /cannot be used at the same time/
    );
  });

  it('rejects an unknown default_escape', () => {
    expect(() => new HTMLTemplate({ scalarref: 'a', default_escape: 'xml' as never })).toThrow(
      /Invalid setting for default_escape/
    );
  });

  it('rejects an associate object without param()', () => {
    expect(() => new HTMLTemplate({ scalarref: 'a', associate: {} as never })).toThrow(/lacks a param\(\) method/);
  });

  it('rejects type without source', () => {
    expect(() => new HTMLTemplate({ type: 'scalarref' })).toThrow(/no 'source'/);
  });

  it('rejects an unknown type', () => {
    expect(() => new HTMLTemplate({ type: 'wat' as never, source: 'a' })).toThrow(/invalid type parameter/);
  });
});
