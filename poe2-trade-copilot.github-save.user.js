// ==UserScript==
// @name         PoE2 Trade Copilot GitHub Save
// @namespace    chatgpt-poe2-trade
// @version      1.2.0
// @description  Saves PoE2 Trade Copilot result packets to GitHub without touching PoE Vue state
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @connect      api.github.com
// ==/UserScript==

(() => {
  "use strict";

  const VERSION="1.2.0";
  const OWNER="toaster-vip";
  const REPO="poe2-trade-copilot";
  const BRANCH="main";
  const LATEST_PATH="data/latest-results.json";
  const TOKEN_KEY="poe2tc.github.token";
  const $=s=>document.querySelector(s);

  function status(text){
    const el=$("#ptc-status");
    if(el) el.textContent=text;
    console.log("[PoE2TC GitHub Save]",text);
  }

  async function getToken(){ return String((await GM.getValue(TOKEN_KEY,""))||"").trim(); }
  async function setToken(token){ await GM.setValue(TOKEN_KEY,String(token||"").trim()); }

  function githubRequest({method="GET",url,token,body}){
    return new Promise((resolve,reject)=>{
      GM.xmlHttpRequest({
        method,url,
        headers:{
          Accept:"application/vnd.github+json",
          Authorization:`Bearer ${token}`,
          "X-GitHub-Api-Version":"2022-11-28",
          ...(body?{"Content-Type":"application/json"}:{})
        },
        data:body?JSON.stringify(body):undefined,
        timeout:30000,
        onload:r=>{
          let json=null;
          try{json=r.responseText?JSON.parse(r.responseText):null}catch{}
          if(r.status>=200&&r.status<300) resolve({status:r.status,json});
          else reject(new Error(`GitHub HTTP ${r.status}: ${json?.message||r.responseText||"request failed"}`));
        },
        onerror:()=>reject(new Error("GitHub network request failed")),
        ontimeout:()=>reject(new Error("GitHub request timed out"))
      });
    });
  }

  function base64Utf8(text){
    const bytes=new TextEncoder().encode(text);
    let binary="";
    for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    return btoa(binary);
  }

  async function existingSha(token){
    const url=`https://api.github.com/repos/${OWNER}/${REPO}/contents/${LATEST_PATH}?ref=${BRANCH}`;
    try{return (await githubRequest({url,token})).json?.sha||null}
    catch(e){if(/HTTP 404/.test(e.message))return null;throw e;}
  }

  async function uploadPacket(packet){
    const token=await getToken();
    if(!token) throw new Error("TOKEN_NOT_SET");
    const sha=await existingSha(token);
    const url=`https://api.github.com/repos/${OWNER}/${REPO}/contents/${LATEST_PATH}`;
    return githubRequest({
      method:"PUT",url,token,
      body:{
        message:`Update latest trade results (${packet.listings.length} listings)`,
        content:base64Utf8(JSON.stringify(packet,null,2)+"\n"),
        branch:BRANCH,
        ...(sha?{sha}:{})
      }
    });
  }

  function requestPacket(){
    return new Promise((resolve,reject)=>{
      let done=false;
      const cleanup=()=>{
        document.removeEventListener("poe2tc:results-ready",onReady);
        document.removeEventListener("poe2tc:results-error",onError);
      };
      const finish=(fn,value)=>{if(done)return;done=true;cleanup();fn(value);};
      const onReady=e=>{
        try{finish(resolve,JSON.parse(String(e.detail||"")));}
        catch(err){finish(reject,new Error("Result bridge returned invalid JSON"));}
      };
      const onError=e=>finish(reject,new Error(String(e.detail||"Collector error")));
      document.addEventListener("poe2tc:results-ready",onReady);
      document.addEventListener("poe2tc:results-error",onError);
      document.dispatchEvent(new CustomEvent("poe2tc:request-results"));
      setTimeout(()=>finish(reject,new Error("Result collector bridge timed out")),90000);
    });
  }

  async function saveToGitHub(){
    try{
      if(!(await getToken())){status("GitHub token not set. Tap SET GITHUB TOKEN.");return;}
      status("Collecting all results for GitHub…");
      const packet=await requestPacket();
      if(!packet || !Array.isArray(packet.listings)) throw new Error("Invalid result packet");
      status(`Uploading ${packet.listings.length} result(s) to GitHub…`);
      const result=await uploadPacket(packet);
      const sha=result.json?.commit?.sha||"";
      status(`Saved ${packet.listings.length} result(s) to GitHub${sha?` · ${sha.slice(0,7)}`:""}.`);
    }catch(error){
      console.error("[PoE2TC GitHub Save]",error);
      status(error.message==="TOKEN_NOT_SET"?"GitHub token not set.":`GitHub save failed: ${error.message}`);
    }
  }

  function install(){
    const results=$("#ptc-results");
    if(!results){setTimeout(install,300);return;}
    const grid=results.parentElement;
    if(!grid){setTimeout(install,300);return;}

    if(!$("#ptc-save-github")){
      const save=document.createElement("button");
      save.id="ptc-save-github";
      save.type="button";
      save.textContent="SAVE TO GITHUB";
      save.setAttribute("style",results.getAttribute("style")||"");
      save.style.cssText += ";padding:9px;background:#26313e;color:#fff;border:1px solid #526071;border-radius:7px;font-weight:600;";
      save.onclick=saveToGitHub;
      grid.appendChild(save);
    }

    if(!$("#ptc-token")){
      const tokenButton=document.createElement("button");
      tokenButton.id="ptc-token";
      tokenButton.type="button";
      tokenButton.textContent="SET GITHUB TOKEN";
      tokenButton.setAttribute("style",results.getAttribute("style")||"");
      tokenButton.style.cssText += ";padding:9px;background:#26313e;color:#fff;border:1px solid #526071;border-radius:7px;font-weight:600;";
      tokenButton.onclick=async()=>{
        const entered=window.prompt("Paste the fine-grained GitHub token for toaster-vip/poe2-trade-copilot (Contents: Read and write). It stays in this saver script's local Userscripts storage.","");
        if(entered==null)return;
        const token=String(entered).trim();
        await setToken(token);
        status(token?"GitHub token saved in saver script.":"GitHub token cleared.");
      };
      grid.appendChild(tokenButton);
    }

    console.log(`[PoE2TC GitHub Save] ${VERSION} companion installed.`);
  }

  install();
})();
