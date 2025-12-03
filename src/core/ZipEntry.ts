// ======================================
//	ZipEntry.ts
//  Copyright (c) 2025 NeoWare, Inc. All rights reserved.
// ======================================
// Zip Directory Item class

import Errors from './constants/Errors';
import { 
  LOCAL_HDR, 
  CENTRAL_DIR, 
  CMP_METHOD, 
  GP_FLAG, 
  FILE_SYSTEM, 
  HDR_ID,
  DOS_FILE_ATTR,
 } from './constants/Headers';
import { ZipFileEntry, FileData } from '../types';
import { Logger } from './components/Logger';
import { crc32 } from './encryption/ZipCrypto';

const VER_ENCODING = 30;
const VER_EXTRACT = 10;                             // Version needed to extract (1.0)

/**
 * Class representing a single entry (file or directory) within a ZIP archive
 */
export default class ZipEntry implements ZipFileEntry {
  debug = true;

  verMadeBy: number = 0;        // Read Version Made By
  verExtract: number = 0;       // Read Version Needed to Extract
  bitFlags: number = 0;         // General purpose bit flag
  cmpMethod: number = 0;        // Compression method
  timeDateDOS: number = 0;      // DOS File Time(2 bytes) & Date(2 bytes) 
  crc: number = 0;              // CRC-32
  compressedSize: number = 0;   // Compressed size
  uncompressedSize: number = 0; // Uncompressed size
  volNumber: number = 0;        // Disk number start
  intFileAttr: number = 0;      // Internal file attributes
  extFileAttr: number = 0;      // External file attributes
  localHdrOffset: number = 0;   // Relative offset to local header from File/Disk start
  filename: string = '';       // File name
  extraField: Buffer | null = null; // Extra field
  comment: string | null = null;    // Entry comment

  // File Data
  fileBuffer: Buffer | null = null; // File Data Buffer

  // Zip Compressed Data
  cmpData: Buffer | null = null;    // Compressed Data Buffer

  isEncrypted: boolean = false;     // Zip Entry is encrypted
  isStrongEncrypt: boolean = false; // Zip Entry is strong encrypted
  encryptHdr: Buffer | null = null;        // Encrypted Header (12 bytes)
  lastModTimeDate: number = 0;      // Data Descriptor File Time & Date
  decrypt: Function | null = null;  // Decrypt Class Function

  isUpdated: boolean = true;        // Entry has been updated
  isDirectory: boolean = false;     // Entry is a directory
  isMetaData: boolean = false;      // Entry is Zip MetaData

  // Platform specific data
  platform: string | null = null;   // Platform
  universalTime: number | null = null; // Universal Time
  uid: number | null = null;        // User ID
  gid: number | null = null;        // Group ID
  sha256: string | null = null;     // SHA-256 hash of the file
  
  // Symbolic link data
  isSymlink: boolean = false;       // Entry is a symbolic link
  linkTarget: string | null = null; // Target path for symbolic links
  
  // Hard link data
  isHardLink: boolean = false;      // Entry is a hard link
  originalEntry: string | null = null; // Original entry name for hard links
  inode: number | null = null;      // Inode number for hard links

  fileData?: FileData;

  /**
   * Creates a new ZIP entry
   * @param fname - Name of the file within the ZIP
   * @param comment - Optional comment for this entry
   * @param debug - Enable debug logging
   */
  constructor(fname: string | null, comment?: string | null, debug?: boolean) {
    this.filename = fname || '';
    this.comment = comment || null;
    this.debug = debug || false;
    
    // Set the UTF-8 Language Encoding Flag (EFS) to indicate UTF-8 encoding for filenames
    this.bitFlags |= GP_FLAG.EFS;
  } 

  isMSDOS = this.platform === null;
  isUnixLike = this.platform != null && this.platform !== 'win32';
  isMacOS = this.platform != null && this.platform === 'darwin';
  isLinux = this.platform != null && this.platform === 'linux';

  VER_MADE_BY = (() => {
    switch (this.platform) {
      case 'darwin':
        return (FILE_SYSTEM.DARWIN << 8) | VER_ENCODING;  // macOS/Darwin
    case 'win32':
      return (FILE_SYSTEM.NTFS << 8) | VER_ENCODING;    // Windows
    default:
      return (FILE_SYSTEM.UNIX << 8) | VER_ENCODING;    // Unix/Linux
    }
  })();

