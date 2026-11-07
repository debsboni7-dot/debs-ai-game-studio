const { chromium } = require("playwright");

const url = process.env.GAME_URL;
const screenshotPath = process.env.GAME_SCREENSHOT_PATH || "browser-game-smoke.png";
const timeoutMs = Number(process.env.GAME_TIMEOUT_MS || 30000);

if (!url) {
  console.error("GAME_URL is required.");
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  const consoleErrors = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (!response || !response.ok()) {
      throw new Error(`Entry page did not load successfully (HTTP ${response?.status() ?? "no response"}).`);
    }

    await page.waitForTimeout(1500);
    const pageState = await page.evaluate(() => {
      const bodyText = document.body?.innerText?.trim() ?? "";
      const canvases = [...document.querySelectorAll("canvas")].filter((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const visibleMedia = [...document.querySelectorAll("video, img, svg")].some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      return {
        title: document.title,
        bodyTextLength: bodyText.length,
        canvasCount: canvases.length,
        visibleMedia,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    });

    if (pageState.bodyTextLength < 10 && pageState.canvasCount === 0 && !pageState.visibleMedia) {
      throw new Error("The page appears blank: no meaningful text, visible canvas, or visible media was found.");
    }
    if (pageErrors.length) {
      throw new Error("Uncaught browser errors: " + pageErrors.join(" | "));
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(JSON.stringify({
      result: "passed",
      check: "chromium-browser-smoke",
      url,
      screenshotPath,
      ...pageState,
      pageErrors,
      consoleErrors,
      note: "This is a launch/render smoke test, not a gameplay or performance certification.",
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
