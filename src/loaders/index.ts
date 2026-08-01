/**
 * Filesystem loaders
 *
 * Kept out of the main entry point so the core carries no `node:fs` import and
 * can be bundled for a runtime that has no filesystem at all.
 *
 * @packageDocumentation
 * @module @libraz/html-template/loaders
 */

export { fileVersion, type NodeFileLoaderOptions, nodeFileLoader } from '../loader/nodeFile.js';
