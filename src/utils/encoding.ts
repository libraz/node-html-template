/**
 * Encoding utilities
 * Handle file encoding and character set conversions
 *
 * @module utils/encoding
 */

import { readFileSync } from 'node:fs';

/**
 * Read file with specified encoding
 * Supports all Node.js buffer encodings
 *
 * @param filepath - Path to file
 * @param encoding - Encoding to use (default: 'utf-8')
 * @returns File content as string
 */
export function readFileWithEncoding(filepath: string, encoding?: BufferEncoding): string {
  const enc = encoding || 'utf-8';
  return readFileSync(filepath, { encoding: enc });
}

/**
 * Detect if string contains valid UTF-8
 * Simple heuristic check for UTF-8 validity
 *
 * @param str - String to check
 * @returns True if string appears to be valid UTF-8
 */
export function isValidUtf8(str: string): boolean {
  try {
    // Try to encode/decode - if it throws, it's not valid UTF-8
    const buffer = Buffer.from(str, 'utf-8');
    const decoded = buffer.toString('utf-8');
    return decoded === str;
  } catch {
    return false;
  }
}

/**
 * Normalize line endings to Unix style (\n)
 * Converts Windows (\r\n) and Mac (\r) line endings
 *
 * @param content - Content with mixed line endings
 * @returns Content with normalized line endings
 */
export function normalizeLineEndings(content: string): string {
  // Replace \r\n with \n, then replace remaining \r with \n
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Convert buffer to string with encoding detection fallback
 * Tries UTF-8 first, falls back to latin1 if UTF-8 fails
 *
 * @param buffer - Buffer to convert
 * @returns Decoded string
 */
export function bufferToString(buffer: Buffer): string {
  try {
    // Try UTF-8 first
    const str = buffer.toString('utf-8');
    // Validate UTF-8
    if (isValidUtf8(str)) {
      return str;
    }
  } catch {
    // Fall through to latin1
  }

  // Fallback to latin1 (always succeeds)
  return buffer.toString('latin1');
}

/**
 * Check if string is a valid Node.js buffer encoding
 *
 * @param encoding - Encoding name to check
 * @returns True if valid encoding
 */
function isValidBufferEncoding(encoding: string): encoding is BufferEncoding {
  const validEncodings: BufferEncoding[] = [
    'ascii',
    'utf8',
    'utf-8',
    'utf16le',
    'utf-16le',
    'ucs2',
    'ucs-2',
    'base64',
    'base64url',
    'latin1',
    'binary',
    'hex'
  ];
  return validEncodings.includes(encoding as BufferEncoding);
}

/**
 * Normalize encoding name to Node.js format
 * Maps common encoding names to Node.js equivalents
 *
 * @param name - Encoding name
 * @returns Normalized Node.js encoding name
 */
export function normalizeEncodingName(name: string): BufferEncoding {
  const normalized = name.toLowerCase().replace(/[_-]/g, '');

  // Map common encoding names
  const mappings: Record<string, BufferEncoding> = {
    utf8: 'utf-8',
    utf16: 'utf-16le',
    utf16le: 'utf-16le',
    utf16be: 'utf-16le', // Node.js only supports LE
    latin1: 'latin1',
    iso88591: 'latin1',
    ascii: 'ascii',
    binary: 'binary',
    base64: 'base64',
    hex: 'hex',
    ucs2: 'utf-16le'
  };

  const mapped = mappings[normalized];
  if (mapped) {
    return mapped;
  }

  // Try to use as-is if it's a valid BufferEncoding
  if (isValidBufferEncoding(name)) {
    return name as BufferEncoding;
  }

  // Default to UTF-8
  return 'utf-8';
}

/**
 * Get encoding from open_mode option
 * Converts Perl-style encoding names to Node.js encodings
 *
 * @param openMode - Open mode string (e.g., '<:encoding(utf8)', 'utf-16le')
 * @returns Node.js encoding name
 */
export function parseOpenMode(openMode: string): BufferEncoding {
  // Handle Perl-style encoding specification: '<:encoding(utf8)'
  const match = openMode.match(/encoding\(([^)]+)\)/);
  if (match?.[1]) {
    return normalizeEncodingName(match[1]);
  }

  // Direct encoding name
  return normalizeEncodingName(openMode);
}

/**
 * Estimate if content is likely binary data
 * Checks for null bytes and high ratio of non-printable characters
 *
 * @param content - Content to check
 * @returns True if content appears to be binary
 */
export function isBinaryContent(content: string): boolean {
  // Check for null bytes (strong indicator of binary)
  if (content.includes('\0')) {
    return true;
  }

  // Count non-printable characters
  let nonPrintable = 0;
  const maxCheck = Math.min(content.length, 8192); // Check first 8KB

  for (let i = 0; i < maxCheck; i++) {
    const code = content.charCodeAt(i);
    // Non-printable ASCII (except whitespace: \t, \n, \r)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintable++;
    }
  }

  // If more than 30% non-printable, likely binary
  return nonPrintable / maxCheck > 0.3;
}
