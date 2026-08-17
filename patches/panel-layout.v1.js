(() => {
  "use strict";

  const VERSION = "panel-layout-1.2";
  const $ = (s, r = document) => r.querySelector(s);

  function makeSection(id, title) {
    let section = $("#" + id);
    if (section) return section;

    section = document.createElement("div");
    section.id = id;
    section.dataset.ptcLayout = "1";
    Object.assign(section.style, {
      marginTop: "9px",
      paddingTop: "7px",
      borderTop: "1px solid rgba(191,145,62,.45)"
    });

    const heading = document.createElement("div");
    heading.textContent = title;
    Object.assign(heading.style, {
      margin: "0 0 6px 2px",
      fontSize: "11px",
      fontWeight: "700",
      letterSpacing: ".08em",
      textTransform: "uppercase",
      opacity: ".72"
    });

    const grid = document.createElement("div");
    grid.className = "ptc-layout-grid";
    Object.assign(grid.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "6px"
    });

    section.append(heading, grid);
    return section;
  }

  function setLabel(button, label) {
    if (label && button.textContent !== label) button.textContent = label;
  }

  function styleButton(button, primary = false, full = false) {
    if (!button) return;
    const values = {
      width: "100%",
      minHeight: primary ? "42px" : "36px",
      margin: "0",
      padding: primary ? "10px 8px" : "8px 6px",
      borderRadius: "7px",
      fontWeight: primary ? "700" : "600",
      fontSize: primary ? "13px" : "12px",
      gridColumn: full ? "1 / -1" : "auto"
    };
    for (const [key, value] of Object.entries(values)) {
      if (button.style[key] !== value) button.style[key] = value;
    }
    if (primary) {
      if (button.style.background !== "rgb(35, 77, 112)" && button.style.background !== "#234d70") button.style.background = "#234d70";
      button.style.border = "1px solid #4f83aa";
      button.style.color = "#fff";
    }
  }

  function move(grid, selector, opts = {}) {
    const button = $(selector);
    if (!button || !grid) return false;
    setLabel(button, opts.label);
    styleButton(button, !!opts.primary, !!opts.full);
    if (button.parentElement !== grid) grid.appendChild(button);
    return true;
  }

  function layoutOnce() {
    const panel = $("#ptc");
    const box = $("#ptc-box");
    if (!panel || !box) return false;

    const github = makeSection("ptc-layout-github", "GitHub workflow");
    const manual = makeSection("ptc-layout-manual", "Manual / tools");

    if (!github.isConnected) box.insertAdjacentElement("afterend", github);
    if (!manual.isConnected) github.insertAdjacentElement("afterend", manual);

    const githubGrid = $(".ptc-layout-grid", github);
    const manualGrid = $(".ptc-layout-grid", manual);

    move(githubGrid, "#ptc-load-github", {primary:true, full:true, label:"LOAD + RUN FROM GITHUB"});
    move(githubGrid, "#ptc-save-github", {primary:true, full:true, label:"SAVE RESULTS TO GITHUB"});
    move(githubGrid, "#ptc-token", {full:true, label:"SET GITHUB TOKEN"});
    move(githubGrid, "#ptc-github-token", {full:true, label:"SET GITHUB TOKEN"});

    move(manualGrid, "#ptc-paste", {label:"PASTE SEARCH"});
    move(manualGrid, "#ptc-run", {label:"RUN / VERIFY"});
    move(manualGrid, "#ptc-results", {label:"COPY TOP 50 RESULTS"});
    move(manualGrid, "#ptc-debug", {label:"COPY DEBUG"});
    move(manualGrid, "#ptc-test", {label:"LOAD TEST"});
    move(manualGrid, "#ptc-search", {label:"SEARCH NOW"});

    panel.dataset.layoutVersion = VERSION;
    return true;
  }

  // No MutationObserver: the previous version could create a self-triggering
  // DOM mutation loop on iOS Safari. Use a small bounded retry window instead.
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    layoutOnce();
    const saverReady = !!$("#ptc-save-github") || !!$("#ptc-github-token");
    if (saverReady || attempts >= 20) clearInterval(timer);
  }, 300);

  layoutOnce();
  console.log(`[PoE2TC Panel Layout] ${VERSION} installed.`);
})();
