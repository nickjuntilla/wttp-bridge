/**
 * Standalone WTTP Resource Fetcher
 *
 * This file contains all the logic needed to fetch resources from WTTP sites on the blockchain.
 * It can be used independently of the main project and hardhat environment.
 *
 * SECURITY NOTE: This gateway assumes a trusted environment where all blockchain networks
 * and contract interactions are considered safe. All network calls are permissive.
 *
 * Usage:
 * ```javascript
 * import { fetchWTTPResource } from './wttpFetch.js';
 *
 * // Using a contract address with network name
 * const result1 = await fetchWTTPResource({
 *   siteAddress: '0xD8B79a32dCb6a2a5370069e97aE46cEb4a49D331',
 *   path: '/indexC8FOdJzW.js',
 *   network: 'polygon' // Network name, or provide custom RPC URL
 * });
 *
 * // Using chainId as number (automatically detected and converted to network name)
 * const result2 = await fetchWTTPResource({
 *   siteAddress: '0xD8B79a32dCb6a2a5370069e97aE46cEb4a49D331',
 *   path: '/indexC8FOdJzW.js',
 *   network: 137 // Chain ID as number, automatically converted to 'polygon'
 * });
 *
 * // Using chainId as string (automatically detected and converted to network name)
 * const result3 = await fetchWTTPResource({
 *   siteAddress: '0xD8B79a32dCb6a2a5370069e97aE46cEb4a49D331',
 *   path: '/indexC8FOdJzW.js',
 *   network: '1' // Chain ID as string, automatically converted to 'ethereum'
 * });
 *
 * // Using an ENS domain (with automatic mainnet fallback, normalization, caching, and provider reuse)
 * const result4 = await fetchWTTPResource({
 *   siteAddress: 'Example.eth', // Automatically normalized to 'example.eth' and cached
 *   path: '/index.html',
 *   network: 'sepolia', // Provider will be cached and reused
 *   ensOptions: { fallbackToMainnet: true, useCache: true } // defaults - all networks trusted
 * });
 *
 * console.log(new TextDecoder().decode(result1.content));
 * ```
 */

import { ethers, JsonRpcProvider, Contract } from "ethers";
import IBaseWTTPSiteArtifact from "../abis/IBaseWTTPSite.json";
import IDataPointStorageArtifact from "../abis/IDataPointStorage.json";

// Network configurations
const NETWORK_CONFIGS = {
  polygon: {
    chainId: 137,
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
  },
  ethereum: {
    chainId: 1,
    rpcUrl: "https://eth.llamarpc.com",
  },
  sepolia: {
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  },
  localhost: {
    chainId: 31337,
    rpcUrl: "http://127.0.0.1:8545",
  },
};

// ENS Registry and Resolver configurations
const ENS_CONFIGS = {
  1: {
    // Mainnet
    registryAddress: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    publicResolverAddress: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63",
  },
  11155111: {
    // Sepolia
    registryAddress: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    publicResolverAddress: "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD",
  },
};

// ENS Registry ABI (minimal - just what we need)
const ENS_REGISTRY_ABI = [
  "function resolver(bytes32 node) external view returns (address)",
];

// ENS Resolver ABI (minimal - just for address resolution)
const ENS_RESOLVER_ABI = [
  "function addr(bytes32 node) external view returns (address)",
];

// ENS resolution cache to avoid repeated lookups and CSP issues
const ensResolutionCache = new Map();

// Provider cache to reuse providers and avoid CSP issues
const providerCache = new Map();

// Network information cache to avoid getNetwork() calls
const networkInfoCache = new Map();

// Use the exact deployed ABI from artifacts to avoid tuple order/size issues
const WEB3_SITE_ABI = IBaseWTTPSiteArtifact.abi;
const DATA_POINT_STORAGE_ABI = IDataPointStorageArtifact.abi;

/**
 * Implements the ENS namehash algorithm
 * Converts a domain name like "vitalik.eth" into a bytes32 hash
 */
function namehash(name) {
  if (!name) return ethers.ZeroHash;

  let node = ethers.ZeroHash;
  if (name !== "") {
    const labels = name.split(".");
    for (let i = labels.length - 1; i >= 0; i--) {
      const labelHash = ethers.keccak256(ethers.toUtf8Bytes(labels[i]));
      node = ethers.keccak256(ethers.concat([node, labelHash]));
    }
  }
  return node;
}

/**
 * Resolves an ENS domain to its associated address
 */
