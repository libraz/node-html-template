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
 * Escapes: \ ' " \n \r U+2028 U+2029
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

/**
 * Escape URL component
 * Compatible with Perl HTML::Template ESCAPE=URL
 *
 * Encodes all characters except: A-Z a-z 0-9 _ . -
 *
 * Uses percent-encoding (e.g., space becomes %20)
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
  // Use Node.js built-in encodeURIComponent (fastest)
  // It's more aggressive than needed, so we need to restore safe chars
  let encoded = encodeURIComponent(str);

  // encodeURIComponent encodes some chars we want to keep: - _ . ~
  // Perl HTML::Template only keeps: - _ .
  // So we need to restore those and encode ~
  encoded = encoded
    .replace(/%2D/g, '-') // Restore -
    .replace(/%5F/g, '_') // Restore _
    .replace(/%2E/g, '.') // Restore .
    .replace(/~/g, '%7E'); // Encode ~ (encodeURIComponent keeps it)

  return encoded;
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
      // Exhaustive check - TypeScript ensures this never happens
      return str;
  }
}