  /**
   * Reads ZIP entry data from a central directory buffer
   * @param data - Buffer containing central directory entry data
   * @returns Buffer positioned at start of next entry
   * @throws Error if central directory entry is invalid
   */
  readZipEntry(data: Buffer): Buffer {
    // Check if buffer is too small before trying to read from it
    if (data.length < CENTRAL_DIR.SIZE) {
      throw new Error('Zip entry data is too small or corrupt');
    }

    // Verify this is a Central Directory Header
    // data should be 46 bytes and start with "PK 01 02"
    if (data.readUInt32LE(0) !== CENTRAL_DIR.SIGNATURE) {
      throw new Error(Errors.INVALID_CEN);
    }

    // Read Zip version made by
    this.verMadeBy = data.readUInt16LE(CENTRAL_DIR.VER_MADE);
    // Read Zip version needed to extract
    this.verExtract = data.readUInt16LE(CENTRAL_DIR.VER_EXT);
    // encrypt, decrypt flags
    this.bitFlags = data.readUInt16LE(CENTRAL_DIR.FLAGS);
    // Test if Zip Entry is encrypted
    if ((this.bitFlags & GP_FLAG.ENCRYPTED) != 0) {
      this.isEncrypted = true;
      if ((this.bitFlags & GP_FLAG.STRONG_ENCRYPT) != 0)
        this.isStrongEncrypt = true;  
    }
    // compression method
    this.cmpMethod = data.readUInt16LE(CENTRAL_DIR.CMP_METHOD);
    // modification time (2 bytes time, 2 bytes date)
    this.timeDateDOS = data.readUInt32LE(CENTRAL_DIR.TIMEDATE_DOS);

    // uncompressed file crc-32 value
    this.crc = data.readUInt32LE(CENTRAL_DIR.CRC);
    // compressed size
    this.compressedSize = data.readUInt32LE(CENTRAL_DIR.CMP_SIZE);
    // uncompressed size
    this.uncompressedSize = data.readUInt32LE(CENTRAL_DIR.UNCMP_SIZE);
    // volume number start
    this.volNumber = data.readUInt16LE(CENTRAL_DIR.DISK_NUM);
    // internal file attributes
    this.intFileAttr = data.readUInt16LE(CENTRAL_DIR.INT_FILE_ATTR);
    // external file attributes
    this.extFileAttr = data.readUInt32LE(CENTRAL_DIR.EXT_FILE_ATTR);
    if (this.extFileAttr & DOS_FILE_ATTR.DIRECTORY) 
      this.isDirectory = true;

    // LOC header offset
    this.localHdrOffset = data.readUInt32LE(CENTRAL_DIR.LOCAL_HDR_OFFSET);

    // Filename Length - 2 bytes
    let fnameLen = data.readUInt16LE(CENTRAL_DIR.FNAME_LEN);
    const filename = data.toString('utf8', CENTRAL_DIR.SIZE, CENTRAL_DIR.SIZE + fnameLen);
    this.filename = filename;
    if (this.filename.endsWith('/'))
      this.isDirectory = true;

    // Extra Field Length - 2 bytes
    let extraLen = data.readUInt16LE(CENTRAL_DIR.EXTRA_LEN);
    if (extraLen > 0) {
      this.extraField = data.subarray(CENTRAL_DIR.SIZE + fnameLen, CENTRAL_DIR.SIZE + fnameLen + extraLen);

      // First pass: Check for Unicode Path to ensure correct filename before processing other fields
      for (let i = 0; i < extraLen; ) {
        let _id = this.extraField.readUInt16LE(i);
        let _len = this.extraField.readUInt16LE(i + 2);
        let _data = this.extraField.subarray(i + 4, i + 4 + _len);
        
        if (_id === HDR_ID.UNICODE_PATH && _len >= 5) {
          // Unicode Path Extra Field
          const version = _data.readUInt8(0);
          const nameCrc32 = _data.readUInt32LE(1);
          
          // Calculate CRC32 of the current filename
          const fnameBuf = Buffer.from(this.filename);
          const calculatedCrc = crc32(fnameBuf);
          
          // If CRCs match, use the UTF-8 filename from the extra field
          if (calculatedCrc === nameCrc32) {
            const unicodeName = _data.subarray(5).toString('utf8');
            this.filename = unicodeName;
            if (this.debug) {
              Logger.log(`Using Unicode Path: ${this.filename}`);
            }
          }
        }
        i += 4 + _len;
      }

      // Second pass: Process all other extra fields
      for (let i = 0; i < extraLen; ) {
        let _id = this.extraField.readUInt16LE(i);
        let _len = this.extraField.readUInt16LE(i + 2);
        let _data = this.extraField.subarray(i + 4, i + 4 + _len);
        
        if (_id === HDR_ID.SHA256) {          
          if (_len === 64)
            // Early versions of NeoZip used a UTF-8 encoded string
            this.sha256 = _data.toString('utf8');
          else
            this.sha256 = _data.toString('hex');
        } else if (_id === HDR_ID.UNV_TIME) {
          // Universal Time field has a flag byte followed by a 4-byte timestamp
          if (_len >= 5) {
            const flags = _data.readUInt8(0);
            // Check if modification time is present (bit 0)
            if (flags & 0x01) {
              this.universalTime = _data.readUInt32LE(1);
            }
          }
        } else if (_id === HDR_ID.UID_GID) {
          // Extract UID/GID if present
          if (_len >= 5) {  // Version + UID size + UID + GID size + GID
            const version = _data.readUInt8(0);
            const uidSize = _data.readUInt8(1);
            if (uidSize <= 4 && _len >= 2 + uidSize) {
              // Read UID based on its size (1-4 bytes)
              this.uid = _data.readUIntLE(2, uidSize);

              // Check if GID is also present
              if (_len >= 2 + uidSize + 1) {
                const gidSize = _data.readUInt8(2 + uidSize);
                if (gidSize <= 4 && _len >= 2 + uidSize + 1 + gidSize) {
                  this.gid = _data.readUIntLE(2 + uidSize + 1, gidSize);
                }
              }
            }
          }
        } else if (_id === HDR_ID.SYMLINK) {
          // Extract symbolic link information
          if (_len >= 3) {  // Version + Target Length + Target
            const version = _data.readUInt8(0);
            const targetLength = _data.readUInt16LE(1);
            if (targetLength > 0 && _len >= 3 + targetLength) {
              this.isSymlink = true;
              this.linkTarget = _data.subarray(3, 3 + targetLength).toString('utf8');
            }
          }
        } else if (_id === HDR_ID.HARDLINK) {
          // Extract hard link information
          if (_len >= 11) {  // Version + Inode + Original Length + Original
            const version = _data.readUInt8(0);
            this.inode = _data.readUInt32LE(1);
            const originalLength = _data.readUInt16LE(5);
            if (originalLength > 0 && _len >= 7 + originalLength) {
              this.isHardLink = true;
              this.originalEntry = _data.subarray(7, 7 + originalLength).toString('utf8');
            }
          }
        }
        // Skip Unicode Path here as we already processed it
        i += 4 + _len;
      }
    }

    // File Comment Length - 2 bytes
    let comLen = data.readUInt16LE(CENTRAL_DIR.COMMENT_LEN);
    if (comLen > 0)
      this.comment = data.toString('utf8', CENTRAL_DIR.SIZE + fnameLen, CENTRAL_DIR.SIZE + fnameLen + comLen);

    if (this.debug)
      this.showVerboseInfo();

    // Calculate the Buffer for the next entry
    let rawSize = CENTRAL_DIR.SIZE + fnameLen + extraLen + comLen;
    return data.subarray(rawSize);
  }