async function resolveEnsAddress(provider, domain, options = {}) {
  const { fallbackToMainnet = true, useCache = true } = options;

  // Normalize domain to lowercase
  const normalizedDomain = normalizeEnsDomain(domain);
  if (normalizedDomain !== domain) {
    console.log(`📝 Normalized ENS domain: ${domain} -> ${normalizedDomain}`);
  }

  // Check cache first
  if (useCache) {
    const cachedAddress = getCachedEnsAddress(normalizedDomain);
    if (cachedAddress) {
      console.log(
        `⚡ Using cached ENS resolution: ${normalizedDomain} -> ${cachedAddress}`
      );
      return cachedAddress;
    }
  }

  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log(
    `🔍 Resolving ENS domain: ${normalizedDomain} on chain ${chainId}`
  );

  // Try current network first
  try {
    const address = await tryResolveOnNetwork(
      provider,
      normalizedDomain,
      chainId
    );

    // Cache the successful resolution
    if (useCache) {
      setCachedEnsAddress(normalizedDomain, address);
    }

    return address;
  } catch (error) {
    console.warn(
      `❌ Failed to resolve ${normalizedDomain} on chain ${chainId}: ${error.message}`
    );

    // If we're not on mainnet and fallback is enabled, try mainnet
    if (fallbackToMainnet && chainId !== 1) {
      console.log(
        `🔄 Attempting fallback to mainnet for ${normalizedDomain}...`
      );
      try {
        const mainnetProvider = new JsonRpcProvider(
          NETWORK_CONFIGS.ethereum.rpcUrl
        );
        const address = await tryResolveOnNetwork(
          mainnetProvider,
          normalizedDomain,
          1
        );
        console.log(
          `✅ Resolved ${normalizedDomain} on mainnet fallback: ${address}`
        );

        // Cache the successful mainnet resolution
        if (useCache) {
          setCachedEnsAddress(normalizedDomain, address);
        }

        return address;
      } catch (fallbackError) {
        console.warn(
          `❌ Mainnet fallback also failed: ${fallbackError.message}`
        );
      }
    }

    // If all attempts failed, throw the original error with more context
    throw new Error(
      `ENS resolution failed for ${normalizedDomain}: ${error.message}. This domain may not be registered or configured on the requested network.`
    );
  }
}

/**
 * Helper function to try resolving ENS on a specific network
 */
async function tryResolveOnNetwork(provider, domain, chainId) {
  const ensConfig = ENS_CONFIGS[chainId];
  if (!ensConfig) {
    throw new Error(`ENS not supported on chain ID ${chainId}`);
  }

  // Calculate the namehash for the domain
  const node = namehash(domain);
  console.log(`📝 Namehash for ${domain}: ${node}`);

  // Get the ENS Registry contract
  const registryContract = new Contract(
    ensConfig.registryAddress,
    ENS_REGISTRY_ABI,
    provider
  );

  // Get the resolver address for this domain
  const resolverAddress = await registryContract.resolver(node);
  console.log(`🔗 Resolver address on chain ${chainId}: ${resolverAddress}`);

  if (resolverAddress === ethers.ZeroAddress) {
    throw new Error(`No resolver set for domain ${domain} on chain ${chainId}`);
  }

  // Get the resolver contract and resolve the address
  const resolverContract = new Contract(
    resolverAddress,
    ENS_RESOLVER_ABI,
    provider
  );

  const address = await resolverContract.addr(node);
  console.log(
    `✅ Resolved ${domain} to address: ${address} on chain ${chainId}`
  );

  if (address === ethers.ZeroAddress) {
    throw new Error(`No address set for domain ${domain} on chain ${chainId}`);
  }

  return address;
}

/**
 * Normalizes an ENS domain to lowercase for consistent processing
 */
function normalizeEnsDomain(domain) {
  if (typeof domain !== "string") {
    throw new Error("ENS domain must be a string");
  }
  return domain.toLowerCase().trim();
}

/**
 * Get cached ENS resolution if available
 */
function getCachedEnsAddress(domain) {
  const normalizedDomain = normalizeEnsDomain(domain);
  return ensResolutionCache.get(normalizedDomain);
}

/**
 * Cache an ENS resolution result
 */
function setCachedEnsAddress(domain, address) {
  const normalizedDomain = normalizeEnsDomain(domain);
  ensResolutionCache.set(normalizedDomain, address);
  console.log(`💾 Cached ENS resolution: ${normalizedDomain} -> ${address}`);
}

