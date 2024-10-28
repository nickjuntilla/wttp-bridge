// index.js
import { handleWTTPURL } from "./wttp/handleWttpUrl.js";

document.addEventListener("DOMContentLoaded", function () {
  try {
    handleWTTPURL();
  } catch (e) {
    console.error(e);
    document.getElementById("content").innerHTML = "Error loading content.";
  }
});
