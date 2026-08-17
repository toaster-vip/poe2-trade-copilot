# Automatic GitHub result saving

The companion userscript `poe2-trade-copilot.github-save.user.js` collects all rendered trade results and writes the packet directly to:

`data/latest-results.json`

## One-time setup

1. Install `poe2-trade-copilot.github-save.user.js` in Userscripts.
2. Create a fine-grained GitHub personal access token restricted to `toaster-vip/poe2-trade-copilot`.
3. Grant only **Contents: Read and write**.
4. On the PoE2 Trade page, tap **SET GITHUB TOKEN** and paste the token.

The token is stored in Userscripts GM storage on the device. It is not stored in this repository and should never be pasted into ChatGPT.

## Normal workflow

1. Run a search with PoE2 Trade Copilot.
2. Tap **SAVE ALL RESULTS**.
3. The companion script scrolls through the virtualized result list, deduplicates listings, and uploads the packet to `data/latest-results.json`.
4. ChatGPT can read that file from the connected GitHub repository without the user pasting a large JSON payload into chat.

The file is intentionally overwritten on each save so `latest-results.json` always represents the newest captured market result set.
