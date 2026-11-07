const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const url = process.env.GAME_URL;
const timeoutMs = Number(process.env.GAME_TIMEOUT_MS || 30000);
const planPath = process.env.GAME_TEST_PLAN_PATH || "";
const reportPath = process.env.GAME_REPORT_PATH || "browser-game-report.json";
const markdownPath = process.env.GAME_MARKDOWN_PATH || "browser-game-report.md";

function assert(condition, message) { if (!condition) throw new Error(message); }
function selector(value) {
  assert(typeof value === "string" && value.trim() && value.length <= 300, "Invalid selector (maximum 300 characters).");
  return value;
}
function loadPlan() {
  if (!planPath) return { tests: [] };
  const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), "utf8"));
  assert(plan && Array.isArray(plan.tests) && plan.tests.length <= 50, "Test plan must contain at most 50 tests.");
  for (const test of plan.tests) {
    assert(test && typeof test.name === "string" && test.name.trim(), "Every test needs a name.");
    assert(["desktop", "mobile", "both", undefined].includes(test.viewport), "Invalid viewport in " + test.name);
    assert(Array.isArray(test.steps || []) && (test.steps || []).length <= 100, "Invalid steps in " + test.name);
    assert(Array.isArray(test.expect || []) && (test.expect || []).length <= 100, "Invalid expectations in " + test.name);
  }
  return plan;
}
async function step(page, item) {
  assert(item && typeof item.action === "string", "Invalid test action.");
  if (item.action === "wait") {
    const ms = Number(item.ms || 250);
    assert(Number.isFinite(ms) && ms >= 0 && ms <= 10000, "Wait must be 0–10000 ms.");
    return page.waitForTimeout(ms);
  }
  const target = page.locator(selector(item.selector)).first();
  const options = { timeout: Math.min(timeoutMs, 10000) };
  if (item.action === "click") return target.click(options);
  if (item.action === "tap") return target.tap(options);
  if (item.action === "fill") {
    assert(typeof item.value === "string" && item.value.length <= 2000, "Invalid fill value.");
    return target.fill(item.value, options);
  }
  if (item.action === "press") {
    assert(typeof item.key === "string" && item.key.length <= 40, "Invalid key.");
    return target.press(item.key, options);
  }
  if (item.action === "check") return target.check(options);
  if (item.action === "uncheck") return target.uncheck(options);
  if (item.action === "select") {
    assert(typeof item.value === "string" && item.value.length <= 200, "Invalid select value.");
    return target.selectOption(item.value, options);
  }
  throw new Error("Unsupported action: " + item.action);
}
async function expect(page, item) {
  assert(item && typeof item.type === "string", "Invalid expectation.");
  if (item.type === "url-contains") {
    assert(typeof item.value === "string" && page.url().includes(item.value), "URL did not contain expected value.");
    return;
  }
  if (item.type === "title-contains") {
    assert(typeof item.value === "string" && (await page.title()).includes(item.value), "Title did not contain expected value.");
    return;
  }
  const query = selector(item.selector);
  const target = page.locator(query);
  if (item.type === "visible") assert(await target.first().isVisible(), "Expected visible: " + query);
  else if (item.type === "hidden") assert(!(await target.first().isVisible().catch(() => false)), "Expected hidden: " + query);
  else if (item.type === "text-contains") {
    const actual = await target.first().innerText();
    assert(typeof item.value === "string" && actual.includes(item.value), "Expected text in " + query + ": " + item.value);
  } else if (item.type === "count") {
    const count = await target.count();
    assert(Number.isInteger(item.equals) && count === item.equals, "Expected count " + item.equals + " for " + query + ", got " + count);
  } else if (item.type === "enabled") assert(await target.first().isEnabled(), "Expected enabled: " + query);
  else throw new Error("Unsupported expectation: " + item.type);
}
async function inspect(page) {
  return page.evaluate(() => {
    const text = document.body && document.body.innerText ? document.body.innerText.trim() : "";
    const canvases = Array.from(document.querySelectorAll("canvas")).filter((el) => {
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    });
    const media = Array.from(document.querySelectorAll("video,img,svg")).some((el) => {
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    });
    return {
      title: document.title, bodyTextLength: text.length, canvasCount: canvases.length, visibleMedia: media,
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2
    };
  });
}
(async () => {
  if (!url) throw new Error("GAME_URL is required.");
  const plan = loadPlan();
  const report = {
    schemaVersion: 1, check: "chromium-browser-runtime", url, startedAt: new Date().toISOString(),
    testPlan: planPath || null, configuredTests: plan.tests.length, profiles: [], result: "passed",
    limitations: [
      "Launch and declared-interaction smoke test only; not full gameplay certification.",
      "No FPS, WebGL quality, memory, multiplayer, or physical-device performance certification.",
      "Mobile profile uses Chromium device emulation, not a physical Android device."
    ]
  };
  const browser = await chromium.launch({ headless: true });
  try {
    const profiles = [
      { name: "desktop", viewport: { width: 1280, height: 720 }, isMobile: false, hasTouch: false },
      { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    ];
    for (const profile of profiles) {
      const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: 1, isMobile: profile.isMobile, hasTouch: profile.hasTouch });
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      const result = { name: profile.name, result: "passed", pageErrors: [], consoleErrors: [], tests: [] };
      page.on("pageerror", (error) => result.pageErrors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") result.consoleErrors.push(message.text()); });
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        assert(response && response.ok(), "Entry page failed to load (HTTP " + (response ? response.status() : "no response") + ").");
        await page.waitForTimeout(1000);
        result.page = await inspect(page);
        assert(result.page.bodyTextLength >= 10 || result.page.canvasCount > 0 || result.page.visibleMedia, "Page appears blank.");
        const tests = plan.tests.filter((test) => !test.viewport || test.viewport === "both" || test.viewport === profile.name);
        for (const test of tests) {
          const item = { name: test.name, result: "passed", steps: [], expectations: [] };
          try {
            for (const action of test.steps || []) { await step(page, action); item.steps.push({ action: action.action, result: "passed" }); }
            for (const check of test.expect || []) { await expect(page, check); item.expectations.push({ type: check.type, result: "passed" }); }
          } catch (error) { item.result = "failed"; item.error = error.message || String(error); }
          result.tests.push(item);
        }
        await page.screenshot({ path: "browser-game-" + profile.name + ".png", fullPage: true });
        if (result.pageErrors.length || result.tests.some((test) => test.result === "failed")) result.result = "failed";
        if (result.pageErrors.length) result.error = "Uncaught page errors: " + result.pageErrors.join(" | ");
      } catch (error) { result.result = "failed"; result.error = error.message || String(error); }
      await context.close();
      report.profiles.push(result);
    }
  } finally { await browser.close(); }
  if (report.profiles.some((profile) => profile.result === "failed")) report.result = "failed";
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  const lines = [
    "# DEBS browser runtime report", "", "- Result: **" + report.result.toUpperCase() + "**",
    "- URL: " + report.url, "- Declared tests: " + report.configuredTests, ""
  ];
  for (const profile of report.profiles) {
    lines.push("## " + profile.name + ": " + profile.result.toUpperCase());
    if (profile.error) lines.push("- Error: " + profile.error);
    if (profile.page) lines.push("- Viewport: " + profile.page.viewport.width + "×" + profile.page.viewport.height + "; horizontal overflow: " + profile.page.horizontalOverflow);
    lines.push("- Uncaught page errors: " + profile.pageErrors.length, "- Console errors (diagnostic): " + profile.consoleErrors.length);
    for (const test of profile.tests) lines.push("- " + test.result.toUpperCase() + ": " + test.name + (test.error ? " — " + test.error : ""));
    lines.push("");
  }
  lines.push("## Limits", ...report.limitations.map((value) => "- " + value), "");
  fs.writeFileSync(markdownPath, lines.join("\n"));
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== "passed") process.exitCode = 1;
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
