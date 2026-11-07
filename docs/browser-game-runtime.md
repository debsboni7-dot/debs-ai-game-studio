# Browser game runtime checks

DEBS AI Studio can launch a browser game in headless Chromium on a GitHub-hosted runner and run optional declarative interaction tests.

## Run from Android

1. Open the repository **Actions** tab.
2. Select **Browser game runtime smoke test**, then **Run workflow**.
3. Enter the repository folder containing the game (for example, \`games/my-game\`) and its HTML entry file (usually \`index.html\`).
4. Optionally provide a JSON test-plan path relative to the repository root.
5. Start the workflow and download the **debs-browser-runtime-evidence** artifact.

The workflow checks desktop Chromium (1280×720) and mobile device emulation (390×844 with touch enabled). It captures screenshots and generates JSON and Markdown reports.

## Test-plan format

The plan is JSON; it does not execute JavaScript or evaluate supplied code.

\`\`\`json
{
  "tests": [
    {
      "name": "Start a new game",
      "viewport": "both",
      "steps": [
        { "action": "click", "selector": "[data-testid='new-game']" },
        { "action": "wait", "ms": 500 }
      ],
      "expect": [
        { "type": "visible", "selector": "[data-testid='character-creator']" },
        { "type": "text-contains", "selector": "h1", "value": "Create character" }
      ]
    },
    {
      "name": "Touch controls exist",
      "viewport": "mobile",
      "expect": [
        { "type": "visible", "selector": "[data-testid='touch-controls']" }
      ]
    }
  ]
}
\`\`\`

Supported actions: \`click\`, \`tap\`, \`fill\`, \`press\`, \`check\`, \`uncheck\`, \`select\`, \`wait\`.

Supported expectations: \`visible\`, \`hidden\`, \`text-contains\`, \`count\`, \`enabled\`, \`url-contains\`, \`title-contains\`.

Use stable selectors such as \`data-testid\`. Limits: 50 tests, 100 steps and 100 expectations per test, 10 seconds per wait. A test targets \`desktop\`, \`mobile\`, or \`both\`.

## Evidence and limits

The artifact contains desktop/mobile screenshots, a machine-readable JSON report and a Markdown summary. Console errors are recorded as diagnostics; uncaught page errors and failed assertions fail the run.

This is a launch and declared-interaction smoke test, not full gameplay certification. It does not measure FPS, WebGL quality, memory use, multiplayer behavior, or physical-device performance. Mobile is Chromium emulation, not a physical Android device. The workflow is manual and does not deploy or modify the game.
