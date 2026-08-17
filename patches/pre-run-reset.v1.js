(() => {
  "use strict";

  const VERSION = "pre-run-reset-1.0";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = s => String(s || "").replace(/\s+/g, " ").trim().toUpperCase();

  function status(text) {
    const el = $("#ptc-status");
    if (el) el.textContent = text;
  }

  function officialClearButton() {
    return $$("button, input[type='button']")
      .filter(el => !el.closest("#ptc"))
      .find(el => norm(el.textContent || el.value) === "CLEAR") || null;
  }

  function numericInputs() {
    return $$("input")
      .filter(el => !el.closest("#ptc"))
      .filter(el => {
        const p = norm(el.placeholder);
        return p === "MIN" || p === "MAX";
      });
  }

  function residualNumericValues() {
    return numericInputs().filter(el => String(el.value || "").trim() !== "");
  }

  async function waitForOfficialClear() {
    for (let i = 0; i < 30; i++) {
      if (residualNumericValues().length === 0) return true;
      await sleep(50);
    }
    return residualNumericValues().length === 0;
  }

  function install() {
    const runButton = $("#ptc-run");
    const box = $("#ptc-box");
    if (!runButton || !box) return setTimeout(install, 200);
    if (runButton.dataset.preRunReset === VERSION) return;
    runButton.dataset.preRunReset = VERSION;

    let bypass = false;

    runButton.addEventListener("click", event => {
      if (bypass) return;

      let packet;
      try { packet = JSON.parse(box.value); }
      catch { return; }

      if (!packet?.clear) return;

      const clearButton = officialClearButton();
      if (!clearButton) {
        console.warn("[PoE2TC Pre-run Reset] Official CLEAR button not found; refusing to run a clear search.");
        event.preventDefault();
        event.stopImmediatePropagation();
        status("Reset failed: official CLEAR button not found. Search not submitted.");
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      (async () => {
        status("Resetting previous trade filters…");
        clearButton.click();
        const cleared = await waitForOfficialClear();
        if (!cleared) {
          const leftovers = residualNumericValues().map(el => ({placeholder: el.placeholder, value: el.value}));
          window.__POE2TC_PRE_RUN_RESET_DEBUG = {ok:false, version:VERSION, reason:"numeric_filters_not_cleared", leftovers};
          console.error("[PoE2TC Pre-run Reset] Stale numeric filters remain", leftovers);
          status("Reset failed: stale numeric filters remain. Search not submitted.");
          return;
        }

        window.__POE2TC_PRE_RUN_RESET_DEBUG = {ok:true, version:VERSION};
        await sleep(120);
        bypass = true;
        try { runButton.click(); }
        finally { bypass = false; }
      })();
    }, true);

    console.log(`[PoE2TC Pre-run Reset] ${VERSION} installed.`);
  }

  install();
})();
