// ==UserScript==
// @name         PoE2 Trade Copilot
// @namespace    chatgpt-poe2-trade
// @version      0.5.1
// @description  Universal PoE2 Trade verified search executor + result exporter
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        none
// ==/UserScript==

(() => {
"use strict";

const VERSION = "0.5.1";
const $  = (s,r=document) => r.querySelector(s);
const $$ = (s,r=document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const norm = s => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const DEBUG = [];

function visible(el){
  if(!el) return false;
  const style = getComputedStyle(el);
  return el.offsetParent !== null && style.display !== "none" && style.visibility !== "hidden";
}

function status(text){
  const el = $("#ptc-status");
  if(el) el.textContent = text;
  console.log("[PoE2TC]", text);
}

function dbg(step, data = {}){
  const entry = {time:new Date().toISOString(), step, ...data};
  DEBUG.push(entry);
  console.log("[PoE2TC DEBUG]", entry);
  return entry;
}

function nativeValue(el, value){
  if(!el) return false;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto,"value")?.set;
  el.focus();
  if(setter) setter.call(el,String(value)); else el.value = String(value);
  el.dispatchEvent(new Event("input",{bubbles:true}));
  el.dispatchEvent(new Event("change",{bubbles:true}));
  return true;
}

async function copyText(text){
  try{ await navigator.clipboard.writeText(text); return true; }catch{}
  const ta = document.createElement("textarea");
  ta.value = text;
  Object.assign(ta.style,{position:"fixed",left:"-9999px",top:"-9999px"});
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}

function advancedPane(){ return $(".search-advanced-pane") || document; }
function propertyRows(){ return $$(".filter.filter-property",advancedPane()).filter(visible); }
function rowText(row){ return norm(row?.innerText || row?.textContent || ""); }

function findPropertyRow(label){
  const wanted = norm(label);
  const rows = propertyRows();
  let row = rows.find(r => { const text=rowText(r); return text===wanted || text.startsWith(wanted+" "); });
  if(row) return row;
  return rows.find(r => rowText(r).includes(wanted)) || null;
}

function numberInputs(row){ return $$(`input[type='number']`,row).filter(visible); }
function minMaxInputs(row){
  const inputs = numberInputs(row);
  return {
    min: inputs.find(x=>norm(x.placeholder)==="min") || inputs[0] || null,
    max: inputs.find(x=>norm(x.placeholder)==="max") || inputs[1] || null
  };
}

function setNumericProperty(spec){
  const row = findPropertyRow(spec.label);
  if(!row) return dbg("numeric-field-failed",{ok:false,label:spec.label,reason:"row_not_found"});
  const {min,max}=minMaxInputs(row);
  if(spec.min != null){
    if(!min) return dbg("numeric-field-failed",{ok:false,label:spec.label,reason:"min_not_found"});
    nativeValue(min,spec.min);
  }
  if(spec.max != null){
    if(!max) return dbg("numeric-field-failed",{ok:false,label:spec.label,reason:"max_not_found"});
    nativeValue(max,spec.max);
  }
  return dbg("numeric-field-set",{ok:true,label:spec.label,min:spec.min??null,max:spec.max??null});
}

function verifyNumericProperty(spec){
  const row = findPropertyRow(spec.label);
  if(!row) return dbg("numeric-verify-failed",{ok:false,label:spec.label,reason:"row_not_found"});
  const mm=minMaxInputs(row);
  if(spec.min != null){
    const got=String(mm.min?.value??"");
    if(got!==String(spec.min)) return dbg("numeric-verify-failed",{ok:false,label:spec.label,reason:"wrong_min",wanted:String(spec.min),got});
  }
  if(spec.max != null){
    const got=String(mm.max?.value??"");
    if(got!==String(spec.max)) return dbg("numeric-verify-failed",{ok:false,label:spec.label,reason:"wrong_max",wanted:String(spec.max),got});
  }
  return dbg("numeric-verified",{ok:true,label:spec.label});
}

function multiselectRoot(row){ return $(".multiselect",row) || $("[role='combobox']",row); }
function multiselectInput(row){ return $("input.multiselect__input",row) || $("input",multiselectRoot(row)); }
function vueInstance(row){
  const root=multiselectRoot(row);
  return root ? (root.__vue__ || root.__vueParentComponent || null) : null;
}
function vueOptionLabel(value){
  if(value==null) return "";
  if(typeof value==="string" || typeof value==="number") return String(value);
  return String(value.label ?? value.name ?? value.text ?? value.value ?? value.id ?? "");
}
function vueCandidateOptions(vm){
  if(!vm) return [];
  const candidates=[vm.options,vm.filteredOptions,vm.optionKeys,vm.$options?.propsData?.options,vm.$parent?.options,vm.$props?.options];
  for(const value of candidates) if(Array.isArray(value)&&value.length) return value;
  return [];
}
function vueSelectedValue(vm){
  if(!vm) return null;
  const values=[vm.internalValue,vm.value,vm.modelValue,vm.selected,vm.currentValue,vm.$props?.value];
  for(const value of values){
    if(value==null) continue;
    if(Array.isArray(value)){ if(value.length) return value[0]; }
    else return value;
  }
  return null;
}
function exactLabelMatch(a,b){ return norm(a)===norm(b); }
function findExactVueOption(options,wanted){ return options.find(option=>exactLabelMatch(vueOptionLabel(option),wanted)) || null; }
function visibleOptions(){ return $$(".multiselect__option, .multiselect__element, [role='option']").filter(visible); }
function optionText(el){ return String(el?.innerText || el?.textContent || "").replace(/\s+/g," ").trim(); }
function findExactDOMOption(options,wanted){ return options.find(option=>exactLabelMatch(optionText(option),wanted)) || null; }

async function closeMultiselect(vm,input){
  try{ if(vm && typeof vm.deactivate==="function") vm.deactivate(); }catch{}
  try{ input?.blur(); }catch{}
  await sleep(150);
}

async function chooseSelect(spec){
  const row=findPropertyRow(spec.label);
  if(!row) return dbg("select-failed",{ok:false,label:spec.label,reason:"row_not_found"});
  const input=multiselectInput(row);
  if(!input) return dbg("select-failed",{ok:false,label:spec.label,reason:"input_not_found"});
  const vm=vueInstance(row);

  if(vm){
    let options=vueCandidateOptions(vm);
    if(!options.length){ input.click(); await sleep(200); options=vueCandidateOptions(vm); }
    const option=findExactVueOption(options,spec.value);
    if(option){
      try{
        if(typeof vm.select==="function") vm.select(option);
        else if(typeof vm.$emit==="function"){
          vm.$emit("input",option);
          vm.$emit("update:modelValue",option);
        }
        await closeMultiselect(vm,input);
        await sleep(150);
        const selected=vueOptionLabel(vueSelectedValue(vm));
        if(exactLabelMatch(selected,spec.value)){
          return dbg("select-set",{ok:true,label:spec.label,value:spec.value,mode:"vue-exact",vueValue:selected});
        }
      }catch(error){ dbg("vue-select-error",{label:spec.label,error:String(error)}); }
    }
  }

  input.click(); input.focus(); await sleep(150);
  nativeValue(input,spec.value); await sleep(500);
  const options=visibleOptions();
  const option=findExactDOMOption(options,spec.value);
  if(!option){
    return dbg("select-failed",{ok:false,label:spec.label,reason:"exact_option_not_found",wanted:spec.value,options:options.slice(0,30).map(optionText)});
  }
  option.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window}));
  option.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,view:window}));
  option.click(); await sleep(300);
  const vmAfter=vueInstance(row);
  await closeMultiselect(vmAfter,input);
  const selected=vueOptionLabel(vueSelectedValue(vmAfter));
  if(exactLabelMatch(selected,spec.value)){
    return dbg("select-set",{ok:true,label:spec.label,value:spec.value,mode:"dom-exact",vueValue:selected});
  }
  return dbg("select-failed",{ok:false,label:spec.label,reason:"selection_not_committed",wanted:spec.value,vueValue:selected,typedValue:input.value});
}

