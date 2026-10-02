(() => {
  "use strict";

  const VERSION = "panel-minimize-1.1";
  const $ = (s, r = document) => r.querySelector(s);

  function install() {
    const panel = $("#ptc");
    if (!panel) return setTimeout(install, 250);

    const existing = $("#ptc-minimize");
    if (existing?.dataset?.ptcPanelToggle === "panel-toggle-1.1") return;
    if (existing) existing.remove();

    const button = document.createElement("button");
    button.id = "ptc-minimize";
    button.type = "button";
    button.dataset.ptcPanelToggle = "panel-toggle-1.1";
    Object.assign(button.style, {
      position: "absolute",
      top: "6px",
      right: "7px",
      width: "34px",
      height: "34px",
      padding: "0",
      margin: "0",
      border: "1px solid #526071",
      borderRadius: "8px",
      background: "#26313e",
      color: "#fff",
      fontSize: "22px",
      fontWeight: "700",
      lineHeight: "30px",
      zIndex: "2147483647",
      cursor: "pointer",
      touchAction: "manipulation",
      pointerEvents: "auto",
      WebkitTapHighlightColor: "transparent"
    });

    const original = {
      width: panel.style.width || "",
      minWidth: panel.style.minWidth || "",
      height: panel.style.height || "",
      minHeight: panel.style.minHeight || "",
      padding: panel.style.padding || "",
      overflow: panel.style.overflow || ""
    };

    let minimized = false;
    try { minimized = localStorage.getItem("poe2tc-panel-minimized") === "1"; } catch {}

    const apply = () => {
      for (const child of [...panel.children]) {
        if (child === button) continue;
        if (minimized) {
          if (child.dataset.ptcPrevDisplay == null) child.dataset.ptcPrevDisplay = child.style.display || "";
          child.style.display = "none";
        } else {
          child.style.display = child.dataset.ptcPrevDisplay ?? "";
          delete child.dataset.ptcPrevDisplay;
        }
      }

      if (minimized) {
        panel.style.width = "48px";
        panel.style.minWidth = "48px";
        panel.style.height = "48px";
        panel.style.minHeight = "48px";
        panel.style.padding = "0";
        panel.style.overflow = "visible";
        button.textContent = "+";
        button.title = "Restore PoE2 Trade Copilot";
        button.setAttribute("aria-label", "Restore PoE2 Trade Copilot");
      } else {
        panel.style.width = original.width;
        panel.style.minWidth = original.minWidth;
        panel.style.height = original.height;
        panel.style.minHeight = original.minHeight;
        panel.style.padding = original.padding;
        panel.style.overflow = original.overflow;
        button.textContent = "−";
        button.title = "Minimize PoE2 Trade Copilot";
        button.setAttribute("aria-label", "Minimize PoE2 Trade Copilot");
      }

      try { localStorage.setItem("poe2tc-panel-minimized", minimized ? "1" : "0"); } catch {}
    };

    let lastPointerUp = 0;
    const toggle = event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      minimized = !minimized;
      apply();
    };

    button.addEventListener("pointerup", event => {
      lastPointerUp = Date.now();
      toggle(event);
    }, true);
    button.addEventListener("click", event => {
      if (Date.now() - lastPointerUp < 700) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }
      toggle(event);
    }, true);

    panel.appendChild(button);
    apply();
    console.log("[PoE2TC Panel] " + VERSION + " installed.");
  }

  install();
})();