/**
 * Clear ENS resolution cache (useful for testing)
 */
function clearEnsCache() {
  ensResolutionCache.clear();
  console.log("🗑️ ENS resolution cache cleared");
}

/**
 * Get cached provider if available
 */
function getCachedProvider(networkKey) {
  return providerCache.get(networkKey);
}

/**
 * Cache a provider for reuse
 */
function setCachedProvider(networkKey, provider) {
  providerCache.set(networkKey, provider);
  console.log(`🌐 Cached provider for network: ${networkKey}`);
}

/**
 * Clear provider cache (useful for testing)
 */
function clearProviderCache() {
  providerCache.clear();
  console.log("🗑️ Provider cache cleared");
}

/**
 * Cache network information to avoid getNetwork() calls
 */
function setCachedNetworkInfo(provider, networkInfo) {
  const networkKey = `${networkInfo.chainId}`;
  networkInfoCache.set(networkKey, networkInfo);
  console.log(`🔗 Cached network info for chain ${networkInfo.chainId}`);
}

/**
 * Get cached network information
 */
function getCachedNetworkInfo(chainId) {
  return networkInfoCache.get(`${chainId}`);
}

/**
 * Clear network cache (useful for testing)
 */
function clearNetworkCache() {
  networkInfoCache.clear();
  console.log("🗑️ Network cache cleared");
}

/**
 * Checks if a string is a valid ENS domain (ends with .eth)
 */
function isEnsAddress(address) {
  return typeof address === "string" && address.toLowerCase().endsWith(".eth");
}

/**
 * Normalizes a path to ensure it starts with '/' and handles relative path prefixes
 */
function normalizePath(path) {
  if (!path) return "/";

  // If already absolute, return as-is
  if (path.startsWith("/")) {
    return path;
  }

  // Handle relative paths
  if (path.startsWith("./")) {
    // Remove the "./" prefix for relative paths
    return "/" + path.substring(2);
  }

  if (path.startsWith("../")) {
    // Handle parent directory references - for now, treat as relative to root
    return "/" + path.substring(3);
  }

  // Simple relative path without "./" prefix
  return "/" + path;
}

/**
 * Resolves a redirect location against the current path, supporting relative paths like "./file" and "../dir/file".
 */
function resolveRedirectPath(currentPath, location) {
  // Absolute path
  if (location.startsWith("/")) {
    return location;
  }
  // If it looks like a full WTTP URL, try to extract the path portion after the chain segment
  if (location.startsWith("wttp://")) {
    const parts = location.split(":");
    const afterChain = parts[parts.length - 1];
    // afterChain begins with path (e.g., "/index.html" or "/"), ensure it's normalized
    return normalizePath(afterChain);
  }

  // Relative path resolution
  const baseDir = currentPath.endsWith("/")
    ? currentPath
    : currentPath.substring(0, currentPath.lastIndexOf("/") + 1);

  const combined = baseDir + location; // may contain ./ or ../
  return normalizePosixPath(combined);
}

/**
 * Normalizes a POSIX-style path by resolving '.', '..', and duplicate slashes.
 */
function normalizePosixPath(path) {
  const segments = path.split("/");
  const stack = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") {
      continue;
    }
    if (seg === "..") {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(seg);
  }
  return "/" + stack.join("/");
}

/**
 * Gets or creates a provider for the specified network
 */
async function getProvider(network, customProvider) {
  if (customProvider) {
    return customProvider;
  }
  console.log("Fetching provider for network:", network);

  // Create a cache key
  const networkKey = network || "polygon";

  // Check cache first
  const cachedProvider = getCachedProvider(networkKey);
  if (cachedProvider) {
    console.log(`⚡ Using cached provider for network: ${networkKey}`);
    return cachedProvider;
  }

  let provider;

  // If network is a URL, use it directly
  if (
    network &&
    (network.startsWith("http://") || network.startsWith("https://"))
  ) {
    provider = new JsonRpcProvider(network);
  } else {
    // Use predefined network configuration
    const networkConfig = network
      ? NETWORK_CONFIGS[network]
      : NETWORK_CONFIGS.polygon;

    if (!networkConfig) {
      throw new Error(
        `Unsupported network: ${network}. Supported networks: ${Object.keys(
          NETWORK_CONFIGS
        ).join(", ")}`
      );
    }

    provider = new JsonRpcProvider(networkConfig.rpcUrl);
  }

  // Cache the provider
  setCachedProvider(networkKey, provider);

  // Cache network information on first creation to avoid future getNetwork() calls
  try {
    const networkInfo = await provider.getNetwork();
    setCachedNetworkInfo(provider, networkInfo);
  } catch (error) {
    console.warn(
      `Failed to cache network info for ${networkKey}:`,
      error.message
    );
  }

  console.log("Returning cached provider:", provider);

  return provider;
}

