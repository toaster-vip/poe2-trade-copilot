// ==UserScript==
// @name         PoE2 Trade Copilot
// @namespace    chatgpt-poe2-trade
// @version      0.6.1
// @description  Remote bootstrap for PoE2 Trade Copilot core and GitHub patches
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  // Pin the last known-good full v0.5.1 core so this bootstrap can stay tiny.
  const CORE = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/ca6788b3cb741a844f1794737480df9d907eee44/poe2-trade-copilot.user.js";
  const BASE = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/";
  const PATCHES = [
    "patches/result-collector.v1.js",
    "patches/search-source.v1.js",
    "patches/select-retry.v1.js"
  ];

  async function fetchCode(url) {
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
      cache: "no-store",
      credentials:"omit"
    });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    let code = await response.text();
    code = code.replace(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m, "");
    return code;
  }

  async function boot() {
    try {
      const core = await fetchCode(CORE);
      (0, eval)(`${core}\n//# sourceURL=poe2-trade-copilot.core.v0.5.1.js`);

      for (const path of PATCHES) {
        const code = await fetchCode(BASE + path);
        (0, eval)(`${code}\n//# sourceURL=${path}`);
      }

      console.log("[PoE2TC Bootstrap] Core + current patches loaded.");
    } catch (error) {
      console.error("[PoE2TC Bootstrap] Failed:", error);
      const box = document.createElement("div");
      box.textContent = `PoE2 Trade Copilot bootstrap failed: ${error.message}`;
      Object.assign(box.style, {
        position:"fixed", left:"10px", right:"10px", bottom:"10px", zIndex:"2147483647",
        padding:"10px", borderRadius:"8px", background:"#611", color:"white",
        font:"12px -apple-system,BlinkMacSystemFont,sans-serif"
      });
      document.body?.appendChild(box);
    }
  }

  if (document.body) boot();
  else window.addEventListener("DOMContentLoaded", boot, {once:true});
})();