function verifySelect(spec){
  const row=findPropertyRow(spec.label);
  if(!row) return dbg("select-verify-failed",{ok:false,label:spec.label,reason:"row_not_found"});
  const selected=vueOptionLabel(vueSelectedValue(vueInstance(row)));
  const ok=exactLabelMatch(selected,spec.value);
  return dbg(ok?"select-verified":"select-verify-failed",{ok,label:spec.label,wanted:spec.value,vueValue:selected,reason:ok?null:"exact_value_mismatch"});
}

function addStatInput(){ return $("input[placeholder='+ Add Stat Filter']") || $("input[placeholder*='Add Stat Filter']"); }
function statContainer(){
  const input=addStatInput();
  return input ? (input.closest(".filter-group") || input.parentElement?.parentElement || null) : null;
}
function currentStatRows(){
  const group=statContainer();
  if(!group) return [];
  return $$(".filter",group).filter(visible).filter(row=>!row.classList.contains("filter-padded") && numberInputs(row).length>0);
}
function statTokens(text){
  const ignore=new Set(["the","of","to","and","or","local","increased","increase"]);
  return norm(text).replace(/[#%+]/g," ").split(" ").filter(x=>x.length>2 && !ignore.has(x));
}
function statScore(candidate,wanted){
  const body=norm(candidate);
  return statTokens(wanted).reduce((n,t)=>n+(body.includes(t)?1:0),0);
}
function findStatRow(text){
  let best=null,bestScore=0;
  for(const row of currentStatRows()){
    const score=statScore(row.innerText,text);
    if(score>bestScore){ best=row; bestScore=score; }
  }
  const required=Math.min(2,statTokens(text).length);
  return bestScore>=required ? best : null;
}

async function addStat(spec){
  const property=findPropertyRow(spec.text);
  if(property && numberInputs(property).length){
    const result=setNumericProperty({label:spec.text,min:spec.min,max:spec.max});
    return {...result,stat:spec.text,source:"property-row"};
  }

  let row=findStatRow(spec.text);
  if(row){
    const mm=minMaxInputs(row);
    if(spec.min!=null && mm.min) nativeValue(mm.min,spec.min);
    if(spec.max!=null && mm.max) nativeValue(mm.max,spec.max);
    return dbg("stat-set",{ok:true,stat:spec.text,mode:"existing"});
  }

  const input=addStatInput();
  if(!input) return dbg("stat-failed",{ok:false,stat:spec.text,reason:"add_stat_input_not_found"});
  input.click(); input.focus(); await sleep(150);
  nativeValue(input,String(spec.text).replace(/#/g,"").replace(/\s+/g," ").trim());
  await sleep(500);

  const options=visibleOptions();
  let best=null,bestScore=0;
  for(const option of options){
    const score=statScore(option.innerText,spec.text);
    if(score>bestScore){ best=option; bestScore=score; }
  }
  if(!best) return dbg("stat-failed",{ok:false,stat:spec.text,reason:"stat_option_not_found",options:options.slice(0,30).map(optionText)});

  best.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window}));
  best.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,view:window}));
  best.click(); await sleep(450);
  row=findStatRow(spec.text) || currentStatRows().at(-1);
  if(!row) return dbg("stat-failed",{ok:false,stat:spec.text,reason:"created_row_not_found"});

  const mm=minMaxInputs(row);
  if(spec.min!=null){
    if(!mm.min) return dbg("stat-failed",{ok:false,stat:spec.text,reason:"created_min_not_found"});
    nativeValue(mm.min,spec.min);
  }
  if(spec.max!=null){
    if(!mm.max) return dbg("stat-failed",{ok:false,stat:spec.text,reason:"created_max_not_found"});
    nativeValue(mm.max,spec.max);
  }
  return dbg("stat-set",{ok:true,stat:spec.text,mode:"created"});
}

