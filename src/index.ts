/**
 * node-perl-html-template
 * 100% compatible TypeScript/ESM port of Perl's HTML::Template module v2.98
 *
 * @packageDocumentation
 * @module node-perl-html-template
 * @author libraz <libraz@libraz.net>
 */

// Main class
export { HTMLTemplate } from './HTMLTemplate.js';

// Export public types
export type {
  HTMLTemplateOptions,
  EscapeType,
  LazyValue,
  LazyLoopValue,
  LoopDataItem,
  LoopData,
  ParamValue,
  AssociateObject,
  Filter,
  OutputOptions,
  QueryResult,
  QueryOptions
} from './types.js';

// Version
export const version = '1.1.0';
