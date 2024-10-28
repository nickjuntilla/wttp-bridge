// getTagsFromHtml.js
import { parseWttpUrl } from "./parseWttpUrl.js";
import { getRpcUrl } from "./getRpc.js";
import { fetchContractResource } from "./fetchDataFromContract.js";

export async function processStyleSheets(fullContent) {
  const styleSheets = fullContent.match(/<link[^>]+>/g);
  if (styleSheets) {
    for (let i = 0; i < styleSheets.length; i++) {
      const styleSheet = styleSheets[i];
      const link = styleSheet.match(/href="([^"]+)"/);
      if (link) {
        const href = link[1];
        if (href.startsWith("wttp://")) {
          const { address, chain, path } = parseWttpUrl(href);
          const rpcUrl = getRpcUrl(chain);
          const { content, contentType, contentLink } =
            await fetchContractResource(address, path, rpcUrl);

          // Style sheets linked without the .css extension don't work
          // so we need to add the contents in a style tag
          const styleTag = document.createElement("style");
          if (contentLink && contentLink.startsWith("http")) {
            // Fetch the content from IPFS using a gateway
            const ipfsResponse = await fetch(contentLink);

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

          // TODO: Handle non-http IPFS contentLinks

          document.head.appendChild(styleTag);
          // Delete found link tag from fullContent
          fullContent = fullContent.replace(styleSheet, "");
        }
      }
    }
  }
  return fullContent;
}

export async function processScripts(fullContent) {
  const scripts = fullContent.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  if (scripts) {
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const srcMatch = script.match(/src="([^"]+)"/);
      if (srcMatch) {
        const scriptSrc = srcMatch[1];
        if (scriptSrc.startsWith("wttp://")) {
          const { address, chain, path } = parseWttpUrl(scriptSrc);
          const rpcUrl = getRpcUrl(chain);
          const { content, contentType, contentLink } =
            await fetchContractResource(address, path, rpcUrl);
          // console.log(
          //   "This is a script tag with a wttp link and with content",
          //   scriptSrc,
          //   content
          // );
          const scriptTag = document.createElement("script");
          if (contentLink && contentLink.startsWith("http")) {
            scriptTag.src = contentLink;
            // TODO: handle pure non-http IPFS contentLinks
          } else {
            scriptTag.innerHTML = content;
          }

          document.head.appendChild(scriptTag);
          // Delete found script tag from fullContent
          fullContent = fullContent.replace(script, "");
        }
      }
    }
  }
  return fullContent;
}

export async function processImages(bodyContent) {
  const images = bodyContent.match(/<img[^>]+>/g);

  if (images) {
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      console.log("Found image tag", image);
      const src = image.match(/src="([^"]+)"/);

      if (src) {
        const imageSrc = src[1];
        if (imageSrc.startsWith("wttp://")) {
          // Get other attributes from img tag
          const attributes = image.match(
            /(alt|height|width|style|class)="([^"]+)"/g
          );
          const { address, chain, path } = parseWttpUrl(imageSrc);
          const rpcUrl = getRpcUrl(chain);
          const { content, contentType, contentLink } =
            await fetchContractResource(address, path, rpcUrl);
          // console.log(
          //   "This is an image tag with a wttp link and with content",
          //   imageSrc,
          //   content
          // );
          const imageTag = document.createElement("img");

          // if contentLink exists set the image src to the contentLink
          if (contentLink && contentLink.startsWith("http")) {
            imageTag.src = contentLink;
            // TODO: handle pure non-http IPFS contentLinks
          } else {
            // convert content to base64 dataUrl for image tag
            const dataUrl = `data:image/png;base64,${content}`;
            imageTag.src = dataUrl;
          }

          // Add attributes back
          if (attributes) {
            for (let j = 0; j < attributes.length; j++) {
              const attribute = attributes[j];
              const key = attribute.split("=")[0];
              const value = attribute.split("=")[1].replace(/"/g, "");
              imageTag.setAttribute(key, value);
            }
          }

          // Replace image tag in bodyContent with the new image tag
          bodyContent = bodyContent.replace(image, imageTag.outerHTML);
        }
      }
    }
    document.body.innerHTML = bodyContent;
  }
  return bodyContent;
}
