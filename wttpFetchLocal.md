# Standalone WTTP Resource Fetcher

This standalone module allows you to fetch resources from WTTP (Web3 Transfer Protocol) sites directly from the blockchain without requiring the full hardhat development environment.

## Features

- ✅ Fetch files from WTTP sites on any supported blockchain network
- ✅ Support for multiple networks (Polygon, Ethereum, Sepolia, localhost)
- ✅ Custom RPC URL support
- ✅ HEAD requests for metadata-only fetching
- ✅ Conditional requests (If-Modified-Since)
- ✅ Range requests support
- ✅ Automatic content decoding for text files
- ✅ Progress reporting for large files with multiple chunks
- ✅ Comprehensive error handling

## Installation

### Dependencies

You'll need to install ethers.js as the only dependency:

```bash
npm install ethers@^6.0.0
```

### Files to Copy

Copy these files to your project:

1. `standalone-wttp-fetcher.ts` - The main fetcher implementation
2. `example-usage.ts` - Usage examples (optional)

## Quick Start

```typescript
import { fetchWTTPResource } from './standalone-wttp-fetcher';

// Fetch a JavaScript file from Polygon
const result = await fetchWTTPResource({
  siteAddress: '0xD8B79a32dCb6a2a5370069e97aE46cEb4a49D331',
  path: '/indexC8FOdJzW.js',
  network: 'polygon'
});

if (result.content) {
  const jsCode = new TextDecoder().decode(result.content);
  console.log(jsCode);
}
```

## API Reference

### `fetchWTTPResource(config: FetchOptions): Promise<FetchResult>`

Main function to fetch resources from WTTP sites.

#### FetchOptions

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `siteAddress` | `string` | ✅ | The WTTP site contract address |
| `path` | `string` | ❌ | Path to the resource (default: "/") |
| `network` | `string` | ❌ | Network name or RPC URL (default: "polygon") |
| `provider` | `JsonRpcProvider` | ❌ | Custom ethers provider |
| `options` | `object` | ❌ | Additional request options |

#### Request Options

| Property | Type | Description |
|----------|------|-------------|
| `ifModifiedSince` | `number` | Unix timestamp for conditional requests |
| `ifNoneMatch` | `string` | ETag value for conditional requests |
| `range` | `{start: number, end: number}` | Byte range for partial content |
| `headRequest` | `boolean` | Fetch metadata only (no content) |
| `datapoints` | `boolean` | Return datapoint addresses only |

#### Supported Networks

- `polygon` - Polygon Mainnet
- `ethereum` - Ethereum Mainnet  
- `sepolia` - Ethereum Sepolia Testnet
- `localhost` - Local hardhat node
- Custom RPC URL (e.g., `https://your-rpc-url.com`)

### Utility Functions

#### `isTextMimeType(mimeType: string): boolean`

Check if a MIME type represents text content.

#### `decodeContent(content: Uint8Array, mimeType: string): string | Uint8Array`

Automatically decode content as text if it's a text MIME type.

## Usage Examples

### Basic File Fetching

```typescript
// Fetch a JavaScript file
const jsResult = await fetchWTTPResource({
  siteAddress: '0xYourSiteAddress',
  path: '/app.js',
  network: 'polygon'
});

// Fetch HTML content
const htmlResult = await fetchWTTPResource({
  siteAddress: '0xYourSiteAddress',
  path: '/index.html',
  network: 'polygon'
});
```

### Custom RPC and Network

```typescript
// Use custom RPC URL
const result = await fetchWTTPResource({
  siteAddress: '0xYourSiteAddress',
  path: '/data.json',
  network: 'https://polygon-rpc.com'
});

// Use localhost for development
const localResult = await fetchWTTPResource({
  siteAddress: '0xYourSiteAddress',
  path: '/test.txt',
  network: 'localhost'
});
```

### Metadata-Only Requests

```typescript
// Get file metadata without downloading content
const metadata = await fetchWTTPResource({
  siteAddress: '0xYourSiteAddress',
  path: '/large-file.zip',
  network: 'polygon',
  options: {
    headRequest: true
  }
});

console.log(`File size: ${metadata.response.head.metadata.size} bytes`);
console.log(`MIME type: ${metadata.response.head.metadata.properties.mimeType}`);
```

### Conditional Requests

```typescript
// Only fetch if modified since timestamp
const result = await fetchWTTPResource({
  siteAddress: '0xYourSiteAddress',
  path: '/api/data.json',
  network: 'polygon',
  options: {
    ifModifiedSince: 1640995200 // Unix timestamp
  }
});

if (result.response.head.status === 304n) {
  console.log('File not modified since last check');
}
```

### Error Handling

```typescript
try {
  const result = await fetchWTTPResource({
    siteAddress: '0xYourSiteAddress',
    path: '/might-not-exist.txt',
    network: 'polygon'
  });
  
  if (result.response.head.status === 404n) {
    console.log('File not found');
  } else if (result.content) {
    console.log('File content:', new TextDecoder().decode(result.content));
  }
} catch (error) {
  console.error('Network or contract error:', error);
}
```

### Working with Binary Files

```typescript
const result = await fetchWTTPResource({
  siteAddress: '0xYourSiteAddress',
  path: '/image.png',
  network: 'polygon'
});

if (result.content) {
  // Save binary content to file (Node.js)
  const fs = require('fs');
  fs.writeFileSync('downloaded-image.png', result.content);
  
  // Or create blob for browser use
  const blob = new Blob([result.content], { 
    type: 'image/png' 
  });
}
```

## Response Structure

### FetchResult

```typescript
interface FetchResult {
  response: LOCATEResponseStruct;
  content?: Uint8Array;
}
```

### Response Metadata

The response includes comprehensive metadata:

- **Status**: HTTP-like status codes (200, 404, 304, etc.)
- **MIME Type**: File content type
- **Size**: File size in bytes
- **Last Modified**: Unix timestamp
- **ETag**: Content hash for caching
- **Cache Headers**: Caching policy information
- **CORS Headers**: Cross-origin policy

## Integration Tips

### TypeScript

The module is written in TypeScript and includes full type definitions. Copy the interface definitions from the top of `standalone-wttp-fetcher.ts` for type safety.

### JavaScript (Node.js)

For plain JavaScript usage:

```javascript
const { fetchWTTPResource, decodeContent } = require('./standalone-wttp-fetcher');

async function fetchFile() {
  const result = await fetchWTTPResource({
    siteAddress: '0xYourSiteAddress',
    path: '/file.txt',
    network: 'polygon'
  });
  
  if (result.content) {
    const text = new TextDecoder().decode(result.content);
    console.log(text);
  }
}
```

### Browser Usage

For browser environments, you may need to polyfill Node.js modules or use a bundler like webpack or vite.

## Performance Considerations

- **Large Files**: The fetcher automatically handles chunked downloads with progress reporting
- **Caching**: Use HEAD requests first to check if content has changed
- **Network**: Consider using conditional requests to avoid unnecessary downloads
- **Memory**: Binary files are loaded entirely into memory

## Troubleshooting

### Common Issues

1. **"Site address is required"**: Ensure you provide a valid contract address
2. **"Unsupported network"**: Check network name or provide custom RPC URL
3. **"Failed to connect to site"**: Verify the contract address exists and implements WTTP interface
4. **"Failed to read datapoint"**: Network connectivity or storage contract issues

### Debug Mode

Enable console logging by setting verbose logging in your environment to see detailed fetch progress.

## License

This standalone fetcher inherits the same license as the main WTTP project (AGPL-3.0).
