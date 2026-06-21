#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = __dirname;
const distDir = path.join(root, "dist");
const htmlPath = path.join(root, "index.html");
const cssPath = path.join(root, "styles.css");
const jsPath = path.join(root, "game.js");
const outPath = path.join(distDir, "game.html");

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function dataUriFor(relativePath) {
  const clean = relativePath.replace(/^\.?\//, "");
  const filePath = path.join(root, clean);
  const data = fs.readFileSync(filePath);
  return `data:${mimeFor(filePath)};base64,${data.toString("base64")}`;
}

function inlineAssetReferences(source) {
  return source.replace(/(["'(])(?:\.\/)?(assets\/generated\/images\/[^"'()]+)(["')])/g, (match, before, asset, after) => {
    const filePath = path.join(root, asset);
    if (!fs.existsSync(filePath)) return match;
    return `${before}${dataUriFor(asset)}${after}`;
  });
}

const html = fs.readFileSync(htmlPath, "utf8");
const css = inlineAssetReferences(fs.readFileSync(cssPath, "utf8"));
const js = inlineAssetReferences(fs.readFileSync(jsPath, "utf8"));

let output = html
  .replace(/<link rel="stylesheet" href="\.\/styles\.css" \/>/, `<style>\n${css}\n</style>`)
  .replace(/<script src="\.\/game\.js"><\/script>/, `<script>\n${js}\n</script>`);

output = inlineAssetReferences(output);

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(outPath, output);
console.log(`Wrote ${path.relative(root, outPath)}`);
