// ======================================
//	Errors.ts
//  Copyright (c) 2024 NeoWare, Inc. All rights reserved.
// ======================================
// Error messages

export default {
    /* Header error messages */
    INVALID_LOC: "Invalid LOC header (bad signature)",
    INVALID_CEN: "Invalid CEN header (bad signature)",
    INVALID_END: "Invalid END header (bad signature)",

    /* ZipEntry error messages*/
    NO_DATA: "Nothing to decompress",
    FILE_IN_THE_WAY: "There is a file in the way: %s",
    UNKNOWN_METHOD: "Invalid/unsupported compression method",

    /* Encryption Errors */
    STRONG_ENCRYPT_UNSUPPORTED: "Strong Encryption is not supported",

    /* Timestamp error messages */
    INVALID_TIMESTAMP: "Invalid timestamp",
    TIMESTAMP_FAILED: "Failed to create the timestamp",

    /* Inflater error messages */
    AVAIL_DATA: "inflate::Available inflate data did not terminate",
    INVALID_DISTANCE: "inflate::Invalid literal/length or distance code in fixed or dynamic block",
    TO_MANY_CODES: "inflate::Dynamic block code description: too many length or distance codes",
    INVALID_REPEAT_LEN: "inflate::Dynamic block code description: repeat more than specified lengths",
    INVALID_REPEAT_FIRST: "inflate::Dynamic block code description: repeat lengths with no first length",
    INCOMPLETE_CODES: "inflate::Dynamic block code description: code lengths codes incomplete",
    INVALID_DYN_DISTANCE: "inflate::Dynamic block code description: invalid distance code lengths",
    INVALID_CODES_LEN: "inflate::Dynamic block code description: invalid literal/length code lengths",
    INVALID_STORE_BLOCK: "inflate::Stored block length did not match one's complement",
    INVALID_BLOCK_TYPE: "inflate::Invalid block type (type == 3)",

    /* Extract error messages */
    INVALID_CMP_DATA_LENGTH: "Compressed data length does not match the expected length",
    EXTRACT_FAILED: "Failed to extract file",
    INVALID_CRC: "CRC32 checksum does not match the expected value",
    UNKNOWN_SHA256: "The SHA-256 hash has not been saved",
    INVALID_SHA256: "The SHA-256 hash does not match the expected value",

    /* NEO-ZIP error messages */
    CANT_EXTRACT_FILE: "Could not extract the file",
    CANT_OVERRIDE: "Target file already exists",
    NO_ZIP: "No zip file was loaded",
    NO_ENTRY: "Entry doesn't exist",
    DIRECTORY_CONTENT_ERROR: "A directory cannot have content",
    FILE_NOT_FOUND: "File not found: %s",
    NOT_IMPLEMENTED: "Not implemented",
    INVALID_FILENAME: "Invalid filename",
    INVALID_FORMAT: "Invalid or unsupported zip format. No END header found",

    // NeoZipKit error messages
    NO_STREAM_SUPPORT: "Streams are not supported in this environment",
    NO_BLOB_SUPPORT: "Blobs are not supported in this environment",
    NO_FILE_READER_SUPPORT: "FileReader is not supported in this environment",

    // Create Zip error messages
    NO_FILES: "No files added, Zip file not created",

    DATATYPE_STRING_UNSUPPORTED: "The String type is not supported by this platform.",
    DATATYPE_ARRAY_UNSUPPORTED: "The Array type is not supported by this platform.",
    DATATYPE_BUFFER_UNSUPPORTED: "The Buffer type is not supported by this platform.",
    DATATYPE_BLOB_UNSUPPORTED: "The Blob type is not supported by this platform.",
    DATATYPE_U8ARRAY_UNSUPPORTED: "The uint8Array type is not supported by this platform.",
    DATATYPE_ARRAYBUFFER_UNSUPPORTED: "The ArrayBuffer type is not supported by this platform.",
    DATATYPE_UNSUPPORTED: "Unsupported input type.",

    COMPRESS_FAILED: 'Failed to compress data',
    COMPRESSION_ERROR: 'Error occurred during compression',
    DECOMPRESSION_ERROR: 'Error occurred during decompression',

    ENCRYPT_FAILED: 'Encryption failed',
};


