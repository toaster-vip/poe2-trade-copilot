(() => {
  "use strict";

  const PATCH_VERSION = "search-source-1.3";
  const API_SOURCE = "https://api.github.com/repos/toaster-vip/poe2-trade-copilot/contents/data/latest-search.json?ref=main";
  const RAW_FALLBACK = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/data/latest-search.json";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = s => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  function status(text) {
    const el = $("#ptc-status");
    if (el) el.textContent = text;
    console.log("[PoE2TC Search Source]", text);
  }

  function decodeBase64Utf8(base64) {
    const clean = String(base64 || "").replace(/\s+/g, "");
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function fetchLatestSearch() {
    try {
      const response = await fetch(`${API_SOURCE}&t=${Date.now()}`, {
        cache: "no-store",
        credentials: "omit",
        headers: {"Accept": "application/vnd.github+json"}
      });
      if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.content) throw new Error("GitHub API response missing content");
      return {text: decodeBase64Utf8(payload.content), sha: payload.sha || null, source: "api"};
    } catch (apiError) {
      console.warn("[PoE2TC Search Source] API load failed; trying raw fallback", apiError);
      const response = await fetch(`${RAW_FALLBACK}?t=${Date.now()}`, {cache:"no-store", credentials:"omit"});
      if (!response.ok) throw new Error(`GitHub raw HTTP ${response.status}`);
      return {text: await response.text(), sha: null, source: "raw-fallback"};
    }
  }

  async function loadFromGitHub() {
    const box = $("#ptc-box");
    if (!box) throw new Error("search box not found");
    status("Loading current main search packet...");
    const loaded = await fetchLatestSearch();
    const parsed = JSON.parse(loaded.text);
    if (!parsed || typeof parsed !== "object") throw new Error("invalid search packet");
    box.value = JSON.stringify(parsed, null, 2);
    box.dispatchEvent(new Event("input", {bubbles:true}));
    box.dispatchEvent(new Event("change", {bubbles:true}));
    try { localStorage.setItem("ptc-packet-v51", box.value); } catch {}
    const firstStat = parsed?.stats?.[0]?.text || "no stats";
    status(`Loaded current main${loaded.sha ? ` · ${loaded.sha.slice(0,7)}` : ""} · ${firstStat}`);
    return parsed;
  }

  function visible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    return el.offsetParent !== null && s.display !== "none" && s.visibility !== "hidden";
  }

  function nativeValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    el.focus();
    if (setter) setter.call(el, String(value)); else el.value = String(value);
    el.dispatchEvent(new Event("input", {bubbles:true}));
    el.dispatchEvent(new Event("change", {bubbles:true}));
  }

  function tokens(text) {
    const ignore = new Set(["the","of","to","and","or","local","increased","increase"]);
    return norm(text).replace(/[#%+]/g, " ").split(" ").filter(x => x.length > 2 && !ignore.has(x));
  }

  function score(text, wanted) {
    const body = norm(text);
    return tokens(wanted).reduce((n,t) => n + (body.includes(t) ? 1 : 0), 0);
  }

  function numericRows() {
    const pane = $(".search-advanced-pane") || document;
    return $$(".filter", pane).filter(visible).filter(row => $$('input[type="number"]', row).some(visible));
  }

  function minMax(row) {
    const inputs = $$('input[type="number"]', row).filter(visible);
    return {
      min: inputs.find(x => norm(x.placeholder) === "min") || inputs[0] || null,
      max: inputs.find(x => norm(x.placeholder) === "max") || inputs[1] || null
    };
  }

  function bestMatchingRow(text, rows = numericRows()) {
    let best = null, bestScore = 0;
    for (const row of rows) {
      const s = score(row.innerText || row.textContent || "", text);
      if (s > bestScore) { best = row; bestScore = s; }
    }
    const required = Math.min(2, Math.max(1, tokens(text).length));
    return bestScore >= required ? best : null;
  }

  async function waitForNewStatRow(before, spec) {
    for (let i = 0; i < 20; i++) {
      await sleep(150);
      const rows = numericRows();
      const added = rows.filter(r => !before.has(r));
      const matchedAdded = bestMatchingRow(spec.text, added);
      if (matchedAdded) return matchedAdded;
      if (added.length === 1) return added[0];
      const anyMatch = bestMatchingRow(spec.text, rows);
      if (anyMatch) return anyMatch;
    }
    return null;
  }

  async function addDynamicStat(spec) {
    let existing = bestMatchingRow(spec.text);
    if (existing) {
      const mm = minMax(existing);
      if (spec.min != null && mm.min) nativeValue(mm.min, spec.min);
      if (spec.max != null && mm.max) nativeValue(mm.max, spec.max);
      return {ok:true, mode:"existing"};
    }

    const input = $("input[placeholder='+ Add Stat Filter']") || $("input[placeholder*='Add Stat Filter']");
    if (!input) return {ok:false, reason:"add_stat_input_not_found"};

    const before = new Set(numericRows());
    input.click();
    input.focus();
    await sleep(120);
    nativeValue(input, spec.text);
    await sleep(550);

    const options = $$(".multiselect__option, .multiselect__element, [role='option']").filter(visible);
    let best = null, bestScore = 0;
    for (const option of options) {
      const s = score(option.innerText || option.textContent || "", spec.text);
      if (s > bestScore) { best = option; bestScore = s; }
    }
    if (!best || bestScore < Math.min(2, Math.max(1, tokens(spec.text).length))) {
      return {ok:false, reason:"stat_option_not_found", options:options.slice(0,20).map(x => (x.innerText || x.textContent || "").trim())};
    }

    best.dispatchEvent(new MouseEvent("mousedown", {bubbles:true,cancelable:true,view:window}));
    best.dispatchEvent(new MouseEvent("mouseup", {bubbles:true,cancelable:true,view:window}));
    best.click();

    const row = await waitForNewStatRow(before, spec);
    if (!row) return {ok:false, reason:"created_row_not_found"};
    const mm = minMax(row);
    if (spec.min != null) {
      if (!mm.min) return {ok:false, reason:"created_min_not_found"};
      nativeValue(mm.min, spec.min);
    }
    if (spec.max != null) {
      if (!mm.max) return {ok:false, reason:"created_max_not_found"};
      nativeValue(mm.max, spec.max);
    }
    return {ok:true, mode:"created", rowText:(row.innerText || row.textContent || "").replace(/\s+/g," ").trim()};
  }

  function selectedValue(label) {
    const pane = $(".search-advanced-pane") || document;
    const wanted = norm(label);
    const rows = $$(".filter.filter-property", pane).filter(visible);
    const row = rows.find(r => norm(r.innerText || r.textContent || "").startsWith(wanted));
    const root = row?.querySelector(".multiselect") || row?.querySelector("[role='combobox']");
    const vm = root ? (root.__vue__ || root.__vueParentComponent || null) : null;
    const vals = vm ? [vm.internalValue,vm.value,vm.modelValue,vm.selected,vm.currentValue,vm.$props?.value] : [];
    let v = null;
    for (const x of vals) { if (x != null) { v = Array.isArray(x) ? x[0] : x; if (v != null) break; } }
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number") return String(v);
    return String(v.label ?? v.name ?? v.text ?? v.value ?? v.id ?? "");
  }

  async function waitForCorePreparation(packet) {
    const selects = Array.isArray(packet.selects) ? packet.selects : [];
    for (let i = 0; i < 50; i++) {
      const ok = selects.every(s => norm(selectedValue(s.label)) === norm(s.value));
      if (ok) return true;
      await sleep(120);
    }
    return false;
  }

  function installStatBridge(runButton, box) {
    if (runButton.dataset.statBridge === PATCH_VERSION) return;
    runButton.dataset.statBridge = PATCH_VERSION;

    runButton.addEventListener("click", event => {
      let packet;
      try { packet = JSON.parse(box.value); } catch { return; }
      const stats = Array.isArray(packet.stats) ? packet.stats : [];
      if (!stats.length) return;

      // Let the known-good v0.5.1 core keep doing clear/select/property fields.
      // We temporarily remove dynamic stats because its old row lookup is too narrow
      // for the current PoE2 trade DOM, then add those stats here and click Search.
      const originalText = box.value;
      const delegated = {...packet, stats:[], search:false};
      box.value = JSON.stringify(delegated, null, 2);
      box.dispatchEvent(new Event("input", {bubbles:true}));

      setTimeout(() => {
        box.value = originalText;
        box.dispatchEvent(new Event("input", {bubbles:true}));
      }, 0);

      (async () => {
        status("Preparing base filters before dynamic stats...");
        const prepared = await waitForCorePreparation(packet);
        if (!prepared) {
          status("Dynamic stat bridge aborted: base filters did not finish.");
          return;
        }
        await sleep(250);

        const audit = [];
        for (const spec of stats) {
          status(`Adding stat: ${spec.text}...`);
          const result = await addDynamicStat(spec);
          audit.push({spec,result});
          if (!result.ok) {
            window.__POE2TC_STAT_BRIDGE_DEBUG = {ok:false,packet,audit};
            status(`Dynamic stat failed: ${spec.text} · ${result.reason}. COPY DEBUG and send it.`);
            return;
          }
        }

        window.__POE2TC_STAT_BRIDGE_DEBUG = {ok:true,packet,audit};
        const search = $("button.search-btn");
        if (!search) {
          status("Dynamic stats ready, but Search button was not found.");
          return;
        }
        status("Dynamic stats verified. Searching...");
        search.click();
      })().catch(error => {
        console.error("[PoE2TC Stat Bridge]", error);
        window.__POE2TC_STAT_BRIDGE_DEBUG = {ok:false,error:String(error),packet};
        status(`Dynamic stat bridge failed: ${error.message}`);
      });
    }, true);
  }

  function install() {
    const box = $("#ptc-box");
    const runButton = $("#ptc-run");
    if (!box || !runButton) { setTimeout(install, 300); return; }

    if (!$("#ptc-load-github")) {
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
          status(`GitHub search load failed: ${error.message}`);
        }
      });
    }

    installStatBridge(runButton, box);
    window.__POE2TC_LOAD_SEARCH_FROM_GITHUB = loadFromGitHub;
    console.log(`[PoE2TC Search Source] ${PATCH_VERSION} installed`);
  }

  install();
})();
