(() => {
  "use strict";

  const PATCH_VERSION = "run-wrapper-3.1";
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

  function candidateRows(){
    const scope = document;
    const selectors = [".filter.filter-property", ".filter", "[class*='filter']"];
    const seen = new Set();
    const out = [];
    for (const selector of selectors) {
      for (const el of scope.querySelectorAll(selector)) {
        if (seen.has(el) || el.closest("#ptc")) continue;
        seen.add(el);
        if (!el.querySelector("input, .multiselect, [role='combobox']")) continue;
        out.push(el);
      }
    }
    return out;
  }
  function rowMatchScore(row,wanted){
    const text = norm(row.innerText || row.textContent || "");
    let score = 0;
    if (visible(row)) score += 10000;
    if (text === wanted) score += 5000;
    else if (text.startsWith(wanted + " ")) score += 3500;
    else if (text.includes(wanted)) score += 1500;
    score -= Math.min(text.length, 1200);
    return score;
  }
  function findRow(label){
    const wanted = norm(label);
    const list = candidateRows().filter(r => norm(r.innerText || r.textContent || "").includes(wanted));
    list.sort((a,b) => rowMatchScore(b,wanted) - rowMatchScore(a,wanted));
    return list[0] || null;
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
  function allSelectRoots(){
    return [...document.querySelectorAll(".multiselect, [role='combobox']")]
      .filter(el => !el.closest("#ptc"));
  }
  function selectControlCandidates(spec){
    const wantedValue = norm(spec.value);
    const wantedLabel = norm(spec.label);
    const out = [];
    for (const r of allSelectRoots()) {
      const vm = r.__vue__ || r.__vueParentComponent || null;
      const opts = options(vm);
      const optionLabels = opts.map(label);
      const exactIndex = optionLabels.findIndex(x => norm(x) === wantedValue);

      let node = r;
      let distance = 0;
      let labelDistance = 999;
      let labelContext = "";
      while (node && node !== document.body && distance < 10) {
        const text = norm(node.innerText || node.textContent || "");
        if (text.includes(wantedLabel)) {
          labelDistance = distance;
          labelContext = String(node.innerText || node.textContent || "").replace(/\s+/g," ").trim().slice(0,400);
          break;
        }
        node = node.parentElement;
        distance++;
      }
      const input = r.querySelector("input.multiselect__input") || r.querySelector("input") || null;
      if (exactIndex < 0 && labelDistance >= 999) continue;
      const score =
        (exactIndex >= 0 ? 20000 : 0) +
        (labelDistance < 999 ? 10000 - labelDistance * 500 : 0) -
        Math.min(labelContext.length,400);
      out.push({root:r,vm,input,opts,optionLabels,exactIndex,labelDistance,labelContext,score});
    }
    out.sort((a,b)=>b.score-a.score);
    return out;
  }
  function nearestLabelContext(el,label,maxDepth=10){
    const wanted = norm(label);
    let node = el;
    for (let distance=0; node && node!==document.body && distance<=maxDepth; distance++, node=node.parentElement) {
      const text = norm(node.innerText || node.textContent || "");
      if (text.includes(wanted)) {
        return {
          distance,
          node,
          text:String(node.innerText || node.textContent || "").replace(/\s+/g," ").trim()
        };
      }
    }
    return null;
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

  function numericInputs(row){
    if (!row) return [];
    return [...row.querySelectorAll("input")].filter(el => {
      const p = norm(el.placeholder);
      return el.type === "number" || p === "min" || p === "max";
    });
  }
  function minMax(row){
    const inputs = numericInputs(row);
    const byMin = inputs.find(x => norm(x.placeholder) === "min");
    const byMax = inputs.find(x => norm(x.placeholder) === "max");
    return {
      min: byMin || inputs[0] || null,
      max: byMax || inputs[1] || (inputs.length === 1 ? inputs[0] : null)
    };
  }
  function setNumericInput(el,value){
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    el.focus();
    if (setter) setter.call(el,String(value)); else el.value=String(value);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
    el.blur();
  }
  function fieldCommitted(row,spec){
    const mm = minMax(row);
    if (spec.min != null && String(mm.min?.value ?? "") !== String(spec.min)) return false;
    if (spec.max != null && String(mm.max?.value ?? "") !== String(spec.max)) return false;
    return true;
  }

  function verifyFieldCommitted(spec){
    function candidatesFor(kind){
      const wantedPlaceholder=kind==="min"?"min":"max";
      return [...document.querySelectorAll("input")]
        .filter(el=>!el.closest("#ptc"))
        .filter(el=>{
          const p=norm(el.placeholder);
          return p===wantedPlaceholder || (el.type==="number" && (p==="" || p===wantedPlaceholder));
        })
        .map(el=>{
          const ctx=nearestLabelContext(el,spec.label,10);
          return {el,ctx};
        })
        .filter(x=>!!x.ctx)
        .sort((a,b)=>{
          if(a.ctx.distance!==b.ctx.distance) return a.ctx.distance-b.ctx.distance;
          return a.ctx.text.length-b.ctx.text.length;
        });
    }

    const minCandidates=spec.min!=null?candidatesFor("min"):[];
    const maxCandidates=spec.max!=null?candidatesFor("max"):[];
    const minEl=spec.min!=null?(minCandidates[0]?.el||null):null;
    const maxEl=spec.max!=null?(maxCandidates[0]?.el||null):null;
    const minOk=spec.min==null || (!!minEl && String(minEl.value??"")===String(spec.min));
    const maxOk=spec.max==null || (!!maxEl && String(maxEl.value??"")===String(spec.max));
    const ctx=(minCandidates[0]?.ctx||maxCandidates[0]?.ctx||null);
    return {
      ok:minOk&&maxOk,
      minFound:spec.min==null||!!minEl,
      maxFound:spec.max==null||!!maxEl,
      minValue:minEl?.value??null,
      maxValue:maxEl?.value??null,
      context:String(ctx?.text||"").slice(0,260)
    };
  }
  async function setField(spec){
    const attempts=[];
    let last="not_started";

    function candidatesFor(kind){
      const wantedPlaceholder=kind==="min"?"min":"max";
      return [...document.querySelectorAll("input")]
        .filter(el=>!el.closest("#ptc"))
        .filter(el=>{
          const p=norm(el.placeholder);
          return p===wantedPlaceholder || (el.type==="number" && (p==="" || p===wantedPlaceholder));
        })
        .map(el=>{
          const ctx=nearestLabelContext(el,spec.label,10);
          return {el,ctx};
        })
        .filter(x=>!!x.ctx)
        .sort((a,b)=>{
          if(a.ctx.distance!==b.ctx.distance) return a.ctx.distance-b.ctx.distance;
          return a.ctx.text.length-b.ctx.text.length;
        });
    }

    for(let attempt=1; attempt<=5; attempt++){
      const minCandidates=spec.min!=null?candidatesFor("min"):[];
      const maxCandidates=spec.max!=null?candidatesFor("max"):[];
      const minEl=spec.min!=null?(minCandidates[0]?.el||null):null;
      const maxEl=spec.max!=null?(maxCandidates[0]?.el||null):null;
      const trace={
        attempt,
        minCandidates:minCandidates.slice(0,8).map(x=>({distance:x.ctx.distance,context:x.ctx.text.slice(0,280),value:x.el.value})),
        maxCandidates:maxCandidates.slice(0,8).map(x=>({distance:x.ctx.distance,context:x.ctx.text.slice(0,280),value:x.el.value})),
        minFound:spec.min==null||!!minEl,
        maxFound:spec.max==null||!!maxEl
      };

      if(spec.min!=null&&!minEl){
        last="min_not_found";
        trace.reason=last;
        attempts.push(trace);
        await sleep(450*attempt);
        continue;
      }
      if(spec.max!=null&&!maxEl){
        last="max_not_found";
        trace.reason=last;
        attempts.push(trace);
        await sleep(450*attempt);
        continue;
      }

      if(minEl) setNumericInput(minEl,spec.min);
      if(maxEl) setNumericInput(maxEl,spec.max);
      await sleep(350+150*attempt);

      trace.afterMin=minEl?.value??null;
      trace.afterMax=maxEl?.value??null;
      const minOk=spec.min==null||String(minEl?.value??"")===String(spec.min);
      const maxOk=spec.max==null||String(maxEl?.value??"")===String(spec.max);
      if(minOk&&maxOk){
        attempts.push(trace);
        return {ok:true,attempt,attempts};
      }

      last="value_not_committed";
      trace.reason=last;
      attempts.push(trace);
      status(`Retrying ${spec.label} (${attempt}/5)…`);
      await sleep(500*attempt);
    }

    return {ok:false,reason:last,attempts};
  }

  function domOptions(){
    return [...document.querySelectorAll(".multiselect__option, .multiselect__element, [role='option']")]
      .filter(visible)
      .map(el => ({el,text:String(el.innerText || el.textContent || "").replace(/\s+/g," ").trim()}));
  }

  function chooseNativeSelect(spec){
    const wanted=norm(spec.value);
    const matches=[...document.querySelectorAll("select")]
      .filter(el=>!el.closest("#ptc") && visible(el))
      .map(el=>{
        const opts=[...el.options];
        const idx=opts.findIndex(o=>norm(o.textContent||o.label||o.value)===wanted);
        return {el,opts,idx};
      })
      .filter(x=>x.idx>=0);

    if(!matches.length) return null;

    const target=matches[0];
    const opt=target.opts[target.idx];
    try{
      target.el.value=opt.value;
      target.el.selectedIndex=target.idx;
      target.el.dispatchEvent(new Event("input",{bubbles:true}));
      target.el.dispatchEvent(new Event("change",{bubbles:true}));
    }catch(error){
      return {ok:false,reason:"native_select_error",error:String(error?.message||error)};
    }

    const selectedText=String(target.el.options[target.el.selectedIndex]?.textContent||target.el.value||"").replace(/\s+/g," ").trim();
    return {
      ok:exact(selectedText,spec.value),
      mode:"native-select-exact",
      selectedText,
      optionLabels:target.opts.map(o=>String(o.textContent||o.label||o.value||"").replace(/\s+/g," ").trim()).slice(0,20)
    };
  }

  function tradeModeClickables(){
    const sel="button,[role='button'],a,label,.multiselect,.dropdown-toggle,[class*='select'],[class*='dropdown']";
    return [...document.querySelectorAll(sel)]
      .filter(el=>!el.closest("#ptc") && visible(el))
      .map(el=>({
        el,
        text:String(el.innerText||el.textContent||el.getAttribute("aria-label")||"").replace(/\s+/g," ").trim()
      }))
      .filter(x=>/in-person trade|instant buyout/i.test(x.text));
  }

  async function chooseTradeMode(spec){
    if(norm(spec.label)!=="trade mode") return null;
    const wanted=norm(spec.value);
    const trace={mode:"trade-mode-click",wanted:spec.value,initial:tradeModeClickables().map(x=>x.text).slice(0,30)};

    const clickExact=async()=>{
      const exactMatch=tradeModeClickables().find(x=>norm(x.text)===wanted || norm(x.text).includes(wanted));
      if(!exactMatch) return false;
      try{ exactMatch.el.click(); }catch{
        try{ exactMatch.el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window})); }catch{}
      }
      await sleep(500);
      trace.clicked=exactMatch.text;
      return true;
    };

    if(await clickExact()){
      trace.after=tradeModeClickables().map(x=>x.text).slice(0,30);
      return {ok:true,attempt:1,mode:"trade-mode-direct-click",attempts:[trace]};
    }

    const openers=tradeModeClickables();
    for(const opener of openers.slice(0,12)){
      try{ opener.el.click(); }catch{
        try{ opener.el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window})); }catch{}
      }
      await sleep(350);
      trace.opened=(trace.opened||[]).concat(opener.text);
      if(await clickExact()){
        trace.after=tradeModeClickables().map(x=>x.text).slice(0,30);
        return {ok:true,attempt:1,mode:"trade-mode-open-then-click",attempts:[trace]};
      }
    }

    trace.after=tradeModeClickables().map(x=>x.text).slice(0,30);
    return {ok:false,reason:"trade_mode_control_not_found",attempts:[trace]};
  }

  function searchItemControl(){
    const input=[...document.querySelectorAll("input")]
      .find(el=>!el.closest("#ptc") && /search items/i.test(String(el.placeholder||"")));
    if(!input) return {root:null,input:null,vm:null};
    const root=input.closest(".multiselect,.search-select,[role='combobox']") || input.parentElement;
    const vm=root ? (root.__vue__ || root.__vueParentComponent || null) : null;
    return {root,input,vm};
  }

  async function chooseSearchItem(itemName){
    const wanted=norm(itemName);
    const attempts=[];

    for(let attempt=1; attempt<=5; attempt++){
      const ctl=searchItemControl();
      const trace={attempt,inputFound:!!ctl.input,rootFound:!!ctl.root};

      if(!ctl.input || !ctl.root){
        trace.reason="search_items_control_not_found";
        attempts.push(trace);
        await sleep(350*attempt);
        continue;
      }

      try{ ctl.input.click(); }catch{}
      setInput(ctl.input,itemName);
      await sleep(650+150*attempt);

      const vm=ctl.root.__vue__ || ctl.root.__vueParentComponent || ctl.vm || null;
      const vueOpts=options(vm);
      trace.vueOptions=vueOpts.slice(0,30).map(label);

      const vueMatch=vueOpts.find(o=>{
        const t=norm(label(o));
        return t===wanted || t.startsWith(wanted+" ");
      });

      if(vueMatch){
        trace.vueMatch=label(vueMatch);
        try{
          if(typeof vm?.select==="function") vm.select(vueMatch);
          else if(typeof vm?.$emit==="function"){
            vm.$emit("input",vueMatch);
            vm.$emit("update:modelValue",vueMatch);
          }
        }catch(error){ trace.vueError=String(error?.message||error); }

        await close(vm,ctl.input);
        await sleep(350);

        const rootText=String(ctl.root.innerText||ctl.root.textContent||"").replace(/\s+/g," ").trim();
        const selectedText=label(selected(ctl.root.__vue__ || ctl.root.__vueParentComponent || vm));
        trace.selectedText=selectedText;
        trace.rootText=rootText.slice(0,300);

        if(norm(selectedText)===wanted || norm(selectedText).startsWith(wanted+" ")){
          attempts.push(trace);
          return {ok:true,mode:"search-items-vue-exact",selected:selectedText||rootText,attempts};
        }
      }

      try{ ctl.input.click(); }catch{}
      await sleep(120);
      setInput(ctl.input,itemName);
      await sleep(650+150*attempt);

      const domOptions=[...ctl.root.querySelectorAll(".multiselect__option,.multiselect__element,[role='option']")]
        .filter(visible)
        .map(el=>({el,text:String(el.innerText||el.textContent||"").replace(/\s+/g," ").trim()}));
      trace.domOptions=domOptions.slice(0,30).map(x=>x.text);

      const domMatch=domOptions.find(x=>{
        const t=norm(x.text);
        return t===wanted || t.startsWith(wanted+" ");
      });

      if(domMatch){
        trace.domMatch=domMatch.text;
        for(const type of ["pointerdown","mousedown","pointerup","mouseup","click"]){
          try{ domMatch.el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window})); }catch{}
        }
        await sleep(450);

        const rootText=String(ctl.root.innerText||ctl.root.textContent||"").replace(/\s+/g," ").trim();
        const selectedText=label(selected(ctl.root.__vue__ || ctl.root.__vueParentComponent || vm));
        trace.selectedTextAfterDom=selectedText;
        trace.rootTextAfterDom=rootText.slice(0,300);

        if(norm(selectedText)===wanted || norm(selectedText).startsWith(wanted+" ")){
          attempts.push(trace);
          return {ok:true,mode:"search-items-dom-exact",selected:selectedText||rootText,attempts};
        }
      }

      trace.reason="item_name_not_committed";
      attempts.push(trace);
      await sleep(350*attempt);
    }

    return {ok:false,reason:"item_name_not_committed",wanted:itemName,attempts};
  }

  async function choose(spec){
    const tradeModeResult=await chooseTradeMode(spec);
    if(tradeModeResult) return tradeModeResult;

    const nativeResult=chooseNativeSelect(spec);
    if(nativeResult){
      if(nativeResult.ok) return {ok:true,attempt:1,mode:nativeResult.mode,attempts:[nativeResult]};
      return {ok:false,reason:nativeResult.reason||"native_selection_not_committed",attempts:[nativeResult]};
    }

    const attempts=[];
    let last="not_started";

    for(let attempt=1; attempt<=5; attempt++){
      let candidates=selectControlCandidates(spec);
      let target=candidates.find(c=>c.exactIndex>=0)||candidates[0]||null;
      const trace={
        attempt,
        candidateCount:candidates.length,
        candidates:candidates.slice(0,10).map(c=>({
          optionLabels:c.optionLabels.slice(0,25),
          labelDistance:c.labelDistance,
          labelContext:c.labelContext,
          score:c.score
        })),
        inputFound:!!target?.input
      };

      if(!target){
        last="exact_option_control_not_found";
        trace.reason=last;
        attempts.push(trace);
        await sleep(450*attempt);
        continue;
      }

      let vm=target.vm;
      let i=target.input;
      let opts=target.opts;
      trace.vueOptions=opts.slice(0,25).map(label);

      if(!i){
        last="input_not_found";
        trace.reason=last;
        attempts.push(trace);
        await sleep(450*attempt);
        continue;
      }

      if(!opts.some(o=>exact(label(o),spec.value))){
        // Some official Trade multiselects populate their options only after opening.
        // Probe label-local candidates one at a time and keep the first control that
        // actually exposes the requested exact value.
        for(const probe of candidates.slice(0,12)){
          const probeInput=probe.input;
          if(!probeInput) continue;
          try{ probeInput.click(); }catch{}
          await sleep(300+120*attempt);
          const refreshed=selectControlCandidates(spec);
          const exactTarget=refreshed.find(c=>c.exactIndex>=0);
          if(exactTarget){
            target=exactTarget;
            vm=target.vm;
            i=target.input||probeInput;
            opts=target.opts;
            break;
          }
          try{ probeInput.blur(); }catch{}
        }
        trace.vueOptionsAfterOpen=opts.slice(0,25).map(label);
      }

      const opt=opts.find(o=>exact(label(o),spec.value));
      if(opt){
        trace.vueExactFound=true;
        try{
          if(typeof vm?.select==="function") vm.select(opt);
          else if(typeof vm?.$emit==="function"){
            vm.$emit("input",opt);
            vm.$emit("update:modelValue",opt);
          }
        }catch(e){ trace.vueError=String(e); }

        await close(vm,i);
        await sleep(350);

        const afterVm=target.root ? (target.root.__vue__ || target.root.__vueParentComponent || vm) : vm;
        trace.afterVueValue=label(selected(afterVm));
        trace.afterDisplay=String(target.root?.innerText||target.root?.textContent||"").replace(/\s+/g," ").trim().slice(0,250);

        if(exact(trace.afterVueValue,spec.value) || norm(trace.afterDisplay).includes(norm(spec.value))){
          attempts.push(trace);
          return {ok:true,attempt,mode:"vue-global-exact",attempts};
        }
      }

      // DOM fallback scoped to this exact control.
      i.click();
      await sleep(120);
      setInput(i,spec.value);
      await sleep(750+250*attempt);
      const localOptions=[...target.root.querySelectorAll(".multiselect__option, .multiselect__element, [role='option']")]
        .filter(visible)
        .map(el=>({el,text:String(el.innerText||el.textContent||"").replace(/\s+/g," ").trim()}));
      trace.domOptions=localOptions.slice(0,35).map(x=>x.text);
      const domOpt=localOptions.find(x=>exact(x.text,spec.value)) || localOptions.find(x=>norm(x.text).startsWith(norm(spec.value)+" "));
      if(domOpt){
        trace.domExactFound=true;
        for(const type of ["pointerdown","mousedown","pointerup","mouseup","click"]){
          try{domOpt.el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window}));}catch{}
        }
        await sleep(500);
        const afterVm=target.root ? (target.root.__vue__ || target.root.__vueParentComponent || vm) : vm;
        trace.afterDomValue=label(selected(afterVm));
        trace.finalInput=i.value;
        if(exact(trace.afterDomValue,spec.value) || norm(target.root?.innerText||target.root?.textContent||"").includes(norm(spec.value))){
          attempts.push(trace);
          return {ok:true,attempt,mode:"dom-global-exact",attempts};
        }
      }

      last=`selection_not_committed:${label(selected(vm))||"empty"}`;
      trace.reason=last;
      attempts.push(trace);
      status(`Retrying ${spec.label} (${attempt}/5)…`);
      await sleep(500*attempt);
    }

    return {ok:false,reason:last,attempts};
  }

  function clearNumericFilters(){
    const inputs=[...document.querySelectorAll("input")]
      .filter(el=>!el.closest("#ptc"))
      .filter(el=>{
        const p=norm(el.placeholder);
        return el.type==="number" || p==="min" || p==="max";
      });
    for(const el of inputs){
      try{
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
        el.focus();
        if(setter) setter.call(el,""); else el.value="";
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.dispatchEvent(new Event("change",{bubbles:true}));
        el.blur();
      }catch{}
    }
    return inputs.length;
  }

  function numericResidue(){
    return [...document.querySelectorAll("input")]
      .filter(el=>!el.closest("#ptc"))
      .filter(el=>{
        const p=norm(el.placeholder);
        return (el.type==="number" || p==="min" || p==="max") && String(el.value||"").trim()!=="";
      })
      .map(el=>({
        value:el.value,
        placeholder:el.placeholder||null,
        context:nearestLabelContext(el,"",4)?.text?.slice(0,180)||null
      }));
  }

  async function clearPage(){
    const btn = document.querySelector("button.clear-btn");
    if (btn) {
      btn.click();
      await sleep(900);
    }
    const cleared=clearNumericFilters();
    await sleep(350);

    // A second pass catches controls re-rendered by the Trade page after Clear.
    const clearedAgain=clearNumericFilters();
    await sleep(300);

    const residue=numericResidue();
    return {ok:residue.length===0,buttonFound:!!btn,cleared:cleared+clearedAgain,residue};
  }

  async function ensureGroupedStatExecutor(){
    const required="stat-groups-1.6";
    if(
      typeof window.__POE2TC_APPLY_STAT_GROUPS==="function" &&
      window.__POE2TC_STAT_GROUPS_MODULE?.version===required
    ) return window.__POE2TC_APPLY_STAT_GROUPS;

    const api="https://api.github.com/repos/toaster-vip/poe2-trade-copilot/contents/patches/stat-groups.v1.js?ref=main&t="+Date.now();
    status("Loading current grouped-stat module…");
    const response=await fetch(api,{
      cache:"no-store",
      credentials:"omit",
      headers:{"Accept":"application/vnd.github+json"}
    });
    if(!response.ok) throw new Error("stat-groups GitHub HTTP "+response.status);
    const payload=await response.json();
    if(!payload?.content) throw new Error("stat-groups GitHub response missing content");

    const clean=String(payload.content||"").replace(/\s+/g,"");
    const binary=atob(clean);
    const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
    const code=new TextDecoder("utf-8").decode(bytes);
    (0,eval)(code+"\n//# sourceURL=poe2tc-stat-groups-hotload.js");

    for(let i=0;i<20;i++){
      if(
        typeof window.__POE2TC_APPLY_STAT_GROUPS==="function" &&
        window.__POE2TC_STAT_GROUPS_MODULE?.version===required
      ){
        window.__POE2TC_STAT_GROUPS_HOTLOAD={
          ok:true,
          sha:payload.sha||null,
          version:window.__POE2TC_STAT_GROUPS_MODULE.version,
          loadedAt:new Date().toISOString()
        };
        return window.__POE2TC_APPLY_STAT_GROUPS;
      }
      await sleep(100);
    }
    window.__POE2TC_STAT_GROUPS_HOTLOAD={
      ok:false,
      sha:payload.sha||null,
      reason:"executor_not_exported_after_eval",
      loadedAt:new Date().toISOString()
    };
    throw new Error("group executor still missing after hot-load");
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
      const fields = Array.isArray(packet.fields) ? packet.fields : [];
      const itemName = packet.itemName != null ? String(packet.itemName).trim() : "";
      if (!selects.length && !fields.length && !itemName) return original.call(this,event);

      const preflight={ok:false,version:PATCH_VERSION,packet,steps:[]};
      window.__POE2TC_PREFLIGHT_DEBUG=preflight;
      window.__POE2TC_LAST_DEBUG=null;

      status("Preflight: preparing select filters…");
      if (packet.clear !== false) {
        const r = await clearPage();
        preflight.steps.push({step:"clear",result:r});
        if (!r.ok) {
          preflight.failed={step:"clear",residue:r.residue};
          status("ABORTED: stale numeric filters remain after reset. COPY DEBUG.");
          return;
        }
      }

      if (itemName) {
        status(`Preflight: Search Items → ${itemName}`);
        const r = await chooseSearchItem(itemName);
        preflight.steps.push({step:"item-name",spec:{itemName},result:r});
        if (!r.ok) {
          preflight.failed={step:"item-name",itemName};
          preflight.result=r;
          status(`ABORTED: Search Items failed for ${itemName}. COPY DEBUG.`);
          return;
        }
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

      for (const spec of fields) {
        status(`Preflight: ${spec.label} numeric filter`);
        const r = await setField(spec);
        preflight.steps.push({step:"field",spec,result:r});
        if (!r.ok) {
          preflight.failed=spec;
          preflight.result=r;
          status(`ABORTED: ${spec.label} numeric filter failed after 5 retries. COPY DEBUG.`);
          return;
        }
      }

      const verifyFields = fields.map(spec=>{
        const result=verifyFieldCommitted(spec);
        return {
          spec,
          ok:result.ok,
          minFound:result.minFound,
          maxFound:result.maxFound,
          minValue:result.minValue,
          maxValue:result.maxValue,
          rowText:result.context
        };
      });
      preflight.steps.push({step:"verify-fields",fields:verifyFields});
      if (verifyFields.some(x=>!x.ok)) {
        preflight.failed={step:"verify-fields",fields:verifyFields};
        status("ABORTED: one or more numeric filters did not verify. COPY DEBUG.");
        return;
      }

      const originalText = box.value;
      preflight.ok=true;

      const grouped = Array.isArray(packet.statGroups) ? packet.statGroups : [];
      if (grouped.length) {
        let executor;
        try {
          executor = await ensureGroupedStatExecutor();
        } catch (error) {
          preflight.failed={step:"stat-groups",reason:"group_executor_load_failed:"+String(error?.message||error)};
          status("ABORTED: grouped-stat executor failed to load. COPY DEBUG.");
          return;
        }

        status("Preflight complete. Building AND/COUNT stat groups…");
        try {
          await executor(packet);
        } catch (error) {
          preflight.failed={step:"stat-groups",reason:String(error?.message||error)};
          status("ABORTED: grouped stat construction failed. COPY DEBUG.");
          return;
        }

        if (packet.search !== false) {
          const searchButton=document.querySelector("button.search-btn");
          if (!searchButton) {
            preflight.failed={step:"search",reason:"search_button_not_found"};
            status("ABORTED: Search button not found after grouped stat verification.");
            return;
          }
          status("PASS: base filters and AND/COUNT groups verified. Searching…");
          searchButton.click();
        } else {
          status("PASS: base filters and AND/COUNT groups verified. Search NOT submitted.");
        }
        return;
      }

      const delegated = {...packet, clear:false, selects:[], fields:[], itemName:null};
      box.value = JSON.stringify(delegated,null,2);
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
        if (window.__POE2TC_PREFLIGHT_DEBUG) {
          const packet={
            protocol:"poe2-trade-copilot/preflight-debug-v1",
            version:PATCH_VERSION,
            url:location.href,
            preflight:window.__POE2TC_PREFLIGHT_DEBUG,
            statBridge:window.__POE2TC_STAT_BRIDGE_DEBUG||null,
            searchSource:window.__POE2TC_LAST_SEARCH_SOURCE||null,
            lastDebug:window.__POE2TC_LAST_DEBUG||null,
            directApi:window.__POE2TC_DIRECT_API_DEBUG||null,
            statGroups:window.__POE2TC_STAT_GROUPS_DEBUG||null,
            statGroupsModule:window.__POE2TC_STAT_GROUPS_MODULE||null,
            remoteInfo:window.__POE2TC_REMOTE_INFO||null,
            runButtonDataset:{...document.querySelector("#ptc-run")?.dataset},
            statGroupsHotload:window.__POE2TC_STAT_GROUPS_HOTLOAD||null,
            addGroupDiscovery:window.__POE2TC_ADD_GROUP_DISCOVERY||null
          };
          const text=JSON.stringify(packet);
          try { await navigator.clipboard.writeText(text); status("Preflight debug copied."); return; } catch {}
          box.value=text;
          box.dispatchEvent(new Event("input",{bubbles:true}));
          box.focus(); box.select?.();
          status("Clipboard blocked — debug placed in the text box. Long-press and Copy.");
          return;
        }
        try {
          return await originalDebug?.call(this,event);
        } catch(error) {
          const fallback=JSON.stringify({protocol:"poe2-trade-copilot/debug-fallback-v1",version:PATCH_VERSION,url:location.href,error:String(error?.message||error),preflight:null,lastDebug:window.__POE2TC_LAST_DEBUG||null});
          box.value=fallback;
          box.dispatchEvent(new Event("input",{bubbles:true}));
          box.focus(); box.select?.();
          status("COPY DEBUG failed — fallback debug placed in the text box.");
          return;
        }
      };
      debugButton.dataset.preflightDebug="1";
    }

    button.dataset.runWrapper = PATCH_VERSION;
    console.log(`[PoE2TC Run Wrapper] ${PATCH_VERSION} installed`);
  }

  install();
  setInterval(() => {
    const button = document.querySelector("#ptc-run");
    if (button && button.dataset.runWrapper !== PATCH_VERSION) install();
  }, 1500);
})();
