/**
 * Type generation command
 *
 * Split from the executable so the whole command can be driven from a test:
 * argv in, exit code out, with every stream and every file access passed in.
 *
 * @module cli/run
 */

import { parseArgs } from 'node:util';
import { generateModule, pascalCase, type TemplateEntry } from '../codegen/generate.js';
import { TemplateNotFoundError } from '../loader/errors.js';
import type { ResolveRequest, SyncTemplateLoader } from '../loader/types.js';

/** Everything the command touches outside itself */
export interface CommandIO {
  /** Write a line of normal output */
  out(text: string): void;

  /** Write a line of diagnostic output */
  err(text: string): void;

  /** Read a UTF-8 text file */
  readFile(path: string): string;

  /** Write a UTF-8 text file, creating it if needed */
  writeFile(path: string, text: string): void;

  /** Report whether a path exists */
  exists(path: string): boolean;

  /** Report whether a path names a directory */
  isDirectory(path: string): boolean;

  /** List a directory's files, recursively, as paths relative to it */
  listFiles(path: string): string[];

  /** Join path segments */
  join(...segments: string[]): string;

  /** Return a path's final segment without its extension */
  stem(path: string): string;

  /** Return a path's extension, including the leading dot */
  extension(path: string): string;

  /** Return a path's directory */
  directory(path: string): string;
}

const USAGE = `Usage: html-template-codegen <path...> [options]

Generates a TypeScript interface describing the parameters each template
declares. A path may be a template file or a directory to search.

Options:
  -o, --out <file>   Write to a file instead of standard output
      --check        Write nothing; exit 1 if --out is missing or out of date
      --required     Make every property required
      --split        Give each loop's row type its own named interface
      --ext <list>   Comma-separated extensions to pick up (default: .tmpl,.html)
      --suffix <s>   Appended to each generated interface name (default: Data)
      --import <mod> Module the value types are imported from
  -h, --help         Show this message`;

/**
 * Run the command.
 *
 * @param argv - Arguments, excluding the executable and script names
 * @param io - Streams and file access
 * @returns Process exit code
 */
export function run(argv: readonly string[], io: CommandIO): number {
  let parsed: ReturnType<typeof parse>;

  try {
    parsed = parse(argv);
  } catch (error) {
    io.err(message(error));
    io.err(USAGE);
    return 2;
  }

  const { values, positionals } = parsed;

  if (values.help) {
    io.out(USAGE);
    return 0;
  }

  if (positionals.length === 0) {
    io.err('No template paths given.');
    io.err(USAGE);
    return 2;
  }

  const extensions = String(values.ext ?? '.tmpl,.html')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.startsWith('.') ? entry : `.${entry}`));

  let files: string[];
  try {
    files = collect(positionals, extensions, io);
  } catch (error) {
    io.err(message(error));
    return 2;
  }

  if (files.length === 0) {
    io.err(`No templates found matching ${extensions.join(', ')}.`);
    return 2;
  }

  const suffix = values.suffix ?? 'Data';
  let generated: string;

  try {
    const entries: TemplateEntry[] = files.map((file) => ({
      name: `${pascalCase(io.stem(file))}${suffix}`,
      source: io.readFile(file),
      filename: file
    }));

    generated = generateModule(entries, {
      required: Boolean(values.required),
      split: Boolean(values.split),
      importFrom: values.import,
      compile: { loader: loaderOver(io, [...new Set(files.map((file) => io.directory(file)))]) }
    });
  } catch (error) {
    io.err(message(error));
    return 1;
  }

  const out = values.out;

  if (values.check) {
    if (!out) {
      io.err('--check needs --out to compare against.');
      return 2;
    }

    const current = io.exists(out) ? io.readFile(out) : undefined;
    if (current === generated) return 0;

    io.err(`${out} is out of date. Run without --check to rewrite it.`);
    return 1;
  }

  if (out) {
    io.writeFile(out, generated);
    return 0;
  }

  io.out(generated);
  return 0;
}

/**
 * Build a loader that reads includes through the command's own bindings.
 *
 * Reading templates one way and their includes another would make the command
 * behave differently from how it can be tested, so both go through the same
 * place.
 *
 * @param io - File access
 * @param paths - Directories searched when a name resolves nowhere else
 * @returns Loader over the command's bindings
 */
function loaderOver(io: CommandIO, paths: readonly string[]): SyncTemplateLoader {
  return {
    sync: true,

    resolve(request: ResolveRequest): string {
      const candidates = request.from ? [io.join(io.directory(request.from), request.name)] : [];
      candidates.push(...paths.map((path) => io.join(path, request.name)), request.name);

      for (const candidate of candidates) {
        if (io.exists(candidate) && !io.isDirectory(candidate)) return candidate;
      }

      throw new TemplateNotFoundError(request.name);
    },

    read: (id) => ({ id, text: io.readFile(id) })
  };
}

/**
 * Parse the command line.
 *
 * @param argv - Arguments, excluding the executable and script names
 * @returns Option values and positional arguments
 * @throws Error on an unknown or malformed option
 */
function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      check: { type: 'boolean', default: false },
      required: { type: 'boolean', default: false },
      split: { type: 'boolean', default: false },
      ext: { type: 'string' },
      suffix: { type: 'string' },
      import: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false }
    }
  });
}

/**
 * Expand the given paths into a sorted list of template files.
 *
 * @param paths - Files and directories named on the command line
 * @param extensions - Extensions picked up when searching a directory
 * @param io - File access
 * @returns Template file paths
 * @throws Error naming a path that does not exist
 */
function collect(paths: readonly string[], extensions: readonly string[], io: CommandIO): string[] {
  const files = new Set<string>();

  for (const path of paths) {
    if (!io.exists(path)) {
      throw new Error(`No such file or directory: ${path}`);
    }

    if (!io.isDirectory(path)) {
      files.add(path);
      continue;
    }

    for (const entry of io.listFiles(path)) {
      const full = io.join(path, entry);
      if (extensions.includes(io.extension(full))) files.add(full);
    }
  }

  return [...files].sort();
}

/**
 * Reduce a thrown value to a message.
 *
 * @param error - Thrown value
 * @returns Message text
 */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
