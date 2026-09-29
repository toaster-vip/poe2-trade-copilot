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


## UI stat groups

For official Trade searches that need explicit stat-group structure, use top-level `statGroups`.
The grouped-stat executor creates the groups in the official Trade UI; it does not place grouped
modifiers directly under the root Stat Filters section.

Each filter must provide an exact official stat id and expected display text. Before changing the
page, the executor validates every id/text pair against the live official
`/api/trade2/data/stats` catalog.

```json
{
  "statGroups": [
    {
      "type": "and",
      "filters": [
        {
          "id": "explicit.stat_1030153674",
          "text": "Recover #% of maximum Mana on Kill",
          "min": 2
        }
      ]
    },
    {
      "type": "count",
      "min": 2,
      "filters": [
        {
          "id": "explicit.stat_2843214518",
          "text": "#% increased Attack Damage"
        }
      ]
    }
  ]
}
```

The executor must verify that:
- an explicit AND group was created for the mandatory stat(s);
- an explicit COUNT group was created for pooled optional stats;
- COUNT min/max is committed on the group itself;
- every requested stat appears inside its intended group;
- no grouped stat is silently inserted into the root Stat Filters group.

Legacy `stats` remains for simple, ungrouped filters.
