(() => {
  "use strict";

  const PATCH_VERSION = "search-source-1.21";
  const API_SOURCE = "https://api.github.com/repos/toaster-vip/poe2-trade-copilot/contents/data/latest-search.json?ref=main";
  const RAW_FALLBACK = "https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/data/latest-search.json";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => r ? [...r.querySelectorAll(s)] : [];
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
        cache: "no-store",
        credentials: "omit",
        headers: {"Accept":"application/vnd.github+json"}
      });
      if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.content) throw new Error("GitHub API response missing content");
      return {
        text:decodeBase64Utf8(payload.content),
        sha:payload.sha||null,
        commitSha:null,
        source:"api-main"
      };
    } catch (apiError) {
      console.warn("[PoE2TC Search Source] API load failed; trying raw fallback", apiError);
      const response = await fetch(`${RAW_FALLBACK}?t=${Date.now()}`, {
        cache:"no-store",
        credentials:"omit"
      });
      if (!response.ok) throw new Error(`GitHub raw HTTP ${response.status}`);
      return {text:await response.text(),sha:null,commitSha:null,source:"raw-fallback"};
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
    const filters = [
      ...(Array.isArray(parsed?.fields) ? parsed.fields : []).filter(x => x?.label !== "Buyout Price").map(x => x.label),
      ...(Array.isArray(parsed?.stats) ? parsed.stats : []).map(x => x.text)
    ].filter(Boolean);
    const summary = filters.length ? filters.join(" · ") : "no numeric/stat filters";
    const fieldSummary=(Array.isArray(parsed?.fields)?parsed.fields:[]).map(x=>{
      const range=[x.min!=null?`>=${x.min}`:"",x.max!=null?`<=${x.max}`:""].filter(Boolean).join(" ");
      return `${x.label} ${range}`.trim();
    }).join(" · ");
    window.__POE2TC_LAST_SEARCH_SOURCE={
      version:PATCH_VERSION,
      source:loaded.source,
      commitSha:loaded.commitSha||null,
      blobSha:loaded.sha||null,
      packet:parsed,
      loadedAt:new Date().toISOString()
    };
    status(`Loaded ${loaded.commitSha?`commit ${loaded.commitSha.slice(0,7)}`:"current main"}${loaded.sha?` · blob ${loaded.sha.slice(0,7)}`:""} · ${fieldSummary||summary}`);
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
  function requiredScore(wanted) {
    const body=norm(wanted);
    const ts=tokens(wanted);
    const typedAttackDamage = body.includes("damage") && body.includes("attacks") &&
      ["cold","physical","fire","lightning","chaos"].some(type=>body.includes(type));
    return typedAttackDamage ? Math.max(1,ts.length) : Math.min(2,Math.max(1,ts.length));
  }
  function labelOf(value) {
    if(value==null) return "";
    if(typeof value==="string"||typeof value==="number") return String(value);
    return String(value.label??value.name??value.text??value.value??value.id??"");
  }
  function optionIdOf(value) {
    if(value==null || typeof value!=="object") return null;
    return value.id ?? value.value?.id ?? value.option?.id ?? null;
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
    const required=requiredScore(wanted);
    return bestScore>=required?{option:best,score:bestScore}:null;
  }

  function statSection() {
    const add=$("input[placeholder='+ Add Stat Filter']") || $("input[placeholder*='Add Stat Filter']");
    if(add) return add.closest(".filter-group") || add.closest(".filter-group-body") || add.parentElement?.parentElement?.parentElement || document;

    const heading=$("body *").find(el=>visible(el) && /^STAT FILTERS$/i.test(String(el.textContent||"").replace(/\s+/g," ").trim()));
    if(!heading) return null;

    let node=heading.parentElement;
    for(let i=0;node&&node!==document.body&&i<6;i++,node=node.parentElement){
      const text=norm(node.innerText||node.textContent||"");
      if(text.includes("stat filters") && node.querySelector("input,button,.multiselect,[role='combobox']")) return node;
    }
    return heading.parentElement||null;
  }

  async function addStatInput(){
    let input=$("input[placeholder='+ Add Stat Filter']") || $("input[placeholder*='Add Stat Filter']");
    if(input&&visible(input)) return input;

    const section=statSection();
    if(!section) return null;

    const candidates=()=>$("input",section)
      .filter(el=>visible(el)&&!el.closest("#ptc"))
      .filter(el=>{
        const p=norm(el.placeholder);
        if(el.type==="number"||p==="min"||p==="max") return false;
        return p.includes("stat")||p.includes("search")||!!el.closest(".multiselect,[role='combobox']");
      });

    input=candidates()[0]||null;
    if(input) return input;

    const opener=$("button,[role='button'],div",section)
      .filter(visible)
      .find(el=>/ADD STAT FILTER/i.test(String(el.innerText||el.textContent||"").replace(/\s+/g," ").trim()));
    if(opener){
      try{opener.click();}catch{}
      await sleep(250);
      input=candidates()[0]||null;
      if(input) return input;
    }

    const selectRoot=$(".multiselect,[role='combobox']",section).filter(visible)[0]||null;
    if(selectRoot){
      try{selectRoot.click();}catch{}
      await sleep(200);
      input=$("input",selectRoot).filter(visible).find(el=>{
        const p=norm(el.placeholder);
        return el.type!=="number"&&p!=="min"&&p!=="max";
      })||null;
    }
    return input;
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
    const required=requiredScore(text);
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
          return {ok:true,mode:"vue",option:labelOf(picked.option),optionId:optionIdOf(picked.option),optionRaw:{id:picked.option?.id??null,value:picked.option?.value??null,text:picked.option?.text??null,label:picked.option?.label??null,name:picked.option?.name??null}};
        } catch(error) {
          console.warn("[PoE2TC Stat Bridge] Vue select failed",error);
        }
      }
    }

    const domOptions=$$(".multiselect__option, [role='option']").filter(visible);
    const picked=bestOption(domOptions,spec.text,x=>String(x.innerText||x.textContent||"").trim());
    if(!picked) return {ok:false,reason:"stat_option_not_found",options:domOptions.slice(0,20).map(x=>(x.innerText||x.textContent||"").trim())};
    const option=picked.option;
    option.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerType:"touch"}));
    option.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window}));
    option.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,view:window}));
    option.click();
    input.blur();
    return {ok:true,mode:"dom",option:String(option.innerText||option.textContent||"").trim(),optionId:option.getAttribute("data-id")||option.getAttribute("data-value")||null};
  }

  async function addDynamicStat(spec) {
    let existing=bestMatchingRow(spec.text);
    if(existing){
      const mm=minMax(existing);
      if(spec.min!=null&&mm.min) nativeValue(mm.min,spec.min);
      if(spec.max!=null&&mm.max) nativeValue(mm.max,spec.max);
      return {ok:true,mode:"existing",rowText:(existing.innerText||existing.textContent||"").replace(/\s+/g," ").trim()};
    }

    const input=await addStatInput();
    if(!input) return {
      ok:false,
      reason:"add_stat_input_not_found",
      sectionText:(statSection()?.innerText||"").replace(/\s+/g," ").trim().slice(0,1200)
    };
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
    return {ok:true,mode:`created-${select.mode}`,option:select.option,optionId:select.optionId??null,optionRaw:select.optionRaw??null,rowText:(row.innerText||row.textContent||"").replace(/\s+/g," ").trim()};
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
  async function waitForCorePreparation(packet,coreStats=[]){
    for(let i=0;i<100;i++){
      const preflight=window.__POE2TC_PREFLIGHT_DEBUG;
      const baseOk=preflight?.ok===true;
      const coreStatsOk=coreStats.every(s=>propertyValueMatches({label:s.text,min:s.min,max:s.max}));
      if(baseOk&&coreStatsOk) return true;
      await sleep(120);
    }
    return false;
  }


  const OFFICIAL_STATS_URL = "/api/trade2/data/stats";
  const DIRECT_API_VERSION = "direct-api-1.3";

  function directLeague(packet){
    const explicit=packet?.apiSearch?.league;
    if(explicit) return String(explicit);
    const parts=location.pathname.split("/").filter(Boolean);
    const poeIndex=parts.findIndex(x=>x==="poe2");
    if(poeIndex>=0 && parts[poeIndex+1]) {
      try { return decodeURIComponent(parts[poeIndex+1]); } catch { return parts[poeIndex+1]; }
    }
    return null;
  }

  async function officialStatIndex(){
    if(window.__POE2TC_OFFICIAL_STAT_INDEX) return window.__POE2TC_OFFICIAL_STAT_INDEX;
    const response=await fetch(OFFICIAL_STATS_URL,{
      cache:"no-store",
      credentials:"same-origin",
      headers:{"Accept":"application/json"}
    });
    if(!response.ok) throw new Error(`official stats HTTP ${response.status}`);
    const payload=await response.json();
    const index=new Map();
    for(const group of payload?.result||[]){
      for(const entry of group?.entries||[]){
        if(entry?.id) index.set(String(entry.id),entry);
      }
    }
    if(!index.size) throw new Error("official stats catalog was empty");
    window.__POE2TC_OFFICIAL_STAT_INDEX=index;
    return index;
  }

  function apiStatGroups(spec,index){
    const groups=Array.isArray(spec?.statGroups)?spec.statGroups:[];
    return groups.map((group,groupIndex)=>{
      const type=String(group?.type||"and");
      const allowed=new Set(["and","count","not","if","weight","weight2"]);
      if(!allowed.has(type)) throw new Error(`unsupported stat group type: ${type}`);
      const filters=(Array.isArray(group?.filters)?group.filters:[]).map((filter,filterIndex)=>{
        let id=String(filter?.id||"");
        let live=id?index.get(id):null;
        if(!id){
          const wanted=norm(filter?.text||"");
          if(!wanted) throw new Error(`statGroups[${groupIndex}].filters[${filterIndex}] missing id/text`);
          const matches=[...index.entries()].filter(([,entry])=>norm(entry?.text)===wanted);
          const explicit=matches.filter(([candidateId])=>String(candidateId).startsWith("explicit.stat_"));
          const chosen=explicit.length===1?explicit:(matches.length===1?matches:[]);
          if(chosen.length!==1){
            throw new Error(`official stat text did not resolve uniquely: ${filter.text} · explicit=${explicit.map(([candidateId])=>candidateId).join(",")} · matches=${matches.map(([candidateId])=>candidateId).join(",")}`);
          }
          id=String(chosen[0][0]);
          live=chosen[0][1];
        }
        if(!live) throw new Error(`official stat id no longer exists: ${id}`);
        if(filter?.text && norm(live.text)!==norm(filter.text)){
          throw new Error(`official stat text mismatch for ${id}: expected "${filter.text}", got "${live.text}"`);
        }
        const value={};
        if(filter?.min!=null) value.min=Number(filter.min);
        if(filter?.max!=null) value.max=Number(filter.max);
        if((type==="weight"||type==="weight2") && filter?.weight!=null) value.weight=Number(filter.weight);
        return {
          id,
          ...(Object.keys(value).length?{value}:{}),
          disabled:filter?.disabled===true
        };
      });
      const out={type,filters,disabled:group?.disabled===true};
      if(type==="count"||type==="weight"||type==="weight2"){
        const value={};
        if(group?.min!=null) value.min=Number(group.min);
        if(group?.max!=null) value.max=Number(group.max);
        out.value=value;
      }
      return out;
    });
  }

  function buildDirectQuery(spec,index){
    const filters={};
    if(spec?.category || spec?.rarity){
      filters.type_filters={filters:{}};
      if(spec.category) filters.type_filters.filters.category={option:String(spec.category)};
      if(spec.rarity) filters.type_filters.filters.rarity={option:String(spec.rarity)};
    }
    if(spec?.price){
      const price={};
      if(spec.price.option) price.option=String(spec.price.option);
      if(spec.price.min!=null) price.min=Number(spec.price.min);
      if(spec.price.max!=null) price.max=Number(spec.price.max);
      filters.trade_filters={filters:{price}};
    }
    return {
      status:{option:String(spec?.status||"securable")},
      ...(spec?.name?{name:String(spec.name)}:{}),
      ...(spec?.type?{type:String(spec.type)}:{}),
      stats:apiStatGroups(spec,index),
      filters
    };
  }

  async function runDirectApiPacket(packet){
    const spec=packet?.apiSearch;
    const league=directLeague(packet);
    if(!league) throw new Error("league could not be resolved");
    status("Direct API: validating exact stat IDs against official catalog...");
    const index=await officialStatIndex();
    const query=buildDirectQuery(spec,index);
    const requestBody={query,sort:{price:"asc"}};
    const debug={
      ok:false,
      version:DIRECT_API_VERSION,
      league,
      catalogSize:index.size,
      packet,
      requestBody,
      startedAt:new Date().toISOString()
    };
    window.__POE2TC_DIRECT_API_DEBUG=debug;

    if(packet.search===false){
      debug.ok=true;
      debug.validationOnly=true;
      status(`PASS: ${query.stats.reduce((n,g)=>n+g.filters.length,0)} exact official stats verified. Search NOT submitted.`);
      return debug;
    }

    status("Direct API: submitting verified Count/AND search...");
    const response=await fetch(`/api/trade2/search/poe2/${encodeURIComponent(league)}`,{
      method:"POST",
      credentials:"same-origin",
      headers:{
        "Accept":"application/json",
        "Content-Type":"application/json"
      },
      body:JSON.stringify(requestBody)
    });
    const responseText=await response.text();
    let result=null;
    try { result=JSON.parse(responseText); } catch {}
    debug.httpStatus=response.status;
    debug.response=result||responseText.slice(0,1200);
    if(!response.ok) throw new Error(`trade search HTTP ${response.status}`);
    if(!result?.id) throw new Error("trade search response missing id");
    debug.ok=true;
    debug.searchId=result.id;
    debug.total=result.total??null;
    debug.resultCount=Array.isArray(result.result)?result.result.length:null;
    status(`PASS: direct search submitted${result.total!=null?` · ${result.total} matches`:""}. Opening results...`);
    await sleep(250);
    location.assign(`/trade2/search/poe2/${encodeURIComponent(league)}/${encodeURIComponent(result.id)}`);
    return debug;
  }

  function installDirectApiBridge(runButton,box){
    if(runButton.dataset.directApiBridge===DIRECT_API_VERSION) return;
    runButton.dataset.directApiBridge=DIRECT_API_VERSION;
    runButton.addEventListener("click",event=>{
      let packet; try{packet=JSON.parse(box.value);}catch{return;}
      if(!packet?.apiSearch) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      (async()=>{
        try{
          await runDirectApiPacket(packet);
        }catch(error){
          console.error("[PoE2TC Direct API]",error);
          const prev=window.__POE2TC_DIRECT_API_DEBUG||{};
          window.__POE2TC_DIRECT_API_DEBUG={...prev,ok:false,version:DIRECT_API_VERSION,error:String(error?.message||error),packet};
          status(`Direct API search aborted: ${error?.message||error}. COPY DEBUG.`);
        }
      })();
    },true);
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

      const coreStats=stats.filter(spec=>!!findPropertyRow(spec.text));
      const dynamicStats=stats.filter(spec=>!findPropertyRow(spec.text));
      if(!dynamicStats.length) return;

      event.preventDefault(); event.stopImmediatePropagation();

      (async()=>{
        const originalText=box.value;
        const delegated={...packet,stats:coreStats,search:false};
        box.value=JSON.stringify(delegated,null,2);
        box.dispatchEvent(new Event("input",{bubbles:true}));
        box.dispatchEvent(new Event("change",{bubbles:true}));
        status("Preparing base filters and numeric properties...");
        window.__POE2TC_PREFLIGHT_DEBUG=null;
        bypass=true; runButton.click(); bypass=false;
        const prepared=await waitForCorePreparation(packet,coreStats);
        if(!prepared){
          box.value=originalText; box.dispatchEvent(new Event("input",{bubbles:true}));
          status("Dynamic stat bridge aborted: base/numeric filters did not finish."); return;
        }
        box.value=originalText;
        box.dispatchEvent(new Event("input",{bubbles:true}));
        box.dispatchEvent(new Event("change",{bubbles:true}));
        await sleep(250);

        const audit=[];
        for(const spec of dynamicStats){
          status(`Adding stat: ${spec.text}...`);
          const result=await addDynamicStat(spec);
          audit.push({spec,result});
          window.__POE2TC_STAT_BRIDGE_DEBUG={ok:result.ok,version:PATCH_VERSION,packet,coreStats,dynamicStats,audit};
          if(!result.ok){status(`Dynamic stat failed: ${spec.text} · ${result.reason}.`);return;}
        }
        window.__POE2TC_STAT_BRIDGE_DEBUG={ok:true,version:PATCH_VERSION,packet,coreStats,dynamicStats,audit};
        const search=$("button.search-btn");
        if(!search){status("Dynamic stats ready, but Search button was not found.");return;}
        status("Numeric and dynamic stats verified. Searching..."); search.click();
      })().catch(error=>{
        bypass=false;
        console.error("[PoE2TC Stat Bridge]",error);
        window.__POE2TC_STAT_BRIDGE_DEBUG={ok:false,version:PATCH_VERSION,error:String(error),packet};
        status(`Dynamic stat bridge failed: ${error.message}`);
      });
    },true);
  }

  function ensureMinimizeButton(){
    const panel=$("#ptc");
    if(!panel) return false;
    if($("#ptc-minimize")) return true;

    const button=document.createElement("button");
    button.id="ptc-minimize";
    button.type="button";
    button.textContent="−";
    button.setAttribute("aria-label","Minimize PoE2 Trade Copilot");
    button.title="Minimize PoE2 Trade Copilot";

    Object.assign(button.style,{
      position:"absolute",
      top:"6px",
      right:"7px",
      width:"32px",
      height:"32px",
      padding:"0",
      margin:"0",
      border:"1px solid #526071",
      borderRadius:"8px",
      background:"#26313e",
      color:"#fff",
      fontSize:"22px",
      fontWeight:"700",
      lineHeight:"28px",
      zIndex:"2147483647",
      cursor:"pointer",
      touchAction:"manipulation"
    });

    if(getComputedStyle(panel).position==="static") panel.style.position="fixed";

    const original={
      width:panel.style.width||"",
      minWidth:panel.style.minWidth||"",
      height:panel.style.height||"",
      minHeight:panel.style.minHeight||"",
      padding:panel.style.padding||"",
      overflow:panel.style.overflow||""
    };

    let minimized=false;
    try{ minimized=localStorage.getItem("poe2tc-panel-minimized")==="1"; }catch{}

    const apply=()=>{
      for(const child of [...panel.children]){
        if(child===button) continue;
        child.style.display=minimized?"none":"";
      }

      if(minimized){
        panel.style.width="46px";
        panel.style.minWidth="46px";
        panel.style.height="46px";
        panel.style.minHeight="46px";
        panel.style.padding="0";
        panel.style.overflow="hidden";
        button.textContent="+";
        button.title="Restore PoE2 Trade Copilot";
        button.setAttribute("aria-label","Restore PoE2 Trade Copilot");
      }else{
        panel.style.width=original.width;
        panel.style.minWidth=original.minWidth;
        panel.style.height=original.height;
        panel.style.minHeight=original.minHeight;
        panel.style.padding=original.padding;
        panel.style.overflow=original.overflow;
        button.textContent="−";
        button.title="Minimize PoE2 Trade Copilot";
        button.setAttribute("aria-label","Minimize PoE2 Trade Copilot");
      }

      try{localStorage.setItem("poe2tc-panel-minimized",minimized?"1":"0");}catch{}
    };

    button.addEventListener("click",event=>{
      event.preventDefault();
      event.stopPropagation();
      minimized=!minimized;
      apply();
    });

    panel.appendChild(button);
    apply();
    window.__POE2TC_PANEL_MINIMIZE={version:"embedded-1.0",installed:true};
    return true;
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
    ensureMinimizeButton();
    installDirectApiBridge(runButton,box);
    installStatBridge(runButton,box);
    window.__POE2TC_LOAD_SEARCH_FROM_GITHUB=loadFromGitHub;
    window.__POE2TC_RUN_DIRECT_API_PACKET=runDirectApiPacket;
    console.log(`[PoE2TC Search Source] ${PATCH_VERSION} installed`);
  }
  install();
})();
