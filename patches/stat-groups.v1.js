(() => {
  "use strict";

  const VERSION = "stat-groups-1.7";
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
    const candidates = $("input,button,[role='button'],a,div,span", document)
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

  async function addGroup(type) {
    const before = new Set(groupRoots());
    const control = findAddGroupControl();
    if (!control) return {
      ok:false,
      reason:"add_stat_group_control_not_found",
      discovery:window.__POE2TC_ADD_GROUP_DISCOVERY||null
    };

    clickLikeUser(control);
    await sleep(250);

    let created = groupRoots().find(x => !before.has(x)) || null;
    if (!created) {
      const wanted = norm(type);
      const choices = visibleGroupChoices();
      const choice = choices.find(x => norm(x.text) === wanted) ||
        (wanted === "and" ? choices.find(x => norm(x.text).startsWith("and")) : null) ||
        (wanted === "count" ? choices.find(x => norm(x.text).startsWith("count")) : null);
      if (!choice) return {ok:false, reason:"stat_group_type_option_not_found", choices:choices.map(x=>x.text)};
      clickLikeUser(choice.el);
      created = await waitForNewGroup(before, type);
    }

    if (!created) return {ok:false, reason:"created_stat_group_not_found"};
    if (!groupTypeVisible(created, type)) {
      const changed = await setExistingGroupType(created,type);
      if (!changed || !groupTypeVisible(created,type)) {
        return {ok:false, reason:"wrong_stat_group_type", wanted:type, groupText:String(created.innerText || created.textContent || "").replace(/\s+/g," ").trim().slice(0,400)};
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
    for (let gi=0; gi<groups.length; gi++) {
      const group = groups[gi];
      if (!["and","count","not","if","weight","weight2"].includes(group.type)) {
        throw new Error("unsupported stat group type: " + group.type);
      }
      for (let fi=0; fi<(group.filters || []).length; fi++) {
        const spec = group.filters[fi];
        const live = index.get(String(spec.id || ""));
        if (!live) throw new Error("official stat id no longer exists: " + spec.id);
        if (!exactTextMatch(live.text, spec.text)) {
          throw new Error("official stat text mismatch for " + spec.id + ": " + live.text);
        }
      }
    }
  }

  function groupAddInput(group) {
    return $$("input", group).find(el => visible(el) && /add stat filter/i.test(String(el.placeholder || ""))) || null;
  }

  function statRows(group) {
    return $$(".filter", group).filter(row => {
      const mm = minMaxInputs(row);
      return !!(mm.min || mm.max);
    });
  }

  function findRow(group, text) {
    const wanted = norm(text);
    return statRows(group).find(row => norm(row.innerText || row.textContent || "").includes(wanted)) || null;
  }

  async function commitExactStat(group, spec) {
    const input = groupAddInput(group);
    if (!input) return {ok:false, reason:"group_add_stat_input_not_found"};

    const before = new Set(statRows(group));
    const root = input.closest(".multiselect") || input.parentElement?.closest(".multiselect") || input.closest("[role='combobox']");
    let vm = vueFor(root);

    input.click();
    nativeValue(input, spec.text);
    await sleep(500);

    vm = vueFor(root) || vm;
    let chosenLabel = null;
    if (vm) {
      let options = vueOptions(vm);
      if (!options.length) { await sleep(300); options = vueOptions(vm); }
      const picked = options.find(o => idOf(o) === String(spec.id)) ||
        options.find(o => exactTextMatch(labelOf(o), spec.text));
      if (picked) {
        try {
          if (typeof vm.select === "function") vm.select(picked);
          else if (typeof vm.$emit === "function") {
            vm.$emit("input", picked);
            vm.$emit("update:modelValue", picked);
          }
          chosenLabel = labelOf(picked);
          try { vm.deactivate?.(); } catch {}
          input.blur();
        } catch {}
      }
    }

    if (!chosenLabel) {
      const options = $$(".multiselect__option,[role='option'],li")
        .filter(visible)
        .map(el => ({el,text:String(el.innerText || el.textContent || "").replace(/\s+/g," ").trim()}));
      const picked = options.find(x => exactTextMatch(x.text, spec.text));
      if (!picked) return {ok:false, reason:"exact_stat_option_not_found", wanted:spec.text, options:options.slice(0,30).map(x=>x.text)};
      clickLikeUser(picked.el);
      chosenLabel = picked.text;
      input.blur();
    }

    let row = null;
    for (let i=0; i<40; i++) {
      await sleep(100);
      const added = statRows(group).filter(x => !before.has(x));
      row = added.find(x => norm(x.innerText || x.textContent || "").includes(norm(spec.text))) || findRow(group, spec.text);
      if (row) break;
    }
    if (!row) return {ok:false, reason:"created_stat_row_not_found", selected:chosenLabel};

    const mm = minMaxInputs(row);
    if (spec.min != null) {
      if (!mm.min) return {ok:false, reason:"stat_min_not_found", selected:chosenLabel};
      nativeValue(mm.min, spec.min);
    }
    if (spec.max != null) {
      if (!mm.max) return {ok:false, reason:"stat_max_not_found", selected:chosenLabel};
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
    if (active === "run-wrapper-2.9") return "stat-groups-1.6";
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
      if (button.dataset.runWrapper === "run-wrapper-2.5") return;

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
