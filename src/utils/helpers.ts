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
// Function type is needed for compatibility with Perl's lazy value callbacks
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

/**
 * Check if value is a plain object (not array, not null)
 *
 * @param value - Value to check
 * @returns True if value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if value is a non-empty string
 *
 * @param value - Value to check
 * @returns True if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if value is truthy (for template conditions)
 * Compatible with Perl's truthiness:
 * - undefined, null, false, 0, '', '0' are falsy
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
  if (value === 0 || value === '' || value === '0') {
    return false;
  }
  // Empty arrays are falsy (for loop conditions)
  if (Array.isArray(value) && value.length === 0) {
    return false;
  }
  // Non-empty arrays are truthy
  if (Array.isArray(value)) {
    return true;
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
 * Convert value to string for output
 * Handles special cases: undefined/null become empty string
 *
 * @param value - Value to convert
 * @returns String representation
 */
export function valueToString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // For objects/arrays, convert to string (shouldn't normally happen)
  return String(value);
}

/**
 * Deep clone an object using JSON serialization
 * Fast but only works with JSON-serializable data
 *
 * @param obj - Object to clone
 * @returns Cloned object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
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

/**
 * Escape special characters for regex
 * Used when converting strings to regex patterns
 *
 * @param str - String to escape
 * @returns Escaped string safe for use in RegExp
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate a fast hash code for a string
 * Simple DJB2 hash algorithm - fast and good enough for cache keys
 *
 * @param str - String to hash
 * @returns Hash code as 32-bit integer
 */
export function hashCode(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + charCode (optimized with bitwise ops for speed)
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    // Keep within 32-bit integer range
    hash |= 0;
  }
  return hash;
}

/**
 * Array join optimized for V8
 * Pre-allocate result string when possible
 *
 * @param parts - Array of strings to join
 * @param separator - Separator string (default: empty)
 * @returns Joined string
 */
export function fastJoin(parts: string[], separator: string = ''): string {
  // For empty or single-element arrays, optimize
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] ?? '';

  // Use native join (V8 optimizes this well)
  return parts.join(separator);
}

/**
 * Check if two arrays are equal (shallow comparison)
 * Used for cache validation
 *
 * @param a - First array
 * @param b - Second array
 * @returns True if arrays have same length and elements
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Merge two objects (shallow)
 * Second object properties override first
 *
 * @param base - Base object
 * @param override - Override object
 * @returns Merged object
 */
export function mergeObjects<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  return { ...base, ...override };
}

/**
 * Get property safely with undefined check
 * Prevents TypeScript errors when accessing potentially undefined objects
 *
 * @param obj - Object to access
 * @param key - Property key
 * @returns Property value or undefined
 */
export function safeGet<T, K extends keyof T>(obj: T | undefined | null, key: K): T[K] | undefined {
  return obj?.[key];
}

/**
 * Assert that a value is defined (not null/undefined)
 * Throws error if value is null or undefined
 *
 * @param value - Value to check
 * @param message - Error message if assertion fails
 * @returns Value (with type narrowed to non-nullable)
 */
export function assertDefined<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

/**
 * Clamp a number between min and max
 *
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check if running in debug mode
 * Checks DEBUG environment variable
 *
 * @returns True if debug mode is enabled
 */
export function isDebugMode(): boolean {
  return process.env.DEBUG === 'true' || process.env.DEBUG === '1';
}

/**
 * Log debug message if debug mode is enabled
 *
 * @param message - Message to log
 * @param args - Additional arguments
 */
export function debugLog(message: string, ...args: unknown[]): void {
  if (isDebugMode()) {
    console.error(`[DEBUG] ${message}`, ...args);
  }
}
