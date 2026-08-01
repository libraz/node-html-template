/**
 * node-perl-html-template
 * Perl HTML::Template's template syntax, with a TypeScript API
 *
 * @packageDocumentation
 * @module node-perl-html-template
 * @author libraz <libraz@libraz.net>
 */

// Compilation and rendering
export { compile, compileAsync, render } from './api/compile.js';
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
// Perl-compatible API
export { HTMLTemplate } from './HTMLTemplate.js';
export { TemplateNotFoundError } from './loader/errors.js';
// Template sources
export { memoryLoader } from './loader/memory.js';
export { type NodeFileLoaderOptions, nodeFileLoader } from './loader/nodeFile.js';
export type { ResolveRequest, SyncTemplateLoader, TemplateLoader, TemplateResource } from './loader/types.js';
export type { ParamUsage } from './parser/shape.js';

// Export public types
export type {
  AssociateObject,
  EscapeType,
  Filter,
  HTMLTemplateOptions,
  LazyLoopValue,
  LazyValue,
  LoopData,
  LoopDataItem,
  OutputOptions,
  ParamValue,
  QueryOptions,
  QueryResult,
  SourceLoc
} from './types.js';

// Version
export { version } from './version.js';
