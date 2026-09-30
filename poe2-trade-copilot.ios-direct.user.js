// ==UserScript==
// @name         PoE2 Trade Copilot iOS Direct
// @namespace    chatgpt-poe2-trade
// @version      0.1.0
// @description  Standalone iOS direct search runner for PoE2 Trade Copilot
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @updateURL    https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/poe2-trade-copilot.ios-direct.user.js
// @downloadURL  https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/poe2-trade-copilot.ios-direct.user.js
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const VERSION="ios-direct-0.1.0";
  const PACKET_URL="https://raw.githubusercontent.com/toaster-vip/poe2-trade-copilot/main/data/latest-search.json";
  const norm=s=>String(s||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim().toLowerCase();

  function installButton(){
    if(document.querySelector("#poe2tc-ios-direct")) return;
    const b=document.createElement("button");
    b.id="poe2tc-ios-direct";
    b.type="button";
    b.textContent="iOS DIRECT";
    Object.assign(b.style,{
      position:"fixed",right:"12px",bottom:"90px",zIndex:"2147483647",
      padding:"12px 16px",borderRadius:"10px",border:"1px solid #6b7b8c",
      background:"#173a2b",color:"#fff",fontSize:"14px",fontWeight:"700"
    });
    b.addEventListener("click",()=>run(b));
    document.body.appendChild(b);
    window.__POE2TC_IOS_DIRECT={version:VERSION,installed:true};
  }

  async function loadPacket(){
    const r=await fetch(PACKET_URL+"?t="+Date.now(),{cache:"no-store",credentials:"omit"});
    if(!r.ok) throw new Error("latest-search HTTP "+r.status);
    return await r.json();
  }

  function leagueFrom(packet){
    if(packet?.apiSearch?.league) return String(packet.apiSearch.league);
    const parts=location.pathname.split("/").filter(Boolean);
    const i=parts.findIndex(x=>x==="poe2");
    return i>=0&&parts[i+1]?decodeURIComponent(parts[i+1]):"";
  }

  async function officialIndex(){
    const r=await fetch("/api/trade2/data/stats",{cache:"no-store",credentials:"same-origin"});
    if(!r.ok) throw new Error("stats HTTP "+r.status);
    const j=await r.json();
    const index=new Map();
    for(const group of j?.result||[]) for(const e of group?.entries||[]) if(e?.id) index.set(String(e.id),e);
    return index;
  }

  function resolveStat(filter,index){
    let id=String(filter?.id||"");
    let live=id?index.get(id):null;
    if(!id){
      const wanted=norm(filter?.text||"");
      const matches=[...index.entries()].filter(([,e])=>norm(e?.text)===wanted);
      const explicit=matches.filter(([candidateId])=>String(candidateId).startsWith("explicit.stat_"));
      const chosen=explicit.length===1?explicit:(matches.length===1?matches:[]);
      if(chosen.length!==1){
        throw new Error("stat text not unique: "+String(filter?.text||"")+" explicit="+explicit.map(([x])=>x).join(",")+" matches="+matches.map(([x])=>x).join(","));
      }
      id=String(chosen[0][0]); live=chosen[0][1];
    }
    if(!live) throw new Error("missing stat: "+id);
    if(filter?.text && norm(live.text)!==norm(filter.text)) throw new Error("stat text mismatch: "+filter.text+" != "+live.text);
    const value={};
    if(filter?.min!=null) value.min=Number(filter.min);
    if(filter?.max!=null) value.max=Number(filter.max);
    if(filter?.weight!=null) value.weight=Number(filter.weight);
    return {id,...(Object.keys(value).length?{value}:{}),disabled:filter?.disabled===true};
  }

  function buildQuery(spec,index){
    const filters={};
    if(spec?.category||spec?.rarity){
      filters.type_filters={filters:{}};
      if(spec.category) filters.type_filters.filters.category={option:String(spec.category)};
      if(spec.rarity) filters.type_filters.filters.rarity={option:String(spec.rarity)};
    }
    if(spec?.price){
      const p={};
      if(spec.price.option) p.option=String(spec.price.option);
      if(spec.price.min!=null) p.min=Number(spec.price.min);
      if(spec.price.max!=null) p.max=Number(spec.price.max);
      filters.trade_filters={filters:{price:p}};
    }
    const stats=(Array.isArray(spec?.statGroups)?spec.statGroups:[]).map(g=>{
      const out={
        type:String(g?.type||"and"),
        filters:(Array.isArray(g?.filters)?g.filters:[]).map(f=>resolveStat(f,index)),
        disabled:g?.disabled===true
      };
      if(["count","weight","weight2"].includes(out.type)){
        const v={};
        if(g?.min!=null) v.min=Number(g.min);
        if(g?.max!=null) v.max=Number(g.max);
        out.value=v;
      }
      return out;
    });
    return {
      status:{option:String(spec?.status||"securable")},
      ...(spec?.name?{name:String(spec.name)}:{}),
      ...(spec?.type?{type:String(spec.type)}:{}),
      stats,filters
    };
  }

  async function run(button){
    const original=button.textContent;
    button.disabled=true;
    try{
      button.textContent="LOADING…";
      const packet=await loadPacket();
      if(!packet?.apiSearch) throw new Error("latest-search has no apiSearch");
      const league=leagueFrom(packet);
      if(!league) throw new Error("league missing");
      const index=await officialIndex();
      const query=buildQuery(packet.apiSearch,index);
      const body={query,sort:{price:"asc"}};
      window.__POE2TC_IOS_DIRECT_DEBUG={version:VERSION,packet,body};
      button.textContent="SEARCHING…";
      const r=await fetch("/api/trade2/search/poe2/"+encodeURIComponent(league),{
        method:"POST",credentials:"same-origin",
        headers:{"Accept":"application/json","Content-Type":"application/json"},
        body:JSON.stringify(body)
      });
      const text=await r.text();
      let j=null; try{j=JSON.parse(text);}catch{}
      window.__POE2TC_IOS_DIRECT_DEBUG={version:VERSION,packet,body,httpStatus:r.status,response:j||text.slice(0,1200)};
      if(!r.ok) throw new Error("trade HTTP "+r.status+": "+(j?.error?.message||text.slice(0,240)));
      if(!j?.id) throw new Error("search response missing id");
      button.textContent=(j.total!=null?String(j.total)+" MATCH":"OPEN");
      setTimeout(()=>location.assign("/trade2/search/poe2/"+encodeURIComponent(league)+"/"+encodeURIComponent(j.id)),350);
    }catch(e){
      console.error("[PoE2TC iOS Direct]",e);
      button.textContent="ERROR";
      alert("PoE2 iOS Direct "+VERSION+"\n"+String(e?.message||e));
    }finally{
      setTimeout(()=>{button.disabled=false;button.textContent=original;},2500);
    }
  }

  if(document.body) installButton();
  else addEventListener("DOMContentLoaded",installButton,{once:true});
})();