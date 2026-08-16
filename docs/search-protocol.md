# Search packet protocol

Current protocol family: `poe2-trade-copilot/search-v5`.

A search packet describes the exact filters the userscript should apply to the official PoE2 Trade page.

```json
{
  "protocol": "poe2-trade-copilot/search-v5",
  "clear": true,
  "selects": [
    {"label": "Item Category", "value": "Bow"},
    {"label": "Item Rarity", "value": "Rare"},
    {"label": "Buyout Price", "value": "Divine Orb"}
  ],
  "fields": [
    {"label": "Buyout Price", "max": 200}
  ],
  "stats": [
    {"text": "Physical DPS", "min": 620},
    {"text": "Critical Chance", "min": 8.5}
  ],
  "search": false
}
```

## Fields

- `clear`: clear previous Trade filters before applying the packet.
- `selects`: exact-value select filters. Exact matching is required; `Divine Orb` must not silently match `Exalted or Divine Orbs`.
- `fields`: native numeric Trade fields with `min` and/or `max`.
- `stats`: numeric equipment/stat filters. The executor may use a native property row when PoE exposes one, otherwise it may create a stat filter.
- `search`: when `false`, apply and verify only. When `true`, submit Search only after every requested filter passes final verification.

## Invariant

A packet must never be reported as successful merely because text was typed into an input. Success means the final page state matches the requested value.
