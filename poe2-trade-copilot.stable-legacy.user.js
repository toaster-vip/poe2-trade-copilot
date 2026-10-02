// ==UserScript==
// @name         PoE2 Trade Copilot Stable Legacy
// @namespace    chatgpt-poe2-trade
// @version      0.6.5
// @description  Stable self-contained PoE2 Trade Copilot with GitHub Load+Run
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @updateURL    https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/poe2-trade-copilot.stable-legacy.user.js
// @downloadURL  https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/poe2-trade-copilot.stable-legacy.user.js
// @grant        none
// ==/UserScript==



/* ===== poe2-trade-copilot.user.js@ca6788b3cb741a844f1794737480df9d907eee44 ===== */
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


/* ===== patches/pre-run-reset.v1.js@main ===== */
(() => {
  "use strict";

  const VERSION = "pre-run-reset-1.0";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = s => String(s || "").replace(/\s+/g, " ").trim().toUpperCase();

  function status(text) {
    const el = $("#ptc-status");
    if (el) el.textContent = text;
  }

  function officialClearButton() {
    return $$("button, input[type='button']")
      .filter(el => !el.closest("#ptc"))
      .find(el => norm(el.textContent || el.value) === "CLEAR") || null;
  }

  function numericInputs() {
    return $$("input")
      .filter(el => !el.closest("#ptc"))
      .filter(el => {
        const p = norm(el.placeholder);
        return p === "MIN" || p === "MAX";
      });
  }

  function residualNumericValues() {
    return numericInputs().filter(el => String(el.value || "").trim() !== "");
  }

  async function waitForOfficialClear() {
    for (let i = 0; i < 30; i++) {
      if (residualNumericValues().length === 0) return true;
      await sleep(50);
    }
    return residualNumericValues().length === 0;
  }

  function install() {
    const runButton = $("#ptc-run");
    const box = $("#ptc-box");
    if (!runButton || !box) return setTimeout(install, 200);
    if (runButton.dataset.preRunReset === VERSION) return;
    runButton.dataset.preRunReset = VERSION;

    let bypass = false;

    runButton.addEventListener("click", event => {
      if (bypass) return;

      let packet;
      try { packet = JSON.parse(box.value); }
      catch { return; }

      if (!packet?.clear) return;

      const clearButton = officialClearButton();
      if (!clearButton) {
        console.warn("[PoE2TC Pre-run Reset] Official CLEAR button not found; refusing to run a clear search.");
        event.preventDefault();
        event.stopImmediatePropagation();
        status("Reset failed: official CLEAR button not found. Search not submitted.");
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      (async () => {
        status("Resetting previous trade filters…");
        clearButton.click();
        const cleared = await waitForOfficialClear();
        if (!cleared) {
          const leftovers = residualNumericValues().map(el => ({placeholder: el.placeholder, value: el.value}));
          window.__POE2TC_PRE_RUN_RESET_DEBUG = {ok:false, version:VERSION, reason:"numeric_filters_not_cleared", leftovers};
          console.error("[PoE2TC Pre-run Reset] Stale numeric filters remain", leftovers);
          status("Reset failed: stale numeric filters remain. Search not submitted.");
          return;
        }

        window.__POE2TC_PRE_RUN_RESET_DEBUG = {ok:true, version:VERSION};
        await sleep(120);
        bypass = true;
        try { runButton.click(); }
        finally { bypass = false; }
      })();
    }, true);

    console.log(`[PoE2TC Pre-run Reset] ${VERSION} installed.`);
  }

  install();
})();


/* ===== patches/packet-guard.v1.js@main ===== */
(() => {
  "use strict";

  const VERSION = "packet-guard-1.1";
  const KNOWLEDGE_API = "https://api.github.com/repos/toaster-vip/poe2-trade-copilot/contents/data/stat-search-knowledge.json?ref=main";
  const $ = (s, r = document) => r.querySelector(s);
  const norm = s => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  let verifiedStats = new Set(["maximum life","maximum mana","cold resistance","lightning resistance"]);
  let failedStats = new Set(["strength","dexterity","intelligence","+# to strength","+# to dexterity","+# to intelligence"]);
  let knowledgeReady = false;

  function status(text) {
    const el = $("#ptc-status");
    if (el) el.textContent = text;
    console.warn("[PoE2TC Packet Guard]", text);
  }

  function decodeBase64Utf8(base64) {
    const clean = String(base64 || "").replace(/\s+/g, "");
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function loadKnowledge() {
    try {
      const response = await fetch(`${KNOWLEDGE_API}&t=${Date.now()}`, {cache:"no-store",credentials:"omit",headers:{"Accept":"application/vnd.github+json"}});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const data = JSON.parse(decodeBase64Utf8(payload.content));
      const verified = new Set();
      const failed = new Set(failedStats);
      for (const entry of data?.entries || []) {
        if (entry?.kind !== "stat") continue;
        if (entry.status === "verified" && entry.query) verified.add(norm(entry.query));
        for (const f of entry.knownFailures || []) if (f?.query) failed.add(norm(f.query));
      }
      if (verified.size) verifiedStats = verified;
      failedStats = failed;
      knowledgeReady = true;
      window.__POE2TC_PACKET_GUARD_KNOWLEDGE = {version:VERSION,verifiedStats:[...verifiedStats],failedStats:[...failedStats]};
    } catch (error) {
      knowledgeReady = false;
      console.error("[PoE2TC Packet Guard] knowledge load failed; using built-in safety rules", error);
    }
  }

  function validate(packet) {
    if (!packet || typeof packet !== "object") return {ok:false, reason:"invalid_packet", errors:["invalid packet"]};
    const errors = [];
    const warnings = [];

    for (const spec of Array.isArray(packet.stats) ? packet.stats : []) {
      const q = norm(spec?.text);
      if (!q) { errors.push("empty stat query"); continue; }
      if (failedStats.has(q)) { errors.push(`known-bad stat: ${spec.text}`); continue; }
      if (!verifiedStats.has(q)) warnings.push(`unverified stat: ${spec.text}`);
    }

    for (const spec of Array.isArray(packet.fields) ? packet.fields : []) {
      const label = norm(spec?.label);
      if (["strength","dexterity","intelligence"].includes(label)) errors.push(`attribute ambiguity: ${spec.label}`);
    }

    return errors.length ? {ok:false,reason:"unsafe_filters",errors,warnings} : {ok:true,warnings};
  }

  function readPacket() {
    const box = $("#ptc-box");
    if (!box) return null;
    try { return JSON.parse(box.value); } catch { return null; }
  }

  function install() {
    if (window.__POE2TC_PACKET_GUARD_INSTALLED) return;
    window.__POE2TC_PACKET_GUARD_INSTALLED = true;
    document.addEventListener("click", event => {
      const target = event.target?.closest?.("#ptc-run, #ptc-search");
      if (!target) return;
      const packet = readPacket();
      const result = validate(packet);
      window.__POE2TC_PACKET_GUARD_LAST = {version:VERSION,knowledgeReady,packet,result};
      if (result.ok) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      status(`BLOCKED: ${result.errors?.[0] || result.reason}.`);
    }, true);
    console.log(`[PoE2TC Packet Guard] ${VERSION} installed.`);
  }

  loadKnowledge();
  install();
})();


/* ===== patches/result-collector.v1.js@main ===== */
(() => {
  "use strict";

  const PATCH_VERSION = "collector-3.2";
  const TOP_N = 150;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  let lastTradeSearch = null;

  function rememberTradeSearch(payload, url) {
    if (!payload || !Array.isArray(payload.result) || !payload.id) return;
    lastTradeSearch = {
      id:String(payload.id),
      total:Number(payload.total || payload.result.length || 0),
      result:payload.result.slice(),
      url:String(url || ""),
      capturedAt:new Date().toISOString()
    };
    window.__POE2TC_TRADE_SEARCH_RESPONSE = lastTradeSearch;
    console.log("[PoE2TC Collector] captured trade search", {
      total:lastTradeSearch.total,
      ids:lastTradeSearch.result.length,
      id:lastTradeSearch.id
    });
  }

  function installTradeSearchTap() {
    if (window.__POE2TC_TRADE_SEARCH_TAP_INSTALLED) return;
    window.__POE2TC_TRADE_SEARCH_TAP_INSTALLED = true;

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this,args);
      try {
        const url = String(args?.[0]?.url || args?.[0] || "");
        if (/\/api\/trade2\/search\/poe2\//i.test(url)) {
          response.clone().json().then(payload => rememberTradeSearch(payload,url)).catch(()=>{});
        }
      } catch {}
      return response;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method,url,...rest) {
      try { this.__poe2tcUrl = String(url || ""); } catch {}
      return originalOpen.call(this,method,url,...rest);
    };
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(...args) {
      if (/\/api\/trade2\/search\/poe2\//i.test(String(this.__poe2tcUrl || ""))) {
        this.addEventListener("load", () => {
          try {
            const payload = JSON.parse(String(this.responseText || ""));
            rememberTradeSearch(payload,this.__poe2tcUrl);
          } catch {}
        }, {once:true});
      }
      return originalSend.apply(this,args);
    };
  }

  installTradeSearchTap();

  function visible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    return el.offsetParent !== null && style.display !== "none" && style.visibility !== "hidden";
  }

  function status(text) {
    const el = $("#ptc-status");
    if (el) el.textContent = text;
    console.log("[PoE2TC Collector]", text);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      Object.assign(ta.style, {position:"fixed",left:"0",top:"0",width:"1px",height:"1px",opacity:"0"});
      document.body.appendChild(ta);
      ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch { return false; }
  }

  function cardElements() {
    const selectors = [".resultset .row", ".search-results .row", ".result-row", ".result", "[data-id]"];
    const out = [];
    for (const selector of selectors) {
      for (const el of $$(selector)) {
        const text = el.innerText || "";
        if (text.length > 100 && (/Asking Price/i.test(text) || /~b\/o/i.test(text))) out.push(el);
      }
    }
    return [...new Set(out)];
  }

  function num(text, re) {
    const m = text.match(re);
    return m ? Number(String(m[1]).replace(/,/g, "")) : null;
  }

  function canonicalCurrency(value) {
    const v = norm(value);
    if (v === "mirror" || v === "mirror of kalandra") return "Mirror of Kalandra";
    if (v === "divine" || v === "divine orb") return "Divine Orb";
    if (v === "exalted" || v === "exalted orb") return "Exalted Orb";
    if (v === "regal" || v === "regal orb") return "Regal Orb";
    if (v === "chaos" || v === "chaos orb") return "Chaos Orb";
    return String(value || "").trim() || null;
  }

  function parsePrice(text) {
    let m = text.match(/Asking Price\s*:?\s*[\r\n ]*([0-9.,]+)\s*[×x]?\s*(Divine Orb|Exalted Orb|Regal Orb|Chaos Orb|Mirror of Kalandra)/i);
    if (m) return {amount:Number(m[1].replace(/,/g,"")),currency:canonicalCurrency(m[2])};
    m = text.match(/~b\/o\s+([0-9.,]+)\s+(divine|exalted|regal|chaos|mirror(?: of kalandra)?)/i);
    if (!m) return null;
    return {amount:Number(m[1].replace(/,/g,"")),currency:canonicalCurrency(m[2])};
  }

  function identifyItem(lines) {
    const clean = lines.filter(x => !/^Verified$/i.test(x));
    const classes = ["Bow","Crossbow","Two Hand Mace","One Hand Mace","Two Hand Axe","One Hand Axe","Two Hand Sword","One Hand Sword","Body Armour","Helmet","Gloves","Boots","Ring","Amulet","Belt","Jewel","Quiver","Quarterstaff","Kalguuran Quarterstaff","Staff","Wand","Sceptre","Shield"];
    const index = clean.findIndex(x => classes.some(c => norm(c) === norm(x)));
    return index >= 2 ? {name:clean[index-2],baseType:clean[index-1],itemClass:clean[index]} : {name:clean[0]||null,baseType:clean[1]||null,itemClass:clean[2]||null};
  }

  function parseSocketDom(card) {
    const selectors = ['[class*="socket"]','[class*="rune"]','[class*="soul-core"]','[data-socket]','[data-rune]'];
    const nodes = [...new Set(selectors.flatMap(sel => { try { return [...card.querySelectorAll(sel)]; } catch { return []; } }))];
    const visibleNodes = nodes.filter(el => visible(el));
    const descriptors = visibleNodes.map(el => ({tag:el.tagName,className:String(el.className||""),title:el.getAttribute("title")||null,aria:el.getAttribute("aria-label")||null,dataSocket:el.getAttribute("data-socket")||null,dataRune:el.getAttribute("data-rune")||null}));
    const container = visibleNodes.find(el => /(?:^|\\s)numSockets([0-9]+)(?:\\s|$)/.test(String(el.className||"")));
    const classMatch = container ? String(container.className||"").match(/(?:^|\\s)numSockets([0-9]+)(?:\\s|$)/) : null;
    const explicitCount = classMatch ? Number(classMatch[1]) : null;
    const socketNodes = visibleNodes.filter(el => /(?:^|\\s)socket(?:\\s|$)/.test(String(el.className||"")));
    return {count:explicitCount ?? (socketNodes.length||null),descriptors};
  }

  function parseSockets(text, lines, card) {
    const socketLine = lines.find(line => /^(?:Sockets?|Rune Sockets?|Sockets? \(Rune\))\s*:/i.test(line));
    let socketCount = null;
    if (socketLine) {
      const rhs = socketLine.split(":").slice(1).join(":").trim();
      const explicit = rhs.match(/\b([0-9]+)\b/);
      if (explicit) socketCount = Number(explicit[1]);
      else {
        const marks = rhs.match(/(?:[RGBW]|○|●|◉|◇|◆)/gi);
        if (marks?.length) socketCount = marks.length;
      }
    }
    if (socketCount == null) socketCount = num(text, /(?:Rune )?Sockets?\s*:?\s*([0-9]+)/i);
    const bonded = lines.filter(line => /^Bonded:/i.test(line));
    const runeLines = lines.filter(line => /\b(?:Rune|Soul Core)\b/i.test(line) && !/^(?:Rune )?Sockets?\s*:/i.test(line));
    const dom = parseSocketDom(card);
    if (socketCount == null) socketCount = dom.count;
    return {socketCount,bondedEffects:bonded,socketedRunes:runeLines,socketDom:dom.descriptors};
  }

  function parseCard(card) {
    const text = String(card.innerText || "").replace(/\u00a0/g," ").trim();
    const lines = text.split("\n").map(x=>x.trim()).filter(Boolean);
    const id = identifyItem(lines);
    const sockets = parseSockets(text, lines, card);
    const seller = text.match(/([^\s\n]+#[0-9]+)\s+listed\s+([^\n]+)/i);
    const phys = text.match(/Physical Damage:\s*([0-9]+)\s*[-–]\s*([0-9]+)/i);
    const mods = lines.filter(line => {
      if (line===id.name || line===id.baseType || line===id.itemClass || /^Verified$/i.test(line)) return false;
      if (/^(Quality|Physical Damage|Cold Damage|Fire Damage|Lightning Damage|Chaos Damage|Critical Hit Chance|Attacks per Second|Item Level|Requires|DPS|Physical DPS|Elemental DPS|Asking Price|Fee):?/i.test(line)) return false;
      if (/^~b\/o/i.test(line) || /^[0-9.,]+\s*[×x]?\s*(?:Divine Orb|Exalted Orb|Regal Orb|Chaos Orb|Mirror of Kalandra)$/i.test(line) || /\slisted\s/i.test(line) || /^Travel to Hideout$/i.test(line) || /^Ignore Player$/i.test(line)) return false;
      return true;
    });
    const activeMods = mods.filter(line => !/^Bonded:/i.test(line));
    const activeModText = activeMods.join("\n");
    return {
      name:id.name,baseType:id.baseType,itemClass:id.itemClass,
      itemLevel:num(text,/Item Level:\s*([0-9]+)/i),quality:num(text,/Quality:\s*\+?([0-9]+)%/i),requirements:text.match(/Requires:\s*([^\n]+)/i)?.[1]||null,
      armour:num(text,/Armour:\s*([0-9,]+)/i),
      evasion:num(text,/Evasion:\s*([0-9,]+)/i),
      energyShield:num(text,/Energy Shield:\s*([0-9,]+)/i),
      maximumLife:num(text,/\+([0-9]+)\s+to maximum Life/i)||0,
      dexterity:num(text,/\+([0-9]+)\s+to Dexterity/i)||0,
      intelligence:num(text,/\+([0-9]+)\s+to Intelligence/i)||0,
      strength:num(text,/\+([0-9]+)\s+to Strength/i)||0,
      chaosResistance:num(text,/\+([0-9.]+)%\s+to Chaos Resistance/i)||0,
      fireResistance:num(text,/\+([0-9.]+)%\s+to Fire Resistance/i)||0,
      coldResistance:num(text,/\+([0-9.]+)%\s+to Cold Resistance/i)||0,
      lightningResistance:num(text,/\+([0-9.]+)%\s+to Lightning Resistance/i)||0,
      physicalDamage:phys?[Number(phys[1]),Number(phys[2])]:null,
      criticalChance:num(text,/Critical Hit Chance:\s*([0-9.]+)%/i),attacksPerSecond:num(text,/Attacks per Second:\s*([0-9.]+)/i),
      physicalDps:num(text,/Physical DPS\s*:?\s*([0-9.]+)/i),elementalDps:num(text,/Elemental DPS\s*:?\s*([0-9.]+)/i),totalDps:num(text,/(?:^|\n)DPS\s*:?\s*([0-9.]+)/im),
      price:parsePrice(text),seller:seller?.[1]||null,listedAgo:seller?.[2]?.trim()||null,
      corrupted:/\bCorrupted\b/i.test(text),sanctified:/\bSanctified\b/i.test(text),
      additionalArrow:activeMods.some(line => /^Bow Attacks fire an additional Arrow$/i.test(line)),
      surpassingArrowChance:num(activeModText,/\+?([0-9.]+)%\s+Surpassing chance to fire an additional Arrow/i)||0,
      lessAttackDamage:num(activeModText,/([0-9.]+)%\s+less Attack Damage/i)||0,
      criticalDamageBonus:num(activeModText,/\+([0-9.]+)%\s+to Critical Damage Bonus/i)||0,
      rareUniqueAttackDamage:num(activeModText,/([0-9.]+)%\s+increased Attack Damage against Rare or Unique Enemies/i)||0,
      projectileRangeReduction:num(activeModText,/([0-9.]+)%\s+reduced Projectile Range/i)||0,
      gainExtraAllElements:num(activeModText,/Gain\s+([0-9.]+)%\s+of Damage as Extra Damage of all Elements/i)||0,
      manaPerEnemyKilled:num(activeModText,/Gain\s+([0-9.]+)\s+Mana per enemy killed/i)||0,
      socketCount:sockets.socketCount,bondedEffects:sockets.bondedEffects,socketedRunes:sockets.socketedRunes,socketDom:sockets.socketDom,
      manaLeech:num(activeModText,/Leeches\s+([0-9.]+)%\s+of Physical Damage as Mana/i)||0,
      lifeLeech:num(activeModText,/Leeches\s+([0-9.]+)%\s+of Physical Damage as Life/i)||0,
      attackSkillLevels:num(activeModText,/\+([0-9]+)\s+to Level of all Attack Skills/i)||0,
      projectileSkillLevels:num(activeModText,/\+([0-9]+)\s+to Level of all Projectile Skills/i)||0,
      attackCostEfficiency:num(activeModText,/([0-9.]+)%\s+increased Cost Efficiency of Attacks/i)||0,
      mods
    };
  }

  function propNumber(item, wanted) {
    const props = Array.isArray(item?.properties) ? item.properties : [];
    const row = props.find(p => norm(p?.name) === norm(wanted));
    const raw = row?.values?.[0]?.[0];
    if (raw == null) return null;
    const m = String(raw).replace(/,/g,"").match(/-?[0-9]+(?:\.[0-9]+)?/);
    return m ? Number(m[0]) : null;
  }

  function cleanRequirementName(name) {
    const raw = String(name || "");
    if (/intelligence|\bint\b/i.test(raw)) return "Int";
    if (/dexterity|\bdex\b/i.test(raw)) return "Dex";
    if (/strength|\bstr\b/i.test(raw)) return "Str";
    if (/level/i.test(raw)) return "Level";
    return raw.replace(/\[([^|\]]+)\|([^\]]+)\]/g,"$2");
  }

  function requirementText(item) {
    const reqs = Array.isArray(item?.requirements) ? item.requirements : [];
    if (!reqs.length) return null;
    return reqs.map(r => {
      const value = r?.values?.[0]?.[0];
      const name = cleanRequirementName(r?.name);
      return value != null ? `${value} ${name}`.trim() : null;
    }).filter(Boolean).join(", ") || null;
  }

  function apiModText(x) {
    if (x == null) return "";
    if (typeof x === "string" || typeof x === "number") return String(x);
    if (typeof x === "object") {
      for (const key of ["text","value","display","rendered","mod"]) {
        if (typeof x[key] === "string" && x[key].trim()) return x[key].trim();
      }
      if (typeof x.name === "string" && x.name.trim() && !Array.isArray(x.magnitudes)) return x.name.trim();
    }
    return "";
  }

  function allApiMods(item) {
    const fields = [
      "enchantMods","implicitMods","explicitMods","craftedMods",
      "fracturedMods","runeMods","sanctumMods","scourgeMods"
    ];
    const out = [];
    for (const field of fields) {
      const xs = item?.[field];
      if (!Array.isArray(xs)) continue;
      for (const x of xs) {
        const text = apiModText(x);
        if (text) out.push(text);
      }
    }
    return out;
  }

  function agoFromIso(iso) {
    const t = Date.parse(String(iso || ""));
    if (!Number.isFinite(t)) return null;
    const sec = Math.max(0,Math.floor((Date.now()-t)/1000));
    if (sec < 3600) return `${Math.max(1,Math.floor(sec/60))} minutes ago`;
    if (sec < 86400) return `${Math.floor(sec/3600)} hours ago`;
    if (sec < 604800) return `${Math.floor(sec/86400)} days ago`;
    if (sec < 2592000) return `${Math.floor(sec/604800)} weeks ago`;
    return `${Math.floor(sec/2592000)} months ago`;
  }

  function currentSearchItemClass() {
    try {
      const source = window.__POE2TC_LAST_SEARCH_SOURCE?.packet;
      const packet = source || JSON.parse($("#ptc-box")?.value || "{}");
      const sel = (packet?.selects || []).find(x => norm(x?.label) === "item category");
      if (sel?.value) return String(sel.value);
    } catch {}
    const first = cardElements()[0];
    if (first) return parseCard(first).itemClass || null;
    return null;
  }

  function parseApiFetched(entry, fallbackClass) {
    const item = entry?.item || {};
    const listing = entry?.listing || {};
    const mods = allApiMods(item);
    const activeModText = mods.join("\n");
    const physRaw = propNumber(item,"Physical Damage");
    let phys = null;
    const physProp = (item?.properties || []).find(p => norm(p?.name) === "physical damage");
    const physText = physProp?.values?.[0]?.[0];
    const physMatch = String(physText || "").match(/([0-9]+)\s*[-–]\s*([0-9]+)/);
    if (physMatch) phys = [Number(physMatch[1]),Number(physMatch[2])];

    const price = listing?.price ? {
      amount:Number(listing.price.amount),
      currency:canonicalCurrency(listing.price.currency)
    } : null;

    const sockets = Array.isArray(item?.sockets) ? item.sockets : [];
    const bonded = mods.filter(line => /^Bonded:/i.test(line));
    return {
      id:entry?.id || item?.id || null,
      name:item?.name || item?.typeLine || null,
      baseType:item?.baseType || item?.typeLine || null,
      itemClass:fallbackClass || item?.extended?.category || null,
      itemLevel:Number(item?.ilvl || 0) || null,
      quality:propNumber(item,"Quality"),
      requirements:requirementText(item),
      armour:propNumber(item,"Armour"),
      evasion:propNumber(item,"Evasion Rating") ?? propNumber(item,"Evasion"),
      energyShield:propNumber(item,"Energy Shield") ?? (Number.isFinite(Number(item?.extended?.es)) ? Number(item.extended.es) : null),
      maximumLife:num(activeModText,/\+([0-9]+)\s+to maximum Life/i)||0,
      dexterity:num(activeModText,/\+([0-9]+)\s+to Dexterity/i)||0,
      intelligence:num(activeModText,/\+([0-9]+)\s+to Intelligence/i)||0,
      strength:num(activeModText,/\+([0-9]+)\s+to Strength/i)||0,
      chaosResistance:num(activeModText,/\+([0-9.]+)%\s+to Chaos Resistance/i)||0,
      fireResistance:num(activeModText,/\+([0-9.]+)%\s+to Fire Resistance/i)||0,
      coldResistance:num(activeModText,/\+([0-9.]+)%\s+to Cold Resistance/i)||0,
      lightningResistance:num(activeModText,/\+([0-9.]+)%\s+to Lightning Resistance/i)||0,
      physicalDamage:phys,
      criticalChance:propNumber(item,"Critical Hit Chance"),
      attacksPerSecond:propNumber(item,"Attacks per Second"),
      physicalDps:null,elementalDps:null,totalDps:null,
      price,
      seller:listing?.account?.name || null,
      listedAgo:agoFromIso(listing?.indexed),
      indexedAt:listing?.indexed || null,
      corrupted:!!item?.corrupted,
      sanctified:!!item?.sanctified,
      additionalArrow:mods.some(line => /^Bow Attacks fire an additional Arrow$/i.test(line)),
      surpassingArrowChance:num(activeModText,/\+?([0-9.]+)%\s+Surpassing chance to fire an additional Arrow/i)||0,
      lessAttackDamage:num(activeModText,/([0-9.]+)%\s+less Attack Damage/i)||0,
      criticalDamageBonus:num(activeModText,/\+([0-9.]+)%\s+to Critical Damage Bonus/i)||0,
      rareUniqueAttackDamage:num(activeModText,/([0-9.]+)%\s+increased Attack Damage against Rare or Unique Enemies/i)||0,
      projectileRangeReduction:num(activeModText,/([0-9.]+)%\s+reduced Projectile Range/i)||0,
      gainExtraAllElements:num(activeModText,/Gain\s+([0-9.]+)%\s+of Damage as Extra Damage of all Elements/i)||0,
      manaPerEnemyKilled:num(activeModText,/Gain\s+([0-9.]+)\s+Mana per enemy killed/i)||0,
      socketCount:sockets.length || null,
      bondedEffects:bonded,
      socketedRunes:[],
      socketDom:[],
      manaLeech:num(activeModText,/Leeches\s+([0-9.]+)%\s+of Physical Damage as Mana/i)||0,
      lifeLeech:num(activeModText,/Leeches\s+([0-9.]+)%\s+of Physical Damage as Life/i)||0,
      attackSkillLevels:num(activeModText,/\+([0-9]+)\s+to Level of all Attack Skills/i)||0,
      projectileSkillLevels:num(activeModText,/\+([0-9]+)\s+to Level of all Projectile Skills/i)||0,
      attackCostEfficiency:num(activeModText,/([0-9.]+)%\s+increased Cost Efficiency of Attacks/i)||0,
      mods
    };
  }

  async function fetchHiddenApiResults(domCount) {
    const search = lastTradeSearch || window.__POE2TC_TRADE_SEARCH_RESPONSE;
    if (!search?.id || !Array.isArray(search.result)) return {items:[],search:null};
    const max = Math.min(TOP_N, search.result.length);
    if (domCount >= max) return {items:[],search};
    const ids = search.result.slice(domCount,max);
    const fallbackClass = currentSearchItemClass();
    const out = [];
    for (let i=0;i<ids.length;i+=10) {
      const batch = ids.slice(i,i+10);
      status(`Fetching hidden trade results… ${domCount+out.length}/${max}`);
      const url = `/api/trade2/fetch/${batch.join(",")}?query=${encodeURIComponent(search.id)}&realm=poe2`;
      const response = await fetch(url,{credentials:"same-origin",headers:{"Accept":"application/json","X-Requested-With":"XMLHttpRequest"}});
      if (!response.ok) throw new Error(`Trade fetch HTTP ${response.status}`);
      const payload = await response.json();
      for (const entry of (payload?.result || [])) out.push(parseApiFetched(entry,fallbackClass));
      if (i+10 < ids.length) await sleep(450);
    }
    return {items:out,search};
  }

  function keyFor(item) { return JSON.stringify([item.name,item.baseType,item.seller,item.price,item.physicalDps,item.criticalChance,item.attacksPerSecond]); }
  function collectCurrent(map) { for (const card of cardElements()) { const item=parseCard(card); map.set(keyFor(item),item); } }

  function findScrollContainer() {
    const result = $(".resultset") || $(".search-results");
    if (!result) return null;
    let el=result;
    while (el && el!==document.body) {
      const style=getComputedStyle(el);
      if ((style.overflowY==="auto" || style.overflowY==="scroll") && el.scrollHeight>el.clientHeight+20) return el;
      el=el.parentElement;
    }
    return null;
  }

  async function collectAllResults() {
    const map=new Map();
    const container=findScrollContainer();
    const getPos=()=>container?container.scrollTop:window.scrollY;
    const getMax=()=>container?Math.max(0,container.scrollHeight-container.clientHeight):Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
    const setPos=y=>{ if(container) container.scrollTop=y; else window.scrollTo(0,y); };
    const stepSize=()=>container?Math.max(300,Math.floor(container.clientHeight*.7)):Math.max(400,Math.floor(window.innerHeight*.7));
    const original=getPos();
    setPos(0); await sleep(300);
    let last=-1, stagnant=0;
    for(let rounds=0; rounds<150; rounds++) {
      collectCurrent(map);
      status(`Collecting results… ${map.size} captured`);
      const max=getMax(), pos=getPos();
      stagnant=map.size===last?stagnant+1:0;
      last=map.size;
      if(pos>=max-5) {
        await sleep(600); collectCurrent(map);
        const max2=getMax();
        if(stagnant>=3 && max2<=max+5) break;
      }
      setPos(Math.min(getMax(),pos+stepSize()));
      await sleep(350);
    }
    setPos(original); await sleep(100);
    return [...map.values()];
  }

  function selectTop(listings) {
    const priced = listings.filter(x => x?.price && Number.isFinite(x.price.amount));
    const currencies = [...new Set(priced.map(x => x.price.currency))];
    let ordered = listings.slice();
    let sort = "page-order";
    if (currencies.length === 1) {
      ordered.sort((a,b) => {
        const ap = Number.isFinite(a?.price?.amount) ? a.price.amount : Number.POSITIVE_INFINITY;
        const bp = Number.isFinite(b?.price?.amount) ? b.price.amount : Number.POSITIVE_INFINITY;
        return ap - bp;
      });
      sort = `price-asc:${currencies[0]}`;
    }
    return {listings: ordered.slice(0, TOP_N), sort, captured:listings.length};
  }

  async function buildPacket() {
    const dom=await collectAllResults();
    let combined=dom.slice();
    let search=null;
    try {
      const extra=await fetchHiddenApiResults(dom.length);
      search=extra.search;
      if (extra.items.length) combined.push(...extra.items);
    } catch(error) {
      console.warn("[PoE2TC Collector] API expansion failed; keeping DOM results",error);
      window.__POE2TC_API_EXPANSION_ERROR=String(error?.message||error);
    }
    const selected=selectTop(combined);
    return {
      protocol:"poe2-trade-copilot/results-v5",
      version:"0.5.1+collector3.2",
      capturedAt:new Date().toISOString(),
      sourceUrl:location.href,
      matchedResults:search?.total ?? null,
      searchResultIds:search?.result?.length ?? null,
      capturedResults:selected.captured,
      returnedResults:selected.listings.length,
      resultLimit:TOP_N,
      sort:selected.sort,
      apiExpanded:combined.length>dom.length,
      domResults:dom.length,
      listings:selected.listings
    };
  }

  async function copyAllResults() {
    try {
      status(`Scanning up to top ${TOP_N} results…`);
      const packet=await buildPacket();
      const text=JSON.stringify(packet);
      const ok=await copyText(text);
      status(ok ? `Copied ${packet.returnedResults} result(s) · ${packet.sort}.` : `Clipboard blocked. Use SAVE TO GITHUB.`);
    } catch(error) {
      console.error("[PoE2TC Collector]",error);
      status(`Collector failed: ${error.message}`);
    }
  }

  document.addEventListener("poe2tc:request-results", async () => {
    try {
      status(`Preparing up to top ${TOP_N} for GitHub…`);
      const packet=await buildPacket();
      document.dispatchEvent(new CustomEvent("poe2tc:results-ready", {detail:JSON.stringify(packet)}));
    } catch(error) {
      document.dispatchEvent(new CustomEvent("poe2tc:results-error", {detail:String(error?.message||error)}));
    }
  });

  window.__POE2TC_BUILD_RESULTS = buildPacket;

  function syncTopNLabels() {
    const copy=$("#ptc-results");
    if(copy) copy.textContent=`COPY TOP ${TOP_N} RESULTS`;
    const save=$("#ptc-save-github");
    if(save) save.textContent=`SAVE TOP ${TOP_N} TO GITHUB`;
  }

  function install() {
    const button=$("#ptc-results");
    if(!button){setTimeout(install,250);return;}
    button.onclick=copyAllResults;
    button.dataset.collectorPatch=PATCH_VERSION;
    syncTopNLabels();
    setTimeout(syncTopNLabels,500);
    setTimeout(syncTopNLabels,1500);
    console.log(`[PoE2TC Collector] ${PATCH_VERSION} installed.`);
  }

  install();
})();


