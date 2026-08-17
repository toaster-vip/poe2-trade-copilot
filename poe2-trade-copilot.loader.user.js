// ==UserScript==
// @name         PoE2 Trade Copilot Loader
// @namespace    chatgpt-poe2-trade
// @version      1.6.0
// @description  Loads known-good PoE2 Trade core in page context and always-current GitHub patches
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const REPO = "toaster-vip/poe2-trade-copilot";
  const CORE_SHA = "ca6788b3cb741a844f1794737480df9d907eee44";
  const CORE_RAW = `https://raw.githubusercontent.com/${REPO}/${CORE_SHA}/poe2-trade-copilot.user.js`;
  const API_BASE = `https://api.github.com/repos/${REPO}/contents/`;
  const PATCH_PATHS = [
    "patches/result-collector.v1.js",
    "patches/search-source.v1.js"
  ];

  function decodeBase64Utf8(base64) {
    const clean = String(base64 || "").replace(/\s+/g, "");
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function fetchRaw(url) {
    const response = await fetch(`${url}?t=${Date.now()}`, {cache:"no-store", credentials:"omit"});
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return await response.text();
  }

  async function fetchMainFile(path) {
    const url = `${API_BASE}${path}?ref=main&t=${Date.now()}`;
    const response = await fetch(url, {
      cache:"no-store",
      credentials:"omit",
      headers:{"Accept":"application/vnd.github+json"}
    });
    if (!response.ok) throw new Error(`${path}: GitHub API HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload?.content) throw new Error(`${path}: GitHub API response missing content`);
    return {code:decodeBase64Utf8(payload.content), sha:payload.sha || null};
  }

  function stripHeader(code) {
    return String(code).replace(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m, "");
  }

  async function boot() {
    try {
      if (window.__POE2TC_LOADER_160_RUNNING) return;
      window.__POE2TC_LOADER_160_RUNNING = true;

      const core = stripHeader(await fetchRaw(CORE_RAW));
      (0, eval)(`${core}\n//# sourceURL=poe2tc-core-v0.5.1.js`);

      const loaded = [];
      for (const path of PATCH_PATHS) {
        const file = await fetchMainFile(path);
        const code = stripHeader(file.code);
        (0, eval)(`${code}\n//# sourceURL=poe2tc-${path.split('/').pop()}`);
        loaded.push(`${path.split('/').pop()}@${file.sha ? file.sha.slice(0,7) : "unknown"}`);
      }

      window.__POE2TC_LOADER_INFO = {version:"1.6.0", loaded};
      console.log(`[PoE2TC Loader] v1.6.0 loaded current main patches: ${loaded.join(", ")}`);

      const waitForStatus = () => {
        const el = document.querySelector("#ptc-status");
        if (!el) return setTimeout(waitForStatus, 250);
        el.textContent = `Loader 1.6.0 · current GitHub patches loaded`;
      };
      waitForStatus();
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
