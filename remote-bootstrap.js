(() => {
  "use strict";

  const VERSION = "remote-bootstrap-1.7";
  const REPO = "toaster-vip/poe2-trade-copilot";
  const CORE_SHA = "ca6788b3cb741a844f1794737480df9d907eee44";
  const CORE_PATH = "poe2-trade-copilot.user.js";
  const CORE_RAW = `https://raw.githubusercontent.com/${REPO}/${CORE_SHA}/${CORE_PATH}`;
  const API_BASE = `https://api.github.com/repos/${REPO}/contents/`;

  const CRITICAL_MODULES = [
    "patches/pre-run-reset.v1.js",
    "patches/result-collector.v1.js",
    "patches/search-source.v1.js",
    "patches/github-load-run.v1.js"
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

  async function fetchApiFile(path, ref = "main") {
    const url = `${API_BASE}${path}?ref=${encodeURIComponent(ref)}&t=${Date.now()}`;
    const response = await fetch(url, {cache:"no-store",credentials:"omit",headers:{"Accept":"application/vnd.github+json"}});
    if (!response.ok) throw new Error(`${path}@${ref}: GitHub API HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload?.content) throw new Error(`${path}@${ref}: GitHub API response missing content`);
    return {code:decodeBase64Utf8(payload.content),sha:payload.sha||null};
  }

  async function fetchCore() {
    try {
      const response = await fetch(`${CORE_RAW}?t=${Date.now()}`, {cache:"no-store",credentials:"omit"});
      if (!response.ok) throw new Error(`core raw HTTP ${response.status}`);
      return {code:await response.text(),source:"raw"};
    } catch (error) {
      console.warn("[PoE2TC Remote Bootstrap] Core raw failed; using API fallback", error);
      const file = await fetchApiFile(CORE_PATH, CORE_SHA);
      return {code:file.code,source:"api-fallback"};
    }
  }

  function stripHeader(code) { return String(code).replace(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m, ""); }

  async function loadModule(path, required) {
    try {
      const file = await fetchApiFile(path, "main");
      (0,eval)(`${stripHeader(file.code)}\n//# sourceURL=poe2tc-${path.split('/').pop()}`);
      return {ok:true,path,sha:file.sha||null};
    } catch (error) {
      console.error(`[PoE2TC Remote Bootstrap] ${required?"Critical":"Optional"} module failed: ${path}`, error);
      if (required) throw error;
      return {ok:false,path,error:String(error?.message||error)};
    }
  }

  async function boot() {
    if (window.__POE2TC_REMOTE_BOOTSTRAP_RUNNING) return;
    window.__POE2TC_REMOTE_BOOTSTRAP_RUNNING = true;
    try {
      const coreFile = await fetchCore();
      (0,eval)(`${stripHeader(coreFile.code)}\n//# sourceURL=poe2tc-core-v0.5.1.js`);
      const loaded=[],optionalErrors=[];
      for (const path of CRITICAL_MODULES) { const result=await loadModule(path,true); loaded.push(`${path.split('/').pop()}@${result.sha?result.sha.slice(0,7):"unknown"}`); }
      for (const path of OPTIONAL_MODULES) { const result=await loadModule(path,false); if(result.ok) loaded.push(`${path.split('/').pop()}@${result.sha?result.sha.slice(0,7):"unknown"}`); else optionalErrors.push({path:result.path,error:result.error}); }
      window.__POE2TC_REMOTE_INFO={version:VERSION,coreSource:coreFile.source,loaded,optionalErrors};
      console.log(`[PoE2TC Remote Bootstrap] ${VERSION} loaded: ${loaded.join(", ")}`);
      const showStatus=()=>{ const el=document.querySelector("#ptc-status"); if(!el) return setTimeout(showStatus,250); el.textContent=optionalErrors.length?`Remote ${VERSION} · core ready · optional UI degraded`:`Remote ${VERSION} · core ready`; }; showStatus();
    } catch(error) {
      console.error("[PoE2TC Remote Bootstrap] Critical boot failed:",error);
      const box=document.createElement("div"); box.textContent=`PoE2 Trade Copilot critical startup failed: ${error.message}`;
      Object.assign(box.style,{position:"fixed",left:"10px",right:"10px",bottom:"10px",zIndex:"2147483647",padding:"10px",borderRadius:"8px",background:"#611",color:"white",font:"12px -apple-system,BlinkMacSystemFont,sans-serif"}); document.body?.appendChild(box); window.__POE2TC_REMOTE_BOOTSTRAP_RUNNING=false;
    }
  }

  if(document.body) boot(); else window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
