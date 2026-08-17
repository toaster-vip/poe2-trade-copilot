// ==UserScript==
// @name         PoE2 Trade Copilot Loader
// @namespace    chatgpt-poe2-trade
// @version      1.0.0
// @description  Loads the latest PoE2 Trade Copilot from GitHub on each page load
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const SOURCE = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/poe2-trade-copilot.user.js";
  const CACHE_BUSTER = `?t=${Date.now()}`;

  async function boot() {
    try {
      const response = await fetch(SOURCE + CACHE_BUSTER, {
        cache: "no-store",
        credentials: "omit"
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let code = await response.text();

      // Remove the userscript metadata block before evaluating the program body.
      code = code.replace(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m, "");

      // Avoid accidentally running a GitHub HTML/error page as JavaScript.
      if (!code.includes("PoE2 Trade Copilot") && !code.includes("const VERSION")) {
        throw new Error("Downloaded file does not look like PoE2 Trade Copilot");
      }

      (0, eval)(`${code}\n//# sourceURL=poe2-trade-copilot.remote.js`);
      console.log("[PoE2TC Loader] Latest GitHub version loaded.");
    } catch (error) {
      console.error("[PoE2TC Loader] Failed to load remote script:", error);

      const box = document.createElement("div");
      box.textContent = `PoE2 Trade Copilot failed to load from GitHub: ${error.message}`;
      Object.assign(box.style, {
        position: "fixed",
        left: "10px",
        right: "10px",
        bottom: "10px",
        zIndex: "2147483647",
        padding: "10px",
        borderRadius: "8px",
        background: "#611",
        color: "white",
        font: "12px -apple-system,BlinkMacSystemFont,sans-serif"
      });
      document.body?.appendChild(box);
    }
  }

  if (document.body) {
    boot();
  } else {
    window.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();
