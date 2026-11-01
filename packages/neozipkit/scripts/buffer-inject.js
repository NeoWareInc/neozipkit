/**
 * esbuild --inject shim: makes bare `Buffer` resolve to the `buffer` package
 * without assigning `globalThis.Buffer` (so host apps like ZipWiki need no shim).
 *
 * @see https://esbuild.github.io/api/#inject
 */
export { Buffer } from 'buffer';
