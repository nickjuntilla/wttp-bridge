// parseWttpUrl.js

export function parseWttpUrl(url) {
  try {
    console.log("Parsing wttp link:", url);
    // If url includes wttp://, remove it
    let wttpUrl = url.startsWith("wttp://") ? url.split("wttp://")[1] : url;

    // Remove any parameters from the end of the url
    wttpUrl = wttpUrl.split("?")[0];

    // Remove trailing backslash
    wttpUrl = wttpUrl.endsWith("/") ? wttpUrl.slice(0, -1) : wttpUrl;

    // if _url starts with /wttp/, remove it
    wttpUrl = wttpUrl.startsWith("/wttp/")
      ? wttpUrl.split("/wttp/")[1]
      : wttpUrl;

    // Parse out whatever is between the wttp:// and the first /
    let chain = "";
    let path = "/";
    let address = wttpUrl;

    // Check if there is a forward slash
    if (wttpUrl.includes("/")) {
      address = wttpUrl.split("/")[0];

      // Path is everything after the first / in the wttpUrl
      path = `/${wttpUrl.split("/").slice(1).join("/")}`;
    }

    // Test if there is a : in the wttpUrl
    if (wttpUrl.includes(":")) {
      address = wttpUrl.split(":")[0];

      chain = wttpUrl.split(":")[1].split("/")[0];
    }

    // Default chain to 137 if none is provided
    if (!chain) {
      chain = "137";
    }

    console.log("Parsed wttp link:", { chain, path, address });

    return { address, chain, path };
  } catch (error) {
    console.error("Error parsing wttp link:", error);
    return null;
  }
}
