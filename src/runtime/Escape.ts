/**
 * Escape functions for TMPL_VAR values
 * HTML, JavaScript, and URL escaping compatible with Perl HTML::Template
 *
 * Performance optimized with lookup tables and precompiled regexes
 *
 * @module runtime/Escape
 */

import type { EscapeType } from '../types.js';

// ============================================================================
// HTML Escape
// ============================================================================

/**
 * HTML entity lookup table for fast escaping
 * Maps characters to their HTML entity equivalents
 */
const HTML_ESCAPE_TABLE: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;'
};

/**
 * Precompiled regex for HTML escaping
 * Matches any character that needs escaping
 */
const HTML_ESCAPE_REGEX = /[&"'<>]/g;

/**
 * Escape HTML entities
 * Compatible with Perl HTML::Template ESCAPE=HTML
 *
 * Escapes: & " ' < >
 *
 * @param str - String to escape
 * @returns HTML-escaped string
 *
 * @example
 * ```ts
 * escapeHtml('Hello <world> & "friends"')
 * // Returns: 'Hello &lt;world&gt; &amp; &quot;friends&quot;'
 * ```
 */
export function escapeHtml(str: string): string {
  return str.replace(HTML_ESCAPE_REGEX, (match) => HTML_ESCAPE_TABLE[match] ?? match);
}

// ============================================================================
// JavaScript Escape
// ============================================================================

/**
 * JavaScript escape lookup table
 * Maps characters to their escaped equivalents
 */
const JS_ESCAPE_TABLE: Record<string, string> = {
  '\\': '\\\\',
  "'": "\\'",
  '"': '\\"',
  '\n': '\\n',
  '\r': '\\r',
  '\u2028': '\\n', // Line separator
  '\u2029': '\\n\\n' // Paragraph separator
};

/**
 * Precompiled regex for JavaScript escaping
 * Matches any character that needs escaping
 */
const JS_ESCAPE_REGEX = /[\\"'\n\r\u2028\u2029]/g;

/**
 * Escape JavaScript string
 * Compatible with Perl HTML::Template ESCAPE=JS
 *
 * Escapes: \ ' " \n \r; U+2028 becomes `\n` and U+2029 becomes `\n\n`
 *
 * @param str - String to escape
 * @returns JavaScript-escaped string
 *
 * @example
 * ```ts
 * escapeJs("It's a \"test\"\nwith newlines")
 * // Returns: "It\\'s a \\"test\\"\\nwith newlines"
 * ```
 */
export function escapeJs(str: string): string {
  // Use lookup table for replacement
  return str.replace(JS_ESCAPE_REGEX, (match) => JS_ESCAPE_TABLE[match] ?? match);
}

// ============================================================================
// URL Escape
// ============================================================================

/** Characters Perl's ESCAPE=URL leaves as-is */
const URL_SAFE_REGEX = /^[A-Za-z0-9_.-]*$/;

/** A surrogate half with no partner */
const LONE_SURROGATE_REGEX = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Characters the built-in URI encoder leaves raw but Perl encodes */
const URL_EXTRA_REGEX = /[!'()*~]/g;

/**
 * Escape URL component
 * Compatible with Perl HTML::Template ESCAPE=URL
 *
 * Percent-encodes every UTF-8 byte except A-Z a-z 0-9 _ . - with uppercase
 * hex. A lone surrogate is encoded as U+FFFD (%EF%BF%BD), the same
 * substitution a UTF-8 output stream applies, so the function never throws.
 *
 * @param str - String to URL-escape
 * @returns URL-escaped string
 *
 * @example
 * ```ts
 * escapeUrl('hello world?foo=bar&baz')
 * // Returns: 'hello%20world%3Ffoo%3Dbar%26baz'
 * ```
 */
export function escapeUrl(str: string): string {
  if (URL_SAFE_REGEX.test(str)) {
    return str;
  }
  return encodeURIComponent(str.replace(LONE_SURROGATE_REGEX, '\uFFFD')).replace(
    URL_EXTRA_REGEX,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

// ============================================================================
// Main Escape Function
// ============================================================================

/**
 * Escape string based on escape type
 * Dispatches to appropriate escape function
 *
 * @param str - String to escape
 * @param escapeType - Type of escaping to apply
 * @returns Escaped string
 * @throws {Error} For a mode outside {@link EscapeType}
 *
 * @example
 * ```ts
 * escape('Hello <world>', 'html')
 * // Returns: 'Hello &lt;world&gt;'
 *
 * escape("It's a test", 'js')
 * // Returns: "It\\'s a test"
 *
 * escape('hello world', 'url')
 * // Returns: 'hello%20world'
 *
 * escape('no escaping', 'none')
 * // Returns: 'no escaping'
 * ```
 */
export function escapeValue(str: string, escapeType: EscapeType): string {
  switch (escapeType) {
    case 'html':
      return escapeHtml(str);
    case 'js':
      return escapeJs(str);
    case 'url':
      return escapeUrl(str);
    case 'none':
      return str;
    default:
      // Fail closed: every compile path validates the mode, so this is a bug
      throw new Error(`Unknown escape mode '${String(escapeType satisfies never)}'`);
  }
}
