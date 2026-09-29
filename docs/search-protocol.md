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


## Exact-ID API stat groups

For searches that need multiple official stat groups such as `count`, a packet may include `apiSearch`.
The userscript validates every supplied stat id and text against the live official PoE2 Trade
`/api/trade2/data/stats` catalog before submitting the query. A mismatch aborts the search.

```json
{
  "apiSearch": {
    "league": "Runes of Aldur",
    "status": "securable",
    "category": "jewel",
    "rarity": "rare",
    "price": {"option": "divine", "max": 10000},
    "statGroups": [
      {
        "type": "and",
        "filters": [
          {"id": "explicit.stat_1030153674", "text": "Recover #% of maximum Mana on Kill", "min": 2}
        ]
      },
      {
        "type": "count",
        "min": 2,
        "filters": [
          {"id": "explicit.stat_2843214518", "text": "#% increased Attack Damage"}
        ]
      }
    ]
  }
}
```

When `apiSearch` is present, the direct API bridge takes precedence over DOM stat entry. The legacy
`selects` / `fields` / `stats` keys may remain in the packet as a safe fallback for older loaded
patches.