function verifyStat(spec){
  const property=findPropertyRow(spec.text);
  if(property && numberInputs(property).length){
    const r=verifyNumericProperty({label:spec.text,min:spec.min,max:spec.max});
    return {...r,stat:spec.text,source:"property-row"};
  }
  const row=findStatRow(spec.text);
  if(!row) return dbg("stat-verify-failed",{ok:false,stat:spec.text,reason:"stat_row_not_found"});
  const mm=minMaxInputs(row);
  if(spec.min!=null){
    const got=String(mm.min?.value??"");
    if(got!==String(spec.min)) return dbg("stat-verify-failed",{ok:false,stat:spec.text,reason:"wrong_min",wanted:String(spec.min),got});
  }
  if(spec.max!=null){
    const got=String(mm.max?.value??"");
    if(got!==String(spec.max)) return dbg("stat-verify-failed",{ok:false,stat:spec.text,reason:"wrong_max",wanted:String(spec.max),got});
  }
  return dbg("stat-verified",{ok:true,stat:spec.text});
}

async function clearTrade(){
  const clear=$("button.clear-btn");
  if(!clear) return dbg("clear-failed",{ok:false,reason:"clear_button_not_found"});
  clear.click(); await sleep(700);
  return dbg("clear-complete",{ok:true});
}

function clickSearch(){
  const button=$("button.search-btn");
  if(!button) return dbg("search-failed",{ok:false,reason:"search_button_not_found"});
  button.click();
  return dbg("search-clicked",{ok:true});
}

