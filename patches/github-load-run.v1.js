(() => {
  "use strict";

  const VERSION = "github-load-run-1.1";
  const $ = (s, r = document) => r.querySelector(s);

  function install() {
    const loadButton = $("#ptc-load-github");
    const runButton = $("#ptc-run");
    const box = $("#ptc-box");
    if (!loadButton || !runButton || !box) return setTimeout(install, 250);
    if (loadButton.dataset.autoRun === VERSION) return;

    loadButton.dataset.autoRun = VERSION;
    loadButton.textContent = "LOAD + RUN FROM GITHUB";

    loadButton.addEventListener("click", () => {
      const before = box.value;
      const beforeLoadedAt = window.__POE2TC_LAST_SEARCH_SOURCE?.loadedAt || null;
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        const changed = !!box.value && box.value !== before;
        const source = window.__POE2TC_LAST_SEARCH_SOURCE || null;
        const freshLoad = !!source?.loadedAt && source.loadedAt !== beforeLoadedAt;
        const status = $("#ptc-status")?.textContent || "";
        const loaded = freshLoad || /Loaded (?:current main|commit )/i.test(status);

        if (changed && loaded) {
          clearInterval(timer);
          setTimeout(() => runButton.click(), 120);
          return;
        }

        if (tries >= 60) clearInterval(timer);
      }, 100);
    }, false);

    console.log(`[PoE2TC GitHub Load+Run] ${VERSION} installed.`);
  }

  install();
})();
