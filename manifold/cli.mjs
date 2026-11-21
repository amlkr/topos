#!/usr/bin/env node
/**
 * manifold — the engine of Topos. (AGPL: the invariant is shared.)
 *
 *   manifold validate schools/lotus.yaml   → does the manifest hold the contract?
 *   manifold render   schools/lotus.yaml   → build/<school>/ — every page the school has
 *   manifold serve    schools/lotus.yaml   → render + http://localhost:8642
 *   manifold new      schools/lotus.yaml   → build + copy the manifest alongside (a scaffold)
 *
 * The organs (validate, contract, render) live in core.mjs with frozen
 * signatures — the studio and the tests import them, never this file.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest, validateManifest, contractProblems, renderSite } from "./core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "spec", "manifest.schema.json"), "utf8"));

const [cmd, file] = process.argv.slice(2);
if (!cmd || !file) {
  console.log("usage: manifold <validate|render|serve|new> schools/<school>.yaml");
  process.exit(cmd ? 1 : 0);
}
const manifest = loadManifest(file);
const errors = [...validateManifest(manifest, SCHEMA), ...contractProblems(manifest)];
const slug = file.split("/").pop().replace(/\.ya?ml$/, "");

if (cmd === "validate") {
  if (errors.length) { console.error(`✗ ${file}: ${errors.length} problem(s)`); errors.forEach((e) => console.error("  · " + e)); process.exit(1); }
  const plural = (w) => (/y$/.test(w) ? w.slice(0, -1) + "ies" : /s$|sh$|ch$|x$/.test(w) ? w + "es" : w + "s");
  console.log(`✓ ${file} holds the contract — ${manifest.programs.length} ${plural(manifest.topology.entity)}, ${manifest.operations.primitives.length} primitives, ${manifest.identity.locales.length} locale(s).`);
} else if (cmd === "render" || cmd === "serve" || cmd === "new") {
  if (errors.length) { console.error(`✗ refusing to build a broken manifest (${errors.length} problems)`); errors.forEach((e) => console.error("  · " + e)); process.exit(1); }
  const pages = renderSite(manifest);
  const outRoot = join(ROOT, "build", slug);
  for (const [path, html] of Object.entries(pages)) {
    const rel = path === "/" ? "index.html" : join(path.slice(1), "index.html");
    const dest = join(outRoot, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, html);
  }
  if (cmd === "new") writeFileSync(join(outRoot, "MANIFEST.yaml"), readFileSync(file, "utf8"));
  console.log(`✓ built ${Object.keys(pages).length} pages → build/${slug}/${cmd === "new" ? " (scaffold: manifest copied alongside)" : ""}`);
  if (cmd === "serve") {
    createServer((req, res) => {
      const path = decodeURIComponent(req.url.split("?")[0]).replace(/\/+$/, "") || "/";
      const html = pages[path] ?? null;
      if (html === null) { res.writeHead(404, { "content-type": "text/plain" }); res.end("404 — this page is not in the manifest"); return; }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html);
    }).listen(8642, "0.0.0.0", () => console.log("→ http://localhost:8642 · LAN http://192.168.1.190:8642 · Ctrl+C to stop"));
  }
}