async function runPacket(packet){
  DEBUG.length=0;
  const result={ok:false,version:VERSION,packet,audit:[]};
  status("Starting verified search...");

  if(packet.clear!==false){
    status("Clearing old filters...");
    const clear=await clearTrade();
    result.audit.push(clear);
    if(!clear.ok){ result.reason="clear_failed"; return result; }
  }

  for(const spec of packet.selects||[]){
    status(`Selecting ${spec.label}: ${spec.value}`);
    const r=await chooseSelect(spec); result.audit.push(r);
    if(!r.ok){ result.reason="select_failed"; return result; }
  }

  for(const spec of packet.fields||[]){
    status(`Setting ${spec.label}`);
    const r=setNumericProperty(spec); result.audit.push(r);
    if(!r.ok){ result.reason="field_failed"; return result; }
  }

  for(const spec of packet.stats||[]){
    status(`Setting ${spec.text}`);
    const r=await addStat(spec); result.audit.push(r);
    if(!r.ok){ result.reason="stat_failed"; return result; }
  }

  status("Verifying final page state...");

  for(const spec of packet.selects||[]){
    const r=verifySelect(spec); result.audit.push(r);
    if(!r.ok){ result.reason="select_verification_failed"; status(`ABORTED: ${spec.label} is not ${spec.value}.`); return result; }
  }
  for(const spec of packet.fields||[]){
    const r=verifyNumericProperty(spec); result.audit.push(r);
    if(!r.ok){ result.reason="field_verification_failed"; status(`ABORTED: ${spec.label} failed verification.`); return result; }
  }
  for(const spec of packet.stats||[]){
    const r=verifyStat(spec); result.audit.push(r);
    if(!r.ok){ result.reason="stat_verification_failed"; status(`ABORTED: ${spec.text} failed verification.`); return result; }
  }

  result.ok=true;
  if(packet.search===false){ status("PASS: all requested filters exactly verified. Search NOT submitted."); return result; }

  const searchResult=clickSearch(); result.audit.push(searchResult);
  if(!searchResult.ok){ result.ok=false; result.reason="search_click_failed"; return result; }
  status("PASS: all filters verified and Search submitted.");
  return result;
}

function cards(){
  const selectors=[".resultset .row",".search-results .row",".result-row",".result","[data-id]"];
  const out=[];
  for(const selector of selectors){
    for(const el of $$(selector)){
      const text=el.innerText||"";
      if(visible(el) && text.length>100 && (/Asking Price/i.test(text) || /~b\/o/i.test(text))) out.push(el);
    }
  }
  return [...new Set(out)];
}

async function loadResults(max=50){
  let previous=-1,stuck=0;
  for(let i=0;i<25;i++){
    const count=cards().length;
    if(count>=max) break;
    if(count===previous) stuck++; else stuck=0;
    if(stuck>=5) break;
    previous=count;
    window.scrollTo(0,document.body.scrollHeight);
    await sleep(650);
  }
  window.scrollTo(0,0);
}

function num(text,re){ const match=text.match(re); return match ? Number(String(match[1]).replace(/,/g,"")) : null; }
function parsePrice(text){
  let match=text.match(/Asking Price\s*:?\s*[\r\n ]*([0-9.,]+)\s*[×x]?\s*(Divine Orb|Exalted Orb|Regal Orb|Chaos Orb)/i);
  if(match) return {amount:Number(match[1].replace(/,/g,"")),currency:match[2]};
  match=text.match(/~b\/o\s+([0-9.,]+)\s+(divine|exalted|regal|chaos)/i);
  if(!match) return null;
  return {amount:Number(match[1].replace(/,/g,"")),currency:match[2][0].toUpperCase()+match[2].slice(1).toLowerCase()+" Orb"};
}

function identifyItem(lines){
  const clean=lines.filter(x=>!/^Verified$/i.test(x));
  const classes=["Bow","Crossbow","Two Hand Mace","One Hand Mace","Two Hand Axe","One Hand Axe","Two Hand Sword","One Hand Sword","Body Armour","Helmet","Gloves","Boots","Ring","Amulet","Belt","Jewel","Quiver","Quarterstaff","Kalguuran Quarterstaff","Staff","Wand","Sceptre","Shield"];
  const index=clean.findIndex(x=>classes.some(c=>norm(c)===norm(x)));
  if(index>=2) return {name:clean[index-2],baseType:clean[index-1],itemClass:clean[index]};
  return {name:clean[0]||null,baseType:clean[1]||null,itemClass:clean[2]||null};
}

