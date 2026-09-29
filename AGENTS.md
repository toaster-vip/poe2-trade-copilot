# AI / Agent Instructions

Before generating or modifying any PoE2 Trade search packet in this repository:

1. Read `docs/search-knowledge.md`.
2. Read `data/stat-search-knowledge.json`.
3. Treat `data/stat-search-knowledge.json` as the machine-readable source of truth for which query strings are verified, failed, or still unverified.
4. Do not guess an official Trade query from the text shown on an item.
5. Do not use an ambiguous label such as `Strength`, `Dexterity`, or `Intelligence` for an item modifier if the page also exposes that label as an equipment requirement.
6. If a desired stat is not marked `verified`, first create a minimal one-stat test and have the user verify the actual official Trade UI result. Record that evidence before combining it into a real search.
7. A search is successful only if every condition appears in the correct official Trade UI section, not merely because the script reports success.
8. Preserve previously verified search behavior when adding a new stat. Test new conditions independently before combining them.

For current project architecture and usage, also read `README.md` and `docs/search-protocol.md`.


## Exact official Trade stat IDs

The one-stat UI-discovery rule above applies to fuzzy/text-driven DOM stat selection. For `apiSearch`
packets, an exact stat id plus its expected display text may be used when both conditions hold:

1. The id/text pair came from the official PoE2 Trade stat catalog or a current data snapshot built from it.
2. The userscript re-fetches the live official `/api/trade2/data/stats` catalog and verifies the exact id/text
   pair before submitting the search.

If either check fails, abort instead of falling back to fuzzy matching.
