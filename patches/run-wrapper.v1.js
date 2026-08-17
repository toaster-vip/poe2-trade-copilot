(() => {
  "use strict";

  const PATCH_VERSION = "run-wrapper-1.0";
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || "").replace(/\u00a0/g," ").replace(/\s+/g," ").trim().toLowerCase();
  const visible = el => {
    if (!el) return false;
    const st = getComputedStyle(el);
    return el.offsetParent !== null && st.display !== "none" && st.visibility !== "hidden";
  };
  const status = text => {
    const el = document.querySelector("#ptc-status");
    if (el) el.textContent = text;
    console.log("[PoE2TC Run Wrapper]", text);
  };
  const exact = (a,b) => norm(a) === norm(b);

  function rows(){
    const pane = document.querySelector(".search-advanced-pane") || document;
    return [...pane.querySelectorAll(".filter.filter-property")].filter(visible);
  }
  function findRow(label){
    const wanted = norm(label);
    const list = rows();
    return list.find(r => {
      const t = norm(r.innerText || r.textContent || "");
      return t === wanted || t.startsWith(wanted + " ");
    }) || list.find(r => norm(r.innerText || r.textContent || "").includes(wanted)) || null;
  }
  function root(row){ return row?.querySelector(".multiselect") || row?.querySelector("[role='combobox']") || null; }
  function input(row){ return row?.querySelector("input.multiselect__input") || root(row)?.querySelector("input") || null; }
  function vue(row){ const r=root(row); return r ? (r.__vue__ || r.__vueParentComponent || null) : null; }
  function label(v){
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number") return String(v);
    return String(v.label ?? v.name ?? v.text ?? v.value ?? v.id ?? "");
  }
  function selected(vm){
    if (!vm) return null;
    for (const x of [vm.internalValue,vm.value,vm.modelValue,vm.selected,vm.currentValue,vm.$props?.value]) {
      if (x == null) continue;
      if (Array.isArray(x)) { if (x.length) return x[0]; }
      else return x;
    }
    return null;
  }
  function options(vm){
    if (!vm) return [];
    for (const x of [vm.options,vm.filteredOptions,vm.optionKeys,vm.$options?.propsData?.options,vm.$parent?.options,vm.$props?.options]) {
      if (Array.isArray(x) && x.length) return x;
    }
    return [];
  }
  function committed(row,wanted){ return exact(label(selected(vue(row))), wanted); }
  function setInput(el,value){
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    el.focus();
    if (setter) setter.call(el,String(value)); else el.value=String(value);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }
  async function close(vm,i){
    try { if (vm && typeof vm.deactivate === "function") vm.deactivate(); } catch {}
    try { i?.blur(); } catch {}
    await sleep(180);
  }

  async function choose(spec){
    let last = "not_started";
    for (let attempt=1; attempt<=5; attempt++) {
      const row = findRow(spec.label);
      const i = input(row);
      if (!row || !i) {
        last = !row ? "row_not_found" : "input_not_found";
        await sleep(300 * attempt);
        continue;
      }

      await sleep(250 + 200 * attempt);
      let vm = vue(row);
      if (vm) {
        let opts = options(vm);
        if (!opts.length) {
          i.click();
          await sleep(300 + 150 * attempt);
          vm = vue(row);
          opts = options(vm);
        }
        const opt = opts.find(o => exact(label(o),spec.value));
        if (opt) {
          try {
            if (typeof vm.select === "function") vm.select(opt);
            else if (typeof vm.$emit === "function") {
              vm.$emit("input",opt);
              vm.$emit("update:modelValue",opt);
            }
          } catch {}
          await close(vm,i);
          await sleep(250);
          if (committed(row,spec.value)) return {ok:true,attempt,mode:"vue"};
        }
      }

      i.click();
      setInput(i,spec.value);
      await sleep(550 + 200 * attempt);
      const domOpts = [...document.querySelectorAll(".multiselect__option, .multiselect__element, [role='option']")].filter(visible);
      const opt = domOpts.find(o => exact(o.innerText || o.textContent || "", spec.value));
      if (opt) {
        opt.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window}));
        opt.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,view:window}));
        opt.click();
        await sleep(400);
        await close(vue(row),i);
        if (committed(row,spec.value)) return {ok:true,attempt,mode:"dom"};
      }

      last = `selection_not_committed:${label(selected(vue(row))) || "empty"}`;
      status(`Retrying ${spec.label} (${attempt}/5)…`);
      await sleep(350 * attempt);
    }
    return {ok:false,reason:last};
  }

  async function clearPage(){
    const btn = document.querySelector("button.clear-btn");
    if (!btn) return false;
    btn.click();
    await sleep(900);
    return true;
  }

  function install(){
    const button = document.querySelector("#ptc-run");
    const box = document.querySelector("#ptc-box");
    if (!button || !box || typeof button.onclick !== "function") {
      setTimeout(install,300);
      return;
    }
    if (button.dataset.runWrapper === PATCH_VERSION) return;

    const original = button.onclick;
    button.onclick = async function(event){
      let packet;
      try { packet = JSON.parse(box.value); }
      catch { return original.call(this,event); }

      const selects = Array.isArray(packet.selects) ? packet.selects : [];
      if (!selects.length) return original.call(this,event);

      status("Preflight: preparing select filters…");
      if (packet.clear !== false) {
        const ok = await clearPage();
        if (!ok) {
          status("ABORTED: clear button not found.");
          return;
        }
      }

      for (const spec of selects) {
        status(`Preflight: ${spec.label} → ${spec.value}`);
        const r = await choose(spec);
        if (!r.ok) {
          status(`ABORTED: ${spec.label} failed after 5 retries. COPY DEBUG.`);
          window.__POE2TC_PREFLIGHT_DEBUG = {ok:false,failed:spec,result:r,packet};
          return;
        }
      }

      // Let the known-good v0.5.1 runner handle numeric fields/stats/search,
      // but skip its flaky clear/select phase because preflight already committed them.
      const originalText = box.value;
      const delegated = {...packet, clear:false, selects:[]};
      box.value = JSON.stringify(delegated,null,2);
      window.__POE2TC_PREFLIGHT_DEBUG = {ok:true,selects,packet};
      try {
        const promise = original.call(this,event);
        await sleep(50);
        box.value = originalText;
        return promise;
      } catch (error) {
        box.value = originalText;
        throw error;
      }
    };

    button.dataset.runWrapper = PATCH_VERSION;
    console.log(`[PoE2TC Run Wrapper] ${PATCH_VERSION} installed`);
  }

  install();
})();
