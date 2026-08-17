// ==UserScript==
// @name         PoE2 Trade Copilot Permanent Loader
// @namespace    chatgpt-poe2-trade
// @version      2.0.0
// @description  Permanent local loader. Fetches the current GitHub remote bootstrap; normal updates never require editing this script.
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const API = "https://api.github.com/repos/toaster-vip/poe2-trade-copilot/contents/remote-bootstrap.js?ref=main";

  function decodeBase64Utf8(base64) {
    const clean = String(base64 || "").replace(/\s+/g, "");
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function boot() {
    if (window.__POE2TC_PERMANENT_LOADER_RUNNING) return;
    window.__POE2TC_PERMANENT_LOADER_RUNNING = true;

    try {
      const response = await fetch(`${API}&t=${Date.now()}`, {
        cache: "no-store",
        credentials: "omit",
        headers: {"Accept":"application/vnd.github+json"}
      });
      if (!response.ok) throw new Error(`GitHub bootstrap HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.content) throw new Error("GitHub bootstrap response missing content");
      const code = decodeBase64Utf8(payload.content);
      (0, eval)(`${code}\n//# sourceURL=poe2tc-remote-bootstrap.js`);
      console.log(`[PoE2TC Permanent Loader] v2.0.0 loaded remote-bootstrap.js@${payload.sha ? payload.sha.slice(0,7) : "unknown"}`);
    } catch (error) {
      window.__POE2TC_PERMANENT_LOADER_RUNNING = false;
      console.error("[PoE2TC Permanent Loader] Failed:", error);
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
