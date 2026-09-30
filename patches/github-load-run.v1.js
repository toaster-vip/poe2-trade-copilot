(() => {
  "use strict";

  const VERSION = "github-load-run-1.2";
  const $ = (s, r = document) => r.querySelector(s);

  function status(text) {
    const el = $("#ptc-status");
    if (el) el.textContent = text;
    console.log("[PoE2TC GitHub Load+Run]", text);
  }

  function decodeBase64Utf8(base64) {
    const clean=String(base64||"").replace(/\s+/g,"");
    const binary=atob(clean);
    const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function refreshGroupedStatModuleIfNeeded(packet) {
    const groups=Array.isArray(packet?.statGroups)?packet.statGroups:[];
    if(!groups.length) return {ok:true,skipped:true};

    const current=window.__POE2TC_STAT_GROUPS_MODULE?.implementationVersion||"";
    if(current==="stat-groups-2.4") return {ok:true,skipped:true,current};

    status("Refreshing grouped-stat module from GitHub…");
    const url="https://api.github.com/repos/toaster-vip/poe2-trade-copilot/contents/patches/stat-groups.v1.js?ref=main&t="+Date.now();
    const response=await fetch(url,{
      cache:"no-store",
      credentials:"omit",
      headers:{"Accept":"application/vnd.github+json"}
    });
    if(!response.ok) throw new Error("stat-groups GitHub HTTP "+response.status);
    const payload=await response.json();
    if(!payload?.content) throw new Error("stat-groups GitHub response missing content");
    const code=decodeBase64Utf8(payload.content);
    (0,eval)(code+"\n//# sourceURL=poe2tc-stat-groups-refresh.js");

    const loaded=window.__POE2TC_STAT_GROUPS_MODULE?.implementationVersion||"";
    if(loaded!=="stat-groups-2.4") throw new Error("latest grouped-stat module did not activate");
    return {ok:true,skipped:false,current,loaded,sha:payload.sha||null};
  }

  function install() {
    const loadButton = $("#ptc-load-github");
    const runButton = $("#ptc-run");
    if (!loadButton || !runButton) return setTimeout(install, 250);
    if (loadButton.dataset.autoRun === VERSION) return;

    // Remove the original search-source click handler by cloning the button.
    const button = loadButton.cloneNode(true);
    loadButton.replaceWith(button);
    button.dataset.autoRun = VERSION;
    button.textContent = "LOAD + RUN FROM GITHUB";

    button.addEventListener("click", async () => {
      if (button.dataset.running === "1") return;
      button.dataset.running = "1";
      button.disabled = true;
      try {
        const loader = window.__POE2TC_LOAD_SEARCH_FROM_GITHUB;
        if (typeof loader !== "function") throw new Error("GitHub loader is not ready");
        const packet = await loader();
        await refreshGroupedStatModuleIfNeeded(packet);
        const fields = Array.isArray(packet?.fields) ? packet.fields : [];
        const summary = fields.map(x => {
          const range = [x.min != null ? `>=${x.min}` : "", x.max != null ? `<=${x.max}` : ""].filter(Boolean).join(" ");
          return `${x.label} ${range}`.trim();
        }).join(" · ");
        status(`Loaded fresh packet · ${summary || "ready"} · running…`);
        await new Promise(r => setTimeout(r, 150));
        runButton.click();
      } catch (error) {
        console.error("[PoE2TC GitHub Load+Run]", error);
        status(`GitHub search load failed: ${error.message}`);
      } finally {
        button.dataset.running = "0";
        button.disabled = false;
      }
    });

    console.log(`[PoE2TC GitHub Load+Run] ${VERSION} installed.`);
  }

  install();
})();

