# Zstd Compression Usage Guide

## Overview

Zipkit [[memory:8771859]] supports Zstandard (Zstd) compression as an alternative to the standard Deflate compression method. Zstd typically provides better compression ratios and faster compression/decompression speeds compared to Deflate.

## Compression Method Codes

- **Method 0**: STORED (no compression)
- **Method 8**: DEFLATE (standard ZIP compression)
- **Method 93**: ZSTD (Zstandard compression)

## Using Zstd Compression

### Basic Usage

```typescript
import ZipkitNode from 'neozipkit/node';

const zip = new ZipkitNode();

// Create ZIP with Zstd compression
await zip.createZipFromFiles(
  ['file1.txt', 'file2.txt'],
  'output.zip',
  {
    level: 6,        // Compression level (1-9)
    useZstd: true,   // Enable Zstd compression
    useSHA256: true  // Optional: Calculate SHA-256 hashes
  }
);
```

### Extracting Zstd-Compressed Files

```typescript
import ZipkitNode from 'neozipkit/node';

const zip = new ZipkitNode();

// Extract ZIP (automatically detects compression method)
await zip.extractZipFile('input.zip', './output-directory');
```

## Instance-Based Architecture

### Why Instance-Based Initialization?

Zipkit uses **instance-based Zstd codec initialization** to prevent memory corruption issues. Each Zipkit instance maintains its own isolated Zstd WASM module, ensuring:

1. **No Shared State**: Multiple instances don't interfere with each other
2. **Memory Safety**: No corruption when using multiple instances in the same process
3. **Thread Safety**: Better isolation for future async operations

### Previous Issue (Fixed)

**Before v0.3.2**: Zipkit used module-level singleton Zstd codecs, which caused memory corruption when:
- Creating multiple Zipkit instances in the same process
- Compressing with one instance and decompressing with another
- Running concurrent compression/decompression operations

**After v0.3.2**: Each Zipkit instance has its own isolated Zstd codec, eliminating these issues.

## Memory Considerations

### Memory Usage

Each Zipkit instance with Zstd enabled requires approximately:
- **100-200 KB** for the WASM module
- **Additional memory** based on buffer size and file size

### Best Practices

1. **Reuse Instances When Possible**
   ```typescript
   // Good: Reuse instance for multiple operations
   const zip = new ZipkitNode();
   await zip.createZipFromFiles(files1, 'output1.zip', { useZstd: true });
   await zip.createZipFromFiles(files2, 'output2.zip', { useZstd: true });
   ```

2. **Dispose When Done** (Optional)
   ```typescript
   const zip = new ZipkitNode();
   await zip.createZipFromFiles(files, 'output.zip', { useZstd: true });
   
   // Optional: Explicitly release Zstd resources
   if (zip.compressNode) {
     zip.compressNode.dispose();
   }
   ```

3. **Multiple Instances Are Safe**
   ```typescript
   // Safe: Each instance has isolated Zstd codec
   const zip1 = new ZipkitNode();
   const zip2 = new ZipkitNode();
   
   await zip1.createZipFromFiles(files1, 'output1.zip', { useZstd: true });
   await zip2.extractZipFile('input.zip', './output');
   ```

4. **Concurrent Operations**
   ```typescript
   // Safe: Concurrent operations with separate instances
   const operations = [
     new ZipkitNode().createZipFromFiles(files1, 'out1.zip', { useZstd: true }),
     new ZipkitNode().createZipFromFiles(files2, 'out2.zip', { useZstd: true }),
     new ZipkitNode().extractZipFile('input.zip', './output')
   ];
   
   await Promise.all(operations);
   ```

## Compression Levels

Zstd supports compression levels from 1 to 22, but Zipkit maps the standard 1-9 range:

| Zipkit Level | Zstd Level | Speed      | Compression |
|--------------|------------|------------|-------------|
| 1            | 1-3        | Fastest    | Lower       |
| 6 (default)  | 12-13      | Balanced   | Good        |
| 9            | 19         | Slower     | Best        |

```typescript
// Fast compression
await zip.createZipFromFiles(files, 'output.zip', {
  level: 1,
  useZstd: true
});

// Best compression
await zip.createZipFromFiles(files, 'output.zip', {
  level: 9,
  useZstd: true
});
```

## Initialization Behavior

