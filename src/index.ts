/**
 * node-perl-html-template
 * TypeScript/ESM port of Perl's HTML::Template module v2.98 core API and template syntax
 *
 * @packageDocumentation
 * @module node-perl-html-template
 * @author libraz <libraz@libraz.net>
 */

// Main class
export { HTMLTemplate } from './HTMLTemplate.js';

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
  QueryResult
} from './types.js';

// Version
export { version } from './version.js';
