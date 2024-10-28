// fetchDataFromContract.js
import { ethers } from "ethers";
import webContractV1Abi from "../abis/webContractV1.js";
import { hexToUtf8 } from "../utils/utils.js";

export async function fetchContractResource(address, path, rpcurl) {
  const provider = new ethers.JsonRpcProvider(rpcurl);
  const contract = new ethers.Contract(address, webContractV1Abi, provider);

  try {
    console.log(`Fetching total chunks for path: ${path}`);
    const totalChunks = await contract.getResource(path.toString());

    console.log(`Total chunks to fetch: ${totalChunks[0]}`);

    let content = "";
    let contentType = "";
    let contentLink = "";

    for (let i = 0; i < totalChunks[0]; i++) {
      console.log(
        `Fetching chunk ${i + 1} of ${totalChunks} for path: ${path}`
      );
      const result = await contract.getResourceChunk(path, i);

      console.log(result);

      const hexString = result[0]; // Example hex string (hello world)
      const utf8String = hexToUtf8(hexString);
      console.log(utf8String); // Output: hello world

      content += utf8String; // Append the chunk
      contentType = result[1]; // Keep content type consistent

      console.log(`Fetched chunk ${i + 1}:`, result[0]);
    }

    // if content type is ipfs the populate contentLink with the
    // link parsed from the json parsed content
    // Also check to make sure it's html for now
    // later this will have to check other link types
    // to make sure the gateway can handle them
    if (contentType === "ipfs") {
      const jsonContent = JSON.parse(content);
      contentLink = jsonContent.link;
    }

    console.log(`Completed fetching resource for path: ${path}`);
    console.log(`Content type: ${contentType}`);
    console.log(`Content: ${content}`);
    console.log(`Content link: ${contentLink}`);
    return { content, contentType, contentLink };
  } catch (error) {
    console.error("Error fetching resource chunks:", error);
    return null;
  }
}
