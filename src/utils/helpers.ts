/**
 * Utility helper functions
 * General-purpose utilities used throughout the codebase
 *
 * @module utils/helpers
 */

/**
 * Check if value is a function
 * Used to detect lazy values (callbacks)
 *
 * @param value - Value to check
 * @returns True if value is a function
 */
// biome-ignore lint/complexity/noBannedTypes: Function type needed for lazy value callbacks compatibility
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

/**
 * Check if value is truthy (for template conditions)
 * Compatible with Perl's truthiness:
 * - undefined, null, false, 0, 0n, '', '0' are falsy
 * - Empty arrays are falsy
 * - Everything else is truthy
 *
 * @param value - Value to check
 * @returns True if value is truthy
 */
export function isTruthy(value: unknown): boolean {
  if (value === undefined || value === null || value === false) {
    return false;
  }
  if (value === 0 || value === 0n || value === '' || value === '0') {
    return false;
  }
  if (Array.isArray(value) && value.length === 0) {
    return false;
  }
  return true;
}

/**
 * Normalize parameter name (lowercase unless case_sensitive)
 * Perl HTML::Template is case-insensitive by default
 *
 * @param name - Parameter name
 * @param caseSensitive - Whether to preserve case
 * @returns Normalized name
 */
export function normalizeParamName(name: string, caseSensitive: boolean): string {
  return caseSensitive ? name : name.toLowerCase();
}

/**
 * Create error message with file context
 *
 * @param message - Error message
 * @param filename - Optional filename for context
 * @param line - Optional line number
 * @returns Formatted error message
 */
export function createError(message: string, filename?: string, line?: number): Error {
  let msg = message;
  if (filename) {
    msg = `${message} in file ${filename}`;
  }
  if (line !== undefined) {
    msg = `${msg} at line ${line}`;
  }
  return new Error(msg);
}