/* ===== patches/search-source.v1.js@main ===== */
(() => {
  "use strict";

  const PATCH_VERSION = "search-source-1.22";
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

    const stale=$("#ptc-minimize");
    if(stale && stale.dataset.ptcPanelToggle==="panel-toggle-1.1") return true;
    if(stale) stale.remove();

    const button=document.createElement("button");
    button.id="ptc-minimize";
    button.type="button";
    button.dataset.ptcPanelToggle="panel-toggle-1.1";
    button.setAttribute("aria-label","Minimize PoE2 Trade Copilot");

    Object.assign(button.style,{
      position:"absolute",
      top:"6px",
      right:"7px",
      width:"34px",
      height:"34px",
      padding:"0",
      margin:"0",
      border:"1px solid #526071",
      borderRadius:"8px",
      background:"#26313e",
      color:"#fff",
      fontSize:"22px",
      fontWeight:"700",
      lineHeight:"30px",
      zIndex:"2147483647",
      cursor:"pointer",
      touchAction:"manipulation",
      pointerEvents:"auto",
      WebkitTapHighlightColor:"transparent"
    });

    if(getComputedStyle(panel).position==="static") panel.style.position="fixed";
    panel.style.pointerEvents="auto";

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
        if(minimized){
          if(child.dataset.ptcPrevDisplay==null) child.dataset.ptcPrevDisplay=child.style.display||"";
          child.style.display="none";
        }else{
          child.style.display=child.dataset.ptcPrevDisplay??"";
          delete child.dataset.ptcPrevDisplay;
        }
      }

      if(minimized){
        panel.style.width="48px";
        panel.style.minWidth="48px";
        panel.style.height="48px";
        panel.style.minHeight="48px";
        panel.style.padding="0";
        panel.style.overflow="visible";
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

    let lastPointerUp=0;
    const toggle=event=>{
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      minimized=!minimized;
      apply();
    };

    button.addEventListener("pointerup",event=>{
      lastPointerUp=Date.now();
      toggle(event);
    },true);
    button.addEventListener("click",event=>{
      if(Date.now()-lastPointerUp<700){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }
      toggle(event);
    },true);

    panel.appendChild(button);
    apply();
    window.__POE2TC_PANEL_MINIMIZE={version:"panel-toggle-1.1",installed:true};
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


/* ===== patches/github-load-run.v1.js@main ===== */
(() => {
  "use strict";

  const VERSION = "github-load-run-1.9";
  const $ = (s, r = document) => r.querySelector(s);

  function status(text) {
    const el = $("#ptc-status");
    if (el) el.textContent = text;
    console.log("[PoE2TC GitHub Load+Run]", text);
  }

  function decodeBase64Utf8(base64) {
    const clean=String(base64||"").replace(/\s+/g,"");
    const binary=atob(clean);
    const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function refreshGroupedStatModuleIfNeeded(packet) {
    const groups=Array.isArray(packet?.statGroups)?packet.statGroups:[];
    if(!groups.length) return {ok:true,skipped:true};

    const current=window.__POE2TC_STAT_GROUPS_MODULE?.implementationVersion||"";
    if(current==="stat-groups-2.5") return {ok:true,skipped:true,current};

    status("Refreshing grouped-stat module from GitHub…");
    const url="https://api.github.com/repos/toaster-vip/poe2-trade-copilot/contents/patches/stat-groups.v1.js?ref=main&t="+Date.now();
    const response=await fetch(url,{
      cache:"no-store",
      credentials:"omit",
      headers:{"Accept":"application/vnd.github+json"}
    });
    if(!response.ok) throw new Error("stat-groups GitHub HTTP "+response.status);
    const payload=await response.json();
    if(!payload?.content) throw new Error("stat-groups GitHub response missing content");
    const code=decodeBase64Utf8(payload.content);
    (0,eval)(code+"\n//# sourceURL=poe2tc-stat-groups-refresh.js");

    const loaded=window.__POE2TC_STAT_GROUPS_MODULE?.implementationVersion||"";
    if(loaded!=="stat-groups-2.5") throw new Error("latest grouped-stat module did not activate");
    return {ok:true,skipped:false,current,loaded,sha:payload.sha||null};
  }

  function install() {
    const loadButton = $("#ptc-load-github");
    const runButton = $("#ptc-run");
    if (!loadButton || !runButton) return setTimeout(install, 250);
    if (loadButton.dataset.autoRun === VERSION) return;

    // Remove the original search-source click handler by cloning the button.
    const button = loadButton.cloneNode(true);
    loadButton.replaceWith(button);
    button.dataset.autoRun = VERSION;
    button.textContent = "LOAD + RUN FROM GITHUB";

    button.addEventListener("click", async () => {
      if (button.dataset.running === "1") return;
      button.dataset.running = "1";
      button.disabled = true;
      let packet = null;
      try {
        const loader = window.__POE2TC_LOAD_SEARCH_FROM_GITHUB;
        if (typeof loader !== "function") throw new Error("GitHub loader is not ready");
        packet = await loader();
        window.__POE2TC_LAST_DEBUG = {
          ok:false,
          stage:"github-load-run",
          version:VERSION,
          packet,
          note:"Packet loaded; runtime verification pending"
        };

        if (packet?.discoverStat) {
          const discover = window.__POE2TC_DISCOVER_STAT_FROM_PACKET;
          if (typeof discover !== "function") throw new Error("Stat discovery module is not ready");
          status(`Loaded discovery packet · ${packet.discoverStat} · running…`);
          await discover(String(packet.discoverStat));
          return;
        }

        const runtime={
          directApi:runButton.dataset.directApiBridge||"",
          statBridge:runButton.dataset.statBridge||"",
          runWrapper:runButton.dataset.runWrapper||""
        };
        const expected={
          directApi:"direct-api-1.3",
          statBridge:"search-source-1.22",
          runWrapper:"run-wrapper-3.2"
        };
        window.__POE2TC_LAST_DEBUG = {
          ok:false,
          stage:"github-load-run",
          version:VERSION,
          packet,
          runtime,
          expected,
          note:"Packet loaded; checking runtime versions"
        };
        const stale=Object.keys(expected).filter(key=>runtime[key]!==expected[key]);
        if(stale.length){
          throw new Error("runtime patches are stale ("+
            stale.map(key=>key+"="+(runtime[key]||"missing")+" expected "+expected[key]).join(", ")+
            "). Reload the Trade page once.");
        }

        await refreshGroupedStatModuleIfNeeded(packet);

        if (packet?.apiSearch) {
          const direct = window.__POE2TC_RUN_DIRECT_API_PACKET;
          if (typeof direct !== "function") throw new Error("Direct API runner is not ready");
          status("Loaded direct API packet · running…");
          window.__POE2TC_LAST_DEBUG = {
            ok:false,
            stage:"github-load-run",
            version:VERSION,
            packet,
            runtime,
            expected,
            note:"Direct API handoff started"
          };
          await direct(packet);
          return;
        }

        const fields = Array.isArray(packet?.fields) ? packet.fields : [];
        const summary = fields.map(x => {
          const range = [x.min != null ? `>=${x.min}` : "", x.max != null ? `<=${x.max}` : ""].filter(Boolean).join(" ");
          return `${x.label} ${range}`.trim();
        }).join(" · ");
        status(`Loaded fresh packet · ${summary || "ready"} · running…`);
        await new Promise(r => setTimeout(r, 150));
        runButton.click();
      } catch (error) {
        console.error("[PoE2TC GitHub Load+Run]", error);
        if (!packet) {
          try { packet = JSON.parse($("#ptc-box")?.value || "null"); } catch {}
        }
        window.__POE2TC_LAST_DEBUG = {
          ok:false,
          stage:"github-load-run",
          version:VERSION,
          packet,
          error:String(error?.message || error)
        };
        status(`GitHub search load failed: ${error.message}`);
      } finally {
        button.dataset.running = "0";
        button.disabled = false;
      }
    });

    console.log(`[PoE2TC GitHub Load+Run] ${VERSION} installed.`);
  }

  install();
})();


/* ===== patches/panel-minimize.v1.js@main ===== */
(() => {
  "use strict";

  const VERSION = "panel-minimize-1.1";
  const $ = (s, r = document) => r.querySelector(s);

  function install() {
    const panel = $("#ptc");
    if (!panel) return setTimeout(install, 250);

    const existing = $("#ptc-minimize");
    if (existing?.dataset?.ptcPanelToggle === "panel-toggle-1.1") return;
    if (existing) existing.remove();

    const button = document.createElement("button");
    button.id = "ptc-minimize";
    button.type = "button";
    button.dataset.ptcPanelToggle = "panel-toggle-1.1";
    Object.assign(button.style, {
      position: "absolute",
      top: "6px",
      right: "7px",
      width: "34px",
      height: "34px",
      padding: "0",
      margin: "0",
      border: "1px solid #526071",
      borderRadius: "8px",
      background: "#26313e",
      color: "#fff",
      fontSize: "22px",
      fontWeight: "700",
      lineHeight: "30px",
      zIndex: "2147483647",
      cursor: "pointer",
      touchAction: "manipulation",
      pointerEvents: "auto",
      WebkitTapHighlightColor: "transparent"
    });

    const original = {
      width: panel.style.width || "",
      minWidth: panel.style.minWidth || "",
      height: panel.style.height || "",
      minHeight: panel.style.minHeight || "",
      padding: panel.style.padding || "",
      overflow: panel.style.overflow || ""
    };

    let minimized = false;
    try { minimized = localStorage.getItem("poe2tc-panel-minimized") === "1"; } catch {}

    const apply = () => {
      for (const child of [...panel.children]) {
        if (child === button) continue;
        if (minimized) {
          if (child.dataset.ptcPrevDisplay == null) child.dataset.ptcPrevDisplay = child.style.display || "";
          child.style.display = "none";
        } else {
          child.style.display = child.dataset.ptcPrevDisplay ?? "";
          delete child.dataset.ptcPrevDisplay;
        }
      }

      if (minimized) {
        panel.style.width = "48px";
        panel.style.minWidth = "48px";
        panel.style.height = "48px";
        panel.style.minHeight = "48px";
        panel.style.padding = "0";
        panel.style.overflow = "visible";
        button.textContent = "+";
        button.title = "Restore PoE2 Trade Copilot";
        button.setAttribute("aria-label", "Restore PoE2 Trade Copilot");
      } else {
        panel.style.width = original.width;
        panel.style.minWidth = original.minWidth;
        panel.style.height = original.height;
        panel.style.minHeight = original.minHeight;
        panel.style.padding = original.padding;
        panel.style.overflow = original.overflow;
        button.textContent = "−";
        button.title = "Minimize PoE2 Trade Copilot";
        button.setAttribute("aria-label", "Minimize PoE2 Trade Copilot");
      }

      try { localStorage.setItem("poe2tc-panel-minimized", minimized ? "1" : "0"); } catch {}
    };

    let lastPointerUp = 0;
    const toggle = event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      minimized = !minimized;
      apply();
    };

    button.addEventListener("pointerup", event => {
      lastPointerUp = Date.now();
      toggle(event);
    }, true);
    button.addEventListener("click", event => {
      if (Date.now() - lastPointerUp < 700) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }
      toggle(event);
    }, true);

    panel.appendChild(button);
    apply();
    console.log("[PoE2TC Panel] " + VERSION + " installed.");
  }

  install();
})();


/* ===== patches/stat-discovery.v1.js@main ===== */
(() => {
  "use strict";
  const VERSION = "stat-discovery-1.5";
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
