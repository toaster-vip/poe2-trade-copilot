// ==UserScript==
// @name         PoE2 Trade Copilot
// @namespace    chatgpt-poe2-trade
// @version      0.6.4
// @description  Resilient remote bootstrap for PoE2 Trade Copilot core and GitHub patches
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const VERSION = "0.6.5";
  const REPO = "toaster-vip/poe2-trade-copilot";
  const CORE_SHA = "ca6788b3cb741a844f1794737480df9d907eee44";
  const API_BASE = `https://api.github.com/repos/${REPO}/contents/`;

  const CRITICAL_MODULES = [
    "patches/pre-run-reset.v1.js",
    "patches/packet-guard.v1.js",
    "patches/result-collector.v1.js",
    "patches/search-source.v1.js",
    "patches/stat-groups.v1.js",
    "patches/github-load-run.v1.js",
    "patches/run-wrapper.v1.js"
  ];

  const OPTIONAL_MODULES = [
    "patches/panel-minimize.v1.js",
    "patches/stat-discovery.v1.js"
  ];

  function decodeBase64Utf8(base64) {
    const clean = String(base64 || "").replace(/\s+/g, "");
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function fetchApiFile(path, ref) {
    const url = `${API_BASE}${path}?ref=${encodeURIComponent(ref)}&t=${Date.now()}`;
    const response = await fetch(url, {
      cache:"no-store",
      credentials:"omit",
      headers:{"Accept":"application/vnd.github+json"}
    });
    if (!response.ok) throw new Error(`${path}@${ref}: GitHub API HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload?.content) throw new Error(`${path}@${ref}: GitHub API response missing content`);
    return {code:decodeBase64Utf8(payload.content),sha:payload.sha||null};
  }

  function stripHeader(code) {
    return String(code).replace(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m, "");
  }

  function execute(code,label) {
    const wrapped = `${stripHeader(code)}\n//# sourceURL=${label}`;
    return (new Function(wrapped))();
  }

  async function loadModule(path, required) {
    try {
      const file=await fetchApiFile(path,"main");
      execute(file.code,`poe2tc-${path.split("/").pop()}`);
      return {ok:true,path,sha:file.sha||null};
    } catch(error) {
      console.error(`[PoE2TC ${VERSION}] ${required?"Critical":"Optional"} module failed: ${path}`,error);
      if(required) throw new Error(`${path}: ${error?.message||error}`);
      return {ok:false,path,error:String(error?.message||error)};
    }
  }

  async function boot() {
    if(window.__POE2TC_BOOT_064_RUNNING) return;
    window.__POE2TC_BOOT_064_RUNNING=true;
    try {
      const core=await fetchApiFile("poe2-trade-copilot.user.js",CORE_SHA);
      execute(core.code,"poe2tc-core-v0.5.1.js");

      const loaded=[];
      const optionalErrors=[];
      for(const path of CRITICAL_MODULES){
        const result=await loadModule(path,true);
        loaded.push(`${path.split("/").pop()}@${result.sha?result.sha.slice(0,7):"unknown"}`);
      }
      for(const path of OPTIONAL_MODULES){
        const result=await loadModule(path,false);
        if(result.ok) loaded.push(`${path.split("/").pop()}@${result.sha?result.sha.slice(0,7):"unknown"}`);
        else optionalErrors.push(result);
      }

      window.__POE2TC_REMOTE_INFO={version:VERSION,loaded,optionalErrors};
      console.log(`[PoE2TC] loader ${VERSION} ready: ${loaded.join(", ")}`);
    } catch(error) {
      console.error("[PoE2TC] bootstrap failed",error);
      const box=document.createElement("div");
      box.textContent=`PoE2 Trade Copilot ${VERSION} failed: ${error.message}`;
      Object.assign(box.style,{
        position:"fixed",left:"10px",right:"10px",bottom:"10px",
        zIndex:"2147483647",padding:"10px",borderRadius:"8px",
        background:"#611",color:"white",
        font:"12px -apple-system,BlinkMacSystemFont,sans-serif"
      });
      document.body?.appendChild(box);
      window.__POE2TC_BOOT_064_RUNNING=false;
    }
  }

  if(document.body) boot();
  else window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
