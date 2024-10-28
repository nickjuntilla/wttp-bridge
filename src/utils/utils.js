// utils.js
export function hexToUtf8(hex) {
  // Ensure hex is a string
  if (typeof hex !== "string") {
    throw new TypeError("Expected a string");
  }

  // Remove the "0x" prefix if present
  hex = hex.startsWith("0x") ? hex.slice(2) : hex;

  // Convert the hex string into bytes (Uint8Array)
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
  );

  // Decode bytes into a UTF-8 string
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}
