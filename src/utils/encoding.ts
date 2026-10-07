/**
 * Encoding names
 *
 * Templates written for the Perl module carry their encoding as an `open_mode`
 * string, so the filesystem loader accepts that spelling alongside Node's.
 * A name resolves to one exact decoding or is rejected: Node's own decoder
 * where it handles the encoding byte for byte, a WHATWG `TextDecoder` for the
 * rest, and `utf-16` sniffs the byte order mark as Perl's `UTF-16` does.
 *
 * @module utils/encoding
 */

/** Encodings `Buffer#toString` decodes exactly as named */
const BUFFER_ENCODINGS: ReadonlySet<string> = new Set<BufferEncoding>([
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
]);

/** Spellings, with `-` and `_` removed, mapped to the encoding they name */
const ALIASES: Readonly<Record<string, string>> = {
  utf8: 'utf-8',
  utf16: 'utf-16',
  utf16le: 'utf-16le',
  utf16be: 'utf-16be',
  ucs2: 'utf-16le',
  latin1: 'latin1',
  iso88591: 'latin1',
  ascii: 'ascii',
  binary: 'binary',
  base64: 'base64',
  hex: 'hex',
  // Perl Encode names TextDecoder does not know as labels
  shiftjis: 'shift_jis',
  cp932: 'shift_jis'
};

/** Byte-order-mark detected UTF-16, as Perl's `UTF-16` */
const UTF16_BOM = 'utf-16';

/**
 * Turns a file's bytes into text.
 *
 * @param bytes - File contents
 * @param id - Template identifier, named in errors
 */
export type Decoder = (bytes: Uint8Array, id: string) => string;

/**
 * Resolve an encoding name to the encoding it names.
 *
 * @param name - Encoding name, in Node or Perl spelling
 * @returns Canonical encoding name
 * @throws {Error} When the name is not an encoding this loader can decode
 */
export function normalizeEncodingName(name: string): string {
  const alias = ALIASES[name.toLowerCase().replace(/[_-]/g, '')];
  if (alias) return alias;

  if (BUFFER_ENCODINGS.has(name)) return name;

  try {
    return new TextDecoder(name).encoding;
  } catch {
    throw new Error(`Unsupported template encoding '${name}'`);
  }
}

/**
 * Resolve an encoding name written in either Node or Perl spelling.
 *
 * @param openMode - Encoding name (e.g. 'utf-16le', '<:encoding(utf8)', ':raw')
 * @returns Canonical encoding name
 * @throws {Error} When the name is not an encoding this loader can decode
 */
export function parseOpenMode(openMode: string): string {
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

/**
 * Build the decoder for a canonical encoding name.
 *
 * @param encoding - Name returned by {@link parseOpenMode}
 * @returns Decoder for that encoding
 */
export function decoderFor(encoding: string): Decoder {
  if (BUFFER_ENCODINGS.has(encoding)) {
    const bufferEncoding = encoding as BufferEncoding;
    return (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(bufferEncoding);
  }

  if (encoding === UTF16_BOM) {
    const little = new TextDecoder('utf-16le');
    const big = new TextDecoder('utf-16be');
    return (bytes, id) => {
      if (bytes[0] === 0xff && bytes[1] === 0xfe) return little.decode(bytes);
      if (bytes[0] === 0xfe && bytes[1] === 0xff) return big.decode(bytes);
      throw new Error(`${id}: UTF-16 text has no byte order mark; name utf-16le or utf-16be instead`);
    };
  }

  const decoder = new TextDecoder(encoding);
  return (bytes) => decoder.decode(bytes);
}
