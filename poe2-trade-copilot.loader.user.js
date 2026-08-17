// ==UserScript==
// @name         PoE2 Trade Copilot Loader
// @namespace    chatgpt-poe2-trade
// @version      1.5.0
// @description  Loads the known-good search core in page context plus read-only GitHub patches
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const BASE = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/";
  const CORE = "ca6788b3cb741a844f1794737480df9d907eee44/poe2-trade-copilot.user.js";
  const REMOTE = "main/";
  const SOURCES = [
    {name:"core-v0.5.1", url: BASE + CORE},
    {name:"result-collector", url: BASE + REMOTE + "patches/result-collector.v1.js"},
    {name:"search-source", url: BASE + REMOTE + "patches/search-source.v1.js"}
  ];

  async function fetchCode(url) {
    const response = await fetch(`${url}?t=${Date.now()}`, {cache:"no-store", credentials:"omit"});
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    let code = await response.text();
    return code.replace(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m, "");
  }

  async function boot() {
    try {
      if (window.__POE2TC_LOADER_150_RUNNING) return;
      window.__POE2TC_LOADER_150_RUNNING = true;

      for (const source of SOURCES) {
        const code = await fetchCode(source.url);
        (0, eval)(`${code}\n//# sourceURL=poe2tc-${source.name}.js`);
      }

      console.log("[PoE2TC Loader] v1.5.0 loaded page-world v0.5.1 core + read-only GitHub patches.");
    } catch (error) {
      console.error("[PoE2TC Loader] Failed:", error);
      const box = document.createElement("div");
      box.textContent = `PoE2 Trade Copilot loader failed: ${error.message}`;
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
