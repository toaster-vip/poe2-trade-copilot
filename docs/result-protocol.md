# Result packet protocol

Current result protocol family: `poe2-trade-copilot/results-v5`.

The exporter returns compact structured listing data so ChatGPT can compare items without requiring screenshots.

Typical fields include:

- `name`
- `baseType`
- `itemClass`
- `itemLevel`
- `quality`
- `requirements`
- `physicalDamage`
- `criticalChance`
- `attacksPerSecond`
- `physicalDps`
- `elementalDps`
- `totalDps`
- `price`
- `seller`
- `listedAgo`
- `corrupted`
- `sanctified`
- `additionalArrow`
- `manaLeech`
- `lifeLeech`
- `attackSkillLevels`
- `projectileSkillLevels`
- `attackCostEfficiency`
- `mods`

The exporter intentionally avoids copying the full raw listing text by default so the ChatGPT message stays reasonably small.
