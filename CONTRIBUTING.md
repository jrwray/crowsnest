# Contributing to Crowsnest

Thanks for helping out. Crowsnest is plain HTML, CSS, and JavaScript with no build step, so getting started takes a minute.

## Run it locally

1. Fork and clone the repo.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the repo folder.
3. Make a change, click the reload icon on the Crowsnest card, and open a new tab.

Errors from the new tab show in its DevTools console. Errors from the right-click menu show under **Inspect views: service worker** on the extensions page.

## Guidelines

- **No secrets in code.** API keys belong in the Settings panel, which stores them in `chrome.storage.local`. Never commit a real key.
- **Keep permissions tight.** A new data source needs its host added to `host_permissions` in `manifest.json`; say why in your PR.
- **No remote code.** Manifest V3 forbids loading scripts from a CDN. Vendor small libraries into the repo and note their license in the README.
- **Match the style.** Two-space indent, single quotes, `async`/`await`, and the section banners used in `src/`. New features get their own module in `src/`, imported from `main.js`.
- **Escape untrusted text.** Feed titles and API responses go through `esc()` before they reach `innerHTML`.

## Pull requests

- Keep each PR to one change and describe what a user would see before and after.
- Add a screenshot for visual changes.
- CI checks that `manifest.json` is valid, lints every script, and runs the unit tests. Run the same checks locally with `npm run lint` and `npm test`.

## Reporting bugs

Open an issue with your browser and version, what you expected, what happened, and anything from the console.
