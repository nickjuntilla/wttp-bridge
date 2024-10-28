// handleWttpUrl.js
import { fetchContractResource } from "./fetchDataFromContract.js";
import { parseWttpUrl } from "./parseWttpUrl.js";
import { getRpcUrl } from "./getRpc.js";
import {
  processStyleSheets,
  processScripts,
  processImages,
} from "./processTagsFromHtml.js";

export async function handleWTTPURL() {
  // Get the current URL
  let url = window.location.href;

  let fullContent = "";

  let wttpUrl = url.split("/wttp/")[1];

  const { address, chain, path } = parseWttpUrl(wttpUrl);

  const rpcUrl = getRpcUrl(chain);

  console.log("Debug: Initial contract address or ENS:", address);
  console.log("Debug: ", rpcUrl);
  console.log("Debug: Path:", path);

  // Get the initial HTML

  const { content, contentType } = await fetchContractResource(
    address,
    path,
    rpcUrl
  );

  fullContent = content;

  // Parse fullContent, search for meta tags, link tags, and title tags
  // and pull them out then append them to the head tag of the document
  const headTags = `
  ${extractTags(fullContent, /<meta[^>]+>/g)} 
  ${extractTags(fullContent, /<link[^>]+>/g)} 
  ${extractTags(fullContent, /<title[^>]+>/g)}`;
  // Replace current head innerHTML with headTags
  document.head.innerHTML = headTags;

  // Replace script tags, style tags, and image tags with the content

  // Process stylesheets
  fullContent = await processStyleSheets(fullContent);

  // Process scripts
  fullContent = await processScripts(fullContent);

  // Append body tag to HTML after head and set innerHTML to fullContent
  const bodyTag = document.createElement("body");

  // Replace current body tag
  document.documentElement.replaceChild(bodyTag, document.body);

  // Set the body opacity to zero so we can wait for the images
  document.body.style.opacity = 0;

  document.body.innerHTML = fullContent;

  // Process images after DOM update
  setTimeout(async () => {
    // Stringify the document body
    let bodyContent = document.body.outerHTML;
    bodyContent = await processImages(bodyContent);
    document.body.innerHTML = bodyContent;
    document.body.style.opacity = 100;
  }, 100);
}

function extractTags(content, regex) {
  const tags = content.match(regex);
  if (tags && tags.length) {
    return tags.join("");
  }
  return "";
}
