// getTagsFromHtml.js
import { parseWttpUrl } from "./parseWttpUrl.js";
import {
  fetchWTTPResource,
  decodeContent,
  getContractAddress,
  isEnsAddress,
} from "../utils/wttpFetch.js";

// Helper function to process embedded URLs in CSS content
async function processCssUrls(cssContent, currentAddress, currentChain) {
  // Regular expression to find url() declarations in CSS
  const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;
  let processedCss = cssContent;
  let match;

  while ((match = urlRegex.exec(cssContent)) !== null) {
    const originalUrl = match[0]; // The full url() declaration
    const urlPath = match[1]; // Just the URL path inside url()

    // Skip if it's already an absolute URL (http/https/data)
    if (
      urlPath.startsWith("http://") ||
      urlPath.startsWith("https://") ||
      urlPath.startsWith("data:") ||
      urlPath.startsWith("//")
    ) {
      continue;
    }

    try {
      let siteAddress;
      let network;
      let resourcePath;

      if (urlPath.startsWith("wttp://")) {
        // Handle WTTP URLs directly
        const { address, chain, path } = parseWttpUrl(urlPath);
        siteAddress = address;
        network = chain;
        resourcePath = path;
      } else {
        // Handle relative URLs - fetch from the same WTTP source
        siteAddress = currentAddress;
        network = currentChain;
        resourcePath = urlPath.startsWith("/") ? urlPath : `/${urlPath}`;
      }

      console.log("Fetching CSS embedded resource:", {
        siteAddress,
        resourcePath,
        network,
      });

      const result = await fetchWTTPResource({
        siteAddress: siteAddress,
        path: resourcePath,
        network: network,
      });

      if (
        result.response.head.status === 200n ||
        result.response.head.status === 206n
      ) {
        const mimeType = result.response.head.metadata.properties.mimeType;

        if (result.content) {
          const content = decodeContent(result.content, mimeType);

          // Determine MIME type based on file extension
          const extension = urlPath.split(".").pop().toLowerCase();
          let actualMimeType = "application/octet-stream";

          if (extension === "jpg" || extension === "jpeg") {
            actualMimeType = "image/jpeg";
          } else if (extension === "png") {
            actualMimeType = "image/png";
          } else if (extension === "gif") {
            actualMimeType = "image/gif";
          } else if (extension === "svg") {
            actualMimeType = "image/svg+xml";
          } else if (extension === "webp") {
            actualMimeType = "image/webp";
          }

          // Create data URL
          const base64Content =
            typeof content === "string"
              ? btoa(content)
              : btoa(String.fromCharCode(...result.content));
          const dataUrl = `data:${actualMimeType};base64,${base64Content}`;
          processedCss = processedCss.replace(originalUrl, `url('${dataUrl}')`);
        }

        console.log("Successfully processed CSS embedded URL:", urlPath);
      } else {
        console.warn(
          `Failed to fetch CSS embedded resource ${urlPath}: ${result.response.head.status} - Resource not found`
        );
      }
    } catch (error) {
      console.warn(`Failed to process CSS embedded URL ${urlPath}:`, error);
    }
  }

  return processedCss;
}

