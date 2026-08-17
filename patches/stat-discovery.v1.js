(() => {
  "use strict";
  const VERSION = "stat-discovery-1.0";
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
  function optionTexts(){
    const out=[];
    for(const el of $$("li,[role=option],.multiselect__option,.search-select-option,.filter-select-option")){
      if(!visible(el)) continue;
      const t=norm(el.textContent);
      if(t && !out.includes(t)) out.push(t);
    }
    return out.slice(0,50);
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
    const options=optionTexts();
    return {ok:true,query,options};
  }
  async function run(){
    const query=prompt("Stat discovery keyword (example: strength, mana, attack speed):", "strength");
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
