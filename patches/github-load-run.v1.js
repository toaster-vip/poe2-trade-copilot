(() => {
  "use strict";

  const VERSION = "github-load-run-1.0";
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
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        const changed = box.value && box.value !== before;
        const status = $("#ptc-status")?.textContent || "";
        const loaded = /Loaded current main/i.test(status);

        if (changed && loaded) {
          clearInterval(timer);
          setTimeout(() => runButton.click(), 120);
          return;
        }

        if (tries >= 40) clearInterval(timer);
      }, 100);
    }, false);

    console.log(`[PoE2TC GitHub Load+Run] ${VERSION} installed.`);
  }

  install();
})();
