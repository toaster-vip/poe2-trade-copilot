(() => {
  "use strict";

  const PATCH_VERSION = "collector-3.1";
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

  function requirementText(item) {
    const reqs = Array.isArray(item?.requirements) ? item.requirements : [];
    if (!reqs.length) return null;
    return reqs.map(r => {
      const value = r?.values?.[0]?.[0];
      return value != null ? `${value} ${r?.name || ""}`.trim() : null;
    }).filter(Boolean).join(", ") || null;
  }

  function allApiMods(item) {
    const fields = [
      "enchantMods","implicitMods","explicitMods","craftedMods",
      "fracturedMods","runeMods","sanctumMods","scourgeMods"
    ];
    const out = [];
    for (const field of fields) {
      const xs = item?.[field];
      if (Array.isArray(xs)) out.push(...xs.map(String));
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
      energyShield:propNumber(item,"Energy Shield"),
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
      version:"0.5.1+collector3.1",
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