/**
 * Reads content from an array of datapoints using the DPS contract
 */
async function readDataPointsContent(provider, siteAddress, dataPoints) {
  console.log(`📥 Reading content from ${dataPoints.length} datapoints...`);

  if (!siteAddress || !dataPoints || dataPoints.length === 0) {
    throw new Error("Valid site address and datapoints array required");
  }

  // Get the site contract to access DPS
  const siteContract = new Contract(siteAddress, WEB3_SITE_ABI, provider);
  const dpsAddress = await siteContract.DPS();

  console.log(`🔗 Loading DPS at address ${dpsAddress}...`);

  // Get the DPS contract
  const dpsContract = new Contract(
    dpsAddress,
    DATA_POINT_STORAGE_ABI,
    provider
  );

  // Read all datapoints and combine their content with progress reporting
  const contents = [];
  let totalBytesRead = 0;

  for (let i = 0; i < dataPoints.length; i++) {
    const dataPointAddress = dataPoints[i];
    const progress = Math.round(((i + 1) / dataPoints.length) * 100);
    console.log(
      `📊 Reading chunk ${i + 1}/${
        dataPoints.length
      } (${progress}%): ${dataPointAddress.substring(0, 10)}...`
    );

    try {
      const dataPointContent = await dpsContract.readDataPoint(
        dataPointAddress
      );
      const chunk = new Uint8Array(ethers.toBeArray(dataPointContent));
      contents.push(chunk);
      totalBytesRead += chunk.length;
      console.log(`✅ Chunk ${i + 1} read: ${chunk.length} bytes`);
    } catch (error) {
      console.error(`❌ Failed to read datapoint ${dataPointAddress}:`, error);
      throw new Error(
        `Failed to read datapoint ${i + 1}/${dataPoints.length}: ${error}`
      );
    }
  }

  // Combine all content chunks with optimized allocation
  console.log(
    `🔗 Combining ${dataPoints.length} chunks (${totalBytesRead} total bytes)...`
  );
  const combined = new Uint8Array(totalBytesRead);

  let offset = 0;
  for (let i = 0; i < contents.length; i++) {
    const chunk = contents[i];
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  console.log(
    `✅ Successfully reconstructed ${combined.length} bytes from ${dataPoints.length} chunks`
  );
  return combined;
}

/**
 * Main function to fetch a resource from a WTTP site
 */
/**
 * Helper function to map chain ID to network name
 */
function getNetworkFromChain(chainId) {
  switch (chainId) {
    case "1":
      return "ethereum";
    case "137":
      return "polygon";
    case "11155111":
      return "sepolia";
    case "31337":
      return "localhost";
    default:
      return "polygon"; // default fallback
  }
}

export async function fetchWTTPResource(config) {
  const {
    siteAddress: inputSiteAddress,
    path: inputPath,
    network,
    provider: customProvider,
    options = {},
    ensOptions = {},
  } = config;

  console.log("Fetching resource from WTTP site:", config);

  // Parameter validation
  if (!inputSiteAddress) {
    throw new Error("Site address is required");
  }

  // Smart network parameter detection
  let resolvedNetwork = network;
  if (network !== undefined) {
    if (typeof network === "string") {
      if (/^\d+$/.test(network)) {
        // It's a string of numbers (chain ID like "137", "1"), convert it to network name
        resolvedNetwork = getNetworkFromChain(network);
        console.log(
          `🔗 Resolved chainId ${network} to network: ${resolvedNetwork}`
        );
      } else {
        // It's a string of letters (network name like "polygon", "ethereum"), use directly
        resolvedNetwork = network;
      }
    } else if (typeof network === "number") {
      // It's a number (chain ID), convert it to network name
      resolvedNetwork = getNetworkFromChain(network.toString());
      console.log(
        `🔗 Resolved chainId ${network} to network: ${resolvedNetwork}`
      );
    }
  }

  // Get provider first so we can resolve ENS domains
  const provider = await getProvider(resolvedNetwork, customProvider);

  // Resolve ENS domain if needed
  let siteAddress;
  if (isEnsAddress(inputSiteAddress)) {
    try {
      siteAddress = await resolveEnsAddress(
        provider,
        inputSiteAddress,
        ensOptions
      );
      console.log(
        `🏷️ Resolved ENS domain ${inputSiteAddress} to ${siteAddress}`
      );
    } catch (error) {
      throw new Error(
        `Failed to resolve ENS domain ${inputSiteAddress}: ${error.message}`
      );
    }
  } else {
    siteAddress = inputSiteAddress;
  }

  let path;
  try {
    path = normalizePath(inputPath || "/");
  } catch (error) {
    throw new Error(
      `Invalid path format: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  const {
    ifModifiedSince = 0,
    ifNoneMatch = ethers.ZeroHash,
    // Use -1 as default end to indicate "to the end" for int256 range semantics
    range = { start: 0, end: -1 },
    headRequest = false,
    datapoints = false, // Default to false to fetch content by default
    maxRedirects = 5,
  } = options;

  console.log(`🌐 Connecting to site: ${siteAddress}`);
  console.log(
    `📄 Requesting resource: ${path}${headRequest ? " (HEAD only)" : ""}`
  );

  // Connectivity diagnostics - all network calls trusted
  try {
    const net = await provider.getNetwork();
    console.log(`🔌 Connected to chainId ${Number(net.chainId)} via provider`);
  } catch (e) {
    console.warn("Provider getNetwork() failed:", e?.message || e);
  }
  try {
    const tmp = new Contract(siteAddress, WEB3_SITE_ABI, provider);
    const dps = await tmp.DPS();
    console.log(`🧩 DPS at: ${dps}`);
  } catch (e) {
    console.warn(
      "DPS() call failed (ABI mismatch or wrong contract):",
      e?.message || e
    );
  }
  try {
    const code = await provider.getCode(siteAddress);
    console.log(
      code && code !== "0x"
        ? "✅ Contract code found at site address"
        : "⚠️ No contract code at site address (wrong network or address?)"
    );
  } catch (e) {
    console.warn("getCode() failed:", e?.message || e);
  }

  // Get the site contract
  let siteContract;
  try {
    siteContract = new Contract(siteAddress, WEB3_SITE_ABI, provider);
  } catch (error) {
    throw new Error(
      `Failed to connect to site contract at ${siteAddress}: ${error}`
    );
  }

  // Prepare the request object (path can change if redirects occur)
  let currentPath = path;
  const makeHeadRequestObj = (p) => ({
    path: p,
    ifModifiedSince,
    ifNoneMatch,
  });

  // Helper to call GET with object params, falling back to array-encoded tuples
  const callGet = async (p, start, end) => {
    try {
      return await siteContract.GET({
        head: makeHeadRequestObj(p),
        rangeChunks: { start, end },
      });
    } catch (e1) {
      try {
        // Fallback: pass tuples as arrays in case some providers/abi decoders require it
        return await siteContract.GET([
          [p, BigInt(ifModifiedSince), ifNoneMatch],
          [start, end],
        ]);
      } catch (e2) {
        throw e2 || e1;
      }
    }
  };

  // Helper to call HEAD with fallback ABIs
  const callHead = async (p) => {
    try {
      return await siteContract.HEAD(makeHeadRequestObj(p));
    } catch (e1) {
      // Artifact ABI should be authoritative; surface the failure
      console.warn(
        "HEAD failed with artifact ABI:",
        e1?.reason || e1?.message || e1
      );
      throw e1;
    }
  };

  // Default empty response
  const defaultHead = {
    status: 404n,
    headerInfo: {
      cache: { immutableFlag: false, preset: 0n, custom: "" },
      cors: { methods: 1n, origins: [], preset: 0n, custom: "" },
      redirect: { code: 0n, location: "" },
    },
    metadata: {
      properties: {
        mimeType: "0x0000",
        charset: "0x0000",
        encoding: "0x0000",
        language: "0x0000",
      },
      size: 0n,
      version: 0n,
      lastModified: 0n,
      header: ethers.ZeroHash,
    },
    etag: ethers.ZeroHash,
  };

  // If it's a HEAD request, just call HEAD
  if (headRequest) {
    console.log(`Sending HEAD request for ${path} from site ${siteAddress}`);
    try {
      const head = await siteContract.HEAD(makeHeadRequestObj(currentPath));
      return {
        response: { head, resource: { dataPoints: [], totalChunks: 0 } },
        content: undefined,
      };
    } catch (error) {
      console.log("HEAD request failed, assuming file doesn't exist");
      return {
        response: {
          head: defaultHead,
          resource: { dataPoints: [], totalChunks: 0 },
        },
        content: undefined,
      };
    }
  } else {
    // For GET requests, call HEAD first to avoid GET reverts for missing resources
    console.log(`Fetching resource at ${path} from site ${siteAddress}`);

    let head = defaultHead;
    let redirectsLeft = maxRedirects;
    while (true) {
      try {
        console.log(`Calling HEAD for ${currentPath}`);
        head = await callHead(currentPath);
      } catch (error) {
        // If HEAD itself fails, treat as not found
        head = defaultHead;
      }

      // Handle redirects
      if (
        (head.status === 301n ||
          head.status === 302n ||
          head.status === 307n ||
          head.status === 308n) &&
        head.headerInfo?.redirect?.location &&
        redirectsLeft > 0
      ) {
        const nextLocation = head.headerInfo.redirect.location;
        const resolved = resolveRedirectPath(currentPath, nextLocation);
        console.log(
          `🔁 Redirect (${
            head.status
          }) to: ${nextLocation} -> resolved: ${resolved} (remaining: ${
            redirectsLeft - 1
          })`
        );
        currentPath = resolved;
        redirectsLeft -= 1;
        continue;
      }
      break;
    }

    // If not found, attempt common default index fallbacks when path is a directory-like path
    if (!(head.status === 200n || head.status === 206n)) {
      console.log(`Response status for directory: ${head.status}`);
      const looksLikeDirectory =
        currentPath.endsWith("/") || !currentPath.includes(".");
      if (head.status === 404n && looksLikeDirectory) {
        const fallbackPaths = [
          "index.html",
          "index.htm",
          "index.md",
          "index.txt",
        ];
        for (const candidate of fallbackPaths) {
          const candidatePath = normalizePath(
            currentPath.endsWith("/")
              ? currentPath + candidate
              : currentPath + "/" + candidate
          );
          try {
            const candidateHead = await callHead(candidatePath);
            if (
              candidateHead.status === 200n ||
              candidateHead.status === 206n
            ) {
              console.log(`Fallback succeeded at ${candidatePath}`);
              head = candidateHead;
              currentPath = candidatePath;
              break;
            }
          } catch (_) {
            // ignore and try next
          }
        }
      }
      // If still not ok, try GET directly in case HEAD is blocked but GET is allowed
      if (!(head.status === 200n || head.status === 206n)) {
        console.log(`Response status reading datapoints: ${head.status}`);
        try {
          const probe = await callGet(
            currentPath,
            BigInt(range.start),
            BigInt(range.end)
          );
          if (probe.head.status === 200n || probe.head.status === 206n) {
            // Use the successful GET response
            return {
              response: probe,
              content: await (async () => {
                if (probe.resource.dataPoints.length > 0 && !datapoints) {
                  const dataPointAddresses = probe.resource.dataPoints.map(
                    (dp) => dp.toString()
                  );
                  return readDataPointsContent(
                    provider,
                    siteAddress,
                    dataPointAddresses
                  );
                }
                return undefined;
              })(),
            };
          }
        } catch (_) {
          // ignore
        }
      }
      // If still not ok, return HEAD-only
      if (!(head.status === 200n || head.status === 206n)) {
        return {
          response: { head, resource: { dataPoints: [], totalChunks: 0 } },
          content: undefined,
        };
      }
    }

    // Otherwise, call GET to retrieve datapoints
    let locateResponse = {
      head,
      resource: { dataPoints: [], totalChunks: 0 },
    };
    try {
      console.log(`Locating response calling GET: ${head.status}`);
      locateResponse = await callGet(
        currentPath,
        BigInt(range.start),
        BigInt(range.end)
      );
    } catch (error) {
      console.error(
        `GET failed for ${currentPath}:`,
        error?.reason || error?.shortMessage || error?.message || error
      );
      // Retry once with a safe default range {0, -1} in case caller provided incompatible range
      try {
        locateResponse = await callGet(currentPath, 0n, -1n);
      } catch (error2) {
        console.debug(
          "GET failed after successful HEAD; returning HEAD only",
          error2?.reason || error2?.shortMessage || error2?.message || error2
        );
        return {
          response: { head, resource: { dataPoints: [], totalChunks: 0 } },
          content: undefined,
        };
      }
    }

    console.log(`Response status: ${locateResponse.head.status}`);
    console.log(
      `Found ${locateResponse.resource.dataPoints.length} data points (totalChunks=${locateResponse.resource.totalChunks})`
    );

    // Debug: Check if we're missing chunks
    if (
      locateResponse.resource.totalChunks > 0 &&
      locateResponse.resource.dataPoints.length <
        locateResponse.resource.totalChunks
    ) {
      console.warn(
        `⚠️ Missing chunks! Expected ${locateResponse.resource.totalChunks}, got ${locateResponse.resource.dataPoints.length}`
      );
      console.log(`Range used: start=${range.start}, end=${range.end}`);

      // Try to fetch all chunks explicitly
      console.log("🔄 Attempting to fetch all chunks...");
      try {
        const totalChunks = Number(locateResponse.resource.totalChunks);
        const fullResponse = await callGet(
          currentPath,
          0n,
          BigInt(totalChunks - 1)
        );
        if (
          fullResponse.resource.dataPoints.length >
          locateResponse.resource.dataPoints.length
        ) {
          console.log(
            `✅ Fetched all chunks: ${fullResponse.resource.dataPoints.length}/${totalChunks}`
          );
          locateResponse = fullResponse;
        } else {
          console.warn("❌ Still missing chunks after explicit fetch");
        }
      } catch (fetchAllError) {
        console.warn("❌ Failed to fetch all chunks:", fetchAllError.message);
      }
    }

    // If we have totalChunks > 0 but got 0 dataPoints, page in the first chunk to prove content exists
    if (
      (locateResponse.head.status === 200n ||
        locateResponse.head.status === 206n) &&
      locateResponse.resource.totalChunks > 0 &&
      locateResponse.resource.dataPoints.length === 0
    ) {
      try {
        const firstChunk = await callGet(currentPath, 0n, 0n);
        locateResponse = {
          head: firstChunk.head,
          resource: firstChunk.resource,
        };
        console.log(
          `Paged first chunk: ${firstChunk.resource.dataPoints.length} returned`
        );
      } catch (e) {
        console.warn("Paging first chunk failed:", e?.message || e);
      }
    }

    // If the response is successful and user wants data (datapoints=false), load the content
    let content = undefined;
    if (!datapoints) {
      if (
        (locateResponse.head.status === 200n ||
          locateResponse.head.status === 206n) &&
        locateResponse.resource.dataPoints.length > 0
      ) {
        const dataPointAddresses = locateResponse.resource.dataPoints.map(
          (dp) => dp.toString()
        );
        content = await readDataPointsContent(
          provider,
          siteAddress,
          dataPointAddresses
        );
      }
    }

    return {
      response: locateResponse,
      content,
    };
  }
}

/**
 * Utility function to check if a MIME type represents text content
 */
export function isTextMimeType(mimeType) {
  return (
    mimeType === "0x7470" || // text/plain (tp)
    mimeType === "0x7468" || // text/html (th)
    mimeType === "0x7463" || // text/css (tc)
    mimeType === "0x746d" || // text/markdown (tm)
    mimeType === "0x616a" || // application/javascript (aj)
    mimeType === "0x616f" || // application/json (ao)
    mimeType === "0x6178" || // application/xml (ax)
    mimeType === "0x6973"
  ); // image/svg+xml (is)
}

/**
 * Utility function to decode content as text if it's a text MIME type
 */
export function decodeContent(content, mimeType) {
  if (isTextMimeType(mimeType)) {
    return new TextDecoder().decode(content);
  }
  return content;
}

/**
 * Checks if an ENS domain exists (has an owner) on the current network
 */
async function checkEnsExists(provider, domain) {
  try {
    // Normalize domain to lowercase
    const normalizedDomain = normalizeEnsDomain(domain);

    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    const ensConfig = ENS_CONFIGS[chainId];
    if (!ensConfig) {
      return false;
    }

    const node = namehash(normalizedDomain);
    const registryContract = new Contract(
      ensConfig.registryAddress,
      [
        ...ENS_REGISTRY_ABI,
        "function owner(bytes32 node) external view returns (address)",
      ],
      provider
    );

    const owner = await registryContract.owner(node);
    return owner !== ethers.ZeroAddress;
  } catch (error) {
    console.warn(
      `Failed to check ENS existence for ${normalizedDomain}:`,
      error.message
    );
    return false;
  }
}

/**
 * Get a list of well-known ENS domains for testing
 */
export function getKnownEnsTestDomains() {
  return ["vitalik.eth", "ens.eth", "ethereum.eth", "nick.eth", "brantly.eth"];
}

/**
 * Test ENS resolution with multiple well-known domains
 */
export async function testEnsResolution(provider, options = {}) {
  const testDomains = getKnownEnsTestDomains();
  const results = [];

  console.log("🧪 Testing ENS resolution with known domains...");

  for (const domain of testDomains) {
    try {
      console.log(`Testing: ${domain}`);
      const address = await resolveEnsAddress(provider, domain, options);
      results.push({ domain, address, success: true });
      console.log(`✅ ${domain} -> ${address}`);
    } catch (error) {
      results.push({ domain, error: error.message, success: false });
      console.log(`❌ ${domain} -> Failed: ${error.message}`);
    }
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(
    `🏁 ENS Test Results: ${successCount}/${results.length} domains resolved successfully`
  );

  return results;
}

/**
 * Helper function to get a contract address from either an ENS domain or contract address
 * This function prioritizes cached resolutions and avoids external network calls when possible
 */
export async function getContractAddress(
  addressOrEns,
  provider = null,
  options = {}
) {
  // If it's not an ENS domain, return as-is
  if (!isEnsAddress(addressOrEns)) {
    return addressOrEns;
  }

  // Check cache first (this avoids network calls)
  const cachedAddress = getCachedEnsAddress(addressOrEns);
  if (cachedAddress) {
    console.log(
      `⚡ Using cached address for ${addressOrEns}: ${cachedAddress}`
    );
    return cachedAddress;
  }

  // If no cache and no provider, we can't resolve
  if (!provider) {
    throw new Error(
      `ENS domain ${addressOrEns} not in cache and no provider available for resolution`
    );
  }

  // Resolve using the provider
  return await resolveEnsAddress(provider, addressOrEns, options);
}

/**
 * Export ENS resolution utilities for external use
 */
export {
  namehash,
  resolveEnsAddress,
  isEnsAddress,
  checkEnsExists,
  normalizeEnsDomain,
  getCachedEnsAddress,
  setCachedEnsAddress,
  clearEnsCache,
  setCachedProvider,
  clearProviderCache,
  getCachedNetworkInfo,
  setCachedNetworkInfo,
  clearNetworkCache,
};

// Example usage:
/*
async function example() {
  try {
    // Using a regular contract address with network name
    const result1 = await fetchWTTPResource({
      siteAddress: '0xD8B79a32dCb6a2a5370069e97aE46cEb4a49D331',
      path: '/indexC8FOdJzW.js',
      network: 'polygon'
    });
    
    // Using chainId as number (automatically detected and converted to network name)
    const result2 = await fetchWTTPResource({
      siteAddress: '0xD8B79a32dCb6a2a5370069e97aE46cEb4a49D331',
      path: '/indexC8FOdJzW.js',
      network: 137 // Polygon chain ID as number
    });
    
    // Using chainId as string (automatically detected and converted to network name)
    const result3 = await fetchWTTPResource({
      siteAddress: '0xD8B79a32dCb6a2a5370069e97aE46cEb4a49D331',
      path: '/indexC8FOdJzW.js',
      network: '1' // Ethereum chain ID as string
    });
    
    // Using an ENS domain (will be automatically resolved and normalized)
    const result4 = await fetchWTTPResource({
      siteAddress: 'Etherdoom.eth', // Will be normalized to 'etherdoom.eth'
      path: '/index.html',
      network: 'sepolia'  // Or 'ethereum' for mainnet
    });
    
    if (result1.content) {
      const mimeType = result1.response.head.metadata.properties.mimeType;
      const decoded = decodeContent(result1.content, mimeType);
      console.log('Content:', decoded);
    }
  } catch (error) {
    console.error('Failed to fetch resource:', error);
  }
}

// ENS resolution can also be used independently:
async function resolveEnsExample() {
  try {
    const provider = new JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
    
    // Check if domain exists first
    const exists = await checkEnsExists(provider, 'Etherdoom.eth');
    console.log('Domain exists on current network:', exists);
    
    // Resolve with automatic mainnet fallback
    const address = await resolveEnsAddress(provider, 'Etherdoom.eth');
    console.log('Resolved address:', address);
    
    // Or resolve without fallback
    const addressNoFallback = await resolveEnsAddress(provider, 'Etherdoom.eth', { fallbackToMainnet: false });
    console.log('Resolved address (no fallback):', addressNoFallback);
  } catch (error) {
    console.error('Failed to resolve ENS:', error);
  }
}
*/
