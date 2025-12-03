// Buffer polyfill injection point
// This file is injected by esbuild to provide Buffer support in browser
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

