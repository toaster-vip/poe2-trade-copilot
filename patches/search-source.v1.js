(() => {
  "use strict";

  const PATCH_VERSION = "search-source-1.2";
  const API_SOURCE = "https://api.github.com/repos/toaster-vip/poe2-trade-copilot/contents/data/latest-search.json?ref=main";
  const RAW_FALLBACK = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/data/latest-search.json";
  const $ = s => document.querySelector(s);

  function decodeBase64Utf8(base64) {
    const clean = String(base64 || "").replace(/\s+/g, "");
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function fetchLatestSearch() {
    // GitHub's Contents API gives us the exact current main blob and avoids
    // stale raw.githubusercontent.com CDN responses observed on iOS Safari.
    try {
      const response = await fetch(`${API_SOURCE}&t=${Date.now()}`, {
        cache: "no-store",
        credentials: "omit",
        headers: {
          "Accept": "application/vnd.github+json"
        }
      });
      if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.content) throw new Error("GitHub API response missing content");
      return {
        text: decodeBase64Utf8(payload.content),
        sha: payload.sha || null,
        source: "api"
      };
    } catch (apiError) {
      console.warn("[PoE2TC Search Source] API load failed; trying raw fallback", apiError);
      const response = await fetch(`${RAW_FALLBACK}?t=${Date.now()}`, {
        cache: "no-store",
        credentials: "omit"
      });
      if (!response.ok) throw new Error(`GitHub raw HTTP ${response.status}`);
      return {text: await response.text(), sha: null, source: "raw-fallback"};
    }
  }

  async function loadFromGitHub() {
    const box = $("#ptc-box");
    const status = $("#ptc-status");
    if (!box) throw new Error("search box not found");
    if (status) status.textContent = "Loading current main search packet...";

    const loaded = await fetchLatestSearch();
    const parsed = JSON.parse(loaded.text);
    if (!parsed || typeof parsed !== "object") throw new Error("invalid search packet");

    box.value = JSON.stringify(parsed, null, 2);
    box.dispatchEvent(new Event("input", {bubbles:true}));
    box.dispatchEvent(new Event("change", {bubbles:true}));
    try { localStorage.setItem("ptc-packet-v51", box.value); } catch {}

    const firstStat = parsed?.stats?.[0]?.text || "no stats";
    if (status) status.textContent = `Loaded current main${loaded.sha ? ` · ${loaded.sha.slice(0,7)}` : ""} · ${firstStat}`;
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
