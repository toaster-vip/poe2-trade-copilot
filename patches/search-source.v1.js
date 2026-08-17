(() => {
  "use strict";

  const PATCH_VERSION = "search-source-1.5";
  const API_SOURCE = "https://api.github.com/repos/toaster-vip/poe2-trade-copilot/contents/data/latest-search.json?ref=main";
  const RAW_FALLBACK = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/data/latest-search.json";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = s => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  function status(text) {
    const el = $("#ptc-status");
    if (el) el.textContent = text;
    console.log("[PoE2TC Search Source]", text);
  }

  function decodeBase64Utf8(base64) {
    const clean = String(base64 || "").replace(/\s+/g, "");
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function fetchLatestSearch() {
    try {
      const response = await fetch(`${API_SOURCE}&t=${Date.now()}`, {
        cache: "no-store", credentials: "omit", headers: {"Accept":"application/vnd.github+json"}
      });
      if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.content) throw new Error("GitHub API response missing content");
      return {text:decodeBase64Utf8(payload.content),sha:payload.sha||null,source:"api"};
    } catch (apiError) {
      console.warn("[PoE2TC Search Source] API load failed; trying raw fallback", apiError);
      const response = await fetch(`${RAW_FALLBACK}?t=${Date.now()}`, {cache:"no-store",credentials:"omit"});
      if (!response.ok) throw new Error(`GitHub raw HTTP ${response.status}`);
      return {text:await response.text(),sha:null,source:"raw-fallback"};
    }
  }

  async function loadFromGitHub() {
    const box = $("#ptc-box");
    if (!box) throw new Error("search box not found");
    status("Loading current main search packet...");
    const loaded = await fetchLatestSearch();
    const parsed = JSON.parse(loaded.text);
    if (!parsed || typeof parsed !== "object") throw new Error("invalid search packet");
    box.value = JSON.stringify(parsed,null,2);
    box.dispatchEvent(new Event("input",{bubbles:true}));
    box.dispatchEvent(new Event("change",{bubbles:true}));
    try { localStorage.setItem("ptc-packet-v51",box.value); } catch {}
    const firstStat = parsed?.stats?.[0]?.text || "no stats";
    status(`Loaded current main${loaded.sha?` · ${loaded.sha.slice(0,7)}`:""} · ${firstStat}`);
    return parsed;
  }

  function visible(el) {
    if (!el) return false;
    const s=getComputedStyle(el);
    return el.offsetParent!==null && s.display!=="none" && s.visibility!=="hidden";
  }

  function nativeValue(el,value) {
    const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
    el.focus();
    if(setter) setter.call(el,String(value)); else el.value=String(value);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }

  function tokens(text) {
    const ignore=new Set(["the","of","to","and","or","local","increased","increase"]);
    return norm(text).replace(/[#%+]/g," ").split(" ").filter(x=>x.length>2&&!ignore.has(x));
  }
  function score(text,wanted) {
    const body=norm(text);
    return tokens(wanted).reduce((n,t)=>n+(body.includes(t)?1:0),0);
  }
  function labelOf(value) {
    if(value==null) return "";
    if(typeof value==="string"||typeof value==="number") return String(value);
    return String(value.label??value.name??value.text??value.value??value.id??"");
  }
  function vueInstanceFor(root) { return root ? (root.__vue__ || root.__vueParentComponent || null) : null; }
  function vueOptions(vm) {
    if(!vm) return [];
    const candidates=[vm.options,vm.filteredOptions,vm.optionKeys,vm.$options?.propsData?.options,vm.$parent?.options,vm.$props?.options];
    for(const x of candidates) if(Array.isArray(x)&&x.length) return x;
    return [];
  }
  function bestOption(options,wanted,getText=labelOf) {
    let best=null,bestScore=0;
    for(const option of options){
      const s=score(getText(option),wanted);
      if(s>bestScore){best=option;bestScore=s;}
    }
    const required=Math.min(2,Math.max(1,tokens(wanted).length));
    return bestScore>=required?{option:best,score:bestScore}:null;
  }

  function statSection() {
    const add=$("input[placeholder='+ Add Stat Filter']") || $("input[placeholder*='Add Stat Filter']");
    if(!add) return null;
    return add.closest(".filter-group") || add.closest(".filter-group-body") || add.parentElement?.parentElement?.parentElement || document;
  }
  function allRows() {
    const section=statSection() || ($(".search-advanced-pane")||document);
    return $$(".filter",section);
  }
  function minMax(row) {
    const inputs=$$('input',row).filter(x=>x!==$("input[placeholder='+ Add Stat Filter']",row));
    return {
      min:inputs.find(x=>norm(x.placeholder)==="min")||null,
      max:inputs.find(x=>norm(x.placeholder)==="max")||null
    };
  }
  function statRows() {
    return allRows().filter(row=>{
      const mm=minMax(row);
      return !!(mm.min||mm.max);
    });
  }
  function bestMatchingRow(text,rows=statRows()) {
    let best=null,bestScore=0;
    for(const row of rows){
      const s=score(row.innerText||row.textContent||"",text);
      if(s>bestScore){best=row;bestScore=s;}
    }
    const required=Math.min(2,Math.max(1,tokens(text).length));
    return bestScore>=required?best:null;
  }
  async function waitForStatRow(before,spec) {
    for(let i=0;i<40;i++){
      await sleep(100);
      const rows=statRows();
      const added=rows.filter(r=>!before.has(r));
      const matched=bestMatchingRow(spec.text,added);
      if(matched) return matched;
      if(added.length===1) return added[0];
      const any=bestMatchingRow(spec.text,rows);
      if(any) return any;
    }
    return null;
  }

  async function commitStatSelection(input,spec) {
    const root=input.closest(".multiselect") || input.parentElement?.closest(".multiselect");
    let vm=vueInstanceFor(root);

    input.click(); input.focus();
    await sleep(120);
    nativeValue(input,spec.text);
    await sleep(500);

    // Prefer Vue's own select() just like the known-good Item Category/Rarity path.
    vm=vueInstanceFor(root) || vm;
    if(vm){
      let options=vueOptions(vm);
      if(!options.length){ await sleep(350); options=vueOptions(vm); }
      const picked=bestOption(options,spec.text,labelOf);
      if(picked){
        try {
          if(typeof vm.select==="function") vm.select(picked.option);
          else if(typeof vm.$emit==="function"){
            vm.$emit("input",picked.option);
            vm.$emit("update:modelValue",picked.option);
          }
          try { if(typeof vm.deactivate==="function") vm.deactivate(); } catch {}
          input.blur();
          return {ok:true,mode:"vue",option:labelOf(picked.option)};
        } catch(error) {
          console.warn("[PoE2TC Stat Bridge] Vue select failed",error);
        }
      }
    }

    // DOM fallback: click the actual option node, never the wrapper element.
    const domOptions=$$(".multiselect__option, [role='option']").filter(visible);
    const picked=bestOption(domOptions,spec.text,x=>String(x.innerText||x.textContent||"").trim());
    if(!picked) return {ok:false,reason:"stat_option_not_found",options:domOptions.slice(0,20).map(x=>(x.innerText||x.textContent||"").trim())};
    const option=picked.option;
    option.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerType:"touch"}));
    option.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window}));
    option.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,view:window}));
    option.click();
    input.blur();
    return {ok:true,mode:"dom",option:String(option.innerText||option.textContent||"").trim()};
  }

  async function addDynamicStat(spec) {
    let existing=bestMatchingRow(spec.text);
    if(existing){
      const mm=minMax(existing);
      if(spec.min!=null&&mm.min) nativeValue(mm.min,spec.min);
      if(spec.max!=null&&mm.max) nativeValue(mm.max,spec.max);
      return {ok:true,mode:"existing",rowText:(existing.innerText||existing.textContent||"").replace(/\s+/g," ").trim()};
    }

    const input=$("input[placeholder='+ Add Stat Filter']") || $("input[placeholder*='Add Stat Filter']");
    if(!input) return {ok:false,reason:"add_stat_input_not_found"};
    const before=new Set(statRows());
    const select=await commitStatSelection(input,spec);
    if(!select.ok) return select;

    const row=await waitForStatRow(before,spec);
    if(!row){
      return {ok:false,reason:"created_row_not_found",selection:select,sectionText:(statSection()?.innerText||"").replace(/\s+/g," ").trim().slice(0,1000)};
    }
    const mm=minMax(row);
    if(spec.min!=null){
      if(!mm.min) return {ok:false,reason:"created_min_not_found",selection:select,rowText:(row.innerText||row.textContent||"").trim()};
      nativeValue(mm.min,spec.min);
    }
    if(spec.max!=null){
      if(!mm.max) return {ok:false,reason:"created_max_not_found",selection:select,rowText:(row.innerText||row.textContent||"").trim()};
      nativeValue(mm.max,spec.max);
    }
    return {ok:true,mode:`created-${select.mode}`,option:select.option,rowText:(row.innerText||row.textContent||"").replace(/\s+/g," ").trim()};
  }

  function propertyRows(){
    const pane=$(".search-advanced-pane")||document;
    return $$(".filter.filter-property",pane).filter(visible);
  }
  function selectedValue(label){
    const wanted=norm(label);
    const row=propertyRows().find(r=>norm(r.innerText||r.textContent||"").startsWith(wanted));
    const root=row?.querySelector(".multiselect")||row?.querySelector("[role='combobox']");
    const vm=vueInstanceFor(root);
    const vals=vm?[vm.internalValue,vm.value,vm.modelValue,vm.selected,vm.currentValue,vm.$props?.value]:[];
    let v=null;
    for(const x of vals){if(x!=null){v=Array.isArray(x)?x[0]:x;if(v!=null)break;}}
    return labelOf(v);
  }
  function findPropertyRow(label){
    const wanted=norm(label);
    return propertyRows().find(r=>{const text=norm(r.innerText||r.textContent||"");return text===wanted||text.startsWith(wanted+" ")||text.includes(wanted);})||null;
  }
  function propertyMinMax(row){
    const inputs=$$('input',row).filter(visible);
    return {min:inputs.find(x=>norm(x.placeholder)==="min")||null,max:inputs.find(x=>norm(x.placeholder)==="max")||null};
  }
  function propertyValueMatches(spec){
    const row=findPropertyRow(spec.label); if(!row) return false;
    const mm=propertyMinMax(row);
    if(spec.min!=null&&String(mm.min?.value??"")!==String(spec.min)) return false;
    if(spec.max!=null&&String(mm.max?.value??"")!==String(spec.max)) return false;
    return true;
  }
  async function waitForCorePreparation(packet){
    const selects=Array.isArray(packet.selects)?packet.selects:[];
    const fields=Array.isArray(packet.fields)?packet.fields:[];
    for(let i=0;i<80;i++){
      const selectsOk=selects.every(s=>norm(selectedValue(s.label))===norm(s.value));
      const fieldsOk=fields.every(propertyValueMatches);
      if(selectsOk&&fieldsOk) return true;
      await sleep(120);
    }
    return false;
  }

  function installStatBridge(runButton,box){
    if(runButton.dataset.statBridge===PATCH_VERSION) return;
    runButton.dataset.statBridge=PATCH_VERSION;
    let bypass=false;
    runButton.addEventListener("click",event=>{
      if(bypass) return;
      let packet; try{packet=JSON.parse(box.value);}catch{return;}
      const stats=Array.isArray(packet.stats)?packet.stats:[];
      if(!stats.length) return;
      event.preventDefault(); event.stopImmediatePropagation();

      (async()=>{
        const originalText=box.value;
        const delegated={...packet,stats:[],search:false};
        box.value=JSON.stringify(delegated,null,2);
        box.dispatchEvent(new Event("input",{bubbles:true}));
        box.dispatchEvent(new Event("change",{bubbles:true}));
        status("Preparing base filters...");
        bypass=true; runButton.click(); bypass=false;
        const prepared=await waitForCorePreparation(packet);
        if(!prepared){
          box.value=originalText; box.dispatchEvent(new Event("input",{bubbles:true}));
          status("Dynamic stat bridge aborted: base filters did not finish."); return;
        }
        box.value=originalText;
        box.dispatchEvent(new Event("input",{bubbles:true}));
        box.dispatchEvent(new Event("change",{bubbles:true}));
        await sleep(250);

        const audit=[];
        for(const spec of stats){
          status(`Adding stat: ${spec.text}...`);
          const result=await addDynamicStat(spec);
          audit.push({spec,result});
          window.__POE2TC_STAT_BRIDGE_DEBUG={ok:result.ok,version:PATCH_VERSION,packet,audit};
          if(!result.ok){status(`Dynamic stat failed: ${spec.text} · ${result.reason}.`);return;}
        }
        window.__POE2TC_STAT_BRIDGE_DEBUG={ok:true,version:PATCH_VERSION,packet,audit};
        const search=$("button.search-btn");
        if(!search){status("Dynamic stats ready, but Search button was not found.");return;}
        status("Dynamic stats verified. Searching..."); search.click();
      })().catch(error=>{
        bypass=false;
        console.error("[PoE2TC Stat Bridge]",error);
        window.__POE2TC_STAT_BRIDGE_DEBUG={ok:false,version:PATCH_VERSION,error:String(error),packet};
        status(`Dynamic stat bridge failed: ${error.message}`);
      });
    },true);
  }

  function install(){
    const box=$("#ptc-box"),runButton=$("#ptc-run");
    if(!box||!runButton){setTimeout(install,300);return;}
    if(!$("#ptc-load-github")){
      const button=document.createElement("button");
      button.id="ptc-load-github"; button.type="button"; button.textContent="LOAD FROM GITHUB";
      button.setAttribute("style",runButton.getAttribute("style")||"");
      button.style.cssText += ";padding:9px;background:#26313e;color:#fff;border:1px solid #526071;border-radius:7px;font-weight:600;";
      const grid=runButton.parentElement;
      if(!grid){setTimeout(install,300);return;}
      grid.insertBefore(button,runButton);
      button.addEventListener("click",async()=>{try{await loadFromGitHub();}catch(error){console.error("[PoE2TC Search Source]",error);status(`GitHub search load failed: ${error.message}`);}});
    }
    installStatBridge(runButton,box);
    window.__POE2TC_LOAD_SEARCH_FROM_GITHUB=loadFromGitHub;
    console.log(`[PoE2TC Search Source] ${PATCH_VERSION} installed`);
  }
  install();
})();
