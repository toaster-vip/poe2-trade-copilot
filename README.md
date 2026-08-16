# PoE2 Trade Copilot

A mobile-friendly userscript for Path of Exile 2 Trade that lets ChatGPT provide structured search packets, applies and verifies trade filters, and exports compact structured result packets for analysis.

## Current status

The project is in active development. The search executor can set and verify numeric equipment filters and select fields, while result extraction already supports structured listing export including price, seller, DPS, crit, attack speed, corruption state, and useful modifiers.

The main goal is a reliable loop:

1. ChatGPT generates a search packet.
2. Paste the packet into the userscript on the official PoE2 Trade page.
3. The userscript applies and verifies the filters.
4. Run the search.
5. Copy structured results back to ChatGPT for ranking and purchase decisions.

## Files

- `poe2-trade-copilot.user.js` — main userscript.
- `docs/search-protocol.md` — search packet format.
- `docs/result-protocol.md` — exported result packet format.
- `examples/bow-search.json` — example search packet.

## Safety rule

The executor should never submit a search unless every requested filter passes final verification against the actual page state.

## Install

Use a userscript manager that supports Safari on iPhone/iPad, then install `poe2-trade-copilot.user.js` and enable it for `pathofexile.com/trade2/search/poe2/*`.
