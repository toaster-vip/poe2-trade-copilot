// ==UserScript==
// @name         PoE2 Trade Copilot GitHub Bridge
// @namespace    chatgpt-poe2-trade
// @version      1.0.0
// @description  Saves PoE2 Trade Copilot result packets directly to GitHub
// @match        https://www.pathofexile.com/trade2/search/poe2/*
// @match        https://pathofexile.com/trade2/search/poe2/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @connect      api.github.com
// ==/UserScript==

(() => {
  "use strict";

  const OWNER = "toaster-vip";
  const REPO = "poe2-trade-copilot";
  const BRANCH = "main";
  const LATEST_PATH = "data/latest-results.json";
  const TOKEN_KEY = "poe2tc.github.token";

  const $ = (s, r = document) => r.querySelector(s);

  function status(text) {
    const el = $("#ptc-status");
    if (el) el.textContent = text;
    console.log("[PoE2TC GitHub Bridge]", text);
  }

  async function getToken() {
    return String((await GM.getValue(TOKEN_KEY, "")) || "").trim();
  }

  async function setToken(token) {
    await GM.setValue(TOKEN_KEY, String(token || "").trim());
  }

  function request({ method = "GET", url, token, body }) {
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
        onload: response => {
          const text = response.responseText || "";
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch {}

          if (response.status >= 200 && response.status < 300) {
            resolve({ status: response.status, json, text });
          } else {
            reject(new Error(`GitHub HTTP ${response.status}: ${json?.message || text || "request failed"}`));
          }
        },
        onerror: () => reject(new Error("GitHub network request failed")),
        ontimeout: () => reject(new Error("GitHub request timed out")),
        timeout: 30000
      });
    });
  }

  function base64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function existingSha(path, token) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(BRANCH)}`;
    try {
      const result = await request({ method: "GET", url, token });
      return result.json?.sha || null;
    } catch (error) {
      if (/HTTP 404/.test(String(error.message))) return null;
      throw error;
    }
  }

  async function putFile(path, content, token, message) {
    const sha = await existingSha(path, token);
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
    const payload = {
      message,
      content: base64Utf8(content),
      branch: BRANCH,
      ...(sha ? { sha } : {})
    };
    return request({ method: "PUT", url, token, body: payload });
  }

  async function savePacket(packet) {
    const token = await getToken();
    if (!token) {
      status("GitHub token not set. Tap SET GITHUB TOKEN once.");
      throw new Error("github_token_missing");
    }

    const normalized = {
      ...packet,
      savedAt: new Date().toISOString(),
      savedBy: "poe2-trade-copilot-github-bridge/1.0.0"
    };

    const content = JSON.stringify(normalized, null, 2) + "\n";
    status(`Uploading ${normalized.listings?.length ?? 0} result(s) to GitHub…`);

    const result = await putFile(
      LATEST_PATH,
      content,
      token,
      `Update latest trade results (${normalized.listings?.length ?? 0} listings)`
    );

    const commitSha = result.json?.commit?.sha || null;
    status(`Saved ${normalized.listings?.length ?? 0} result(s) to GitHub${commitSha ? ` · ${commitSha.slice(0, 7)}` : ""}.`);

    window.dispatchEvent(new CustomEvent("poe2tc:github-save-complete", {
      detail: {
        ok: true,
        path: LATEST_PATH,
        commitSha,
        count: normalized.listings?.length ?? 0
      }
    }));
  }

  function installUi() {
    const panel = $("#ptc");
    if (!panel) {
      setTimeout(installUi, 250);
      return;
    }

    if (!$("#ptc-github-token")) {
      const button = document.createElement("button");
      button.id = "ptc-github-token";
      button.textContent = "SET GITHUB TOKEN";
      Object.assign(button.style, {
        width: "100%",
        marginTop: "7px",
        padding: "9px",
        background: "#26313e",
        color: "#fff",
        border: "1px solid #526071",
        borderRadius: "7px",
        fontWeight: "600"
      });

      button.onclick = async () => {
        const current = await getToken();
        const entered = window.prompt(
          "Paste a fine-grained GitHub token for toaster-vip/poe2-trade-copilot with Contents: Read and write. The token stays only in Userscripts storage on this device.",
          current ? "" : ""
        );
        if (entered == null) return;
        const token = String(entered).trim();
        if (!token) {
          await setToken("");
          status("GitHub token cleared.");
          return;
        }
        await setToken(token);
        status("GitHub token saved locally. It was not sent to ChatGPT or committed to the repo.");
      };

      panel.appendChild(button);
    }

    if (!$("#ptc-github-bridge-badge")) {
      const badge = document.createElement("div");
      badge.id = "ptc-github-bridge-badge";
      badge.textContent = "github-bridge1";
      Object.assign(badge.style, { fontSize: "10px", opacity: ".55", marginTop: "4px" });
      panel.appendChild(badge);
    }
  }

  window.addEventListener("poe2tc:save-results", event => {
    const packet = event.detail;
    if (!packet || !Array.isArray(packet.listings)) return;
    savePacket(packet).catch(error => {
      console.error("[PoE2TC GitHub Bridge]", error);
      if (error.message !== "github_token_missing") {
        status(`GitHub save failed: ${error.message}`);
      }
      window.dispatchEvent(new CustomEvent("poe2tc:github-save-complete", {
        detail: { ok: false, error: error.message }
      }));
    });
  });

  installUi();
  console.log("[PoE2TC GitHub Bridge] Ready.");
})();
