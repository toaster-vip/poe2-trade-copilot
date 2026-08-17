(() => {
  "use strict";

  const VERSION = "packet-guard-1.0";
  const KNOWLEDGE_API = "https://api.github.com/repos/toaster-vip/poe2-trade-copilot/contents/data/stat-search-knowledge.json?ref=main";
  const $ = (s, r = document) => r.querySelector(s);
  const norm = s => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  let verifiedStats = new Set([
    "maximum life",
    "maximum mana",
    "cold resistance",
    "lightning resistance"
  ]);
  let failedStats = new Set([
    "strength",
    "dexterity",
    "intelligence",
    "+# to strength",
    "+# to dexterity",
    "+# to intelligence"
  ]);
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
      const response = await fetch(`${KNOWLEDGE_API}&t=${Date.now()}`, {
        cache: "no-store",
        credentials: "omit",
        headers: {"Accept":"application/vnd.github+json"}
      });
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
      window.__POE2TC_PACKET_GUARD_KNOWLEDGE = {
        version: VERSION,
        verifiedStats: [...verifiedStats],
        failedStats: [...failedStats]
      };
    } catch (error) {
      knowledgeReady = false;
      console.error("[PoE2TC Packet Guard] knowledge load failed; using built-in verified baseline", error);
    }
  }

  function validate(packet) {
    if (!packet || typeof packet !== "object") return {ok:false, reason:"invalid_packet"};
    const errors = [];

    for (const spec of Array.isArray(packet.stats) ? packet.stats : []) {
      const q = norm(spec?.text);
      if (!q) {
        errors.push("empty stat query");
        continue;
      }
      if (failedStats.has(q)) {
        errors.push(`known-bad stat: ${spec.text}`);
        continue;
      }
      if (!verifiedStats.has(q)) {
        errors.push(`unverified stat: ${spec.text}`);
      }
    }

    for (const spec of Array.isArray(packet.fields) ? packet.fields : []) {
      const label = norm(spec?.label);
      if (["strength","dexterity","intelligence"].includes(label)) {
        errors.push(`attribute requirement/property ambiguity: ${spec.label}`);
      }
    }

    return errors.length ? {ok:false, reason:"unsafe_or_unverified_filters", errors} : {ok:true};
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
      window.__POE2TC_PACKET_GUARD_LAST = {version:VERSION, knowledgeReady, packet, result};
      if (result.ok) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      status(`BLOCKED: ${result.errors?.[0] || result.reason}. Use DISCOVER STAT before adding unverified filters.`);
    }, true);

    console.log(`[PoE2TC Packet Guard] ${VERSION} installed.`);
  }

  loadKnowledge();
  install();
})();