  /**
   * Checks if the filename contains characters that require Unicode handling
   * @returns true if the filename contains non-ASCII characters or special characters
   */
  needsUnicodeHandling(): boolean {
    // Check if filename contains non-ASCII characters or special characters like apostrophes
    return /[^\x00-\x7E]|['"]/.test(this.filename);
  }

  /**
   * Adds UTF-8 Unicode Path field to a buffer
   * @param buffer - The buffer to write to
   * @param offset - The offset in the buffer to start writing
   * @returns The new offset after writing
   */
  private addUnicodePathField(buffer: Buffer, offset: number): number {
    // Create a UTF-8 buffer of the filename
    const unicodePathBuf = Buffer.from(this.filename, 'utf8');
    
    // Calculate CRC32 of the ASCII version of the filename
    // Create an ASCII version by replacing non-ASCII chars with '?'
    const asciiName = this.filename.replace(/[^\x00-\x7E]/g, '?');
    const asciiNameBuf = Buffer.from(asciiName, 'ascii');
    const nameCrc32 = crc32(asciiNameBuf);
    
    // 1 byte version + 4 bytes CRC + filename
    const unicodePathLen = 5 + unicodePathBuf.length;
    
    // Write Unicode Path Extra Field (0x7075)
    buffer.writeUInt16LE(HDR_ID.UNICODE_PATH, offset); // "up" header ID
    buffer.writeUInt16LE(unicodePathLen, offset + 2);  // data length 
    buffer.writeUInt8(1, offset + 4);                  // version (1)
    buffer.writeUInt32LE(nameCrc32, offset + 5);       // CRC-32 of standard filename
    unicodePathBuf.copy(buffer, offset + 9);           // UTF-8 version of filename
    
    return offset + 4 + unicodePathLen; // 4 bytes for header + data length
  }

  /**
   * Creates a local header for this ZIP entry
   * @returns Buffer containing the local header data
   */
  createLocalHdr(): Buffer {
    let extraFieldLen = 0;
    
    // Only create Unicode Path field if needed
    const needsUnicode = this.needsUnicodeHandling();
    
    if (needsUnicode) {
      // 1 byte version + 4 bytes CRC + filename + 4 bytes header
      const unicodeNameLen = Buffer.from(this.filename, 'utf8').length;
      extraFieldLen = 5 + unicodeNameLen + 4;
    }
    
    const data = Buffer.alloc(LOCAL_HDR.SIZE + this.filename.length + extraFieldLen);
    
    // "PK\003\004"
    data.writeUInt32LE(LOCAL_HDR.SIGNATURE, 0);
    // version needed to extract
    data.writeUInt16LE(VER_EXTRACT, LOCAL_HDR.VER_EXTRACT);
    // general purpose bit flag
    data.writeUInt16LE(this.bitFlags >>> 0, LOCAL_HDR.FLAGS);
    // compression method
    data.writeUInt16LE(this.cmpMethod, LOCAL_HDR.COMPRESSION);
    // modification time (2 bytes time, 2 bytes date)
    data.writeUInt32LE(this.timeDateDOS >>> 0, LOCAL_HDR.TIMEDATE_DOS);
    // uncompressed file crc-32 value
    data.writeUInt32LE(this.crc, LOCAL_HDR.CRC);
    // compressed size
    data.writeUInt32LE(this.compressedSize, LOCAL_HDR.CMP_SIZE);
    // uncompressed size
    data.writeUInt32LE(this.uncompressedSize, LOCAL_HDR.UNCMP_SIZE);
    // filename length
    data.writeUInt16LE(this.filename.length, LOCAL_HDR.FNAME_LEN);
    // extra field length
    data.writeUInt16LE(extraFieldLen, LOCAL_HDR.EXTRA_LEN);

    // Write filename - use ASCII filename (replacing non-ASCII with ?)
    // This ensures compatibility with older ZIP readers
    const asciiName = this.filename.replace(/[^\x00-\x7E]/g, '?');
    const fnameBuf = Buffer.from(asciiName);
    fnameBuf.copy(data, LOCAL_HDR.SIZE);

    let extraOffset = LOCAL_HDR.SIZE + fnameBuf.length;
    
    // Add Unicode Path Extra Field only if needed
    if (needsUnicode) {
      extraOffset = this.addUnicodePathField(data, extraOffset);
    }

    // File comments are NOT stored in local headers (ZIP specification)
    // They are only stored in the central directory

    return data;
  }

  /**
   * Creates a central directory entry for this ZIP entry
   * @returns Buffer containing the central directory entry data
   */
  centralDirEntry(): Buffer {
    // Calculate the length of the extra fields
    const commentLen = this.comment ? Buffer.from(this.comment, 'utf8').length : 0;
    const utfLen = this.universalTime ? 9 : 0;  // 4 bytes header + 5 bytes data
    const uidgidLen = this.uid && this.gid ? 11 + 4 : 0;  // 1 byte version + 1 byte size + 4 bytes data + 1 byte size + 4 bytes data
    const sha256Buf = this.sha256 ? Buffer.from(this.sha256, 'hex') : null;
    const sha256Len = sha256Buf ? (sha256Buf.length + 4) : 0;
    
    // Calculate symbolic link extra field length
    const symlinkLen = this.isSymlink && this.linkTarget ? 
      (4 + 1 + 2 + Buffer.byteLength(this.linkTarget, 'utf8')) : 0; // 4 bytes header + 1 byte version + 2 bytes length + target
    
    // Calculate hard link extra field length
    const hardlinkLen = this.isHardLink && this.originalEntry && this.inode !== null ? 
      (4 + 1 + 4 + 2 + Buffer.byteLength(this.originalEntry, 'utf8')) : 0; // 4 bytes header + 1 byte version + 4 bytes inode + 2 bytes length + original
    
    // Only add Unicode Path field if needed
    const needsUnicode = this.needsUnicodeHandling();
    let unicodePathLen = 0;
    
    if (needsUnicode) {
      // 1 byte version + 4 bytes CRC + filename + 4 bytes header
      const unicodeNameLen = Buffer.from(this.filename, 'utf8').length;
      unicodePathLen = 5 + unicodeNameLen + 4;
    }
    
    const extraLen = utfLen + sha256Len + uidgidLen + symlinkLen + hardlinkLen + (needsUnicode ? unicodePathLen : 0);

    // Calculate actual filename length (ASCII conversion may change length)
    const asciiName = this.filename.replace(/[^\x00-\x7E]/g, '?');
    const fnameLen = asciiName.length;
    
    // Central directory header size (46 Bytes + filename + comment + extra fields)
    const data = Buffer.alloc(CENTRAL_DIR.SIZE + fnameLen + commentLen + extraLen);
    
    // "PK\001\002"
    data.writeUInt32LE(CENTRAL_DIR.SIGNATURE, 0);
    // Version made by - Needs to be set for NeoZip 
    data.writeUInt16LE(this.isUpdated ? this.VER_MADE_BY : this.verMadeBy, CENTRAL_DIR.VER_MADE);
    // Version needed to extract
    data.writeInt16LE(this.isUpdated ? VER_EXTRACT : this.verMadeBy, CENTRAL_DIR.VER_EXT);
    // Encrypt, Decrypt Flags
    data.writeInt16LE(this.bitFlags >>> 0, CENTRAL_DIR.FLAGS);
    // Compression method
    data.writeInt16LE(this.cmpMethod, CENTRAL_DIR.CMP_METHOD);
    // Modification time (2 bytes time, 2 bytes date)
    data.writeUInt32LE(this.timeDateDOS >>> 0, CENTRAL_DIR.TIMEDATE_DOS);
    // Uncompressed file CRC-32 value
    data.writeUInt32LE(this.crc, CENTRAL_DIR.CRC);
    // Compressed Size
    data.writeUInt32LE(this.compressedSize, CENTRAL_DIR.CMP_SIZE);
    // Uncompressed Size
    data.writeUInt32LE(this.uncompressedSize, CENTRAL_DIR.UNCMP_SIZE);
    // Filename Length
    data.writeUInt16LE(this.filename.length, CENTRAL_DIR.FNAME_LEN);
    // Extra Field Length
    data.writeUInt16LE(extraLen, CENTRAL_DIR.EXTRA_LEN);
    // File Comment Length
    data.writeUInt16LE(commentLen, CENTRAL_DIR.COMMENT_LEN);
    // Volume Number Start
    data.writeUInt16LE(0, CENTRAL_DIR.DISK_NUM);
    // Internal File Attributes
    data.writeUInt16LE(this.intFileAttr >>> 0, CENTRAL_DIR.INT_FILE_ATTR);
    // External File Attributes
    data.writeUInt32LE(this.extFileAttr >>> 0, CENTRAL_DIR.EXT_FILE_ATTR);
    // Local Header Offset
    data.writeUInt32LE(this.localHdrOffset, CENTRAL_DIR.LOCAL_HDR_OFFSET);

    // Write filename - use ASCII filename (replacing non-ASCII with ?)
    // This ensures compatibility with older ZIP readers
    const fnameBuf = Buffer.from(asciiName);
    fnameBuf.copy(data, CENTRAL_DIR.SIZE);

    // Add file comment immediately after filename (InfoZip format)
    let currentOffset = CENTRAL_DIR.SIZE + fnameLen;
    if (commentLen > 0 && this.comment) {
      const commentBuf = Buffer.from(this.comment, 'utf8');
      commentBuf.copy(data, currentOffset);
      currentOffset += commentLen;
    }

    // Add Extra Field data after file comment
    let extraOffset = currentOffset;

    // Add Universal Time field
    if (this.universalTime) {
      data.writeUInt16LE(HDR_ID.UNV_TIME, extraOffset);     // 0x5455
      data.writeUInt16LE(5, extraOffset + 2);               // Length of data (flags + time)
      data.writeUInt8(1, extraOffset + 4);                  // Flags: modification time present
      data.writeUInt32LE(Math.floor(Date.now() / 1000), extraOffset + 5); // Unix timestamp
      extraOffset += 9;
    }

    // Add SHA-256 field
    if (sha256Buf) {
      data.writeUInt16LE(HDR_ID.SHA256, extraOffset);       // 0x1f
      data.writeUInt16LE(sha256Buf.length, extraOffset + 2); // Length of data
      sha256Buf.copy(data, extraOffset + 4);
      extraOffset += 4 + sha256Buf.length;
    }

    // Add UID/GID field
    if (this.uid && this.gid) {
      data.writeUInt16LE(HDR_ID.UID_GID, extraOffset);       // 0x7875
      data.writeUInt16LE(11, extraOffset + 2);              // Length of data
      data.writeUInt8(1, extraOffset + 4);                  // Version
      data.writeUInt8(4, extraOffset + 5);                  // UID size
      data.writeUInt32LE(this.uid, extraOffset + 6);        // UID
      data.writeUInt8(4, extraOffset + 10);                 // GID size
      data.writeUInt32LE(this.gid, extraOffset + 11);       // GID
      extraOffset += 15;
    }

    // Add symbolic link field
    if (this.isSymlink && this.linkTarget) {
      const targetBuf = Buffer.from(this.linkTarget, 'utf8');
      const dataLen = 1 + 2 + targetBuf.length; // version + length + target
      
      data.writeUInt16LE(HDR_ID.SYMLINK, extraOffset);       // 0x7855
      data.writeUInt16LE(dataLen, extraOffset + 2);          // Length of data
      data.writeUInt8(1, extraOffset + 4);                   // Version
      data.writeUInt16LE(targetBuf.length, extraOffset + 5); // Target length
      targetBuf.copy(data, extraOffset + 7);                 // Target path
      extraOffset += 4 + dataLen;
    }

    // Add hard link field
    if (this.isHardLink && this.originalEntry && this.inode !== null) {
      const originalBuf = Buffer.from(this.originalEntry, 'utf8');
      const dataLen = 1 + 4 + 2 + originalBuf.length; // version + inode + length + original
      
      data.writeUInt16LE(HDR_ID.HARDLINK, extraOffset);       // 0x7865
      data.writeUInt16LE(dataLen, extraOffset + 2);           // Length of data
      data.writeUInt8(1, extraOffset + 4);                    // Version
      data.writeUInt32LE(this.inode, extraOffset + 5);        // Inode number
      data.writeUInt16LE(originalBuf.length, extraOffset + 9); // Original entry length
      originalBuf.copy(data, extraOffset + 11);               // Original entry path
      extraOffset += 4 + dataLen;
    }

    // Add Unicode Path field if needed
    if (needsUnicode) {
      extraOffset = this.addUnicodePathField(data, extraOffset);
    }

    // File comment is already written immediately after filename

    return data;
  }

  // ======================================
  //	Routines to handle the details of the Zip Entry
  // ======================================

  /**
   * Sets the DOS date/time for this entry
   * @param date - Date to convert to DOS format
   * @returns number - DOS format date/time
   */
  setDateTime(date: Date): number {
    if (!date) return 0;
    
    // DOS date/time format:
    // Date part (16 bits): Year (7 bits) + Month (4 bits) + Day (5 bits)
    // Time part (16 bits): Hour (5 bits) + Minute (6 bits) + Second (5 bits, stored as seconds/2)
    
    const year = date.getFullYear() - 1980; // Years since 1980
    const month = date.getMonth() + 1; // Month (1-12)
    const day = date.getDate(); // Day (1-31)
    const hour = date.getHours(); // Hour (0-23)
    const minute = date.getMinutes(); // Minute (0-59)
    const second = date.getSeconds(); // Second (0-59)
    
    // Pack date: year (7 bits) + month (4 bits) + day (5 bits)
    const datePart = ((year & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
    
    // Pack time: hour (5 bits) + minute (6 bits) + second/2 (5 bits)
    const timePart = ((hour & 0x1f) << 11) | ((minute & 0x3f) << 5) | ((second >> 1) & 0x1f);
    
    // Combine date and time parts
    const time = (datePart << 16) | timePart;
    
    return time;
  }

  /**
   * Converts DOS date/time to JavaScript Date
   * @param timeStamp - DOS format date/time
   * @returns Date object or null if timestamp is 0
   */
  parseDateTime(timeStamp: number): Date | null {
    if (timeStamp == 0)
      return null;
    
    // Extract date part (upper 16 bits)
    const datePart = (timeStamp >> 16) & 0xffff;
    const year = ((datePart >> 9) & 0x7f) + 1980;  // Year (7 bits) + 1980
    const month = ((datePart >> 5) & 0x0f) - 1;    // Month (4 bits) - 1 for 0-based
    const day = datePart & 0x1f;                   // Day (5 bits)
    
    // Extract time part (lower 16 bits)
    const timePart = timeStamp & 0xffff;
    const hour = (timePart >> 11) & 0x1f;          // Hour (5 bits)
    const minute = (timePart >> 5) & 0x3f;         // Minute (6 bits)
    const second = (timePart & 0x1f) << 1;         // Second (5 bits) * 2
    
    return new Date(year, month, day, hour, minute, second);
  }

  /**
   * Formats the entry's date in local format
   * @returns String in MM/DD/YYYY format or "--/--/----" if no date
   */
  toLocalDateString(): string {
    let _timeDate = this.parseDateTime(this.timeDateDOS);
    if (_timeDate === null) return "--/--/----";

    return _timeDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).slice(0,10);
  }

  /**
   * Formats the entry's time
   * @returns String in HH:MM format or "--:--" if no time
   */
  toTimeString(): string {
    let _timeDate = this.parseDateTime(this.timeDateDOS);
    if (_timeDate === null) return "--:--";

    return _timeDate.toTimeString().slice(0, 5);
  }

  /**
   * Formats the entry's date and time in local format
   * @returns String like "Jan 01, 2024 13:45:30" or "--/--/-- --:--" if no date/time
   */
  toFormattedDateString(): string {
    let _timeDate = this.parseDateTime(this.timeDateDOS);
    if (_timeDate == null) return "--/--/-- --:--";

    const datePart = _timeDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });

    const timePart = _timeDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    return `${datePart} ${timePart}`;
  }

