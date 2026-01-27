// ======================================
//	Headers.ts
//  Copyright (c) 2024 NeoWare, Inc. All rights reserved.
// ======================================
// Zip File Format Constants

export const LOCAL_FILE_HEADER = 'PK\x03\x04';
export const CENTRAL_FILE_HEADER = 'PK\x01\x02';
export const CENTRAL_DIRECTORY_END = 'PK\x05\x06';
export const ZIP64_CENTRAL_DIRECTORY_LOCATOR = 'PK\x06\x07';
export const ZIP64_CENTRAL_DIRECTORY_END = 'PK\x06\x06';
export const DATA_DESCRIPTOR = 'PK\x07\x08';

export const TIMESTAMP_SUBMITTED = 'META-INF/TS-SUBMIT.OTS';
export const TIMESTAMP_METADATA = 'META-INF/TIMESTAMP.OTS';
export const TOKENIZED_METADATA = 'META-INF/NZIP.TOKEN';

// Local file header
export const LOCAL_HDR = {
  SIZE:       30,     // LOC header size in bytes
  SIGNATURE:  0x04034b50,  // "PK\003\004"
  VER_EXTRACT: 4,     // version needed to extract
  FLAGS:       6,     // general purpose bit flag
  COMPRESSION: 8,     // compression method
  TIMEDATE_DOS: 10,   // modification time (2 bytes time, 2 bytes date)
  CRC:        14,     // uncompressed file crc-32 value
  CMP_SIZE:   18,     // compressed size
  UNCMP_SIZE: 22,     // uncompressed size
  FNAME_LEN:  26,     // filename length
  EXTRA_LEN:  28      // extra field length
};
export const ENCRYPT_HDR_SIZE = 12;

// Data descriptor
export const DATA_DESC = {
  SIGNATURE:  0x08074b50,  // "PK\007\008"
  SIZE:       16,     // EXT header size in bytes
  CRC:        4,      // uncompressed file crc-32 value (offset)
  CMP_SIZE:   8,      // compressed size (offset)
  UNCMP_SIZE: 12      // uncompressed size
};

// The central directory file header 
export const CENTRAL_DIR = {
  SIZE:       46,     // Central directory header size
  SIGNATURE:  0x02014b50,  // "PK\001\002"
  VER_MADE:   4,      // version made by
  VER_EXT:    6,      // version needed to extract
  FLAGS:      8,      // encrypt, decrypt flags
  CMP_METHOD: 10,    // compression method
  TIMEDATE_DOS: 12,     // DOS modification time (2 bytes time, 2 bytes date)
  CRC:        16,     // uncompressed file crc-32 value
  CMP_SIZE:   20,     // compressed size
  UNCMP_SIZE: 24,     // uncompressed size
  FNAME_LEN:  28,     // filename length
  EXTRA_LEN:  30,     // extra field length
  COMMENT_LEN: 32,    // file comment length
  DISK_NUM:   34,     // volume number start
  INT_FILE_ATTR: 36,  // internal file attributes
  EXT_FILE_ATTR: 38,  // external file attributes (host system dependent)
  LOCAL_HDR_OFFSET: 42 // LOC header offset
};

// The Zip central directory Locator
export const CENTRAL_END = {
  SIZE:       22,         // END header size
  SIGNATURE:  0x06054b50, // "PK\005\006"
  VOL_NUM:        4,      // number of this disk
  VOLDIR_START:   6,      // number of the volume/disk with start of the Central Directory
  VOL_ENTRIES:    8,      // number of entries on this volume/disk
  TOTAL_ENTRIES:  10,     // total number of entries on this disk
  CENTRAL_DIR_SIZE: 12,   // central directory size in bytes
  CENTRAL_DIR_OFFSET: 16, // offset of first CEN header
  ZIP_COMMENT_LEN: 20     // zip file comment length
};

// Zip64 Central Directory Entry
export const ZIP64_CENTRAL_DIR = {
  SIGNATURE:  0x06064b50,  // zip64 signature, "PK\006\006"
  SIZE:       56,     // zip64 record minimum size
  LEAD:       12,     // leading bytes at the start of the record, not counted by the value stored in ZIP64SIZE
  SIZE_FIELD:  4,     // zip64 size of the central directory record
  VER_MADEBY: 12,     // zip64 version made by
  VER_NEEDED: 14,     // zip64 version needed to extract
  VOL_NUM:    16,     // zip64 number of this disk
  VOLDIR_START: 20,  // number of the disk with the start of the record directory
  VOL_ENTRIES:  24,  // number of entries on this disk
  TOTAL_ENTRIES: 32,  // total number of entries
  CENTRAL_DIR_SIZE: 40, // zip64 central directory size in bytes
  CENTRAL_DIR_OFFSET: 48, // offset of start of central directory with respect to the starting disk number
  EXTRA_FIELD:   56   // extensible data sector
};

