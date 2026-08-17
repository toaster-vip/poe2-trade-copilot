// ==UserScript==
// @name         PoE2 Trade Copilot Loader
// @namespace    chatgpt-poe2-trade
// @version      1.6.1
// @description  Loads known-good PoE2 Trade core in page context and always-current GitHub patches
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const REPO = "toaster-vip/poe2-trade-copilot";
  const CORE_SHA = "ca6788b3cb741a844f1794737480df9d907eee44";
  const CORE_PATH = "poe2-trade-copilot.user.js";
  const CORE_RAW = `https://raw.githubusercontent.com/${REPO}/${CORE_SHA}/${CORE_PATH}`;
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

  async function fetchFile(path, ref = "main") {
    const url = `${API_BASE}${path}?ref=${encodeURIComponent(ref)}&t=${Date.now()}`;
    const response = await fetch(url, {
      cache:"no-store",
      credentials:"omit",
      headers:{"Accept":"application/vnd.github+json"}
    });
    if (!response.ok) throw new Error(`${path}@${ref}: GitHub API HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload?.content) throw new Error(`${path}@${ref}: GitHub API response missing content`);
    return {code:decodeBase64Utf8(payload.content), sha:payload.sha || null};
  }

  async function fetchCore() {
    try {
      return {code:await fetchRaw(CORE_RAW), source:"raw"};
    } catch (rawError) {
      console.warn("[PoE2TC Loader] Core raw fetch failed; falling back to GitHub API", rawError);
      const file = await fetchFile(CORE_PATH, CORE_SHA);
      return {code:file.code, source:"api-fallback"};
    }
  }

  function stripHeader(code) {
    return String(code).replace(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m, "");
  }

  async function boot() {
    try {
      if (window.__POE2TC_LOADER_161_RUNNING) return;
      window.__POE2TC_LOADER_161_RUNNING = true;

      const coreFile = await fetchCore();
      const core = stripHeader(coreFile.code);
      (0, eval)(`${core}\n//# sourceURL=poe2tc-core-v0.5.1.js`);

      const loaded = [];
      for (const path of PATCH_PATHS) {
        const file = await fetchFile(path, "main");
        const code = stripHeader(file.code);
        (0, eval)(`${code}\n//# sourceURL=poe2tc-${path.split('/').pop()}`);
        loaded.push(`${path.split('/').pop()}@${file.sha ? file.sha.slice(0,7) : "unknown"}`);
      }

      window.__POE2TC_LOADER_INFO = {version:"1.6.1", coreSource:coreFile.source, loaded};
      console.log(`[PoE2TC Loader] v1.6.1 loaded core via ${coreFile.source}; patches: ${loaded.join(", ")}`);

      const waitForStatus = () => {
        const el = document.querySelector("#ptc-status");
        if (!el) return setTimeout(waitForStatus, 250);
        el.textContent = `Loader 1.6.1 · core ${coreFile.source} · current GitHub patches loaded`;
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
