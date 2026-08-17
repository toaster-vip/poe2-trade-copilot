(() => {
  "use strict";

  const PATCH_VERSION = "search-source-1";
  const SOURCE = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/data/latest-search.json";
  const $ = s => document.querySelector(s);

  async function loadFromGitHub() {
    const box = $("#ptc-box");
    const status = $("#ptc-status");
    if (!box) throw new Error("search box not found");

    if (status) status.textContent = "Loading search packet from GitHub...";

    const response = await fetch(`${SOURCE}?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit"
    });

    if (!response.ok) throw new Error(`GitHub search packet HTTP ${response.status}`);

    const text = await response.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("invalid search packet");

    box.value = JSON.stringify(parsed, null, 2);
    try { localStorage.setItem("ptc-packet-v51", box.value); } catch {}

    if (status) status.textContent = "Loaded latest search packet from GitHub.";
    return parsed;
  }

  function install() {
    const panel = $("#ptc");
    const runButton = $("#ptc-run");
    if (!panel || !runButton) {
      setTimeout(install, 250);
      return;
    }

    if ($("#ptc-load-github")) return;

    const button = document.createElement("button");
    button.id = "ptc-load-github";
    button.textContent = "LOAD FROM GITHUB";
    Object.assign(button.style, {
      padding: "9px",
      background: "#26313e",
      color: "#fff",
      border: "1px solid #526071",
      borderRadius: "7px",
      fontWeight: "600"
    });

    const grid = runButton.parentElement;
    grid?.insertBefore(button, runButton);

    button.onclick = async () => {
      try {
        await loadFromGitHub();
      } catch (error) {
        console.error("[PoE2TC Search Source]", error);
        const status = $("#ptc-status");
        if (status) status.textContent = `GitHub search load failed: ${error.message}`;
      }
    };

    window.__POE2TC_LOAD_SEARCH_FROM_GITHUB = loadFromGitHub;

    const badge = document.createElement("div");
    badge.textContent = PATCH_VERSION;
    Object.assign(badge.style, {fontSize:"10px",opacity:".55",marginTop:"4px"});
    panel.appendChild(badge);
  }

  install();
})();
