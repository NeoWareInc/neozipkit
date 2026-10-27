declare module 'pako' {
  export function deflateRaw(data: Uint8Array | Buffer, options?: any): Buffer;
  export function inflateRaw(data: Uint8Array | Buffer): Buffer;
}
