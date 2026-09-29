(() => {
  "use strict";
  const VERSION = "stat-discovery-1.1";
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
  const norm = s => String(s||"").replace(/\s+/g," ").trim();
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  function status(msg){ const el=$("#ptc-status"); if(el) el.textContent=msg; }
  function visible(el){ const r=el?.getBoundingClientRect?.(); return !!r && r.width>0 && r.height>0; }
  function statSection(){
    return $$("body *").find(el=>visible(el) && /^STAT FILTERS$/i.test(norm(el.textContent)))?.parentElement || null;
  }
  function addStatButton(){
    const section=statSection();
    if(!section) return null;
    return $$("button,div").find(el=>visible(el) && /ADD STAT FILTER/i.test(norm(el.textContent)) && section.contains(el)) || null;
  }
  function activeSearchInput(){
    return $$("input").find(el=>visible(el) && /search/i.test(String(el.placeholder||""))) ||
           $$("input").find(el=>visible(el) && el.closest?.(".multiselect,.search-select,.filter-select"));
  }
  function labelOf(v){
    if(v==null) return "";
    if(typeof v==="string"||typeof v==="number") return String(v);
    return String(v.label??v.name??v.text??v.value??v.id??"");
  }
  function slim(v){
    if(v==null || typeof v!=="object") return v;
    const out={};
    for(const key of ["id","text","label","name","type","group","option","value"]){
      const val=v[key];
      if(val==null) continue;
      if(typeof val==="object"){
        try{
          out[key]=JSON.parse(JSON.stringify(val,(k,x)=>{
            if(typeof x==="function") return undefined;
            return x;
          }));
        }catch{}
      }else out[key]=val;
    }
    return out;
  }
  function vueOptions(root){
    const vm=root?.__vue__||root?.__vueParentComponent||null;
    if(!vm) return [];
    for(const x of [vm.options,vm.filteredOptions,vm.optionKeys,vm.$options?.propsData?.options,vm.$parent?.options,vm.$props?.options]){
      if(Array.isArray(x)&&x.length) return x;
    }
    return [];
  }
  function optionDetails(){
    const out=[];
    const seen=new Set();

    for(const root of $(".multiselect,[role='combobox']")){
      if(!visible(root)) continue;
      for(const opt of vueOptions(root)){
        const label=labelOf(opt);
        if(!label) continue;
        const key=JSON.stringify([label,opt?.id,opt?.value?.id,opt?.value]);
        if(seen.has(key)) continue;
        seen.add(key);
        out.push({
          source:"vue",
          label,
          id:opt?.id??opt?.value?.id??null,
          raw:slim(opt)
        });
      }
    }

    for(const el of $("li,[role=option],.multiselect__option,.search-select-option,.filter-select-option")){
      if(!visible(el)) continue;
      const label=norm(el.textContent);
      if(!label) continue;
      const key="dom:"+label;
      if(seen.has(key)) continue;
      seen.add(key);
      out.push({
        source:"dom",
        label,
        dataId:el.getAttribute("data-id"),
        dataValue:el.getAttribute("data-value")
      });
    }
    return out.slice(0,100);
  }
  async function discover(query){
    const btn=addStatButton();
    if(!btn) return {ok:false,reason:"add_stat_filter_not_found",query};
    btn.click(); await sleep(250);
    const input=activeSearchInput();
    if(!input) return {ok:false,reason:"stat_search_input_not_found",query};
    input.focus();
    input.value=query;
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
    await sleep(500);
    const options=optionDetails();
    return {ok:true,query,options};
  }
  async function run(){
    const query=prompt("Stat discovery keyword:", "maximum Mana on Kill");
    if(!query) return;
    status(`Discovering stat: ${query}…`);
    const result=await discover(query);
    window.__POE2TC_STAT_DISCOVERY=result;
    const packet={protocol:"poe2-trade-copilot/stat-discovery-v1",version:VERSION,url:location.href,result};
    try{ await navigator.clipboard.writeText(JSON.stringify(packet,null,2)); status(result.ok?`Discovery copied: ${result.options.length} candidate(s).`:`Discovery failed: ${result.reason}.`); }
    catch{ status(`Discovery ready. Run COPY DEBUG if clipboard is blocked.`); }
    console.log("[PoE2TC Stat Discovery]",packet);
  }
  function install(){
    const panel=$("#ptc"); if(!panel) return setTimeout(install,250);
    if($("#ptc-stat-discovery")) return;
    const b=document.createElement("button"); b.id="ptc-stat-discovery"; b.type="button"; b.textContent="DISCOVER STAT"; b.title="Inspect official Stat Filter candidates without running a trade search";
    b.addEventListener("click",run); panel.appendChild(b);
    console.log(`[PoE2TC Stat Discovery] ${VERSION} installed.`);
  }
  install();
})();
