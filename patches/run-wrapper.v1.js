(() => {
  "use strict";

  const PATCH_VERSION = "run-wrapper-1.1";
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || "").replace(/\u00a0/g," ").replace(/\s+/g," ").trim().toLowerCase();
  const visible = el => {
    if (!el) return false;
    const st = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return st.display !== "none" && st.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
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
  function displayed(row){
    const candidates = [
      row?.querySelector(".multiselect__single"),
      row?.querySelector(".multiselect__tags"),
      row?.querySelector(".multiselect__placeholder"),
      root(row)
    ];
    for (const el of candidates) {
      const text = String(el?.innerText || el?.textContent || "").replace(/\s+/g," ").trim();
      if (text) return text;
    }
    return "";
  }
  function committed(row,wanted){
    const vueValue = label(selected(vue(row)));
    if (exact(vueValue,wanted)) return true;
    const d = displayed(row);
    return exact(d,wanted) || norm(d).startsWith(norm(wanted) + " ");
  }
  function setInput(el,value){
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    el.focus();
    if (setter) setter.call(el,String(value)); else el.value=String(value);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
    el.dispatchEvent(new KeyboardEvent("keyup",{bubbles:true,key:"a"}));
  }
  async function close(vm,i){
    try { if (vm && typeof vm.deactivate === "function") vm.deactivate(); } catch {}
    try { i?.blur(); } catch {}
    await sleep(180);
  }

  function domOptions(){
    return [...document.querySelectorAll(".multiselect__option, .multiselect__element, [role='option']")]
      .filter(visible)
      .map(el => ({el,text:String(el.innerText || el.textContent || "").replace(/\s+/g," ").trim()}));
  }

  async function choose(spec){
    const attempts=[];
    let last = "not_started";
    for (let attempt=1; attempt<=5; attempt++) {
      const row = findRow(spec.label);
      const i = input(row);
      const trace={attempt,rowFound:!!row,inputFound:!!i,beforeDisplay:displayed(row)};
      if (!row || !i) {
        last = !row ? "row_not_found" : "input_not_found";
        trace.reason=last;
        attempts.push(trace);
        await sleep(450 * attempt);
        continue;
      }

      await sleep(400 + 250 * attempt);
      let vm = vue(row);
      trace.vueFound=!!vm;
      if (vm) {
        let opts = options(vm);
        trace.vueOptions=opts.slice(0,25).map(label);
        if (!opts.length) {
          i.click();
          await sleep(450 + 200 * attempt);
          vm = vue(row);
          opts = options(vm);
          trace.vueOptionsAfterOpen=opts.slice(0,25).map(label);
        }
        const opt = opts.find(o => exact(label(o),spec.value));
        if (opt) {
          trace.vueExactFound=true;
          try {
            if (typeof vm.select === "function") vm.select(opt);
            else if (typeof vm.$emit === "function") {
              vm.$emit("input",opt);
              vm.$emit("update:modelValue",opt);
            }
          } catch (e) { trace.vueError=String(e); }
          await close(vm,i);
          await sleep(350);
          trace.afterVueDisplay=displayed(row);
          trace.afterVueValue=label(selected(vue(row)));
          if (committed(row,spec.value)) {
            attempts.push(trace);
            return {ok:true,attempt,mode:"vue",attempts};
          }
        }
      }

      // DOM fallback. Open, type exact desired text, then click exact visible option.
      i.click();
      await sleep(120);
      setInput(i,spec.value);
      await sleep(750 + 250 * attempt);
      const opts = domOptions();
      trace.domOptions=opts.slice(0,35).map(x=>x.text);
      let opt = opts.find(x => exact(x.text,spec.value));
      if (!opt) opt = opts.find(x => norm(x.text).startsWith(norm(spec.value) + " "));
      if (opt) {
        trace.domExactFound=true;
        for (const type of ["pointerdown","mousedown","pointerup","mouseup","click"]) {
          try { opt.el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window})); } catch {}
        }
        await sleep(500);
        await close(vue(row),i);
        trace.afterDomDisplay=displayed(row);
        trace.afterDomValue=label(selected(vue(row)));
        trace.inputValue=i.value;
        if (committed(row,spec.value)) {
          attempts.push(trace);
          return {ok:true,attempt,mode:"dom",attempts};
        }
      }

      last = `selection_not_committed:${label(selected(vue(row))) || "empty"}`;
      trace.reason=last;
      trace.finalDisplay=displayed(row);
      trace.finalInput=i.value;
      attempts.push(trace);
      status(`Retrying ${spec.label} (${attempt}/5)…`);
      await sleep(500 * attempt);
    }
    return {ok:false,reason:last,attempts};
  }

  async function clearPage(){
    const btn = document.querySelector("button.clear-btn");
    if (!btn) return false;
    btn.click();
    await sleep(1200);
    return true;
  }

  function install(){
    const button = document.querySelector("#ptc-run");
    const box = document.querySelector("#ptc-box");
    if (!button || !box || typeof button.onclick !== "function") { setTimeout(install,300); return; }
    if (button.dataset.runWrapper === PATCH_VERSION) return;

    const original = button.onclick;
    button.onclick = async function(event){
      let packet;
      try { packet = JSON.parse(box.value); }
      catch { return original.call(this,event); }

      const selects = Array.isArray(packet.selects) ? packet.selects : [];
      if (!selects.length) return original.call(this,event);

      const preflight={ok:false,version:PATCH_VERSION,packet,steps:[]};
      window.__POE2TC_PREFLIGHT_DEBUG=preflight;
      window.__POE2TC_LAST_DEBUG=null;

      status("Preflight: preparing select filters…");
      if (packet.clear !== false) {
        const ok = await clearPage();
        preflight.steps.push({step:"clear",ok});
        if (!ok) { status("ABORTED: clear button not found."); return; }
      }

      for (const spec of selects) {
        status(`Preflight: ${spec.label} → ${spec.value}`);
        const r = await choose(spec);
        preflight.steps.push({step:"select",spec,result:r});
        if (!r.ok) {
          preflight.failed=spec;
          preflight.result=r;
          status(`ABORTED: ${spec.label} failed after 5 retries. COPY DEBUG.`);
          return;
        }
      }

      const originalText = box.value;
      const delegated = {...packet, clear:false, selects:[]};
      box.value = JSON.stringify(delegated,null,2);
      preflight.ok=true;
      try {
        const result = original.call(this,event);
        await sleep(80);
        box.value = originalText;
        return result;
      } catch (error) {
        box.value = originalText;
        throw error;
      }
    };

    // Make existing COPY DEBUG include preflight details even when original runner never started.
    const debugButton=document.querySelector("#ptc-debug");
    if (debugButton && !debugButton.dataset.preflightDebug) {
      const originalDebug=debugButton.onclick;
      debugButton.onclick=async function(event){
        if (window.__POE2TC_PREFLIGHT_DEBUG && !window.__POE2TC_LAST_DEBUG) {
          const packet={
            protocol:"poe2-trade-copilot/preflight-debug-v1",
            version:PATCH_VERSION,
            url:location.href,
            preflight:window.__POE2TC_PREFLIGHT_DEBUG
          };
          const text=JSON.stringify(packet);
          try { await navigator.clipboard.writeText(text); status("Preflight debug copied."); return; } catch {}
        }
        return originalDebug?.call(this,event);
      };
      debugButton.dataset.preflightDebug="1";
    }

    button.dataset.runWrapper = PATCH_VERSION;
    console.log(`[PoE2TC Run Wrapper] ${PATCH_VERSION} installed`);
  }

  install();
})();
