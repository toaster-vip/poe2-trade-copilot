(() => {
  "use strict";

  const VERSION = "panel-layout-1.1";
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

  function styleButton(button, primary = false, full = false) {
    if (!button) return;
    Object.assign(button.style, {
      width: "100%",
      minHeight: primary ? "42px" : "36px",
      margin: "0",
      padding: primary ? "10px 8px" : "8px 6px",
      borderRadius: "7px",
      fontWeight: primary ? "700" : "600",
      fontSize: primary ? "13px" : "12px",
      gridColumn: full ? "1 / -1" : "auto"
    });
    if (primary) {
      button.style.background = "#234d70";
      button.style.border = "1px solid #4f83aa";
      button.style.color = "#fff";
    }
  }

  function move(grid, selector, {primary=false, full=false, label=null} = {}) {
    const button = $(selector);
    if (!button) return false;
    if (label) button.textContent = label;
    styleButton(button, primary, full);
    if (button.parentElement !== grid) grid.appendChild(button);
    return true;
  }

  function install() {
    const panel = $("#ptc");
    const box = $("#ptc-box");
    if (!panel || !box) return setTimeout(install, 250);

    let github = makeSection("ptc-layout-github", "GitHub workflow");
    let manual = makeSection("ptc-layout-manual", "Manual / tools");

    // Keep the JSON box near the top, then the common GitHub workflow first.
    if (!github.isConnected) box.insertAdjacentElement("afterend", github);
    if (!manual.isConnected) github.insertAdjacentElement("afterend", manual);

    const githubGrid = $(".ptc-layout-grid", github);
    const manualGrid = $(".ptc-layout-grid", manual);

    // Most common path: one large button, then save.
    move(githubGrid, "#ptc-load-github", {primary:true, full:true, label:"LOAD + RUN FROM GITHUB"});
    move(githubGrid, "#ptc-save-github", {primary:true, full:true, label:"SAVE RESULTS TO GITHUB"});
    move(githubGrid, "#ptc-token", {full:true, label:"SET GITHUB TOKEN"});
    move(githubGrid, "#ptc-github-token", {full:true, label:"SET GITHUB TOKEN"});

    // Manual controls stay available, but secondary.
    move(manualGrid, "#ptc-paste", {label:"PASTE SEARCH"});
    move(manualGrid, "#ptc-run", {label:"RUN / VERIFY"});
    move(manualGrid, "#ptc-results", {label:"COPY TOP 50 RESULTS"});
    move(manualGrid, "#ptc-debug", {label:"COPY DEBUG"});
    move(manualGrid, "#ptc-test", {label:"LOAD TEST"});
    move(manualGrid, "#ptc-search", {label:"SEARCH NOW"});

    panel.dataset.layoutVersion = VERSION;
  }

  install();

  // GitHub saver buttons may arrive after the core UI. Re-layout when they do.
  const observer = new MutationObserver(() => install());
  observer.observe(document.documentElement, {childList:true, subtree:true});
  setTimeout(() => observer.disconnect(), 20000);
})();
