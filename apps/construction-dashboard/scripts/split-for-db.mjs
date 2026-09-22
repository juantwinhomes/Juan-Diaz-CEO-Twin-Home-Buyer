// Splits public/data/properties.json into one JSON file per property
// (dist/db/properties/<id>.json) plus dist/db/meta/dataset.json, ready to
// write into the artifact's shared database with ArtifactData.
import fs from "node:fs";
const d = JSON.parse(fs.readFileSync("public/data/properties.json", "utf8"));
fs.mkdirSync("dist/db/properties", { recursive: true });
fs.mkdirSync("dist/db/meta", { recursive: true });
for (const p of d.properties) fs.writeFileSync(`dist/db/properties/${p.id}.json`, JSON.stringify(p));
fs.writeFileSync("dist/db/meta/dataset.json", JSON.stringify({ asOf: d.asOf, sources: d.sources }));
console.log(d.properties.map((p) => p.id).join(" "));
