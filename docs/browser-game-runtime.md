# Browser game runtime smoke test

DEBS AI Studio includes an optional GitHub Actions workflow that opens a browser game in headless Chromium.

## Run it from Android

1. Open the repository's **Actions** tab.
2. Select **Browser game runtime smoke test**.
3. Choose **Run workflow**.
4. Enter the repository folder containing the game (for example, `games/my-game`) and its HTML entry file (usually `index.html`).
5. Start the workflow and open its run when it finishes.
6. Download the `browser-game-chromium-smoke` artifact to inspect the screenshot.

The workflow serves the selected folder locally inside the GitHub-hosted runner, launches Chromium, checks that the entry page loads, checks for a blank page and uncaught JavaScript errors, and saves a screenshot.

## Current limits

This is a browser launch/render smoke test. It does not yet simulate gameplay, verify controls, measure FPS, inspect WebGL rendering quality, or certify mobile performance. It runs only when manually started; it does not deploy the game or modify the repository. The selected project and entry file must already exist in the repository.
