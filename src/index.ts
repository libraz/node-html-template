/**
 * node-perl-html-template
 * Perl HTML::Template's template syntax, with a TypeScript API
 *
 * @packageDocumentation
 * @module node-perl-html-template
 * @author libraz <libraz@libraz.net>
 */

// Compilation and rendering
export type { CacheOptions } from './api/cache.js';
export { compile, compileAsync, render } from './api/compile.js';
export { Environment, type EnvironmentOptions } from './api/Environment.js';
export { Template } from './api/Template.js';
export type {
  AsyncCompileOptions,
  CompileOptions,
  IncludeOptions,
  LegacyOptions,
  OutputSink,
  ParamInfo,
  RenderOptions,
  RowSource,
  Scalar,
  ScalarSource,
  TemplateData,
  TemplateShape
} from './api/types.js';
export { TemplateNotFoundError } from './loader/errors.js';
// Template sources. The filesystem loader lives in the `loaders` subpath so
// that importing this entry never pulls in `node:fs`.
export { memoryLoader } from './loader/memory.js';
export type { ResolveRequest, SyncTemplateLoader, TemplateLoader, TemplateResource } from './loader/types.js';
export type { ParamUsage } from './parser/shape.js';

// Export public types
export type {
  EscapeType,
  Filter,
  LazyLoopValue,
  LazyValue,
  LoopData,
  LoopDataItem,
  ParamValue,
  SourceLoc
} from './types.js';

// Version
export { version } from './version.js';
