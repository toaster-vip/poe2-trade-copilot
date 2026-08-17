// ==UserScript==
// @name         PoE2 Trade Copilot Loader
// @namespace    chatgpt-poe2-trade
// @version      1.2.0
// @description  Loads the latest PoE2 Trade Copilot and hotfixes from GitHub on each page load
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const BASE = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/";
  const SOURCES = [
    "poe2-trade-copilot.user.js",
    "patches/result-collector.v1.js",
    "patches/search-source.v1.js"
  ];

  async function fetchCode(path) {
    const response = await fetch(`${BASE}${path}?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit"
    });

    if (!response.ok) {
      throw new Error(`${path}: HTTP ${response.status}`);
    }

    let code = await response.text();
    code = code.replace(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m, "");
    return code;
  }

  async function boot() {
    try {
      for (const path of SOURCES) {
        const code = await fetchCode(path);
        (0, eval)(`${code}\n//# sourceURL=${path}`);
      }

      console.log("[PoE2TC Loader] Latest GitHub version + patches loaded.");
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