// Zip64 Central directory locator
export const ZIP64_CENTRAL_END = {
  SIZE:       20,         // zip64 END header size
  SIGNATURE:  0x07064b50, // zip64 Locator signature, "PK\006\007"
  VOL_NUM:    4,          // number of the disk with the start of the zip64
  CENTRAL_DIR_OFFSET: 8,  // relative offset of the zip64 end of central directory
  TOTAL_DISKS: 16         // total number of disks
};

// Compression methods
export const CMP_METHOD = {
  STORED:           0,  // no compression
  SHRUNK:           1,  // shrunk
  REDUCED1:         2,  // reduced with compression factor 1
  REDUCED2:         3,  // reduced with compression factor 2
  REDUCED3:         4,  // reduced with compression factor 3
  REDUCED4:         5,  // reduced with compression factor 4
  IMPLODED:         6,  // imploded
  DEFLATED:         8,  // deflated
  ENHANCED_DEFLATE: 9,  // enhanced deflated
  BZIP2:            12, //  compressed using BZIP2
  LZMA:             14, // LZMA
  IBM_TERSE:        18, // compressed using IBM TERSE
  IBM_LZ77:         19, // IBM LZ77
  ZSTD:             93, // Zstandard compression
  AES_ENCRYPT:      99  // WinZIP AES encryption method
};

// General purpose bit flag
export const GP_FLAG = {
  ENCRYPTED:      1,    // Bit 0: encrypted file
  COMPRESSION1:   2,    // Bit 1, compression option
  COMPRESSION2:   4,    // Bit 2, compression option
  DATA_DESC:      8,    // Bit 3, data descriptor 
  ENHANCED_DEFLATE: 16, // Bit 4, enhanced deflating
  PATCHED:        32,   // Bit 5, indicates that the file is compressed patched data.
  STRONG_ENCRYPT: 64,   // Bit 6, strong encryption (patented)
                        // Bits 7-10: Currently unused.
  EFS:            2048, // Bit 11: Language encoding flag (EFS)
                        // Bit 12: Reserved by PKWARE for enhanced compression.
                        // Bit 13: encrypted the Central Directory (patented).
                        // Bits 14-15: Reserved by PKWARE.
  MASK:           4096, // mask header values
};

// 4.5 Extensible data fields
export const EXTENSIBLE_DATA_FIELDS = {
  ID:              0,
  SIZE:            2,
};

// Header IDs
export const HDR_ID = {
  ZIP64:           0x0001,    // ZIP64 Extended Information Extra Field
  AVINFO:          0x0007,    // AV Info
  PFS:             0x0008,    // PFS Extra Field
  OS2:             0x0009,    // OS/2 Extra Field
  NTFS:            0x000a,    // NTFS Extra Field
  OPENVMS:         0x000c,    // OpenVMS Extra Field
  UNIX:            0x000d,    // Unix Extra Field
  FORK:            0x000e,    // Fork Data Extra Field
  PATCH:           0x000f,    // Patch Descriptor Extra Field
  x509PKCS7:       0x0014,    // X.509 Certificate Store (PKCS#7)
  x509CERT_IDF:    0x0015,    // X.509 Certificate ID and Fingerprint
  x509CERT_IDC:    0x0016,    // X.509 Certificate ID and Certificate
  STRONG_ENC:      0x0017,    // Strong Encryption Header
  RECORD_MGT:      0x0018,    // Record Management Controls
  x509PKCS7RL:     0x0019,    // X.509 Certificate Revocation List (PKCS#7)
  IBM1:            0x0065,    // IBM S/390 (Z390) - Attribute
  IBM2:            0x0066,    // IBM S/390 (Z390) - Attribute
  SHA256:          0x014E,    // SHA256 "N\01" with 64 bytes (256 bit) of SHA256 hash data
  POSZIP:          0x4690,    // POSZIP 4690
  UNV_TIME:        0x5455,    // Universal Time (UT) (32-bit) 5 data bytes
  UID_GID:         0x7875,    // Unix UID/GID (any size)
  UNICODE_PATH:    0x7075,    // Info-ZIP Unicode Path Extra Field
  SYMLINK:         0x7855,    // Unix Symbolic Link Extra Field
  HARDLINK:        0x7865,    // Unix Hard Link Extra Field
};

