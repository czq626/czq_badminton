#!/usr/bin/env node

const fs = require("fs");
const { execFileSync } = require("child_process");

const checks = [];

function pass(name) {
  checks.push({ name, ok: true });
}

function fail(name, detail) {
  checks.push({ name, ok: false, detail });
}

function assertIncludes(source, needle, name) {
  if (source.includes(needle)) pass(name);
  else fail(name, `Missing: ${needle}`);
}

function assertMatch(source, pattern, name) {
  if (pattern.test(source)) pass(name);
  else fail(name, `Pattern not found: ${pattern}`);
}

const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("styles.css", "utf8");
const js = fs.readFileSync("game.js", "utf8");

assertIncludes(html, '<canvas id="game" width="960" height="540">', "canvas has expected 16:9 resolution");
assertIncludes(html, '<link rel="stylesheet" href="./styles.css" />', "stylesheet is linked");
assertIncludes(html, '<script src="./game.js"></script>', "game script is linked");
assertIncludes(html, "先到 7 分获胜", "default overlay text matches 7-point rule");
assertMatch(js, /function matchCopy\b/, "function matchCopy");

[
  "modeButton",
  "assistButton",
  "soundButton",
  "pauseButton",
  "resetButton",
  "startButton",
  "statusStrip",
  "leftScore",
  "rightScore",
].forEach((id) => assertIncludes(html, `id="${id}"`, `required element #${id}`));

["单人", "双人", "蓝队", "红队", "休闲", "普通", "高手", "7分", "11分", "标准", "趣味", "开始游戏", "挥拍", "扣杀", "短球"].forEach((text) =>
  assertIncludes(html, text, `visible label ${text}`),
);

["drawCourt", "drawPlayer", "drawBird", "updateDemo", "awardPoint", "predictLandingX"].forEach((fn) =>
  assertMatch(js, new RegExp(`function ${fn}\\b`), `function ${fn}`),
);

[
  "singlePlayer",
  "playerModeButtons",
  "difficulty",
  "targetScore",
  "playStyle",
  "readyTimer",
  "assist",
  "muted",
  "particles",
  "localStorage",
  "document.cookie",
  "saveSettings",
  "loadSettings",
].forEach((token) =>
  assertIncludes(js, token, `game state token ${token}`),
);

[".touch-controls", ".status-strip", ".overlay", "@media (max-width: 720px)"].forEach((selector) =>
  assertIncludes(css, selector, `CSS rule ${selector}`),
);

try {
  execFileSync("node", ["--check", "game.js"], { stdio: "pipe" });
  pass("game.js syntax");
} catch (error) {
  fail("game.js syntax", error.stderr ? error.stderr.toString() : error.message);
}

const failed = checks.filter((item) => !item.ok);
checks.forEach((item) => {
  const mark = item.ok ? "PASS" : "FAIL";
  console.log(`${mark} ${item.name}${item.detail ? ` - ${item.detail}` : ""}`);
});

if (failed.length) {
  process.exitCode = 1;
} else {
  console.log(`\nAll ${checks.length} checks passed.`);
}
