// ============================================================================
// NeoZipKit Version Info
// ============================================================================

export interface NeoZipKitInfo {
  version: string;
  releaseDate: string;
}

export const NEOZIPKIT_INFO: NeoZipKitInfo = {
  version: '0.70.0-alpha',
  releaseDate: '2024-10-04'
};

// ============================================================================
// File Data Interfaces
// ============================================================================

export interface FileData {
  name: string;
  size: number;
  lastModified: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ZipFileEntry {
  filename: string;
  comment?: string | null;
  fileData?: FileData;
  fileBuffer?: Buffer | null;
  isDirectory: boolean;
  isMetaData: boolean;
  isEncrypted: boolean;
  sha256?: string | null;
}

// ============================================================================
// Support Interface
// ============================================================================

export interface Support {
  base64: boolean;
  array: boolean;
  string: boolean;
  isNode: boolean;
  buffer: boolean;
  uint8array: boolean;
  arrayBuffer: boolean;
  blob: boolean;
  streams: boolean;
  fileReader: boolean;
}

// ============================================================================
// Archive Statistics
// ============================================================================

export interface ArchiveStatistics {
  fileSize: number;
  created: Date;
  modified: Date;
  totalFiles: number;
  totalFolders: number;
  uncompressedSize: number;
  compressedSize: number;
  compressionRatio: number;
  averageCompressionRatio: number;
}
