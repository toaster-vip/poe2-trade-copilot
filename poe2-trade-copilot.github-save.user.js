// ==UserScript==
// @name         PoE2 Trade Copilot GitHub Save
// @namespace    chatgpt-poe2-trade
// @version      1.0.0
// @description  Collects all visible PoE2 trade results and saves them directly to this project's GitHub repo
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @connect      api.github.com
// ==/UserScript==

(() => {
  "use strict";

  const VERSION = "1.0.0";
  const OWNER = "toaster-vip";
  const REPO = "poe2-trade-copilot";
  const BRANCH = "main";
  const LATEST_PATH = "data/latest-results.json";
  const TOKEN_KEY = "poe2tc.github.token";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = s => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  function status(text) {
    const el = $("#ptc-status");
    if (el) el.textContent = text;
    console.log("[PoE2TC GitHub Save]", text);
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

  function parsePrice(text) {
    let m = text.match(/Asking Price\s*:?\s*[\r\n ]*([0-9.,]+)\s*[×x]?\s*(Divine Orb|Exalted Orb|Regal Orb|Chaos Orb)/i);
    if (m) return { amount: Number(m[1].replace(/,/g, "")), currency: m[2] };
    m = text.match(/~b\/o\s+([0-9.,]+)\s+(divine|exalted|regal|chaos)/i);
    if (!m) return null;
    return { amount: Number(m[1].replace(/,/g, "")), currency: m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() + " Orb" };
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
    if (index >= 2) return { name: clean[index - 2], baseType: clean[index - 1], itemClass: clean[index] };
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
    return JSON.stringify([item.name, item.baseType, item.seller, item.price, item.physicalDps, item.criticalChance, item.attacksPerSecond]);
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
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 20) return el;
      el = el.parentElement;
    }
    return null;
  }

  async function collectAllResults() {
    const map = new Map();
    const container = findScrollContainer();
    const getPos = () => container ? container.scrollTop : window.scrollY;
    const getMax = () => container ? Math.max(0, container.scrollHeight - container.clientHeight) : Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const setPos = y => { if (container) container.scrollTop = y; else window.scrollTo(0, y); };
    const stepSize = () => container ? Math.max(300, Math.floor(container.clientHeight * 0.7)) : Math.max(400, Math.floor(window.innerHeight * 0.7));
    const original = getPos();

    setPos(0);
    await sleep(300);
    let lastCount = -1;
    let stagnant = 0;

    for (let rounds = 0; rounds < 150; rounds++) {
      collectCurrent(map);
      status(`Collecting… ${map.size} captured`);
      const max = getMax();
      const pos = getPos();
      if (map.size === lastCount) stagnant++; else stagnant = 0;
      lastCount = map.size;

      if (pos >= max - 5) {
        await sleep(600);
        collectCurrent(map);
        const max2 = getMax();
        if (stagnant >= 3 && max2 <= max + 5) break;
      }

      setPos(Math.min(getMax(), pos + stepSize()));
      await sleep(350);
    }

    setPos(original);
    await sleep(100);
    return [...map.values()];
  }

  async function getToken() {
    return String((await GM.getValue(TOKEN_KEY, "")) || "").trim();
  }

  async function setToken(token) {
    await GM.setValue(TOKEN_KEY, String(token || "").trim());
  }

  function githubRequest({ method = "GET", url, token, body }) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method,
        url,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        data: body ? JSON.stringify(body) : undefined,
        timeout: 30000,
        onload: response => {
          let json = null;
          try { json = response.responseText ? JSON.parse(response.responseText) : null; } catch {}
          if (response.status >= 200 && response.status < 300) resolve({ status: response.status, json });
          else reject(new Error(`GitHub HTTP ${response.status}: ${json?.message || response.responseText || "request failed"}`));
        },
        onerror: () => reject(new Error("GitHub network request failed")),
        ontimeout: () => reject(new Error("GitHub request timed out"))
      });
    });
  }

  function base64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
  }

  async function existingSha(token) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${LATEST_PATH}?ref=${BRANCH}`;
    try {
      return (await githubRequest({ url, token })).json?.sha || null;
    } catch (error) {
      if (/HTTP 404/.test(error.message)) return null;
      throw error;
    }
  }

  async function uploadPacket(packet) {
    const token = await getToken();
    if (!token) throw new Error("TOKEN_NOT_SET");
    const sha = await existingSha(token);
    const content = JSON.stringify(packet, null, 2) + "\n";
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${LATEST_PATH}`;
    const body = {
      message: `Update latest trade results (${packet.listings.length} listings)`,
      content: base64Utf8(content),
      branch: BRANCH,
      ...(sha ? { sha } : {})
    };
    return githubRequest({ method: "PUT", url, token, body });
  }

  async function saveAllResults() {
    try {
      const token = await getToken();
      if (!token) {
        status("Set GitHub token once before saving results.");
        return;
      }

      status("Collecting all trade results…");
      const listings = await collectAllResults();
      const packet = {
        protocol: "poe2-trade-copilot/results-v5",
        version: `0.5.1+github-save-${VERSION}`,
        capturedAt: new Date().toISOString(),
        sourceUrl: location.href,
        visibleResults: listings.length,
        listings
      };

      status(`Uploading ${listings.length} result(s) to GitHub…`);
      const result = await uploadPacket(packet);
      const sha = result.json?.commit?.sha || "";
      status(`Saved ${listings.length} result(s) to GitHub${sha ? ` · ${sha.slice(0, 7)}` : ""}.`);
    } catch (error) {
      console.error("[PoE2TC GitHub Save]", error);
      status(error.message === "TOKEN_NOT_SET" ? "GitHub token not set." : `GitHub save failed: ${error.message}`);
    }
  }

  function install() {
    const panel = $("#ptc");
    const resultsButton = $("#ptc-results");
    if (!panel || !resultsButton) {
      setTimeout(install, 250);
      return;
    }

    resultsButton.onclick = saveAllResults;
    resultsButton.textContent = "SAVE ALL RESULTS";

    if (!$("#ptc-token")) {
      const tokenButton = document.createElement("button");
      tokenButton.id = "ptc-token";
      tokenButton.textContent = "SET GITHUB TOKEN";
      Object.assign(tokenButton.style, {
        width: "100%", marginTop: "7px", padding: "9px", background: "#26313e", color: "#fff",
        border: "1px solid #526071", borderRadius: "7px", fontWeight: "600"
      });
      tokenButton.onclick = async () => {
        const entered = window.prompt(
          "Paste a fine-grained GitHub token for toaster-vip/poe2-trade-copilot with Contents: Read and write. It stays only in Userscripts storage on this device.",
          ""
        );
        if (entered == null) return;
        const token = String(entered).trim();
        if (!token) {
          await setToken("");
          status("GitHub token cleared.");
          return;
        }
        await setToken(token);
        status("GitHub token saved locally.");
      };
      panel.appendChild(tokenButton);
    }

    if (!$("#ptc-github-save-badge")) {
      const badge = document.createElement("div");
      badge.id = "ptc-github-save-badge";
      badge.textContent = `github-save ${VERSION}`;
      Object.assign(badge.style, { fontSize: "10px", opacity: ".55", marginTop: "4px" });
      panel.appendChild(badge);
    }

    console.log("[PoE2TC GitHub Save] Installed.");
  }

  install();
})();