export async function processStyleSheets(fullContent) {
  const styleSheets = fullContent.match(/<link[^>]+>/g);
  console.log("Found stylesheets:", styleSheets);
  if (styleSheets) {
    for (let i = 0; i < styleSheets.length; i++) {
      const styleSheet = styleSheets[i];
      const link = styleSheet.match(/href="([^"]+)"/);
      if (link) {
        const href = link[1];
        console.log("Processing stylesheet href:", href);
        const styleTag = document.createElement("style");

        // Handle both WTTP URLs and regular relative URLs
        if (href.startsWith("wttp://")) {
          const { address, chain, path } = parseWttpUrl(href);

          try {
            const result = await fetchWTTPResource({
              siteAddress: address,
              path: path,
              network: chain,
            });

            if (
              result.response.head.status === 200n ||
              result.response.head.status === 206n
            ) {
              if (result.content) {
                const mimeType =
                  result.response.head.metadata.properties.mimeType;
                const content = decodeContent(result.content, mimeType);

                // Style sheets linked without the .css extension don't work
                // so we need to add the contents in a style tag

                // Process any embedded URLs in the CSS content
                const cssContent =
                  typeof content === "string"
                    ? content
                    : new TextDecoder().decode(result.content);
                const processedContent = await processCssUrls(
                  cssContent,
                  address,
                  chain
                );
                styleTag.innerHTML = processedContent;

                document.head.appendChild(styleTag);
                // Delete found link tag from fullContent
                fullContent = fullContent.replace(styleSheet, "");
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch stylesheet ${href}:`, error);
          }
        } else if (href.endsWith(".css") || href.includes("style")) {
          // Handle regular CSS files that might be relative URLs
          // These should be fetched from the same WTTP source as the main page
          console.log("Processing regular CSS file:", href);
          try {
            // Get the current WTTP URL from the page
            const currentUrl = window.location.pathname;
            let wttpUrl = currentUrl;

            if (process.env.SINGLE_CONTRACT) {
              wttpUrl = `${process.env.SINGLE_CONTRACT}${currentUrl}`;
            } else {
              wttpUrl = currentUrl.startsWith("/wttp/")
                ? currentUrl.split("/wttp/")[1]
                : currentUrl;
            }

            const { address, chain } = parseWttpUrl(wttpUrl);

            // Construct the path for the CSS file
            const cssPath = href;
            console.log(
              "Fetching CSS from WTTP site:",
              address,
              "path:",
              cssPath
            );

            const result = await fetchWTTPResource({
              siteAddress: address,
              path: cssPath,
              network: chain,
            });

            if (
              result.response.head.status === 200n ||
              result.response.head.status === 206n
            ) {
              if (result.content) {
                const mimeType =
                  result.response.head.metadata.properties.mimeType;
                const content = decodeContent(result.content, mimeType);
                console.log("CSS response MIME type:", mimeType);
                console.log("CSS content length:", result.content.length);

                // Process any embedded URLs in the CSS content
                const cssContent =
                  typeof content === "string"
                    ? content
                    : new TextDecoder().decode(result.content);
                const processedContent = await processCssUrls(
                  cssContent,
                  address,
                  chain
                );
                styleTag.innerHTML = processedContent;

                document.head.appendChild(styleTag);
                console.log("Successfully added style tag for:", href);
                // Remove the original link tag from fullContent
                fullContent = fullContent.replace(styleSheet, "");
              }
            } else {
              console.warn(
                `Failed to fetch CSS file ${href}: ${result.response.head.status} - Resource not found`
              );
              // Remove the original link tag even if fetch failed to prevent browser from trying to load it
              fullContent = fullContent.replace(styleSheet, "");
            }
          } catch (error) {
            console.warn(`Failed to process CSS file ${href}:`, error);
            // Remove the original link tag even if processing failed to prevent browser from trying to load it
            fullContent = fullContent.replace(styleSheet, "");
          }
        }
      }
    }
  }
  return fullContent;
}

export async function processScripts(fullContent) {
  const scripts = fullContent.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  if (scripts) {
    console.log("Found scripts:", scripts);
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const srcMatch = script.match(/src="([^"]+)"/);

      if (srcMatch) {
        // Handle scripts with src attribute
        const scriptSrc = srcMatch[1];

        // Check if the original script tag has type="module"
        const isModule =
          script.includes('type="module"') || script.includes("type='module'");
        if (scriptSrc.startsWith("wttp://")) {
          console.log("Processing wttp script:", scriptSrc);
          const { address, chain, path } = parseWttpUrl(scriptSrc);

          try {
            const result = await fetchWTTPResource({
              siteAddress: address,
              path: path,
              network: chain,
            });

            if (
              result.response.head.status === 200n ||
              result.response.head.status === 206n
            ) {
              if (result.content) {
                const mimeType =
                  result.response.head.metadata.properties.mimeType;
                const content = decodeContent(result.content, mimeType);
                const scriptTag = document.createElement("script");

                let scriptContent =
                  typeof content === "string"
                    ? content
                    : new TextDecoder().decode(result.content);

                // Validate script content before processing
                if (!scriptContent || scriptContent.trim() === "") {
                  console.warn("Empty script content, skipping:", scriptSrc);
                  fullContent = fullContent.replace(script, "");
                  continue;
                }

                // Additional integrity check for large scripts
                if (scriptContent.length > 50000) {
                  console.log(
                    "Large script detected, performing integrity check..."
                  );

                  // Check if this is an ES module - if so, skip Function validation as it doesn't support module syntax
                  const isESModule =
                    scriptContent.includes("import.meta") ||
                    scriptContent.includes("import ") ||
                    scriptContent.includes("export ");

                  if (!isESModule) {
                    // Only validate non-module scripts with Function constructor
                    try {
                      new Function(scriptContent);
                      console.log("Large script passed integrity check");
                    } catch (syntaxError) {
                      console.warn(
                        "Syntax error in large script, attempting recovery..."
                      );
                      console.warn("Syntax error:", syntaxError.message);

                      // Try re-decoding from raw bytes with explicit UTF-8
                      try {
                        const redecodedContent = new TextDecoder("utf-8", {
                          fatal: true,
                        }).decode(result.content);
                        new Function(redecodedContent);
                        console.log("Successfully re-decoded script content");
                        // Replace the problematic content with the corrected version
                        scriptContent = redecodedContent;
                      } catch (retryError) {
                        console.error(
                          "Failed to recover script content:",
                          retryError
                        );
                        fullContent = fullContent.replace(script, "");
                        continue;
                      }
                    }
                  } else {
                    console.log(
                      "ES module detected, skipping Function validation"
                    );
                  }
                }

                // For large modules or when original had src, use blob URL instead of innerHTML
                if (
                  isModule ||
                  scriptContent.length > 50000 ||
                  scriptContent.includes("import.meta") ||
                  scriptContent.includes("import ") ||
                  scriptContent.includes("export ")
                ) {
                  // Create a blob URL for the script content
                  const blob = new Blob([scriptContent], {
                    type: "application/javascript",
                  });
                  const blobUrl = URL.createObjectURL(blob);
                  scriptTag.src = blobUrl;
                  scriptTag.type = "module";

                  console.log(
                    "Created blob URL for large/module script:",
                    scriptSrc,
                    "Size:",
                    scriptContent.length
                  );
                } else {
                  // Small, non-module scripts can use innerHTML
                  try {
                    scriptTag.innerHTML = scriptContent;
                  } catch (error) {
                    console.warn(
                      "Failed to set script innerHTML for:",
                      scriptSrc,
                      error
                    );
                    console.warn(
                      "Problematic content preview:",
                      scriptContent.substring(0, 200)
                    );
                    fullContent = fullContent.replace(script, "");
                    continue;
                  }
                }

                try {
                  document.head.appendChild(scriptTag);
                  console.log("Successfully added script tag for:", scriptSrc);
                } catch (error) {
                  console.warn(
                    "Failed to append script tag for:",
                    scriptSrc,
                    error
                  );
                  console.warn(
                    "Script content preview:",
                    scriptTag.innerHTML
                      ? scriptTag.innerHTML.substring(0, 200)
                      : "no content"
                  );
                  fullContent = fullContent.replace(script, "");
                  continue;
                }
                // Delete found script tag from fullContent
                fullContent = fullContent.replace(script, "");
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch script ${scriptSrc}:`, error);
          }
        } else if (
          !scriptSrc.startsWith("http://") &&
          !scriptSrc.startsWith("https://") &&
          !scriptSrc.startsWith("//")
        ) {
          // Handle relative URLs and any non-absolute URLs
          // These should be fetched from the same WTTP source as the main page
          console.log("Processing relative JS file:", scriptSrc);
          try {
            // Get the current WTTP URL from the page
            const currentUrl = window.location.pathname;
            let wttpUrl = currentUrl;

            if (process.env.SINGLE_CONTRACT) {
              wttpUrl = `${process.env.SINGLE_CONTRACT}${currentUrl}`;
            } else {
              wttpUrl = currentUrl.startsWith("/wttp/")
                ? currentUrl.split("/wttp/")[1]
                : currentUrl;
            }

            const { address, chain } = parseWttpUrl(wttpUrl);
            const chainString = ":" + chain;

            // Construct the path for the JS file
            const jsPath = scriptSrc;

            // Use cached address resolution to avoid CSP issues
            let resolvedAddress;
            try {
              resolvedAddress = await getContractAddress(address);
              console.log(
                "Fetching JS from WTTP site:",
                resolvedAddress,
                "path:",
                jsPath
              );
            } catch (error) {
              console.error(`Failed to resolve address ${address}:`, error);
              continue; // Skip this script
            }

            const result = await fetchWTTPResource({
              siteAddress: resolvedAddress,
              path: jsPath,
              network: chain,
            });

            if (
              result.response.head.status === 200n ||
              result.response.head.status === 206n
            ) {
              if (result.content) {
                const mimeType =
                  result.response.head.metadata.properties.mimeType;
                const content = decodeContent(result.content, mimeType);
                console.log("JS response MIME type:", mimeType);
                console.log("JS content length:", result.content.length);

                // Debug: Check content integrity
                console.log("Raw content type:", typeof content);
                if (typeof content === "string") {
                  console.log(
                    "Content first 100 chars:",
                    content.substring(0, 100)
                  );
                  console.log(
                    "Content last 100 chars:",
                    content.substring(content.length - 100)
                  );
                }

                const scriptTag = document.createElement("script");

                let scriptContent =
                  typeof content === "string"
                    ? content
                    : new TextDecoder().decode(result.content);

                // Validate script content before processing
                if (!scriptContent || scriptContent.trim() === "") {
                  console.warn("Empty script content, skipping:", scriptSrc);
                  fullContent = fullContent.replace(script, "");
                  continue;
                }

                // Additional integrity check for large scripts
                if (scriptContent.length > 50000) {
                  console.log(
                    "Large script detected, performing integrity check..."
                  );

                  // Check if this is an ES module - if so, skip Function validation as it doesn't support module syntax
                  const isESModule =
                    scriptContent.includes("import.meta") ||
                    scriptContent.includes("import ") ||
                    scriptContent.includes("export ");

                  if (!isESModule) {
                    // Only validate non-module scripts with Function constructor
                    try {
                      new Function(scriptContent);
                      console.log("Large script passed integrity check");
                    } catch (syntaxError) {
                      console.warn(
                        "Syntax error in large script, attempting recovery..."
                      );
                      console.warn("Syntax error:", syntaxError.message);

                      // Try re-decoding from raw bytes with explicit UTF-8
                      try {
                        const redecodedContent = new TextDecoder("utf-8", {
                          fatal: true,
                        }).decode(result.content);
                        new Function(redecodedContent);
                        console.log("Successfully re-decoded script content");
                        // Replace the problematic content with the corrected version
                        scriptContent = redecodedContent;
                      } catch (retryError) {
                        console.error(
                          "Failed to recover script content:",
                          retryError
                        );
                        fullContent = fullContent.replace(script, "");
                        continue;
                      }
                    }
                  } else {
                    console.log(
                      "ES module detected, skipping Function validation"
                    );
                  }
                }

                // For large modules or when original had src, use blob URL instead of innerHTML
                if (
                  isModule ||
                  scriptContent.length > 50000 ||
                  scriptContent.includes("import.meta") ||
                  scriptContent.includes("import ") ||
                  scriptContent.includes("export ")
                ) {
                  // Create a blob URL for the script content
                  const blob = new Blob([scriptContent], {
                    type: "application/javascript",
                  });
                  const blobUrl = URL.createObjectURL(blob);
                  scriptTag.src = blobUrl;
                  scriptTag.type = "module";

                  console.log(
                    "Created blob URL for large/module script:",
                    scriptSrc,
                    "Size:",
                    scriptContent.length
                  );
                } else {
                  // Small, non-module scripts can use innerHTML
                  try {
                    scriptTag.innerHTML = scriptContent;
                  } catch (error) {
                    console.warn(
                      "Failed to set script innerHTML for:",
                      scriptSrc,
                      error
                    );
                    console.warn(
                      "Problematic content preview:",
                      scriptContent.substring(0, 200)
                    );
                    fullContent = fullContent.replace(script, "");
                    continue;
                  }
                }

                try {
                  document.head.appendChild(scriptTag);
                  console.log("Successfully added script tag for:", scriptSrc);
                } catch (error) {
                  console.warn(
                    "Failed to append script tag for:",
                    scriptSrc,
                    error
                  );
                  console.warn(
                    "Script content preview:",
                    scriptTag.innerHTML
                      ? scriptTag.innerHTML.substring(0, 200)
                      : "no content"
                  );
                  fullContent = fullContent.replace(script, "");
                  continue;
                }
                // console.log("content of script tag is: ", scriptTag.innerHTML);
                // Remove the original script tag from fullContent
                fullContent = fullContent.replace(script, "");
              }
            } else {
              console.warn(
                `Failed to fetch JS file ${scriptSrc}: ${result.response.head.status} - Resource not found`
              );
              // Remove the original script tag even if fetch failed to prevent browser from trying to load it
              fullContent = fullContent.replace(script, "");
            }
          } catch (error) {
            console.warn(`Failed to process JS file ${scriptSrc}:`, error);
            // Remove the original script tag even if processing failed to prevent browser from trying to load it
            fullContent = fullContent.replace(script, "");
          }
        }
      } else {
        // Handle embedded scripts (scripts without src attribute)
        console.log("Processing embedded script");

        // Extract the script content and any attributes
        const scriptContentMatch = script.match(
          /<script[^>]*>([\s\S]*?)<\/script>/i
        );
        if (scriptContentMatch) {
          const scriptContent = scriptContentMatch[1];

          // Extract any attributes from the original script tag
          const attributeMatches = script.match(/(\w+)="([^"]+)"/g);

          // Validate script content before execution
          if (!scriptContent || scriptContent.trim() === "") {
            console.warn("Empty or invalid script content, skipping execution");
            fullContent = fullContent.replace(script, "");
            continue;
          }

          // Check for common JS syntax issues that could cause "Unexpected end of input"
          const trimmedContent = scriptContent.trim();
          if (
            trimmedContent.endsWith(",") ||
            trimmedContent.endsWith("{") ||
            trimmedContent.endsWith("(")
          ) {
            console.warn(
              "Script content appears incomplete (ends with incomplete syntax), skipping execution"
            );
            console.warn(
              "Script content that appears incomplete:",
              scriptContent.substring(0, 500)
            );
            fullContent = fullContent.replace(script, "");
            continue;
          }

          // Execute the script content directly using eval
          try {
            console.log("Executing embedded script content");
            console.log(
              "Script content preview:",
              scriptContent.substring(0, 200) + "..."
            );

            // Try to parse the script first to check for syntax errors
            new Function(scriptContent);

            // If parsing succeeds, execute it
            eval(scriptContent);
            console.log("Successfully executed embedded script");
          } catch (error) {
            console.warn("Failed to execute embedded script:", error);
            console.warn(
              "Script content that failed:",
              scriptContent.substring(0, 500)
            );

            // If it's a syntax error, show more details
            if (error instanceof SyntaxError) {
              console.warn("Syntax error details:", error.message);
            }
          }

          // Remove the original script tag from fullContent
          fullContent = fullContent.replace(script, "");
        }
      }
    }
  }
  return fullContent;
}

