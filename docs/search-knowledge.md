# PoE2 Trade Search Knowledge Base

This document is the source of truth for generating search packets for this project.

## Golden rule

Do **not** assume the text printed on an item is the text that the official PoE2 Trade `+ Add Stat Filter` box accepts.

The official Trade UI has multiple namespaces that can look semantically similar:

- **Property / equipment filters** — e.g. Physical DPS, Critical Chance.
- **Requirements** — e.g. Strength required to equip an item.
- **Stat Filters** — item modifiers / pseudo totals such as maximum Life, maximum Mana, resistances, attributes, attack modifiers.
- **Trade filters** — price, listed time, sale type.

A packet is correct only when the requested concept lands in the intended UI section and the final page state is verified.

## Required workflow before changing `data/latest-search.json`

1. Identify the semantic intent first: e.g. `item grants Strength`, not simply `Strength`.
2. Check `data/stat-search-knowledge.json` for a verified query form.
3. Never reuse a Requirements/property label for an affix just because the words match.
4. If no verified query exists, mark it `unverified`; do not claim it works.
5. Test one new stat at a time on the official Trade page.
6. Record the exact successful or failed query and observed UI result back into `data/stat-search-knowledge.json`.
7. Only then combine the verified stat with other search conditions.

## Verified observations from this project

The following query texts have successfully created Stat Filter rows in the official PoE2 Trade UI during this project:

- `maximum Life` → PSEUDO total maximum Life.
- `maximum Mana` → PSEUDO total maximum Mana.
- `Cold Resistance` → PSEUDO total Cold Resistance.
- `Lightning Resistance` → PSEUDO total Lightning Resistance.

The following forms are known to be wrong or unreliable:

- `Strength` used as a stat request was classified as the **Requirements → Strength** numeric property by the executor. This means “required Strength to equip”, not “item grants Strength”.
- `+# to Strength` failed with `stat_option_not_found` on 2026-08-17.
- `+# to maximum Life` failed with `stat_option_not_found` on 2026-08-17.
- `+# to maximum Mana` should not be used simply because it resembles item text; use the verified `maximum Mana` query instead.
- `total to Strength` is currently **unverified**. Do not treat it as working until the UI proves it.

## Search packet design rule

For dynamic Stat Filters, prefer semantic specs that explicitly state intent instead of ambiguous labels. Example concept:

```json
{
  "key": "grants_strength",
  "kind": "stat",
  "min": 18
}
```

The runtime may map that semantic key to one or more official Trade query strings. The project should move toward this model so ChatGPT does not need to guess UI text.

Until semantic keys are fully implemented, only use query text whose status is `verified` in `data/stat-search-knowledge.json`.

## Regression rule

A previously working search must not be considered preserved merely because the script reports success. Verify the actual page:

- Category/rarity in Type Filters.
- DPS/crit in Equipment Filters.
- Equip requirements only in Requirements.
- Item modifiers in Stat Filters.
- Price/currency in Trade Filters.

If a requested modifier appears in the wrong section, the search is a failure even if a numeric value was filled in.
