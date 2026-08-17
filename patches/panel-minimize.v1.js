(() => {
  "use strict";

  const VERSION = "panel-minimize-1.0";
  const $ = (s, r = document) => r.querySelector(s);

  function install() {
    const panel = $("#ptc");
    if (!panel) return setTimeout(install, 250);
    if ($("#ptc-minimize")) return;

    const button = document.createElement("button");
    button.id = "ptc-minimize";
    button.type = "button";
    button.textContent = "−";
    button.title = "Minimize PoE2 Trade Copilot";
    Object.assign(button.style, {
      position: "absolute",
      top: "6px",
      right: "7px",
      width: "30px",
      height: "30px",
      padding: "0",
      border: "1px solid #526071",
      borderRadius: "7px",
      background: "#26313e",
      color: "#fff",
      fontSize: "20px",
      fontWeight: "700",
      lineHeight: "26px",
      zIndex: "3",
      cursor: "pointer"
    });

    const oldPosition = getComputedStyle(panel).position;
    if (oldPosition === "static") panel.style.position = "fixed";

    const children = [...panel.children];
    const shouldKeep = el => el === button;
    let minimized = false;

    function apply() {
      for (const child of [...panel.children]) {
        if (shouldKeep(child)) continue;
        child.style.display = minimized ? "none" : "";
      }
      if (minimized) {
        panel.dataset.ptcOldWidth = panel.style.width || "";
        panel.dataset.ptcOldMinWidth = panel.style.minWidth || "";
        panel.dataset.ptcOldHeight = panel.style.height || "";
        panel.style.width = "44px";
        panel.style.minWidth = "44px";
        panel.style.height = "44px";
        panel.style.padding = "0";
        panel.style.overflow = "hidden";
        button.textContent = "+";
        button.title = "Restore PoE2 Trade Copilot";
      } else {
        panel.style.width = panel.dataset.ptcOldWidth || "";
        panel.style.minWidth = panel.dataset.ptcOldMinWidth || "";
        panel.style.height = panel.dataset.ptcOldHeight || "";
        panel.style.padding = "";
        panel.style.overflow = "";
        button.textContent = "−";
        button.title = "Minimize PoE2 Trade Copilot";
      }
      try { localStorage.setItem("poe2tc-panel-minimized", minimized ? "1" : "0"); } catch {}
    }

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      minimized = !minimized;
      apply();
    });

    panel.appendChild(button);
    try { minimized = localStorage.getItem("poe2tc-panel-minimized") === "1"; } catch {}
    apply();

    console.log(`[PoE2TC Panel] ${VERSION} installed.`);
  }

  install();
})();