export async function processImages() {
  // Find all img elements in the current document
  const images = document.querySelectorAll("img");

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const imageSrc = image.getAttribute("src");

    if (imageSrc && imageSrc.startsWith("wttp://")) {
      console.log("Found WTTP image tag", image);

      try {
        const { address, chain, path } = parseWttpUrl(imageSrc);

        const result = await fetchWTTPResource({
          siteAddress: address,
          path: path,
          chainId: chain,
        });

        if (
          result.response.head.status === 200n ||
          result.response.head.status === 206n
        ) {
          if (result.content) {
            const mimeType = result.response.head.metadata.properties.mimeType;
            const content = decodeContent(result.content, mimeType);

            // Convert content to base64 dataUrl for image tag
            const base64Content =
              typeof content === "string"
                ? btoa(content)
                : btoa(String.fromCharCode(...result.content));
            const dataUrl = `data:image/png;base64,${base64Content}`;
            image.src = dataUrl;

            console.log("Successfully updated image src for:", imageSrc);
          }
        } else {
          console.warn(
            `Failed to fetch image ${imageSrc}: ${result.response.head.status} - Resource not found`
          );
        }
      } catch (error) {
        console.warn(`Failed to process image ${imageSrc}:`, error);
      }
    } else if (
      imageSrc &&
      !imageSrc.startsWith("http://") &&
      !imageSrc.startsWith("https://") &&
      !imageSrc.startsWith("//") &&
      !imageSrc.startsWith("data:")
    ) {
      // Handle relative URLs and any non-absolute URLs
      // These should be fetched from the same WTTP source as the main page
      console.log("Processing relative image file:", imageSrc);
      try {
        // Get the current WTTP URL from the page
        const currentUrl = window.location.pathname;
        let wttpUrl = currentUrl;

        if (process.env.SINGLE_CONTRACT) {
          wttpUrl = `${process.env.SINGLE_CONTRACT}${currentUrl}`;
        } else {
          wttpUrl = currentUrl.startsWith("/wttp/")
            ? currentUrl.split("/wttp/")[1]
            : currentUrl;
        }

        const { address, chain } = parseWttpUrl(wttpUrl);
        const chainString = ":" + chain;

        // Construct the path for the image file
        const imagePath = imageSrc;

        // Use cached address resolution to avoid CSP issues
        let resolvedAddress;
        try {
          resolvedAddress = await getContractAddress(address);
          console.log(
            "Fetching image from WTTP site:",
            resolvedAddress,
            "path:",
            imagePath
          );
        } catch (error) {
          console.error(`Failed to resolve address ${address}:`, error);
          continue; // Skip this image
        }

        const result = await fetchWTTPResource({
          siteAddress: resolvedAddress,
          path: imagePath,
          chainId: chain,
        });

        if (
          result.response.head.status === 200n ||
          result.response.head.status === 206n
        ) {
          if (result.content) {
            const mimeType = result.response.head.metadata.properties.mimeType;
            const content = decodeContent(result.content, mimeType);
            console.log("Image response MIME type:", mimeType);
            console.log("Image content length:", result.content.length);

            // Convert content to base64 dataUrl for image tag
            const base64Content =
              typeof content === "string"
                ? btoa(content)
                : btoa(String.fromCharCode(...result.content));
            const dataUrl = `data:image/png;base64,${base64Content}`;
            image.src = dataUrl;

            console.log("Successfully updated image src for:", imageSrc);
          }
        } else {
          console.warn(
            `Failed to fetch image file ${imageSrc}: ${result.response.head.status} - Resource not found`
          );
        }
      } catch (error) {
        console.warn(`Failed to process image file ${imageSrc}:`, error);
      }
    }
  }
}
