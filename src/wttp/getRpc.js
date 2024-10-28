// getRpc.js
export function getRpcUrl(chain) {
  let rpcUrl = "";

  // Switch statement to get environmental variables for each ChainId
  switch (chain) {
    case "1":
      rpcUrl = process.env.MAINNET_RPC_URL;
      break;
    case "137":
      rpcUrl = process.env.POLYGON_RPC_URL;
      break;
    default:
      rpcUrl = process.env.POLYGON_RPC_URL;
  }

  return rpcUrl;
}
