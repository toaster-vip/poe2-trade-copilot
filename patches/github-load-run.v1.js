(() => {
  "use strict";

  const VERSION = "github-load-run-1.1";
  const $ = (s, r = document) => r.querySelector(s);

  function status(text) {
    const el = $("#ptc-status");
    if (el) el.textContent = text;
    console.log("[PoE2TC GitHub Load+Run]", text);
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