// File System
export const FILE_SYSTEM = {
  MSDOS:           0,   // MS-DOS and OS/2 (FAT / VFAT / FAT32 file systems)
  AMIGA:           1,   // Amiga
  OPENVMS:         2,   // OpenVMS
  UNIX:            3,   // UNIX
  VM_CMS:          4,   // VM/CMS
  ATARI:           5,   // Atari ST
  OS2:             6,   // OS/2 H.P.F.S.
  MAC:             7,   // Macintosh
  CP_M:            9,   // CP/M
  NTFS:            10,  // Windows NTFS
  MVS:             11,  // MVS (OS/390 - Z/OS)
  VSE:             12,  // VSE
  ACORN:           13,  // Acorn Risc
  VFAT:            14,  // VFAT
  ALTMVS:          15,  // Alternate MVS
  BEOS:            16,  // BeOS
  TANDEM:          17,  // Tandem
  OS400:           18,  // OS/400
  DARWIN:          19   // Apple OS/X (Darwin)
};

// DOS File Attributes
export const DOS_FILE_ATTR = {
  READONLY:        0x01,
  HIDDEN:          0x02,
  SYSTEM:          0x04,
  VOLUME:          0x08,
  DIRECTORY:       0x10,
  ARCHIVE:         0x20
};

// ============================================================================
// Type Definitions for ZIP Structures
// ============================================================================

/**
 * Local file header structure (30 bytes)
 * Standard ZIP format structure as defined in PKZIP specification
 */
export interface LocalFileHeader {
  signature: number;        // 4 bytes: 0x04034b50 ("PK\03\04")
  version: number;          // 2 bytes: version needed to extract
  flags: number;            // 2 bytes: general purpose bit flag
  compression: number;      // 2 bytes: compression method
  modTime: number;          // 2 bytes: modification time (DOS format)
  modDate: number;          // 2 bytes: modification date (DOS format)
  crc32: number;            // 4 bytes: uncompressed file CRC-32 value
  compressedSize: number;   // 4 bytes: compressed size
  uncompressedSize: number; // 4 bytes: uncompressed size
  filenameLength: number;   // 2 bytes: filename length
  extraFieldLength: number; // 2 bytes: extra field length
}

/**
 * Central directory entry structure (46 bytes)
 * Standard ZIP format structure as defined in PKZIP specification
 */
export interface CentralDirEntry {
  signature: number;        // 4 bytes: 0x02014b50 ("PK\01\02")
  versionMadeBy: number;    // 2 bytes: version made by
  versionNeeded: number;    // 2 bytes: version needed to extract
  flags: number;            // 2 bytes: general purpose bit flag
  compression: number;      // 2 bytes: compression method
  modTime: number;          // 2 bytes: modification time (DOS format)
  modDate: number;          // 2 bytes: modification date (DOS format)
  crc32: number;            // 4 bytes: uncompressed file CRC-32 value
  compressedSize: number;   // 4 bytes: compressed size
  uncompressedSize: number; // 4 bytes: uncompressed size
  filenameLength: number;   // 2 bytes: filename length
  extraFieldLength: number; // 2 bytes: extra field length
  commentLength: number;    // 2 bytes: file comment length
  diskNumber: number;       // 2 bytes: volume number start
  internalAttrs: number;    // 2 bytes: internal file attributes
  externalAttrs: number;    // 4 bytes: external file attributes (host system dependent)
  localHeaderOffset: number; // 4 bytes: offset of local file header
}

/**
 * End of central directory record structure (22 bytes)
 * Standard ZIP format structure as defined in PKZIP specification
 */
export interface EndOfCentralDir {
  signature: number;        // 4 bytes: 0x06054b50 ("PK\05\06")
  diskNumber: number;      // 2 bytes: number of this disk
  centralDirDisk: number;  // 2 bytes: number of the disk with start of central directory
  centralDirRecords: number; // 2 bytes: number of entries on this disk
  totalRecords: number;     // 2 bytes: total number of entries
  centralDirSize: number;   // 4 bytes: central directory size in bytes
  centralDirOffset: number; // 4 bytes: offset of first central directory entry
  commentLength: number;    // 2 bytes: ZIP file comment length
}

