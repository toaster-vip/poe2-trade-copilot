(() => {
  "use strict";

  const PATCH_VERSION = "collector-1";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

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
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}

    const ta = document.createElement("textarea");
    ta.value = text;
    Object.assign(ta.style, { position: "fixed", left: "-9999px", top: "-9999px" });
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }

  function cardElements() {
    const selectors = [
      ".resultset .row",
      ".search-results .row",
      ".result-row",
      ".result",
      "[data-id]"
    ];

    const out = [];
    for (const selector of selectors) {
      for (const el of $$(selector)) {
        const text = el.innerText || "";
        if (
          text.length > 100 &&
          (/Asking Price/i.test(text) || /~b\/o/i.test(text))
        ) {
          out.push(el);
        }
      }
    }
    return [...new Set(out)];
  }

  function num(text, re) {
    const m = text.match(re);
    return m ? Number(String(m[1]).replace(/,/g, "")) : null;
  }

  function parsePrice(text) {
    let m = text.match(/Asking Price\s*:?\s*[\r\n ]*([0-9.,]+)\s*[×x]?\s*(Divine Orb|Exalted Orb|Regal Orb|Chaos Orb)/i);
    if (m) {
      return { amount: Number(m[1].replace(/,/g, "")), currency: m[2] };
    }

    m = text.match(/~b\/o\s+([0-9.,]+)\s+(divine|exalted|regal|chaos)/i);
    if (!m) return null;

    return {
      amount: Number(m[1].replace(/,/g, "")),
      currency: m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() + " Orb"
    };
  }

  function identifyItem(lines) {
    const clean = lines.filter(x => !/^Verified$/i.test(x));
    const classes = [
      "Bow", "Crossbow", "Two Hand Mace", "One Hand Mace", "Two Hand Axe", "One Hand Axe",
      "Two Hand Sword", "One Hand Sword", "Body Armour", "Helmet", "Gloves", "Boots", "Ring",
      "Amulet", "Belt", "Jewel", "Quiver", "Quarterstaff", "Kalguuran Quarterstaff", "Staff",
      "Wand", "Sceptre", "Shield"
    ];

    const index = clean.findIndex(x => classes.some(c => norm(c) === norm(x)));
    if (index >= 2) {
      return { name: clean[index - 2], baseType: clean[index - 1], itemClass: clean[index] };
    }

    return { name: clean[0] || null, baseType: clean[1] || null, itemClass: clean[2] || null };
  }

  function parseCard(card) {
    const text = String(card.innerText || "").replace(/\u00a0/g, " ").trim();
    const lines = text.split("\n").map(x => x.trim()).filter(Boolean);
    const id = identifyItem(lines);
    const seller = text.match(/([^\s\n]+#[0-9]+)\s+listed\s+([^\n]+)/i);
    const phys = text.match(/Physical Damage:\s*([0-9]+)\s*[-–]\s*([0-9]+)/i);

    const mods = lines.filter(line => {
      if (line === id.name || line === id.baseType || line === id.itemClass) return false;
      if (/^Verified$/i.test(line)) return false;
      if (/^(Quality|Physical Damage|Cold Damage|Fire Damage|Lightning Damage|Chaos Damage|Critical Hit Chance|Attacks per Second|Item Level|Requires|DPS|Physical DPS|Elemental DPS|Asking Price|Fee):?/i.test(line)) return false;
      if (/^~b\/o/i.test(line)) return false;
      if (/^[0-9.,]+×.*Orb$/i.test(line)) return false;
      if (/\slisted\s/i.test(line)) return false;
      if (/^Travel to Hideout$/i.test(line)) return false;
      if (/^Ignore Player$/i.test(line)) return false;
      return true;
    });

    return {
      name: id.name,
      baseType: id.baseType,
      itemClass: id.itemClass,
      itemLevel: num(text, /Item Level:\s*([0-9]+)/i),
      quality: num(text, /Quality:\s*\+?([0-9]+)%/i),
      requirements: text.match(/Requires:\s*([^\n]+)/i)?.[1] || null,
      physicalDamage: phys ? [Number(phys[1]), Number(phys[2])] : null,
      criticalChance: num(text, /Critical Hit Chance:\s*([0-9.]+)%/i),
      attacksPerSecond: num(text, /Attacks per Second:\s*([0-9.]+)/i),
      physicalDps: num(text, /Physical DPS\s*:?\s*([0-9.]+)/i),
      elementalDps: num(text, /Elemental DPS\s*:?\s*([0-9.]+)/i),
      totalDps: num(text, /(?:^|\n)DPS\s*:?\s*([0-9.]+)/im),
      price: parsePrice(text),
      seller: seller?.[1] || null,
      listedAgo: seller?.[2]?.trim() || null,
      corrupted: /\bCorrupted\b/i.test(text),
      sanctified: /\bSanctified\b/i.test(text),
      additionalArrow: /fire an additional arrow/i.test(text),
      manaLeech: num(text, /Leeches\s+([0-9.]+)%\s+of Physical Damage as Mana/i) || 0,
      lifeLeech: num(text, /Leeches\s+([0-9.]+)%\s+of Physical Damage as Life/i) || 0,
      attackSkillLevels: num(text, /\+([0-9]+)\s+to Level of all Attack Skills/i) || 0,
      projectileSkillLevels: num(text, /\+([0-9]+)\s+to Level of all Projectile Skills/i) || 0,
      attackCostEfficiency: num(text, /([0-9.]+)%\s+increased Cost Efficiency of Attacks/i) || 0,
      mods
    };
  }

  function keyFor(item) {
    return JSON.stringify([
      item.name,
      item.baseType,
      item.seller,
      item.price,
      item.physicalDps,
      item.criticalChance,
      item.attacksPerSecond
    ]);
  }

  function collectCurrent(map) {
    for (const card of cardElements()) {
      const item = parseCard(card);
      map.set(keyFor(item), item);
    }
  }

  function findScrollContainer() {
    const result = $(".resultset") || $(".search-results");
    if (!result) return null;

    let el = result;
    while (el && el !== document.body) {
      const style = getComputedStyle(el);
      const y = style.overflowY;
      if ((y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight + 20) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  async function collectAllResults() {
    const map = new Map();
    const container = findScrollContainer();

    const getPos = () => container ? container.scrollTop : window.scrollY;
    const getMax = () => container
      ? Math.max(0, container.scrollHeight - container.clientHeight)
      : Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const setPos = y => {
      if (container) container.scrollTop = y;
      else window.scrollTo(0, y);
    };
    const stepSize = () => container
      ? Math.max(300, Math.floor(container.clientHeight * 0.7))
      : Math.max(400, Math.floor(window.innerHeight * 0.7));

    const original = getPos();
    setPos(0);
    await sleep(250);

    let lastCount = -1;
    let stagnant = 0;
    let rounds = 0;

    while (rounds < 120) {
      rounds++;
      collectCurrent(map);
      status(`Collecting results… ${map.size} captured`);

      const max = getMax();
      const pos = getPos();

      if (map.size === lastCount) stagnant++;
      else stagnant = 0;
      lastCount = map.size;

      if (pos >= max - 5) {
        collectCurrent(map);
        if (stagnant >= 3) break;
        await sleep(500);
        collectCurrent(map);
        if (getMax() <= max + 5) break;
      }

      setPos(Math.min(max, pos + stepSize()));
      await sleep(300);
    }

    setPos(original);
    await sleep(100);
    return [...map.values()];
  }

  async function copyAllResults() {
    try {
      status("Scanning all rendered result pages…");
      const listings = await collectAllResults();

      const packet = {
        protocol: "poe2-trade-copilot/results-v5",
        version: "0.5.1+collector1",
        capturedAt: new Date().toISOString(),
        sourceUrl: location.href,
        visibleResults: listings.length,
        listings
      };

      const ok = await copyText(JSON.stringify(packet));
      status(ok ? `Copied ${listings.length} result(s).` : "Copy Results failed.");
    } catch (error) {
      console.error("[PoE2TC Collector]", error);
      status(`Collector failed: ${error.message}`);
    }
  }

  function install() {
    const button = $("#ptc-results");
    if (!button) {
      setTimeout(install, 250);
      return;
    }

    button.onclick = copyAllResults;
    button.textContent = "COPY ALL RESULTS";
    button.dataset.collectorPatch = PATCH_VERSION;

    const panel = $("#ptc");
    if (panel && !$("#ptc-collector-badge")) {
      const badge = document.createElement("div");
      badge.id = "ptc-collector-badge";
      badge.textContent = "collector1";
      Object.assign(badge.style, { fontSize: "10px", opacity: ".55", marginTop: "4px" });
      panel.appendChild(badge);
    }

    console.log("[PoE2TC Collector] Result collector patch installed.");
  }

  install();
})();
