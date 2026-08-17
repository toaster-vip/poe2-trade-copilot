// ==UserScript==
// @name         PoE2 Trade Copilot
// @namespace    chatgpt-poe2-trade
// @version      0.6.2
// @description  Remote bootstrap for PoE2 Trade Copilot core and GitHub patches
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const CORE = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/ca6788b3cb741a844f1794737480df9d907eee44/poe2-trade-copilot.user.js";
  const BASE = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/";
  const PATCHES = ["patches/result-collector.v1.js","patches/search-source.v1.js"];

  async function fetchCode(url) {
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {cache:"no-store",credentials:"omit"});
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    let code = await response.text();
    return code.replace(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m, "");
  }

  function injectRetries(core) {
    const oldLine = 'const r=await chooseSelect(spec); result.audit.push(r);\n    if(!r.ok){ result.reason="select_failed"; return result; }';
    const newBlock = `let r=null;\n    for(let attempt=1;attempt<=4;attempt++){\n      r=await chooseSelect(spec);\n      if(r.ok){ if(attempt>1) dbg("select-recovered",{ok:true,label:spec.label,value:spec.value,attempt}); break; }\n      if(attempt<4){\n        dbg("select-retry",{ok:false,label:spec.label,value:spec.value,attempt,reason:r.reason||"selection_failed"});\n        status(\`Retrying \${spec.label} (\${attempt+1}/4)...\`);\n        await sleep(400*attempt);\n      }\n    }\n    result.audit.push(r);\n    if(!r?.ok){ result.reason="select_failed"; return result; }`;
    if (!core.includes(oldLine)) throw new Error("retry injection target not found");
    return core.replace(oldLine,newBlock);
  }

  async function boot() {
    try {
      let core = await fetchCode(CORE);
      core = injectRetries(core);
      (0, eval)(`${core}\n//# sourceURL=poe2-trade-copilot.core.v0.5.1+remote-0.6.2.js`);
      for (const path of PATCHES) {
        const code = await fetchCode(BASE + path);
        (0, eval)(`${code}\n//# sourceURL=${path}`);
      }
      console.log("[PoE2TC Bootstrap] remote 0.6.2 loaded with in-core select retries.");
    } catch (error) {
      console.error("[PoE2TC Bootstrap] Failed:", error);
      const box=document.createElement("div");
      box.textContent=`PoE2 Trade Copilot bootstrap failed: ${error.message}`;
      Object.assign(box.style,{position:"fixed",left:"10px",right:"10px",bottom:"10px",zIndex:"2147483647",padding:"10px",borderRadius:"8px",background:"#611",color:"white",font:"12px -apple-system,BlinkMacSystemFont,sans-serif"});
      document.body?.appendChild(box);
    }
  }

  if(document.body) boot(); else window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
