(() => {
  "use strict";

  const VERSION = "stat-groups-2.5";
  const OFFICIAL_STATS_URL = "/api/trade2/data/stats";
  const $ = (s, r = document) => r ? r.querySelector(s) : null;
  const $$ = (s, r = document) => r ? [...r.querySelectorAll(s)] : [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  function status(msg) {
    const el = $("#ptc-status");
    if (el) el.textContent = msg;
    console.log("[PoE2TC Stat Groups]", msg);
  }

  function visible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return st.display !== "none" && st.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function nativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    el.focus();
    if (setter) setter.call(el, String(value));
    else el.value = String(value);
    el.dispatchEvent(new Event("input", {bubbles:true}));
    el.dispatchEvent(new Event("change", {bubbles:true}));
  }

  function clickLikeUser(el) {
    if (!el) return;
    for (const type of ["pointerdown","mousedown","pointerup","mouseup","click"]) {
      try { el.dispatchEvent(new MouseEvent(type, {bubbles:true,cancelable:true,view:window})); } catch {}
    }
  }

  function statArea() {
    const heading = $$("body *").find(el => visible(el) && /^STAT FILTERS$/i.test(String(el.textContent || "").replace(/\s+/g, " ").trim()));
    if (!heading) return null;
    let node = heading.parentElement;
    for (let i=0; node && node !== document.body && i<8; i++, node=node.parentElement) {
      const text = norm(node.innerText || node.textContent || "");
      if (text.includes("stat filters") && text.includes("add stat group")) return node;
    }
    return heading.parentElement || null;
  }

  function addInputs(area = statArea()) {
    return $$("input", area).filter(el => visible(el) && /add stat filter/i.test(String(el.placeholder || "")));
  }

  function groupRootForInput(input) {
    if (!input) return null;
    const direct = input.closest(".filter-group");
    if (direct) return direct;
    let node = input.parentElement;
    while (node && node !== document.body) {
      const count = $$("input", node).filter(x => /add stat filter/i.test(String(x.placeholder || ""))).length;
      if (count === 1 && ($$(".filter", node).length || /and|count|not|weight/i.test(norm(node.innerText || node.textContent || "")))) return node;
      node = node.parentElement;
    }
    return null;
  }

  function groupRoots() {
    const exact = $$("#trade > .top .filter-group")
      .filter(group => !!group.querySelector('input[placeholder="+ Add Stat Filter"]'));
    if (exact.length) return exact;

    const seen = new Set();
    const out = [];
    for (const input of addInputs()) {
      const root = groupRootForInput(input);
      if (root && !seen.has(root)) {
        seen.add(root);
        out.push(root);
      }
    }
    return out;
  }

  function findAddGroupControl() {
    const candidates = $$("input,button,[role='button'],a,div,span", document)
      .filter(el => visible(el) && !el.closest("#ptc"))
      .map(el => ({
        el,
        text:String(
          el.innerText ||
          el.textContent ||
          el.value ||
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          ""
        ).replace(/\s+/g, " ").trim(),
        rect:el.getBoundingClientRect()
      }))
      .filter(x => /(?:^|\s|\+)ADD STAT GROUP(?:\s|$)/i.test(x.text))
      .sort((a,b) => {
        const aExact = /^\+?\s*ADD STAT GROUP\s*$/i.test(a.text) ? 0 : 1;
        const bExact = /^\+?\s*ADD STAT GROUP\s*$/i.test(b.text) ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        const aArea = Math.max(1,a.rect.width*a.rect.height);
        const bArea = Math.max(1,b.rect.width*b.rect.height);
        if (aArea !== bArea) return aArea-bArea;
        return a.text.length-b.text.length;
      });

    const picked=candidates[0]||null;
    window.__POE2TC_ADD_GROUP_DISCOVERY={
      version:VERSION,
      candidateCount:candidates.length,
      candidates:candidates.slice(0,12).map(x=>({
        tag:x.el.tagName,
        className:String(x.el.className||""),
        text:x.text.slice(0,180),
        width:Math.round(x.rect.width),
        height:Math.round(x.rect.height)
      })),
      picked:picked?{
        tag:picked.el.tagName,
        className:String(picked.el.className||""),
        text:picked.text.slice(0,180)
      }:null
    };
    return picked?.el || null;
  }

  function visibleGroupChoices() {
    const labels = new Set(["and","count","not","if","weight","weighted sum","weight2"]);
    return $$("button,a,li,[role='option'],.dropdown-item,.multiselect__option")
      .filter(visible)
      .map(el => ({el,text:String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim()}))
      .filter(x => labels.has(norm(x.text)));
  }

  function groupTypeVisible(root, type) {
    const wanted = norm(type);
    const text = norm(root?.innerText || root?.textContent || "");
    if (wanted === "and") return /(^|\s)and(\s|$)/.test(text);
    if (wanted === "count") return /(^|\s)count(\s|$)/.test(text);
    return text.includes(wanted);
  }

  async function waitForNewGroup(before, type) {
    for (let i=0; i<40; i++) {
      await sleep(100);
      const now = groupRoots();
      const added = now.filter(x => !before.has(x));
      if (added.length) {
        const exact = added.find(x => groupTypeVisible(x, type));
        return exact || added[added.length - 1];
      }
    }
    return null;
  }

  async function setExistingGroupType(group, type) {
    const wanted = norm(type);

    for (const select of $$("select", group).filter(visible)) {
      const opts = [...select.options];
      const idx = opts.findIndex(o => norm(o.textContent || o.label || o.value) === wanted);
      if (idx >= 0) {
        select.selectedIndex = idx;
        select.value = opts[idx].value;
        select.dispatchEvent(new Event("input",{bubbles:true}));
        select.dispatchEvent(new Event("change",{bubbles:true}));
        await sleep(250);
        if (groupTypeVisible(group,type)) return true;
      }
    }

    for (const root of $$(".multiselect,[role='combobox']", group).filter(visible)) {
      const vm = vueFor(root);
      if (!vm) continue;
      let options = vueOptions(vm);
      if (!options.length) {
        try { root.click(); } catch {}
        await sleep(180);
        options = vueOptions(vm);
      }
      const picked = options.find(o => norm(labelOf(o)) === wanted);
      if (!picked) continue;
      try {
        if (typeof vm.select === "function") vm.select(picked);
        else if (typeof vm.$emit === "function") {
          vm.$emit("input",picked);
          vm.$emit("update:modelValue",picked);
        }
        try { vm.deactivate?.(); } catch {}
        await sleep(250);
        if (groupTypeVisible(group,type)) return true;
      } catch {}
    }

    const local = $$("button,a,[role='button'],.multiselect",group)
      .filter(visible)
      .find(el => {
        const t=norm(el.innerText || el.textContent || "");
        return ["and","count","not","if","weight","weight2","weighted sum"].includes(t);
      });
    if (local) {
      clickLikeUser(local);
      await sleep(180);
      const choice = visibleGroupChoices().find(x => norm(x.text) === wanted);
      if (choice) {
        clickLikeUser(choice.el);
        await sleep(250);
        if (groupTypeVisible(group,type)) return true;
      }
    }
    return false;
  }

  function groupOptionLabel(type) {
    const labels = {
      and:"And",
      count:"Count",
      not:"Not",
      if:"If",
      weight:"Weighted Sum",
      weight2:"Weighted Sum v2"
    };
    return labels[String(type || "").toLowerCase()] || String(type || "");
  }

  function nativeGroupSelect() {
    return $("#trade > .top .filter-group-select") || $(".filter-group-select");
  }

  function findNativeGroupOption(groupSelect, type) {
    if (!groupSelect) return null;
    const wanted = norm(groupOptionLabel(type));
    return $$(
      ".multiselect__option:not(.multiselect__option--disabled), li > span",
      groupSelect
    ).find(el => norm(el.textContent || "") === wanted) || null;
  }

  async function waitForNativeGroupOption(groupSelect, type, attempts=20) {
    for (let i=0; i<attempts; i++) {
      const option = findNativeGroupOption(groupSelect, type);
      if (option) return option;
      await sleep(50);
    }
    return null;
  }

  async function addGroup(type) {
    const before = new Set(groupRoots());
    const groupSelect = nativeGroupSelect();
    const groupInput = groupSelect?.querySelector('input[placeholder="+ Add Stat Group"]') || null;

    window.__POE2TC_ADD_GROUP_DISCOVERY = {
      version:VERSION,
      mode:"native-filter-group-select",
      type,
      groupSelectFound:!!groupSelect,
      groupInputFound:!!groupInput,
      beforeCount:before.size
    };

    if (!groupSelect || !groupInput) {
      return {
        ok:false,
        reason:"native_add_stat_group_input_not_found",
        discovery:window.__POE2TC_ADD_GROUP_DISCOVERY
      };
    }

    groupInput.focus();
    groupInput.click();

    const option = findNativeGroupOption(groupSelect, type) ||
      await waitForNativeGroupOption(groupSelect, type, 20);

    const choices = $$(
      ".multiselect__option:not(.multiselect__option--disabled), li > span",
      groupSelect
    ).map(el => String(el.textContent || "").replace(/\s+/g," ").trim()).filter(Boolean);

    window.__POE2TC_ADD_GROUP_DISCOVERY = {
      ...window.__POE2TC_ADD_GROUP_DISCOVERY,
      choices,
      wanted:groupOptionLabel(type),
      optionFound:!!option
    };

    if (!option) {
      return {
        ok:false,
        reason:"native_stat_group_option_not_found",
        choices
      };
    }

    // Native PoE Trade expects the dropdown to be activated first, then a
    // normal click on the rendered option.
    option.click();

    let created = null;
    for (let i=0; i<30; i++) {
      await sleep(75);
      const now = groupRoots();
      created = now.find(group => !before.has(group)) || null;
      if (created) break;
    }

    window.__POE2TC_ADD_GROUP_DISCOVERY = {
      ...window.__POE2TC_ADD_GROUP_DISCOVERY,
      afterCount:groupRoots().length,
      created:!!created
    };

    if (!created) {
      return {
        ok:false,
        reason:"created_stat_group_not_found_after_native_click",
        discovery:window.__POE2TC_ADD_GROUP_DISCOVERY
      };
    }

    if (!groupTypeVisible(created, type)) {
      const changed = await setExistingGroupType(created,type);
      if (!changed || !groupTypeVisible(created,type)) {
        return {
          ok:false,
          reason:"wrong_stat_group_type",
          wanted:type,
          groupText:String(created.innerText || created.textContent || "")
            .replace(/\s+/g," ").trim().slice(0,400)
        };
      }
    }

    return {ok:true, root:created};
  }

  function minMaxInputs(scope) {
    const inputs = $$("input", scope).filter(visible);
    return {
      min: inputs.find(x => norm(x.placeholder) === "min") || null,
      max: inputs.find(x => norm(x.placeholder) === "max") || null
    };
  }

  function groupRangeInputs(group, spec) {
    const statTexts=(spec.filters || []).map(x=>norm(x.text));
    const inputs=$$("input",group).filter(visible).filter(el=>{
      const p=norm(el.placeholder);
      if(p!=="min" && p!=="max") return false;
      const row=el.closest(".filter");
      if(!row) return true;
      const text=norm(row.innerText || row.textContent || "");
      return !statTexts.some(t=>t && text.includes(t));
    });
    return {
      min:inputs.find(x=>norm(x.placeholder)==="min")||null,
      max:inputs.find(x=>norm(x.placeholder)==="max")||null
    };
  }

  function setGroupRange(group, spec) {
    if (spec.type !== "count" && spec.type !== "weight" && spec.type !== "weight2") return {ok:true};
    const mm = groupRangeInputs(group,spec);
    if (spec.min != null) {
      if (!mm.min) return {ok:false, reason:"group_min_not_found"};
      nativeValue(mm.min, spec.min);
    }
    if (spec.max != null) {
      if (!mm.max) return {ok:false, reason:"group_max_not_found"};
      nativeValue(mm.max, spec.max);
    }
    return {ok:true};
  }

  function labelOf(v) {
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number") return String(v);
    return String(v.label ?? v.name ?? v.text ?? v.value ?? v.id ?? "");
  }

  function idOf(v) {
    if (!v || typeof v !== "object") return "";
    return String(v.id ?? v.value?.id ?? v.option?.id ?? "");
  }

  function vueFor(root) { return root ? (root.__vue__ || root.__vueParentComponent || null) : null; }

  function vueOptions(vm) {
    if (!vm) return [];
    for (const x of [vm.options,vm.filteredOptions,vm.optionKeys,vm.$options?.propsData?.options,vm.$parent?.options,vm.$props?.options]) {
      if (Array.isArray(x) && x.length) return x;
    }
    return [];
  }

  function exactTextMatch(candidate, wanted) {
    const c = norm(candidate);
    const w = norm(wanted);
    return c === w || c.startsWith(w + " (");
  }

  async function officialIndex() {
    const response = await fetch(OFFICIAL_STATS_URL, {
      cache:"no-store",
      credentials:"same-origin",
      headers:{"Accept":"application/json"}
    });
    if (!response.ok) throw new Error("official stats HTTP " + response.status);
    const payload = await response.json();
    const index = new Map();
    for (const group of payload?.result || []) {
      for (const entry of group?.entries || []) if (entry?.id) index.set(String(entry.id), entry);
    }
    if (!index.size) throw new Error("official stats catalog empty");
    return index;
  }

  function validateGroups(groups, index) {
    const entries=[...index.entries()].map(([id,entry])=>({id,entry}));
    for (let gi=0; gi<groups.length; gi++) {
      const group = groups[gi];
      if (!["and","count","not","if","weight","weight2"].includes(group.type)) {
        throw new Error("unsupported stat group type: " + group.type);
      }
      for (let fi=0; fi<(group.filters || []).length; fi++) {
        const spec = group.filters[fi];

        if (!spec.id) {
          const wanted=norm(spec.text);
          const exactMatches=entries.filter(x=>norm(x.entry?.text)===wanted);

          const explicitMatches=exactMatches.filter(x=>String(x.id||"").startsWith("explicit."));
          if (explicitMatches.length === 1) {
            spec.id=explicitMatches[0].id;
          } else if (exactMatches.length === 1) {
            spec.id=exactMatches[0].id;
          } else {
            throw new Error(
              "official stat text did not resolve uniquely: " + spec.text +
              " · explicit=" + explicitMatches.map(x=>x.id).join(",") +
              " · matches=" + exactMatches.map(x=>x.id).join(",")
            );
          }
        }

        const live = index.get(String(spec.id || ""));
        if (!live) throw new Error("official stat id no longer exists: " + spec.id);
        if (norm(live.text) !== norm(spec.text)) {
          throw new Error("official stat text mismatch for " + spec.id + ": " + live.text);
        }
      }
    }
  }

  function groupAddInput(group) {
    return $$("input", group).find(el => visible(el) && /add stat filter/i.test(String(el.placeholder || ""))) || null;
  }

  function statRows(group) {
    const seen = new Set();
    const rows = [];
    for (const row of $$(
      ".filter.full-span, .filter-group-body > .filter:not(.filter-select-mutate), .filter",
      group
    )) {
      if (seen.has(row)) continue;
      seen.add(row);
      if (row.querySelector('input[placeholder="+ Add Stat Filter"]')) continue;
      const text = norm(row.innerText || row.textContent || "");
      if (!text) continue;
      rows.push(row);
    }
    return rows;
  }

  function findRow(group, text) {
    const wanted = norm(text);
    return statRows(group).find(row =>
      norm(row.innerText || row.textContent || "").includes(wanted)
    ) || null;
  }

  function nativeStatOptionLabel(option) {
    if (!option) return "";
    const labelContainer = option.querySelector("div");
    const label =
      labelContainer?.querySelector(":scope > span")?.textContent ||
      labelContainer?.textContent ||
      option.textContent ||
      "";
    return String(label).replace(/\s+/g," ").trim();
  }

  function nativeStatOptions(group) {
    return $$(
      ".multiselect__option:not(.multiselect__option--disabled), [role='option']",
      group
    ).filter(visible);
  }

  async function waitForNativeStatOption(group, spec, attempts=20) {
    const wanted = norm(spec.text);
    for (let i=0; i<attempts; i++) {
      const options = nativeStatOptions(group);
      const exact = options.find(option =>
        norm(nativeStatOptionLabel(option)) === wanted
      );
      if (exact) return exact;

      const compatible = options.filter(option =>
        exactTextMatch(nativeStatOptionLabel(option), spec.text)
      );
      if (compatible.length === 1) return compatible[0];

      const contains = options.filter(option =>
        norm(nativeStatOptionLabel(option)).includes(wanted)
      );
      if (contains.length === 1) return contains[0];
      await sleep(50);
    }
    return null;
  }

  async function commitExactStat(group, spec) {
    const input = groupAddInput(group);
    if (!input) return {ok:false, reason:"group_add_stat_input_not_found"};

    const before = new Set(statRows(group));

    input.focus();
    nativeValue(input, spec.text);

    const option = await waitForNativeStatOption(group, spec, 20);
    const optionDump = nativeStatOptions(group).slice(0,30).map(el => nativeStatOptionLabel(el));

    if (!option) {
      return {
        ok:false,
        reason:"exact_stat_option_not_found",
        wanted:spec.text,
        options:optionDump
      };
    }

    const chosenLabel = nativeStatOptionLabel(option);
    option.click();

    let row = null;
    for (let i=0; i<20; i++) {
      await sleep(75);
      const added = statRows(group).filter(x => !before.has(x));
      row =
        added.find(x => norm(x.innerText || x.textContent || "").includes(norm(spec.text))) ||
        findRow(group, spec.text);
      if (row) break;
    }

    // Native Trade occasionally ignores a synthetic click while the
    // multiselect is focused. Enter is its normal keyboard fallback.
    if (!row) {
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key:"Enter",
        code:"Enter",
        bubbles:true,
        cancelable:true
      }));
      for (let i=0; i<12; i++) {
        await sleep(75);
        row = findRow(group, spec.text);
        if (row) break;
      }
    }

    if (!row) {
      return {
        ok:false,
        reason:"created_stat_row_not_found",
        selected:chosenLabel,
        options:optionDump,
        groupText:String(group.innerText || group.textContent || "").replace(/\s+/g," ").trim().slice(0,1200)
      };
    }

    input.blur();

    const mm = minMaxInputs(row);
    if (spec.min != null) {
      if (!mm.min) return {ok:false, reason:"stat_min_not_found", selected:chosenLabel, rowText:String(row.innerText || row.textContent || "").trim()};
      nativeValue(mm.min, spec.min);
    }
    if (spec.max != null) {
      if (!mm.max) return {ok:false, reason:"stat_max_not_found", selected:chosenLabel, rowText:String(row.innerText || row.textContent || "").trim()};
      nativeValue(mm.max, spec.max);
    }
    return {ok:true, selected:chosenLabel, row};
  }

  function verifyGroup(group, spec) {
    if (!groupTypeVisible(group, spec.type)) return {ok:false, reason:"group_type_verify_failed"};
    if (spec.type === "count" || spec.type === "weight" || spec.type === "weight2") {
      const mm = groupRangeInputs(group,spec);
      if (spec.min != null && String(mm.min?.value ?? "") !== String(spec.min)) return {ok:false, reason:"group_min_verify_failed", got:mm.min?.value ?? null};
      if (spec.max != null && String(mm.max?.value ?? "") !== String(spec.max)) return {ok:false, reason:"group_max_verify_failed", got:mm.max?.value ?? null};
    }
    for (const filter of spec.filters || []) {
      const row = findRow(group, filter.text);
      if (!row) return {ok:false, reason:"stat_row_verify_failed", stat:filter.text};
      const mm = minMaxInputs(row);
      if (filter.min != null && String(mm.min?.value ?? "") !== String(filter.min)) return {ok:false, reason:"stat_min_verify_failed", stat:filter.text, got:mm.min?.value ?? null};
      if (filter.max != null && String(mm.max?.value ?? "") !== String(filter.max)) return {ok:false, reason:"stat_max_verify_failed", stat:filter.text, got:mm.max?.value ?? null};
    }
    return {ok:true};
  }

  async function waitForBase() {
    for (let i=0; i<100; i++) {
      if (window.__POE2TC_PREFLIGHT_DEBUG?.ok === true) return true;
      await sleep(120);
    }
    return false;
  }

  async function applyGroupedStatsAfterBase(packet) {
    const groups = Array.isArray(packet?.statGroups) ? packet.statGroups : [];
    if (!groups.length) return {ok:true,skipped:true,version:VERSION};

    const debug = {ok:false,version:VERSION,packet,audit:[]};
    window.__POE2TC_STAT_GROUPS_DEBUG = debug;

    status("Validating grouped stats against official catalog...");
    const index = await officialIndex();
    validateGroups(groups, index);
    debug.audit.push({step:"catalog-validated",count:groups.reduce((n,g)=>n+(g.filters||[]).length,0)});

    const built = [];
    for (const spec of groups) {
      status("Creating " + spec.type.toUpperCase() + " stat group...");
      const made = await addGroup(spec.type);
      debug.audit.push({step:"group-create",type:spec.type,result:{ok:made.ok,reason:made.reason||null}});
      if (!made.ok) throw new Error(spec.type + " group: " + made.reason);

      const range = setGroupRange(made.root, spec);
      if (!range.ok) throw new Error(spec.type + " group range: " + range.reason);

      for (const filter of spec.filters || []) {
        status("Adding " + filter.text + " to " + spec.type.toUpperCase() + "...");
        const added = await commitExactStat(made.root, filter);
        debug.audit.push({step:"stat-add",type:spec.type,stat:filter.text,result:{ok:added.ok,reason:added.reason||null,selected:added.selected||null}});
        if (!added.ok) throw new Error(filter.text + ": " + added.reason);
      }
      built.push({root:made.root,spec});
    }

    for (const item of built) {
      const verified = verifyGroup(item.root, item.spec);
      debug.audit.push({step:"group-verify",type:item.spec.type,result:verified});
      if (!verified.ok) throw new Error(item.spec.type + " verification: " + verified.reason);
    }

    debug.ok = true;
    status("PASS: AND/COUNT groups verified.");
    return debug;
  }

  window.__POE2TC_APPLY_STAT_GROUPS = async packet => {
    try {
      return await applyGroupedStatsAfterBase(packet);
    } catch (error) {
      const debug = window.__POE2TC_STAT_GROUPS_DEBUG || {};
      window.__POE2TC_STAT_GROUPS_DEBUG = {...debug,ok:false,version:VERSION,error:String(error?.message || error),packet};
      status("Grouped stat search aborted: " + (error?.message || error) + ". COPY DEBUG.");
      throw error;
    }
  };
  function wrapperCompatibleModuleVersion() {
    const active = document.querySelector("#ptc-run")?.dataset?.runWrapper || "";
    if (active === "run-wrapper-2.8") return "stat-groups-1.5";
    if (active === "run-wrapper-2.9" || active === "run-wrapper-3.0") return "stat-groups-1.6";
    return VERSION;
  }

  window.__POE2TC_STAT_GROUPS_MODULE = {
    version:wrapperCompatibleModuleVersion(),
    implementationVersion:VERSION,
    loadedAt:new Date().toISOString()
  };

  function install() {
    const button = $("#ptc-run");
    const box = $("#ptc-box");
    if (!button || !box) return setTimeout(install, 300);
    if (button.dataset.statGroups === VERSION) return;

    let bypass = false;
    button.addEventListener("click", event => {
      if (bypass) return;
      let packet;
      try { packet = JSON.parse(box.value); } catch { return; }
      const groups = Array.isArray(packet.statGroups) ? packet.statGroups : [];
      if (!groups.length) return;

      // run-wrapper 2.5+ calls the public executor after its own verified base preflight.
      // Do not intercept here when that integration is active.
      if (/^run-wrapper-(?:2\.[5-9]|3\.)/.test(button.dataset.runWrapper || "")) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      (async () => {
        const original = box.value;
        const delegated = {...packet, statGroups:[], stats:[], apiSearch:undefined, search:false};
        box.value = JSON.stringify(delegated, null, 2);
        box.dispatchEvent(new Event("input",{bubbles:true}));
        window.__POE2TC_PREFLIGHT_DEBUG = null;

        status("Preparing category, rarity and price...");
        bypass = true;
        button.click();
        bypass = false;

        if (!await waitForBase()) throw new Error("base filters did not finish");
        box.value = original;
        box.dispatchEvent(new Event("input",{bubbles:true}));
        await sleep(250);

        await window.__POE2TC_APPLY_STAT_GROUPS(packet);
        if (packet.search !== false) {
          const search = $("button.search-btn");
          if (!search) throw new Error("Search button not found");
          status("PASS: AND/COUNT groups verified. Searching...");
          search.click();
        } else {
          status("PASS: AND/COUNT groups verified. Search NOT submitted.");
        }
      })().catch(error => {
        bypass = false;
        const debug = window.__POE2TC_STAT_GROUPS_DEBUG || {};
        window.__POE2TC_STAT_GROUPS_DEBUG = {...debug,ok:false,error:String(error?.message || error)};
        status("Grouped stat search aborted: " + (error?.message || error) + ". COPY DEBUG.");
        console.error("[PoE2TC Stat Groups]", error);
      });
    }, true);

    button.dataset.statGroups = VERSION;
    console.log("[PoE2TC Stat Groups] " + VERSION + " installed");
  }

  install();
})();