  /**
   * Formats the entry's date and time in UTC
   * @returns String like "Jan 01, 2024 13:45:30 UTC" or "--/--/-- --:--" if no date/time
   */
  toFormattedUTCDateString(): string {
    let _timeDate = this.parseDateTime(this.timeDateDOS);
    if (_timeDate == null) return "--/--/-- --:--";

    const datePart = _timeDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      timeZone: 'UTC'
    });

    const timePart = _timeDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'UTC'
    });

    return `${datePart} ${timePart} UTC`;
  }

  /**
   * Converts compression method code to human-readable string
   * @returns String describing the compression method
   */
  cmpMethodToString(): string {
    switch (this.cmpMethod) {
      case CMP_METHOD.STORED: return 'Stored';
      case CMP_METHOD.SHRUNK: return 'Shrunk';
      case CMP_METHOD.REDUCED1: return 'Reduced-1';
      case CMP_METHOD.REDUCED2: return 'Reduced-2';
      case CMP_METHOD.REDUCED3: return 'Reduced-3';
      case CMP_METHOD.REDUCED4: return 'Reduced-4';
      case CMP_METHOD.IMPLODED: return 'Imploded';
      case CMP_METHOD.DEFLATED:
        switch (this.bitFlags & 0x6) {
          case 0: return 'Deflate-N';     // Deflate Normal
          case 2: return 'Deflate-M';     // Deflate Maximum
          case 4: return 'Deflate-F';     // Deflate Fast
          case 6: return 'Deflate-S';     // Deflate Super Fast
        }
      case CMP_METHOD.ENHANCED_DEFLATE: return 'Deflate-Enh';
      case CMP_METHOD.IBM_TERSE: return 'PKDCL-LZ77';
      case CMP_METHOD.ZSTD: return 'Zstandard';
      
      default: return 'Unknown';
    }
  }

  /**
   * Converts file system code to human-readable string
   * @returns String describing the file system
   */
  fileSystemToString(): string {
    switch (this.verMadeBy >> 8) {
      case FILE_SYSTEM.MSDOS: return 'MS-DOS';
      case FILE_SYSTEM.AMIGA: return 'Amiga';
      case FILE_SYSTEM.OPENVMS: return 'OpenVMS';
      case FILE_SYSTEM.UNIX: return 'Unix';
      case FILE_SYSTEM.VM_CMS: return 'VM/CMS';
      case FILE_SYSTEM.ATARI: return 'Atari ST';
      case FILE_SYSTEM.OS2: return 'OS/2 HPFS';
      case FILE_SYSTEM.MAC: return 'Macintosh';
      case FILE_SYSTEM.CP_M: return 'CP/M';
      case FILE_SYSTEM.NTFS: return 'Windows NTFS';
      case FILE_SYSTEM.MVS: return 'MVS (OS/390 - Z/OS)';
      case FILE_SYSTEM.VSE: return 'VSE';
      case FILE_SYSTEM.ACORN: return 'Acorn Risc';
      case FILE_SYSTEM.ALTMVS: return 'Alternate MVS';
      case FILE_SYSTEM.BEOS: return 'BeOS';
      case FILE_SYSTEM.TANDEM: return 'Tandem';
      case FILE_SYSTEM.OS400: return 'OS/400';
      case FILE_SYSTEM.DARWIN: return 'Apple OS/X (Darwin)';
      default: return 'Unknown';
    }
  }

  /**
   * Converts MS-DOS file attributes to string representation
   * @returns String like "----" where R=readonly, H=hidden, S=system, A=archive
   */
  private dosAttributesToString(): string {
    let dosAttr = this.extFileAttr & 0xFFFF;
    if (dosAttr === 0) return 'none';
    let attrs = '';
    attrs += (dosAttr & DOS_FILE_ATTR.READONLY) ? 'r' : '-';
    attrs += (dosAttr & DOS_FILE_ATTR.HIDDEN)   ? 'h' : '-';
    attrs += (dosAttr & DOS_FILE_ATTR.SYSTEM)   ? 's' : '-';
    // attrs += (dosAttr & DOS_FILE_ATTR.VOLUME)   ? 'v' : '-';
    attrs += (dosAttr & DOS_FILE_ATTR.DIRECTORY)  ? 'd' : '-';
    attrs += (dosAttr & DOS_FILE_ATTR.ARCHIVE)  ? 'a' : '-';
    return attrs;
  }

  /**
   * Outputs detailed information about this entry for debugging
   * Includes compression, encryption, timestamps, and extra fields
   */
  showVerboseInfo() {
    Logger.log('=== Central Directory Entry (%s) ===', this.filename);
    Logger.log('unzip from start of archive: ', this.localHdrOffset);
    Logger.log('File system or operating system of origin:    ', this.fileSystemToString());
    Logger.log('Version of encoding software:                 ', this.verMadeBy);
    Logger.log('Compression Method:                           ', this.cmpMethodToString());
    Logger.log('File Security Status:                         ', 
      this.bitFlags & GP_FLAG.ENCRYPTED ? 
        this.bitFlags & GP_FLAG.STRONG_ENCRYPT ? 'Strong Encrypt' : 'Encrypted' :
        'Not Encrypted');
    Logger.log('File Modified (DOS date/time)                 ', this.toFormattedDateString()); 
    Logger.log('File Modified (UTC)                           ', this.toFormattedUTCDateString());
    Logger.log('Compressed Size:                              ', this.compressedSize);
    Logger.log('UnCompressed Size:                            ', this.uncompressedSize);
    Logger.log(`32-bit CRC value (hex):                        ${this.crc.toString(16).padStart(8, '0')}`);
    Logger.log('Length of extra field:                        ', this.extraField?.length ?? 0);
    Logger.log('Length of file comment:                       ', this.comment?.length ?? 0);
    Logger.log('Unix File Attributes:                         ');
    Logger.log('MS-DOS File Attributes:                       ', this.dosAttributesToString());
    if (this.extraField) {
      Logger.log('\nThe Central-Directory Extra Field contains:');
      try {
        for (let i = 0; i < this.extraField.length; ) {
          // Ensure we have at least 4 bytes (header ID + length)
          if (i + 4 > this.extraField.length) {
            Logger.log(`   Warning: Truncated extra field at offset ${i}`);
            break;
          }
          
          let _id = this.extraField.readUInt16LE(i);
          let _idStr = _id.toString(16).padStart(4, '0');
          let _len = this.extraField.readUInt16LE(i + 2);
          
          // Validate the length to ensure it doesn't exceed buffer bounds
          if (_len < 0 || i + 4 + _len > this.extraField.length) {
            Logger.log(`   Warning: Invalid extra field length (${_len}) at offset ${i} for ID ${_idStr}`);
            break;
          }
          
          let _data = this.extraField.subarray(i + 4, i + 4 + _len);
          
          try {
            if (_id === HDR_ID.SHA256) {          
              Logger.log(`   ID[0x${_idStr}] NeoZip-SHA256: ${_data.toString('hex')}`);
            } else if (_id === HDR_ID.UNV_TIME) {
              if (_len >= 5) {
                const flags = _data.readUInt8(0);
                const timestamp = _data.readUInt32LE(1);
                const date = new Date(timestamp * 1000);
                Logger.log(`   ID[0x${_idStr}] Universal Time: flags=${flags}, time=${date.toISOString()}`);
              } else {
                Logger.log(`   ID[0x${_idStr}] Universal Time: (invalid length ${_len})`);
              }
            } else if (_id === HDR_ID.UID_GID) {
              if (_len >= 5) {
                const version = _data.readUInt8(0);
                const uidSize = _data.readUInt8(1);
                if (2 + uidSize > _len) {
                  Logger.log(`   ID[0x${_idStr}] Unix UID/GID: (invalid UID size ${uidSize})`);
                } else {
                  const uid = _data.readUIntLE(2, Math.min(uidSize, 4));
                  let gid = 0;
                  if (2 + uidSize + 1 < _len) {
                    const gidSize = _data.readUInt8(2 + uidSize);
                    if (2 + uidSize + 1 + gidSize <= _len) {
                      gid = _data.readUIntLE(2 + uidSize + 1, Math.min(gidSize, 4));
                    }
                  }
                  Logger.log(`   ID[0x${_idStr}] Unix UID/GID: version=${version}, uid=${uid}, gid=${gid}`);
                }
              } else {
                Logger.log(`   ID[0x${_idStr}] Unix UID/GID: (invalid length ${_len})`);
              }
            } else if (_id === HDR_ID.SYMLINK) {
              if (_len >= 3) {
                const version = _data.readUInt8(0);
                const targetLength = _data.readUInt16LE(1);
                if (targetLength > 0 && _len >= 3 + targetLength) {
                  const target = _data.subarray(3, 3 + targetLength).toString('utf8');
                  Logger.log(`   ID[0x${_idStr}] Symbolic Link: version=${version}, target="${target}"`);
                } else {
                  Logger.log(`   ID[0x${_idStr}] Symbolic Link: (invalid target length ${targetLength})`);
                }
              } else {
                Logger.log(`   ID[0x${_idStr}] Symbolic Link: (invalid length ${_len})`);
              }
            } else if (_id === HDR_ID.HARDLINK) {
              if (_len >= 11) {
                const version = _data.readUInt8(0);
                const inode = _data.readUInt32LE(1);
                const originalLength = _data.readUInt16LE(5);
                if (originalLength > 0 && _len >= 7 + originalLength) {
                  const original = _data.subarray(7, 7 + originalLength).toString('utf8');
                  Logger.log(`   ID[0x${_idStr}] Hard Link: version=${version}, inode=${inode}, original="${original}"`);
                } else {
                  Logger.log(`   ID[0x${_idStr}] Hard Link: (invalid original length ${originalLength})`);
                }
              } else {
                Logger.log(`   ID[0x${_idStr}] Hard Link: (invalid length ${_len})`);
              }
            } else if (_id === HDR_ID.UNICODE_PATH) {
              if (_len >= 5) {
                const version = _data.readUInt8(0);
                const nameCrc32 = _data.readUInt32LE(1);
                const unicodeName = _data.subarray(5).toString('utf8');
                
                // Calculate CRC32 of the original filename for verification
                const fnameBuf = Buffer.from(this.filename);
                const calculatedCrc = crc32(fnameBuf);
                
                const crcMatch = nameCrc32 === calculatedCrc ? 'MATCH' : 'MISMATCH';
                
                Logger.log(`   ID[0x${_idStr}] Unicode Path: version=${version}, CRC32=${nameCrc32.toString(16)} (${crcMatch})`);
                Logger.log(`                      Path: "${unicodeName}"`);
              } else {
                Logger.log(`   ID[0x${_idStr}] Unicode Path: (invalid length ${_len})`);
              }
            } else if (_id === HDR_ID.ZIP64) {
              // ZIP64 Extended Information (0x0001)
              Logger.log(`   ID[0x${_idStr}] ZIP64 Extended Information:`);
              if (_len >= 8) {
                let offset = 0;
                
                // Read uncompressed size (8 bytes) if present
                if (offset + 8 <= _len) {
                  const uncompressedSize = _data.readBigUInt64LE(offset);
                  Logger.log(`     Uncompressed Size (ZIP64): ${uncompressedSize.toString()} bytes`);
                  offset += 8;
                }
                
                // Read compressed size (8 bytes) if present
                if (offset + 8 <= _len) {
                  const compressedSize = _data.readBigUInt64LE(offset);
                  Logger.log(`     Compressed Size (ZIP64): ${compressedSize.toString()} bytes`);
                  offset += 8;
                }
                
                // Read local header offset (8 bytes) if present
                if (offset + 8 <= _len) {
                  const localHeaderOffset = _data.readBigUInt64LE(offset);
                  Logger.log(`     Local Header Offset (ZIP64): ${localHeaderOffset.toString()}`);
                  offset += 8;
                }
                
                // Read disk number (4 bytes) if present
                if (offset + 4 <= _len) {
                  const diskNumber = _data.readUInt32LE(offset);
                  Logger.log(`     Disk Number (ZIP64): ${diskNumber}`);
                }
              } else {
                Logger.log(`     ZIP64 Extended Information: (invalid length ${_len})`);
              }
            } else {
              // For unknown fields, show a hex preview of the first few bytes
              const preview = _len > 0 
                ? _data.slice(0, Math.min(16, _len)).toString('hex')
                : '';
              Logger.log(`   ID[0x${_idStr}] Unknown field: length=${_len} bytes${preview ? ', data=' + preview + '...' : ''}`);
            }
          } catch (error: any) {
            Logger.log(`   Error parsing extra field ID[0x${_idStr}]: ${error.message}`);
          }
          
          i += 4 + _len;
        }
      } catch (error: any) {
        Logger.log(`   Error parsing extra fields: ${error.message}`);
      }
    }
    Logger.log('\n');
  }
}

export { ZipEntry };
