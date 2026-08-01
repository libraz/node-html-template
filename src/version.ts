/**
 * Package version.
 *
 * The value is substituted at build time from package.json, so the version
 * never has to be kept in sync by hand and the bundle stays free of any
 * filesystem access.
 *
 * @module version
 */

declare const __PKG_VERSION__: string;

export const version: string = __PKG_VERSION__;
