// Turns the single-file Vite build into an Artifact page:
// the Artifact host supplies <!doctype>/<html>/<head>/<body>, so strip them,
// keep <title> first, and copy the data file alongside.
import fs from "node:fs";
const html = fs.readFileSync("dist/index.html", "utf8");
const title = (html.match(/<title>[\s\S]*?<\/title>/) || [""])[0];
const head = (html.match(/<head>([\s\S]*?)<\/head>/) || ["", ""])[1]
  .replace(/<meta[^>]*>/g, "").replace(/<title>[\s\S]*?<\/title>/, "");
const body = (html.match(/<body>([\s\S]*?)<\/body>/) || ["", ""])[1];
fs.mkdirSync("dist/artifact/data", { recursive: true });
fs.writeFileSync("dist/artifact/index.html", `${title}\n${head.trim()}\n${body.trim()}\n`);
fs.copyFileSync("public/data/properties.json", "dist/artifact/data/properties.json");
console.log("artifact page:", (fs.statSync("dist/artifact/index.html").size / 1024).toFixed(1), "KiB");
