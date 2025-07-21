// getTagsFromHtml.js
import { parseWttpUrl } from "./parseWttpUrl.js";
import { WTTPHandler } from "@wttp/handler";

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

          // Create WTTP handler instance with the selected network's chain ID
          const wttp = new WTTPHandler(undefined, chain);

          // Fetch content from the WTTP site
          const url = `wttp://${address}${path}`;

          const response = await wttp.fetch(url);

          if (response.ok) {
            // Get the content type from headers
            const contentType = response.headers.get("Content-Type") || "";

            // Use the Response.text() method to get the body as text
            const content = await response.text();

            // Style sheets linked without the .css extension don't work
            // so we need to add the contents in a style tag

            if (contentType === "ipfs") {
              const jsonContent = JSON.parse(content);
              const contentLink = jsonContent.link;

              // Fetch the content from IPFS using a gateway
              const ipfsResponse = await fetch(parseIpfsLink(contentLink));

              // Check if the response is okay
              if (!ipfsResponse.ok) {
                throw new Error(
                  `Error fetching IPFS content: ${ipfsResponse.statusText}`
                );
              }

              // Read the response as a Blob for binary data
              const ipfsBlob = await ipfsResponse.blob();

              // console.log("Blob is: ", ipfsBlob);

              let _content = await ipfsBlob.text();

              styleTag.innerHTML = _content;
            } else {
              styleTag.innerHTML = content;
            }

            document.head.appendChild(styleTag);
            // Delete found link tag from fullContent
            fullContent = fullContent.replace(styleSheet, "");
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

            // Construct the full WTTP URL for the CSS file
            const cssPath = href.startsWith("/") ? href : `/${href}`;
            const cssWttpUrl = `wttp://${address}${cssPath}`;
            console.log("Fetching CSS from WTTP URL:", cssWttpUrl);

            // Create WTTP handler instance
            const wttp = new WTTPHandler(undefined, chain);

            const response = await wttp.fetch(cssWttpUrl);

            if (response.ok) {
              const contentType = response.headers.get("Content-Type") || "";
              const content = await response.text();
              console.log("CSS response content type:", contentType);
              console.log("CSS content length:", content.length);

              if (contentType === "ipfs") {
                const jsonContent = JSON.parse(content);
                const contentLink = jsonContent.link;

                const ipfsResponse = await fetch(parseIpfsLink(contentLink));

                if (!ipfsResponse.ok) {
                  throw new Error(
                    `Error fetching IPFS content: ${ipfsResponse.statusText}`
                  );
                }

                const ipfsBlob = await ipfsResponse.blob();
                let _content = await ipfsBlob.text();
                styleTag.innerHTML = _content;
              } else {
                styleTag.innerHTML = content;
              }

              document.head.appendChild(styleTag);
              console.log("Successfully added style tag for:", href);
              // Remove the original link tag from fullContent
              fullContent = fullContent.replace(styleSheet, "");
            } else {
              console.warn(
                `Failed to fetch CSS file ${href}: ${response.status} - ${response.statusText}`
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
        if (scriptSrc.startsWith("wttp://")) {
          console.log("Processing wttp script:", scriptSrc);
          const { address, chain, path } = parseWttpUrl(scriptSrc);

          // Create WTTP handler instance with the selected network's chain ID
          const wttp = new WTTPHandler(undefined, chain);

          // Fetch content from the WTTP site
          const url = `wttp://${address}${path}`;

          const response = await wttp.fetch(url);

          if (response.ok) {
            // Get the content type from headers
            const contentType = response.headers.get("Content-Type") || "";

            // Use the Response.text() method to get the body as text
            const content = await response.text();

            // console.log(
            //   "This is a script tag with a wttp link and with content",
            //   path,
            //   content,
            //   contentLink
            // );
            const scriptTag = document.createElement("script");

            if (contentType === "ipfs") {
              const jsonContent = JSON.parse(content);
              const contentLink = jsonContent.link;
              scriptTag.src = parseIpfsLink(contentLink);
            } else {
              scriptTag.innerHTML = content;
            }

            document.head.appendChild(scriptTag);
            // Delete found script tag from fullContent
            fullContent = fullContent.replace(script, "");
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

            // Construct the full WTTP URL for the JS file
            const jsPath = scriptSrc.startsWith("/")
              ? scriptSrc
              : `/${scriptSrc}`;
            const jsWttpUrl = `wttp://${address}${chainString}${jsPath}`;
            console.log("Fetching JS from WTTP URL:", jsWttpUrl);

            // Create WTTP handler instance
            const wttp = new WTTPHandler(undefined, chain);

            const response = await wttp.fetch(jsWttpUrl);

            if (response.ok) {
              const contentType = response.headers.get("Content-Type") || "";
              const content = await response.text();
              console.log("JS response content type:", contentType);
              console.log("JS content length:", content.length);

              const scriptTag = document.createElement("script");

              if (contentType === "ipfs") {
                const jsonContent = JSON.parse(content);
                const contentLink = jsonContent.link;
                scriptTag.src = parseIpfsLink(contentLink);
              } else {
                scriptTag.innerHTML = content;
              }

              document.head.appendChild(scriptTag);
              console.log("Successfully added script tag for:", scriptSrc);
              console.log("content of script tag is: ", scriptTag.innerHTML);
              // Remove the original script tag from fullContent
              fullContent = fullContent.replace(script, "");
            } else {
              console.warn(
                `Failed to fetch JS file ${scriptSrc}: ${response.status} - ${response.statusText}`
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

          // Execute the script content directly using eval
          try {
            console.log("Executing embedded script content");
            eval(scriptContent);
            console.log("Successfully executed embedded script");
          } catch (error) {
            console.warn("Failed to execute embedded script:", error);
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

        // Create WTTP handler instance with the selected network's chain ID
        const wttp = new WTTPHandler(undefined, chain);

        // Fetch content from the WTTP site
        const url = `wttp://${address}${path}`;

        const response = await wttp.fetch(url);

        if (response.ok) {
          // Get the content type from headers
          const contentType = response.headers.get("Content-Type") || "";

          // Use the Response.text() method to get the body as text
          const content = await response.text();

          // console.log(
          //   "This is an image tag with a wttp link and with content",
          //   imageSrc,
          //   content
          // );

          // if contentLink exists set the image src to the contentLink
          if (contentType === "ipfs") {
            const jsonContent = JSON.parse(content);
            const contentLink = jsonContent.link;
            image.src = parseIpfsLink(contentLink);
          } else {
            // convert content to base64 dataUrl for image tag
            const dataUrl = `data:image/png;base64,${content}`;
            image.src = dataUrl;
          }

          console.log("Successfully updated image src for:", imageSrc);
        } else {
          console.warn(
            `Failed to fetch image ${imageSrc}: ${response.status} - ${response.statusText}`
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

        // Construct the full WTTP URL for the image file
        const imagePath = imageSrc.startsWith("/") ? imageSrc : `/${imageSrc}`;
        const imageWttpUrl = `wttp://${address}${chainString}${imagePath}`;
        console.log("Fetching image from WTTP URL:", imageWttpUrl);

        // Create WTTP handler instance
        const wttp = new WTTPHandler(undefined, chain);

        const response = await wttp.fetch(imageWttpUrl);

        if (response.ok) {
          const contentType = response.headers.get("Content-Type") || "";
          const content = await response.text();
          console.log("Image response content type:", contentType);
          console.log("Image content length:", content.length);

          if (contentType === "ipfs") {
            const jsonContent = JSON.parse(content);
            const contentLink = jsonContent.link;
            image.src = parseIpfsLink(contentLink);
          } else {
            // convert content to base64 dataUrl for image tag
            const dataUrl = `data:image/png;base64,${content}`;
            image.src = dataUrl;
          }

          console.log("Successfully updated image src for:", imageSrc);
        } else {
          console.warn(
            `Failed to fetch image file ${imageSrc}: ${response.status} - ${response.statusText}`
          );
        }
      } catch (error) {
        console.warn(`Failed to process image file ${imageSrc}:`, error);
      }
    }
  }
}

function parseIpfsLink(link) {
  // if link has /ipfs/ in it then get everrything after /ipfs/
  // and add https://ipfs.io/ipfs/ to the front
  if (link.includes("/ipfs/")) {
    return `https://ipfs.io/ipfs/${link.split("/ipfs/")[1]}`;
  }

  // if link starts with ipfs:// then remove it and add https://ipfs.io/ipfs/
  if (link.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${link.split("ipfs://")[1]}`;
  }

  return link;
}
