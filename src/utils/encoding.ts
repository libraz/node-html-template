/**
 * Encoding names
 *
 * Templates written for the Perl module carry their encoding as an `open_mode`
 * string, so the filesystem loader accepts that spelling alongside Node's.
 *
 * @module utils/encoding
 */

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
 * Resolve an encoding name written in either Node or Perl spelling.
 *
 * @param openMode - Encoding name (e.g. 'utf-16le', '<:encoding(utf8)', ':raw')
 * @returns Node.js encoding name
 */
export function parseOpenMode(openMode: string): BufferEncoding {
  const lowerMode = openMode.toLowerCase();
  if (lowerMode.includes(':raw')) {
    return 'latin1';
  }

  // Handle Perl-style encoding specification: '<:encoding(utf8)'
  const match = openMode.match(/encoding\(([^)]+)\)/i);
  if (match?.[1]) {
    return normalizeEncodingName(match[1]);
  }

  // Direct encoding name
  return normalizeEncodingName(openMode);
}
