declare module 'pako' {
  export function deflateRaw(data: Uint8Array | Buffer, options?: any): Buffer;
  export function inflateRaw(data: Uint8Array | Buffer): Buffer;
}

declare module 'opentimestamps' {
  export class Ops {
    static OpSHA256: any;
  }
  export class DetachedTimestampFile {
    static fromHash(op: any, digest: Buffer): DetachedTimestampFile;
    static deserialize(ots: Buffer): DetachedTimestampFile;
    serializeToBytes(): Uint8Array;
    timestamp?: {
      allAttestations(): string[];
    };
  }
  export function stamp(detached: DetachedTimestampFile[]): Promise<void>;
  export function upgrade(ots: DetachedTimestampFile): Promise<boolean>;
  export function verify(ots: DetachedTimestampFile, hash: DetachedTimestampFile, options?: any): Promise<any>;
  export function info(detached: DetachedTimestampFile): string;
} 