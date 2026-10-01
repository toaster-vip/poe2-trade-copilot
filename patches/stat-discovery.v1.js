(() => {
  "use strict";
  const VERSION = "stat-discovery-1.4";
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
  const norm = s => String(s||"").replace(/\s+/g," ").trim();
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  function status(msg){ const el=$("#ptc-status"); if(el) el.textContent=msg; }
  function visible(el){ const r=el?.getBoundingClientRect?.(); return !!r && r.width>0 && r.height>0; }
  function addStatInput(){
    return $("input").find(el =>
      visible(el) &&
      /add stat filter/i.test(String(el.placeholder || ""))
    ) || null;
  }
  function statSection(){
    const direct=addStatInput();
    if(direct){
      return direct.closest(".filter-group") ||
             direct.closest(".filter-group-body") ||
             direct.parentElement?.parentElement?.parentElement ||
             direct.parentElement ||
             null;
    }
    const heading=$("body *").find(el=>visible(el) && /^STAT FILTERS$/i.test(norm(el.textContent)));
    if(!heading) return null;
    let node=heading.parentElement;
    for(let i=0;node&&node!==document.body&&i<8;i++,node=node.parentElement){
      const text=norm(node.innerText||node.textContent||"");
      if(text.includes("STAT FILTERS") && text.includes("ADD STAT FILTER")) return node;
    }
    return heading.parentElement||null;
  }
  function addStatControl(){
    const direct=addStatInput();
    if(direct) return direct;
    const section=statSection() || document;
    return $("input,button,[role='button'],div,span").find(el =>
      visible(el) &&
      !el.closest("#ptc") &&
      /ADD STAT FILTER/i.test(norm(el.placeholder || el.innerText || el.textContent || "")) &&
      section.contains(el)
    ) || null;
  }
  function activeSearchInput(){
    const direct=addStatInput();
    if(direct) return direct;
    const active=document.activeElement;
    if(active && active.tagName==="INPUT" && visible(active) && !active.closest("#ptc")) return active;
    return $("input").find(el=>visible(el) && !el.closest("#ptc") && /search|stat/i.test(String(el.placeholder||""))) ||
           $("input").find(el=>visible(el) && !el.closest("#ptc") && el.closest?.(".multiselect,.search-select,.filter-select"));
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
  function setInputValue(input,value){
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    input.focus();
    if(setter) setter.call(input,String(value)); else input.value=String(value);
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
    input.dispatchEvent(new KeyboardEvent("keyup",{bubbles:true,key:"g"}));
  }
  async function discover(query){
    const control=addStatControl();
    if(!control) return {ok:false,reason:"add_stat_filter_not_found",query};
    try{ control.click(); }catch{}
    await sleep(250);
    const input=activeSearchInput();
    if(!input) return {ok:false,reason:"stat_search_input_not_found",query};
    setInputValue(input,query);
    await sleep(700);
    const options=optionDetails();
    return {
      ok:true,
      query,
      inputPlaceholder:String(input.placeholder||""),
      options
    };
  }
  async function copyText(text){
    try{ await navigator.clipboard.writeText(text); return true; }catch{}
    try{
      const ta=document.createElement("textarea");
      ta.value=text;
      Object.assign(ta.style,{position:"fixed",left:"-9999px",top:"-9999px"});
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok=document.execCommand("copy");
      ta.remove();
      return !!ok;
    }catch{return false;}
  }

  async function emitDiscovery(query){
    if(!query) return {ok:false,reason:"empty_query"};
    status(`Discovering stat: ${query}…`);
    const result=await discover(query);
    const packet={protocol:"poe2-trade-copilot/stat-discovery-v1",version:VERSION,url:location.href,result};
    window.__POE2TC_STAT_DISCOVERY=result;
    window.__POE2TC_STAT_DISCOVERY_PACKET=packet;
    const json=JSON.stringify(packet,null,2);
    const copied=await copyText(json);
    if(copied){
      status(result.ok?`Discovery copied: ${result.options.length} candidate(s).`:`Discovery failed: ${result.reason}.`);
    }else{
      const box=$("#ptc-box");
      if(box){
        box.value=json;
        box.dispatchEvent(new Event("input",{bubbles:true}));
        box.dispatchEvent(new Event("change",{bubbles:true}));
        status("Discovery JSON placed in the search box. Long-press and copy it.");
      }else{
        status("Discovery ready; clipboard blocked. See console for JSON.");
      }
    }
    console.log("[PoE2TC Stat Discovery]",packet);
    return packet;
  }

  window.__POE2TC_DISCOVER_STAT_FROM_PACKET = emitDiscovery;

  async function run(){
    const query=prompt("Stat discovery keyword:", "maximum Mana on Kill");
    if(!query) return;
    await emitDiscovery(query);
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
