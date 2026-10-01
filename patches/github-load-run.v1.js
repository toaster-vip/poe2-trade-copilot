(() => {
  "use strict";

  const VERSION = "github-load-run-1.7";
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
    if(current==="stat-groups-2.5") return {ok:true,skipped:true,current};

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
    if(loaded!=="stat-groups-2.5") throw new Error("latest grouped-stat module did not activate");
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
      let packet = null;
      try {
        const loader = window.__POE2TC_LOAD_SEARCH_FROM_GITHUB;
        if (typeof loader !== "function") throw new Error("GitHub loader is not ready");
        packet = await loader();
        window.__POE2TC_LAST_DEBUG = {
          ok:false,
          stage:"github-load-run",
          version:VERSION,
          packet,
          note:"Packet loaded; runtime verification pending"
        };

        if (packet?.discoverStat) {
          const discover = window.__POE2TC_DISCOVER_STAT_FROM_PACKET;
          if (typeof discover !== "function") throw new Error("Stat discovery module is not ready");
          status(`Loaded discovery packet · ${packet.discoverStat} · running…`);
          await discover(String(packet.discoverStat));
          return;
        }

        const runtime={
          directApi:runButton.dataset.directApiBridge||"",
          statBridge:runButton.dataset.statBridge||"",
          runWrapper:runButton.dataset.runWrapper||""
        };
        const expected={
          directApi:"direct-api-1.3",
          statBridge:"search-source-1.20",
          runWrapper:"run-wrapper-3.2"
        };
        window.__POE2TC_LAST_DEBUG = {
          ok:false,
          stage:"github-load-run",
          version:VERSION,
          packet,
          runtime,
          expected,
          note:"Packet loaded; checking runtime versions"
        };
        const stale=Object.keys(expected).filter(key=>runtime[key]!==expected[key]);
        if(stale.length){
          throw new Error("runtime patches are stale ("+
            stale.map(key=>key+"="+(runtime[key]||"missing")+" expected "+expected[key]).join(", ")+
            "). Reload the Trade page once.");
        }

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
        if (!packet) {
          try { packet = JSON.parse($("#ptc-box")?.value || "null"); } catch {}
        }
        window.__POE2TC_LAST_DEBUG = {
          ok:false,
          stage:"github-load-run",
          version:VERSION,
          packet,
          error:String(error?.message || error)
        };
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

