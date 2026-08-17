# PoE2 Trade Copilot

A mobile-friendly userscript for Path of Exile 2 Trade that lets ChatGPT provide structured search packets, applies and verifies trade filters, and exports compact structured result packets for analysis.

## Current status

The project is in active development. The search executor can set and verify numeric equipment filters and select fields, while result extraction already supports structured listing export including price, seller, DPS, crit, attack speed, corruption state, and useful modifiers.

The main goal is a reliable loop:

1. ChatGPT generates a search packet.
2. Paste or load the packet into the userscript on the official PoE2 Trade page.
3. The userscript applies and verifies the filters.
4. Run the search.
5. Copy or save structured results for ranking and purchase decisions.

## AI / search-condition source of truth

**Before generating or modifying any search condition, read these first:**

- `AGENTS.md` — mandatory instructions for AI/agents working on this repo.
- `docs/search-knowledge.md` — human-readable record of what official PoE2 Trade accepts, what failed, and why.
- `data/stat-search-knowledge.json` — machine-readable verified/unverified/failed stat-query registry.

Do not infer Trade search text from an item's displayed modifier text. A label such as `Strength` can refer to an equipment requirement instead of an item-granted stat. New stat forms must be tested independently and recorded in the knowledge registry before they are used in a combined search.

## Files

- `poe2-trade-copilot.loader.user.js` — permanent local loader; fetches the current remote bootstrap.
- `remote-bootstrap.js` — remote module manifest/entry point.
- `poe2-trade-copilot.user.js` — core/bootstrap code retained by the project.
- `docs/search-protocol.md` — search packet format.
- `docs/search-knowledge.md` — verified search semantics and regression rules.
- `data/stat-search-knowledge.json` — machine-readable search knowledge registry.
- `docs/result-protocol.md` — exported result packet format.
- `examples/bow-search.json` — example search packet.

## Safety rule

The executor should never submit a search unless every requested filter passes final verification against the actual page state. Verification must include **semantic placement**: a requested item modifier in Requirements is a failure even if the number itself was filled correctly.

## Install

Use a userscript manager that supports Safari on iPhone/iPad, then install the permanent loader and enable it for `pathofexile.com/trade2/search/poe2/*`. Normal project updates should happen remotely through GitHub without repeatedly replacing the local loader.