function parseCard(card){
  const text=String(card.innerText||"").replace(/\u00a0/g," ").trim();
  const lines=text.split("\n").map(x=>x.trim()).filter(Boolean);
  const id=identifyItem(lines);
  const seller=text.match(/([^\s\n]+#[0-9]+)\s+listed\s+([^\n]+)/i);
  const phys=text.match(/Physical Damage:\s*([0-9]+)\s*[-–]\s*([0-9]+)/i);
  const mods=lines.filter(line=>{
    if(line===id.name || line===id.baseType || line===id.itemClass) return false;
    if(/^Verified$/i.test(line)) return false;
    if(/^(Quality|Physical Damage|Cold Damage|Fire Damage|Lightning Damage|Chaos Damage|Critical Hit Chance|Attacks per Second|Item Level|Requires|DPS|Physical DPS|Elemental DPS|Asking Price|Fee):?/i.test(line)) return false;
    if(/^~b\/o/i.test(line)) return false;
    if(/^[0-9.,]+×.*Orb$/i.test(line)) return false;
    if(/\slisted\s/i.test(line)) return false;
    if(/^Travel to Hideout$/i.test(line)) return false;
    if(/^Ignore Player$/i.test(line)) return false;
    return true;
  });
  return {
    name:id.name,baseType:id.baseType,itemClass:id.itemClass,
    itemLevel:num(text,/Item Level:\s*([0-9]+)/i),
    quality:num(text,/Quality:\s*\+?([0-9]+)%/i),
    requirements:text.match(/Requires:\s*([^\n]+)/i)?.[1]||null,
    physicalDamage:phys?[Number(phys[1]),Number(phys[2])]:null,
    criticalChance:num(text,/Critical Hit Chance:\s*([0-9.]+)%/i),
    attacksPerSecond:num(text,/Attacks per Second:\s*([0-9.]+)/i),
    physicalDps:num(text,/Physical DPS\s*:?\s*([0-9.]+)/i),
    elementalDps:num(text,/Elemental DPS\s*:?\s*([0-9.]+)/i),
    totalDps:num(text,/(?:^|\n)DPS\s*:?\s*([0-9.]+)/im),
    price:parsePrice(text),seller:seller?.[1]||null,listedAgo:seller?.[2]?.trim()||null,
    corrupted:/\bCorrupted\b/i.test(text),sanctified:/\bSanctified\b/i.test(text),
    additionalArrow:/fire an additional arrow/i.test(text),
    manaLeech:num(text,/Leeches\s+([0-9.]+)%\s+of Physical Damage as Mana/i)||0,
    lifeLeech:num(text,/Leeches\s+([0-9.]+)%\s+of Physical Damage as Life/i)||0,
    attackSkillLevels:num(text,/\+([0-9]+)\s+to Level of all Attack Skills/i)||0,
    projectileSkillLevels:num(text,/\+([0-9]+)\s+to Level of all Projectile Skills/i)||0,
    attackCostEfficiency:num(text,/([0-9.]+)%\s+increased Cost Efficiency of Attacks/i)||0,
    mods
  };
}

async function buildResultPacket(){
  status("Loading results...");
  await loadResults(50);
  const parsed=cards().map(parseCard);
  const seen=new Set(),listings=[];
  for(const item of parsed){
    const key=JSON.stringify([item.name,item.baseType,item.seller,item.price,item.physicalDps,item.criticalChance]);
    if(seen.has(key)) continue;
    seen.add(key); listings.push(item);
  }
  return {protocol:"poe2-trade-copilot/results-v5",version:VERSION,capturedAt:new Date().toISOString(),sourceUrl:location.href,visibleResults:listings.length,listings:listings.slice(0,50)};
}

const SAMPLE={
  protocol:"poe2-trade-copilot/search-v5",
  clear:true,
  selects:[
    {label:"Item Category",value:"Bow"},
    {label:"Item Rarity",value:"Rare"},
    {label:"Buyout Price",value:"Divine Orb"}
  ],
  fields:[{label:"Buyout Price",max:200}],
  stats:[{text:"Physical DPS",min:620},{text:"Critical Chance",min:8.5}],
  search:false
};

function makeUI(){
  if($("#ptc")) return;
  const panel=document.createElement("div");
  panel.id="ptc";
  Object.assign(panel.style,{position:"fixed",right:"10px",bottom:"10px",zIndex:"2147483647",width:"min(390px,calc(100vw - 20px))",background:"#10151c",color:"#fff",border:"1px solid #9c793b",borderRadius:"13px",padding:"10px",boxShadow:"0 8px 30px #0008",font:"12px -apple-system,BlinkMacSystemFont,sans-serif"});
  panel.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px"><b style="flex:1;color:#e8c671">PoE2 Trade Copilot</b><span style="opacity:.6">v${VERSION}</span></div>
    <textarea id="ptc-box" spellcheck="false" style="box-sizing:border-box;width:100%;height:145px;margin-top:8px;background:#080b0f;color:#e2e9f5;border:1px solid #3e4a59;border-radius:7px;padding:7px;font:11px monospace"></textarea>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px">
      <button id="ptc-paste">PASTE SEARCH</button><button id="ptc-run">RUN / VERIFY</button>
      <button id="ptc-results">COPY RESULTS</button><button id="ptc-debug">COPY DEBUG</button>
      <button id="ptc-load">LOAD TEST</button><button id="ptc-search">SEARCH NOW</button>
    </div>
    <div id="ptc-status" style="margin-top:8px;background:#080b0f;padding:7px;min-height:28px;border-radius:6px;color:#aeb9c8;line-height:1.4">Ready.</div>`;
  document.body.appendChild(panel);
  $$("button",panel).forEach(button=>Object.assign(button.style,{padding:"9px",background:"#26313e",color:"#fff",border:"1px solid #526071",borderRadius:"7px",fontWeight:"600"}));

  const box=$("#ptc-box");
  box.value=localStorage.getItem("ptc-packet-v51") || JSON.stringify(SAMPLE,null,2);

  $("#ptc-paste").onclick=async()=>{
    let text="";
    try{ text=await navigator.clipboard.readText(); }catch{}
    if(!text){ box.focus(); status("Safari blocked clipboard read. Long-press the box and Paste."); return; }
    box.value=text; localStorage.setItem("ptc-packet-v51",text); status("Search packet pasted.");
  };

  $("#ptc-load").onclick=()=>{ box.value=JSON.stringify(SAMPLE,null,2); status("v0.5.1 exact-match test loaded."); };

  $("#ptc-run").onclick=async()=>{
    let packet;
    try{ packet=JSON.parse(box.value); }catch{ status("Invalid JSON."); return; }
    localStorage.setItem("ptc-packet-v51",box.value);
    const result=await runPacket(packet);
    window.__POE2TC_LAST_DEBUG=result;
    if(result.ok){
      status(packet.search===false ? "PASS: all requested filters EXACTLY verified. Search NOT submitted." : "PASS: all filters verified and Search submitted.");
    }else{
      status("ABORTED: "+(result.reason||"verification_failed")+". COPY DEBUG.");
    }
  };

  $("#ptc-search").onclick=()=>{
    const last=window.__POE2TC_LAST_DEBUG;
    if(!last || !last.ok){ status("SEARCH BLOCKED: verify filters first."); return; }
    const r=clickSearch(); status(r.ok?"Verified search submitted.":"Search button not found.");
  };

  $("#ptc-results").onclick=async()=>{
    const packet=await buildResultPacket();
    const ok=await copyText(JSON.stringify(packet));
    status(ok?`Copied ${packet.visibleResults} result(s).`:"Copy Results failed.");
  };

  $("#ptc-debug").onclick=async()=>{
    const packet=window.__POE2TC_LAST_DEBUG?.packet || SAMPLE;
    const selectState={};
    for(const spec of packet.selects||[]){
      const row=findPropertyRow(spec.label);
      selectState[spec.label]={wanted:spec.value,vueValue:vueOptionLabel(vueSelectedValue(vueInstance(row)))};
    }
    const debug={
      protocol:"poe2-trade-copilot/debug-v5.1",
      version:VERSION,
      url:location.href,
      data:window.__POE2TC_LAST_DEBUG||null,
      exactSelectState:selectState,
      physicalDps:{min:minMaxInputs(findPropertyRow("Physical DPS")).min?.value||null},
      criticalChance:{min:minMaxInputs(findPropertyRow("Critical Chance")).min?.value||null},
      buyoutPrice:{max:minMaxInputs(findPropertyRow("Buyout Price")).max?.value||null}
    };
    await copyText(JSON.stringify(debug));
    status("Exact-state debug copied.");
  };
}

function boot(){
  if(!document.body){ setTimeout(boot,200); return; }
  makeUI();
  console.log(`[PoE2 Trade Copilot] v${VERSION} loaded`);
}

boot();
})();
