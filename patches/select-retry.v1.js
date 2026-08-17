(() => {
  "use strict";

  const PATCH_VERSION = "select-retry-1.0";
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = s => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    return el.offsetParent !== null && style.display !== "none" && style.visibility !== "hidden";
  };
  const optionText = el => String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  const exact = (a,b) => norm(a) === norm(b);

  function propertyRows(){
    const pane = document.querySelector(".search-advanced-pane") || document;
    return [...pane.querySelectorAll(".filter.filter-property")].filter(visible);
  }
  function findRow(label){
    const wanted = norm(label);
    const rows = propertyRows();
    return rows.find(r => {
      const text = norm(r.innerText || r.textContent || "");
      return text === wanted || text.startsWith(wanted + " ");
    }) || rows.find(r => norm(r.innerText || r.textContent || "").includes(wanted)) || null;
  }
  function root(row){ return row?.querySelector(".multiselect") || row?.querySelector("[role='combobox']") || null; }
  function input(row){ return row?.querySelector("input.multiselect__input") || root(row)?.querySelector("input") || null; }
  function vm(row){
    const r = root(row);
    return r ? (r.__vue__ || r.__vueParentComponent || null) : null;
  }
  function label(v){
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number") return String(v);
    return String(v.label ?? v.name ?? v.text ?? v.value ?? v.id ?? "");
  }
  function selected(v){
    if (!v) return null;
    for (const x of [v.internalValue,v.value,v.modelValue,v.selected,v.currentValue,v.$props?.value]) {
      if (x == null) continue;
      if (Array.isArray(x)) { if (x.length) return x[0]; }
      else return x;
    }
    return null;
  }
  function options(v){
    if (!v) return [];
    for (const x of [v.options,v.filteredOptions,v.optionKeys,v.$options?.propsData?.options,v.$parent?.options,v.$props?.options]) {
      if (Array.isArray(x) && x.length) return x;
    }
    return [];
  }
  function nativeValue(el,value){
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    el.focus();
    if (setter) setter.call(el,String(value)); else el.value = String(value);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }
  async function close(v,i){
    try { if (v && typeof v.deactivate === "function") v.deactivate(); } catch {}
    try { i?.blur(); } catch {}
    await sleep(180);
  }
  function isCommitted(row,wanted){ return exact(label(selected(vm(row))),wanted); }

  async function attempt(spec, attemptNo){
    const row = findRow(spec.label);
    if (!row) return {ok:false,reason:"row_not_found"};
    const i = input(row);
    if (!i) return {ok:false,reason:"input_not_found"};

    // Give Vue/site hydration time on slower mobile Safari loads.
    await sleep(attemptNo === 1 ? 250 : 450);
    let v = vm(row);
    if (v) {
      let opts = options(v);
      if (!opts.length) {
        i.click();
        await sleep(300 + attemptNo * 150);
        v = vm(row);
        opts = options(v);
      }
      const opt = opts.find(x => exact(label(x),spec.value));
      if (opt) {
        try {
          if (typeof v.select === "function") v.select(opt);
          else if (typeof v.$emit === "function") {
            v.$emit("input",opt);
            v.$emit("update:modelValue",opt);
          }
        } catch {}
        await close(v,i);
        await sleep(250 + attemptNo * 100);
        if (isCommitted(row,spec.value)) return {ok:true,mode:"vue-retry"};
      }
    }

    // DOM fallback: reopen, type exact value, wait for options, click exact match.
    i.click(); i.focus();
    nativeValue(i,spec.value);
    await sleep(500 + attemptNo * 250);
    const domOpts = [...document.querySelectorAll(".multiselect__option, .multiselect__element, [role='option']")].filter(visible);
    const opt = domOpts.find(x => exact(optionText(x),spec.value));
    if (opt) {
      opt.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window}));
      opt.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,view:window}));
      opt.click();
      await sleep(350 + attemptNo * 100);
      await close(vm(row),i);
      if (isCommitted(row,spec.value)) return {ok:true,mode:"dom-retry"};
    }
    return {ok:false,reason:"selection_not_committed",vueValue:label(selected(vm(row))),typedValue:i.value};
  }

  async function chooseSelectWithRetry(spec){
    let last = null;
    for (let n=1; n<=4; n++) {
      last = await attempt(spec,n);
      if (last.ok) {
        return dbg("select-set",{ok:true,label:spec.label,value:spec.value,mode:last.mode,attempt:n,vueValue:spec.value});
      }
      dbg("select-retry",{ok:false,label:spec.label,value:spec.value,attempt:n,reason:last.reason,vueValue:last.vueValue||"",typedValue:last.typedValue||""});
      await sleep(350*n);
    }
    return dbg("select-failed",{ok:false,label:spec.label,reason:last?.reason||"selection_not_committed",wanted:spec.value,vueValue:last?.vueValue||"",typedValue:last?.typedValue||"",attempts:4});
  }

  // Core is eval'd globally by the bootstrap; replacing this binding makes runPacket use retries.
  try {
    chooseSelect = chooseSelectWithRetry;
    console.log(`[PoE2TC Select Retry] ${PATCH_VERSION} installed`);
  } catch (error) {
    console.error("[PoE2TC Select Retry] install failed", error);
  }
})();
