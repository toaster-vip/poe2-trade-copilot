(() => {
  "use strict";

  const VERSION = "button-layout-1.0";
  const $ = (s, r = document) => r.querySelector(s);

  const buttonStyle = (button, primary = false, compact = false) => {
    if (!button) return;
    Object.assign(button.style, {
      width: "100%",
      margin: "0",
      padding: compact ? "7px 9px" : "10px 10px",
      borderRadius: "7px",
      border: primary ? "1px solid #8398b2" : "1px solid #526071",
      background: primary ? "#34475d" : "#26313e",
      color: "#fff",
      fontWeight: primary ? "700" : "600",
      fontSize: compact ? "11px" : "12px",
      minHeight: compact ? "32px" : "38px"
    });
  };

  function makeSection(id, title, subtitle) {
    let section = $("#" + id);
    if (section) return section;

    section = document.createElement("div");
    section.id = id;
    Object.assign(section.style, {
      marginTop: "9px",
      padding: "8px",
      border: "1px solid rgba(120,140,165,.38)",
      borderRadius: "9px",
      background: "rgba(17,24,32,.62)"
    });

    const heading = document.createElement("div");
    heading.textContent = title;
    Object.assign(heading.style, {
      fontSize: "11px",
      fontWeight: "800",
      letterSpacing: ".06em",
      textTransform: "uppercase",
      color: "#d5dfeb",
      marginBottom: subtitle ? "2px" : "7px"
    });
    section.appendChild(heading);

    if (subtitle) {
      const sub = document.createElement("div");
      sub.textContent = subtitle;
      Object.assign(sub.style, {
        fontSize: "10px",
        opacity: ".62",
        marginBottom: "7px",
        lineHeight: "1.25"
      });
      section.appendChild(sub);
    }

    const grid = document.createElement("div");
    grid.dataset.ptcButtonGrid = "1";
    Object.assign(grid.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "6px"
    });
    section.appendChild(grid);
    return section;
  }

  function firstByText(panel, regex) {
    return [...panel.querySelectorAll("button")].find(b => regex.test(String(b.textContent || "").trim())) || null;
  }

  function move(grid, button, primary = false, compact = false, full = false) {
    if (!button || button.id === "ptc-minimize") return;
    if (button.parentElement !== grid) grid.appendChild(button);
    buttonStyle(button, primary, compact);
    button.style.gridColumn = full ? "1 / -1" : "";
  }

  function arrange() {
    const panel = $("#ptc");
    if (!panel) return false;

    let github = $("#ptc-layout-github");
    let manual = $("#ptc-layout-manual");
    if (!github) github = makeSection("ptc-layout-github", "GitHub", "常用：读取条件 → 搜索 → 保存结果");
    if (!manual) manual = makeSection("ptc-layout-manual", "Manual / Tools", "手动运行、复制与调试");

    // Put grouped controls directly after the search JSON box when possible.
    const box = $("#ptc-box");
    const anchor = box?.parentElement === panel ? box : null;
    if (!github.parentElement) {
      if (anchor?.nextSibling) panel.insertBefore(github, anchor.nextSibling);
      else panel.appendChild(github);
    }
    if (!manual.parentElement) {
      if (github.nextSibling) panel.insertBefore(manual, github.nextSibling);
      else panel.appendChild(manual);
    }

    const gg = github.querySelector("[data-ptc-button-grid]");
    const mg = manual.querySelector("[data-ptc-button-grid]");

    const load = $("#ptc-load-github") || firstByText(panel, /^LOAD FROM GITHUB$/i);
    const save = $("#ptc-save-github") || firstByText(panel, /^SAVE TO GITHUB$/i);
    const token = $("#ptc-token") || $("#ptc-github-token") || firstByText(panel, /GITHUB TOKEN/i);
    const run = $("#ptc-run") || firstByText(panel, /RUN\s*\/\s*VERIFY/i);
    const results = $("#ptc-results") || firstByText(panel, /COPY .*RESULT/i);
    const debug = firstByText(panel, /COPY DEBUG/i);

    // GitHub workflow: two everyday buttons first; token is secondary and full-width.
    move(gg, load, true, false, false);
    move(gg, save, true, false, false);
    move(gg, token, false, true, true);

    // Manual/tools: RUN is most frequently used, then result copy, then debug.
    move(mg, run, true, false, true);
    move(mg, results, false, false, false);
    move(mg, debug, false, true, false);

    // Hide a section if none of its buttons exist yet; MutationObserver will reveal it later.
    github.style.display = gg.querySelector("button") ? "block" : "none";
    manual.style.display = mg.querySelector("button") ? "block" : "none";

    panel.dataset.ptcButtonLayout = VERSION;
    return true;
  }

  function install() {
    if (!arrange()) return setTimeout(install, 250);

    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        arrange();
      }, 80);
    });
    observer.observe(document.body, {childList:true, subtree:true});

    console.log(`[PoE2TC Layout] ${VERSION} installed.`);
  }

  install();
})();