### Lazy Initialization

Zstd codec is initialized **only when needed**:

```typescript
const zip = new ZipkitNode();  // Zstd NOT initialized yet

// Zstd initialized on first use
await zip.createZipFromFiles(files, 'output.zip', { useZstd: true });

// Same codec instance reused for subsequent operations
await zip.createZipFromFiles(files2, 'output2.zip', { useZstd: true });
```

### Initialization Time

- **First use**: ~10-50ms to initialize WASM module
- **Subsequent uses**: Instant (codec already initialized)

## Library Information

### Zstd-js Library

Zipkit uses `@oneidentity/zstd-js` version ^1.0.3, which:
- Compiles Zstd to WebAssembly using Emscripten
- Supports both Node.js and browser environments
- Provides simple compress/decompress API

### Known Limitations

1. **No True Streaming**: Zstd compression/decompression processes entire buffers at once
2. **WASM Overhead**: Initial WASM module loading adds ~10-50ms
3. **Memory Footprint**: Each instance requires ~100-200KB for WASM module

## Troubleshooting

### Memory Corruption Issues

**Symptom**: Decompression fails with corrupted data or crashes

**Solution**: Ensure you're using Zipkit v0.3.2 or later, which includes instance-based codec isolation.

### Performance Issues

**Symptom**: Slow compression/decompression

**Solutions**:
1. Adjust compression level (lower = faster)
2. Reuse Zipkit instances when possible
3. Consider using Deflate for small files (less WASM overhead)

### WASM Initialization Errors

**Symptom**: "Zstd library not initialized" error

**Solution**: This should not occur with v0.3.2+. If it does, ensure:
1. You're using async/await properly
2. The Zstd operation completes before disposing the instance

## Compatibility

### ZIP Standard Compliance

Zstd compression (method 93) is supported by:
- ✅ 7-Zip (16.00+)
- ✅ WinZip (23.0+)
- ✅ Info-ZIP (experimental)
- ❌ Windows Explorer (native, no Zstd support)
- ❌ macOS Archive Utility (no Zstd support)

For maximum compatibility, use Deflate compression (default when `useZstd: false`).

## Examples

### Example 1: Basic Zstd Compression

```typescript
import ZipkitNode from 'neozipkit/node';

async function compressWithZstd() {
  const zip = new ZipkitNode();
  
  await zip.createZipFromFiles(
    ['document.pdf', 'image.jpg', 'data.json'],
    'archive.zip',
    {
      level: 6,
      useZstd: true,
      useSHA256: true
    }
  );
  
  console.log('Compressed with Zstd!');
}

compressWithZstd();
```

### Example 2: Multiple Instances

```typescript
import ZipkitNode from 'neozipkit/node';

async function multipleInstances() {
  // Instance 1: Compress
  const zip1 = new ZipkitNode();
  await zip1.createZipFromFiles(
    ['file1.txt'],
    'archive1.zip',
    { useZstd: true }
  );
  
  // Instance 2: Extract (no memory corruption!)
  const zip2 = new ZipkitNode();
  await zip2.extractZipFile('archive1.zip', './output');
  
  console.log('No memory corruption!');
}

multipleInstances();
```

### Example 3: Concurrent Operations

```typescript
import ZipkitNode from 'neozipkit/node';

async function concurrentOperations() {
  const tasks = [
    new ZipkitNode().createZipFromFiles(['a.txt'], 'a.zip', { useZstd: true }),
    new ZipkitNode().createZipFromFiles(['b.txt'], 'b.zip', { useZstd: true }),
    new ZipkitNode().createZipFromFiles(['c.txt'], 'c.zip', { useZstd: true })
  ];
  
  await Promise.all(tasks);
  console.log('All archives created concurrently!');
}

concurrentOperations();
```

## References

- [Zstandard Official Site](https://facebook.github.io/zstd/)
- [Zstd GitHub Repository](https://github.com/facebook/zstd)
- [@oneidentity/zstd-js](https://github.com/OneIdentity/zstd-js)
- [ZIP File Format Specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)

## Version History

- **v0.3.2+**: Instance-based Zstd codec initialization (fixes memory corruption)
- **v0.3.0-v0.3.1**: Module-level singleton (deprecated due to memory issues)
- **v0.2.x**: Initial Zstd support

