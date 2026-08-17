(() => {
  "use strict";

  const PATCH_VERSION = "search-source-1.1";
  const SOURCE = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/data/latest-search.json";
  const $ = s => document.querySelector(s);

  async function loadFromGitHub() {
    const box = $("#ptc-box");
    const status = $("#ptc-status");
    if (!box) throw new Error("search box not found");
    if (status) status.textContent = "Loading search packet from GitHub...";
    const response = await fetch(`${SOURCE}?t=${Date.now()}`, {cache:"no-store", credentials:"omit"});
    if (!response.ok) throw new Error(`GitHub search packet HTTP ${response.status}`);
    const parsed = JSON.parse(await response.text());
    if (!parsed || typeof parsed !== "object") throw new Error("invalid search packet");
    box.value = JSON.stringify(parsed, null, 2);
    box.dispatchEvent(new Event("input", {bubbles:true}));
    box.dispatchEvent(new Event("change", {bubbles:true}));
    try { localStorage.setItem("ptc-packet-v51", box.value); } catch {}
    if (status) status.textContent = "Loaded latest search packet from GitHub.";
    return parsed;
  }

  function install() {
    const box = $("#ptc-box");
    const runButton = $("#ptc-run");
    if (!box || !runButton) { setTimeout(install, 300); return; }
    if ($("#ptc-load-github")) return;

    const button = document.createElement("button");
    button.id = "ptc-load-github";
    button.type = "button";
    button.textContent = "LOAD FROM GITHUB";
    button.setAttribute("style", runButton.getAttribute("style") || "");
    button.style.cssText += ";padding:9px;background:#26313e;color:#fff;border:1px solid #526071;border-radius:7px;font-weight:600;";

    // v0.5.1 has no #ptc wrapper. Inject beside RUN / VERIFY using the actual button grid.
    const grid = runButton.parentElement;
    if (!grid) { setTimeout(install, 300); return; }
    grid.insertBefore(button, runButton);

    button.addEventListener("click", async () => {
      try { await loadFromGitHub(); }
      catch (error) {
        console.error("[PoE2TC Search Source]", error);
        const status = $("#ptc-status");
        if (status) status.textContent = `GitHub search load failed: ${error.message}`;
      }
    });

    window.__POE2TC_LOAD_SEARCH_FROM_GITHUB = loadFromGitHub;
    console.log(`[PoE2TC Search Source] ${PATCH_VERSION} installed`);
  }

  install();
})();
