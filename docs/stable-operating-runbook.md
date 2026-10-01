# PoE2 Trade Copilot — Stable Operating Runbook

This file defines the preferred execution path for AI-driven gear searches. Read it before changing `data/latest-search.json`.

## User workflow

The user should not need to know official Trade stat names or choose search mechanics.

Normal loop:

1. AI decides the next slot and search criteria from the latest build and current gear.
2. AI writes `data/latest-search.json`.
3. User presses **LOAD + RUN FROM GITHUB**.
4. User presses **SAVE TOP 150 TO GITHUB** when results are shown, or **COPY DEBUG** only when execution aborts.
5. AI reads `data/latest-results.json` or the debug packet, adjusts the next search, and repeats.

Do not ask the user to hand-type stat names unless there is no automated alternative.

## Execution paths

### A. Native property/select filters
Use `selects` and `fields` for category, rarity, price, Physical DPS, Critical Chance, Evasion, Energy Shield, etc.

### B. Exact modifier filters
Prefer `statGroups` over legacy root-level `stats` for explicit item modifiers.

Why:
- `statGroups` validates exact text/ID against the live official `/api/trade2/data/stats` catalog.
- It avoids fuzzy matching and Requirements/property collisions.
- It is the preferred path for new explicit affixes.

A filter may omit `id` only when its `text` is expected to resolve uniquely in the live official catalog. The runtime must abort if it does not resolve uniquely.

### C. Legacy dynamic `stats`
Treat as compatibility-only. Do not use for new explicit affixes when `statGroups` can express the search.

### D. Discovery
Manual `DISCOVER STAT` is diagnostic-only. It is not part of the normal user workflow.

## Version compatibility

The run wrapper must check the stat-groups module by `implementationVersion`, not by historical compatibility aliases.

Current baseline:
- run-wrapper: 3.2
- stat-groups implementation: 2.5
- search-source: 1.20
- direct-api: 1.3

Never hardcode an older stat-groups alias (for example 1.6) as the required implementation.

## Search progression

Start with a broad search that preserves build-critical constraints. Tighten only after observing result counts.

When results are:
- 0–5: relax one lowest-priority constraint.
- 6–40: analyze listings directly.
- 41–150: tighten one or two high-value numerical constraints.
- 150+: tighten before ranking.

Do not discard build-critical sustain/defence constraints merely to increase DPS.

## Current build principle

For the current Ice Shot Deadeye build, survival is explicitly prioritized. For gloves, Evasion-to-Deflection is build-critical and should not be traded away casually for attack speed.

The AI must always compare candidate gear against the latest uploaded build, not stale historical gear.
