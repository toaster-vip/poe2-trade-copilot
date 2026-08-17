# Remote loader

`poe2-trade-copilot.loader.user.js` is the only script that needs to be installed manually on the device.

On every matching PoE2 Trade page load it fetches the latest `poe2-trade-copilot.user.js` from the `main` branch on GitHub with cache disabled, removes the userscript metadata header, and evaluates the program body.

This means normal development only requires updating `poe2-trade-copilot.user.js` in GitHub. The iPhone/iPad does not need a manual full-script replacement for each version; refreshing the Trade page loads the latest committed main version.

If the remote fetch fails, the loader shows a red error banner and does not execute stale code.

## Device setup

1. Install/copy `poe2-trade-copilot.loader.user.js` into Userscripts once.
2. Disable or remove the old full local `poe2-trade-copilot.user.js` to avoid running two copies.
3. Refresh the PoE2 Trade page.
4. The Copilot UI should show the version defined by the current GitHub `poe2-trade-copilot.user.js`.

## Development flow

1. Update and commit `poe2-trade-copilot.user.js` on `main`.
2. Refresh the Trade page on the device.
3. The loader downloads the newest main script immediately.
