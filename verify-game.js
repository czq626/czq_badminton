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
const server = fs.readFileSync("room-server.js", "utf8");
const bundler = fs.readFileSync("build-single-html.js", "utf8");

assertIncludes(html, '<canvas id="game" width="960" height="540">', "canvas has expected 16:9 resolution");
assertIncludes(html, '<link rel="stylesheet" href="./styles.css" />', "stylesheet is linked");
assertIncludes(html, '<script src="./game.js"></script>', "game script is linked");
assertIncludes(html, "先到 7 分且领先 2 分获胜", "start screen explains win rule");
assertMatch(js, /function matchCopy\b/, "function matchCopy");

[
  "startScreen",
  "gameStage",
  "modeButton",
  "assistButton",
  "soundButton",
  "pauseButton",
  "resetButton",
  "startButton",
  "overlayActionButton",
  "statusStrip",
  "leftScore",
  "rightScore",
  "onlinePanel",
  "onlineStatus",
  "roomServerInput",
  "refreshRoomsButton",
  "createRoomButton",
  "resetOnlineButton",
  "roomList",
  "roomEmpty",
].forEach((id) => assertIncludes(html, `id="${id}"`, `required element #${id}`));

["单人挑战", "本地双人", "房间模式", "蓝队", "红队", "休闲", "普通", "高手", "7分", "11分", "标准", "趣味", "开始游戏", "挥拍", "扣杀", "短球"].forEach((text) =>
  assertIncludes(html, text, `visible label ${text}`),
);

["drawCourt", "drawPlayer", "drawBird", "updateDemo", "awardPoint", "predictLandingX", "refreshOnlineRooms", "createOnlineRoom", "joinOnlineRoom", "sendOnlineSnapshot", "applyOnlineSnapshot"].forEach((fn) =>
  assertMatch(js, new RegExp(`function ${fn}\\b`), `function ${fn}`),
);

[
  "matchMode",
  "singlePlayer",
  "matchModeButtons",
  "BroadcastChannel",
  "WebSocket",
  "remoteKeys",
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

[".start-screen", ".mode-card", ".online-panel", ".room-list", ".room-row", ".touch-controls", ".status-strip", ".overlay", "@media (max-width: 720px)"].forEach((selector) =>
  assertIncludes(css, selector, `CSS rule ${selector}`),
);

["create-room", "join-room", "relay", "Sec-WebSocket-Accept"].forEach((token) =>
  assertIncludes(server, token, `room server token ${token}`),
);

["dist", "game.html", "data:", "styles.css", "game.js"].forEach((token) =>
  assertIncludes(bundler, token, `single HTML bundler token ${token}`),
);

try {
  execFileSync("node", ["--check", "game.js"], { stdio: "pipe" });
  pass("game.js syntax");
} catch (error) {
  fail("game.js syntax", error.stderr ? error.stderr.toString() : error.message);
}

try {
  execFileSync("node", ["--check", "room-server.js"], { stdio: "pipe" });
  pass("room-server.js syntax");
} catch (error) {
  fail("room-server.js syntax", error.stderr ? error.stderr.toString() : error.message);
}

try {
  execFileSync("node", ["--check", "build-single-html.js"], { stdio: "pipe" });
  pass("build-single-html.js syntax");
} catch (error) {
  fail("build-single-html.js syntax", error.stderr ? error.stderr.toString() : error.message);
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
