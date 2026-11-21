#!/usr/bin/env node
/**
 * studio.mjs — Topos Studio: the SaaS v0 surface of the platform.
 *
 *   node manifold/studio.mjs            → http://127.0.0.1:8080
 *   TOPOS_STUDIO_PORT=18080 node …      → same thing on a test port
 *
 * One process, one file. A viewer and a prototype — nothing more.
 *
 * What it does:
 *   - lists every school in schools/*.yaml (globbed fresh on EVERY request,
 *     so a second school appearing there shows up without a restart) plus
 *     new schools born in Studio, which live only in memory;
 *   - serves each school's LIVE site: renderSite is called on every request,
 *     v0 does not cache;
 *   - gives a two-pane editor (YAML left, live iframe right) whose "Fold"
 *     button validates through the frozen organs and, when clean, stores the
 *     text as an in-memory draft the preview then prefers;
 *   - "reset" drops a draft back to disk truth.
 *
 * Hard rules (the safety of this whole surface):
 *   1. Studio NEVER writes any file. No fs.write exists in this module by
 *      design; drafts are Map entries and die with the process. schools/*.yaml
 *      is untouched. The home page says so out loud — house rule: nothing is
 *      claimed on screen that the system has not done.
 *   2. Slug must match /^[a-z0-9-]+$/ AND come from the schools glob or the
 *      in-memory maps. Anything else is refused (400/404) before a filesystem
 *      path is ever assembled. The URL tail of a preview is only ever used as
 *      an exact key into renderSite's own page map — never joined to a path.
 *   3. All chrome HTML escapes every user-controlled string from the YAML.
 *      renderSite output is the product and is served as-is, exactly as the
 *      engine would write it to build/.
 *
 * Imports the frozen interfaces from core.mjs; never modifies them.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { validateManifest, contractProblems, renderSite } from "./core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SCHOOLS_DIR = join(ROOT, "schools");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "spec", "manifest.schema.json"), "utf8"));

const PORT = Number(process.env.TOPOS_STUDIO_PORT) || 8080;
const HOST = "127.0.0.1"; // bound to localhost only: this is a prototype
const SLUG_RE = /^[a-z0-9-]+$/;
const MAX_BODY = 1024 * 1024; // 1 MiB of YAML is already an absurd manifest

/* ------------------------------ state ----------------------------------- *
 * The whole "database" of v0 is these two maps. Nothing survives the process,
 * nothing reaches the disk. */
const drafts = new Map(); // slug → draft YAML text (preferred over truth)
const memory = new Map(); // slug → YAML text of schools created in Studio

/* --------------------------- discovery (no hardcoding) ------------------ */
function diskSchools() {
  let names;
  try { names = readdirSync(SCHOOLS_DIR); } catch { return []; }
  const out = [];
  for (const f of names.sort()) {
    const m = f.match(/^([a-z0-9-]+)\.ya?ml$/);
    if (m) out.push({ slug: m[1], file: join(SCHOOLS_DIR, f) });
  }
  return out;
}

function knownSlugs() {
  const set = new Map(); // slug → "disk" | "memory"
  for (const d of diskSchools()) set.set(d.slug, "disk");
  for (const slug of memory.keys()) if (!set.has(slug)) set.set(slug, "memory");
  return set;
}

function sourceKind(slug) {
  if (drafts.has(slug)) return "draft";
  if (memory.has(slug)) return "memory";
  if (diskSchools().some((d) => d.slug === slug)) return "disk";
  return null;
}

function currentText(slug) {
  // the text the preview and the editor work with: draft beats truth
  if (drafts.has(slug)) return drafts.get(slug);
  if (memory.has(slug)) return memory.get(slug);
  const hit = diskSchools().find((d) => d.slug === slug);
  if (!hit) return null;
  try { return readFileSync(hit.file, "utf8"); } catch { return null; }
}

/* ------------------------------ judgement ------------------------------- */
function checkText(text) {
  // → { manifest } or { problems: string[] } — schema + contract, nothing invented
  let manifest;
  try { manifest = YAML.parse(text); }
  catch (e) { return { problems: ["YAML does not parse: " + e.message] }; }
  const problems = [...validateManifest(manifest, SCHEMA)];
  if (manifest && typeof manifest === "object" && !Array.isArray(manifest))
    problems.push(...contractProblems(manifest));
  if (problems.length) return { problems };
  return { manifest };
}

function slugFromDomain(domain) {
  const first = String(domain ?? "").split(".")[0].toLowerCase();
  const cleaned = first.replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  return cleaned && SLUG_RE.test(cleaned) ? cleaned : null;
}

function uniqueSlug(base) {
  const taken = knownSlugs();
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const s = base + "-" + i;
    if (!taken.has(s)) return s;
  }
  return null;
}

/* ------------------------------- chrome --------------------------------- *
 * esc() guards every string that came from YAML (or from the URL). The
 * product pages from renderSite are served raw — that IS the product. */
function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

const CSS = `
:root{--ink:#1c2321;--paper:#f7f6f2;--card:#ffffff;--line:#ddd8cf;--faint:#787f79;--bad:#a31515;--good:#0b6b57}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--good)}
.wrap{max-width:1000px;margin:0 auto;padding:28px 20px}
h1{font-size:1.5rem;margin:0 0 2px}
.sub{color:var(--faint);margin:0 0 20px;font-size:.9rem}
.banner{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--good);border-radius:10px;padding:12px 16px;margin:0 0 22px;font-size:.92rem}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top;font-size:.92rem}
th{background:#efece5;font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--faint)}
tr:last-child td{border-bottom:0}
.badge{display:inline-block;border-radius:999px;padding:1px 9px;font-size:.72rem;font-weight:700;border:1px solid var(--line);background:#efece5;color:var(--faint)}
.badge.draft{background:#fdf3dd;border-color:#e2c98a;color:#7a5a12}
.badge.new{background:#e4f2ee;border-color:#a9d8cb;color:var(--good)}
.btn{display:inline-block;background:var(--good);color:#fff;border:0;border-radius:8px;padding:8px 16px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.btn.ghost{background:var(--card);color:var(--ink);border:1px solid var(--line)}
textarea.code{display:block;width:100%;min-height:180px;font:12.5px/1.5 ui-monospace,"SF Mono",Menlo,Consolas,monospace;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);resize:vertical}
h2{font-size:1.05rem;margin:30px 0 10px}
.faint{color:var(--faint);font-size:.85rem}
.bar{display:flex;gap:12px;align-items:center;padding:8px 14px;background:var(--card);border-bottom:1px solid var(--line)}
.bar .spacer{flex:1}
.panes{display:flex;height:calc(100vh - 46px)}
.pane{flex:1 1 50%;min-width:0;display:flex;flex-direction:column}
.pane+.pane{border-left:1px solid var(--line)}
#yaml{flex:1;border:0;padding:16px;font:12.5px/1.5 ui-monospace,"SF Mono",Menlo,Consolas,monospace;resize:none;background:var(--card);color:var(--ink)}
#frame{flex:1;border:0;width:100%;background:var(--card)}
.status{padding:10px 14px;font-size:.85rem;max-height:36%;overflow:auto;border-top:1px solid var(--line);background:var(--card)}
.status ul{margin:4px 0;padding-left:20px}
.status.bad,.status.bad li{color:var(--bad)}
.status.good,.status.good li{color:var(--good)}
`;

function chrome(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

const NEW_TEMPLATE = `# A new school, born in Studio — it lives in memory only.
# Rename, re-point the domain, add your programs, then Fold.
apiVersion: topos/v0
kind: School

identity:
  name: New School
  domain: newschool.example
  defaultLocale: en
  locales: [en]

brand:
  palette:
    brand: "#0f6e5c"
    brandDeep: "#083d33"
    sun: "#e8a33d"
    teal: "#3aa988"
    ink: "#1c2321"
    paper: "#f6f8f7"
    shell: "#ffffff"
  fonts:
    display: Fraunces
    body: system

topology:
  entity: camp
  groupsBy: season
  agesRange: "5-12"

programs:
  - code: NEW-SUMMER-1
    name: Summer Camp
    place: Somewhere worth naming
    ages: "5-12"
    season: { starts: "2027-04-01", ends: "2027-04-30" }
    price: { amount: 0, currency: THB, unit: camp, published: false }
    door: /enrol/NEW-SUMMER-1

communication:
  funnels:
    - key: admissions
      address: admissions@newschool.example
      purpose: Places and enrolment
  phone: "+0000000000"
  postalAddress: "Fill in a real address before this goes anywhere"

content:
  blog: false
  mediaConsent: none-required

operations:
  primitives: [persons, enrolments, payments, communication, content]
  features:
    dashboard: false
    parentPortal: false
    proofs: false
    marketingEngine: false
`;

function homePage() {
  const rows = [];
  const entries = [...knownSlugs().entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [slug, kind] of entries) {
    const hasDraft = drafts.has(slug);
    let name = "—", entity = "—", locales = "—", count = "—", holds = "does not parse";
    const text = currentText(slug);
    if (text !== null) {
      const chk = checkText(text);
      if (chk.manifest) {
        const m = chk.manifest;
        name = m.identity.name;
        entity = m.topology.entity;
        locales = m.identity.locales.join(", ");
        count = String(m.programs.length);
        holds = "yes";
      } else {
        holds = chk.problems.length + " problem(s)";
      }
    }
    const badges =
      (kind === "memory" ? '<span class="badge new">draft · in memory</span> ' : '<span class="badge">on disk</span> ') +
      (hasDraft ? '<span class="badge draft">unsaved draft</span>' : "");
    rows.push(`<tr>
  <td><strong>${esc(name)}</strong><br><span class="faint">${esc(slug)}</span><br>${badges}</td>
  <td>${esc(entity)}</td><td>${esc(locales)}</td><td>${esc(count)}</td><td>${esc(holds)}</td>
  <td><a href="/school/${esc(slug)}/">preview</a> · <a href="/edit/${esc(slug)}">edit</a></td>
</tr>`);
  }
  const table = rows.length
    ? `<table><thead><tr><th>school</th><th>entity</th><th>locales</th><th>programs</th><th>contract</th><th>links</th></tr></thead><tbody>${rows.join("\n")}</tbody></table>`
    : `<p class="faint">No schools yet — schools/*.yaml is empty and nothing was created here.</p>`;

  return chrome("Topos Studio", `<div class="wrap">
<h1>Topos Studio</h1>
<p class="sub">SaaS v0 · the surface you are looking at is a viewer and a prototype.</p>
<div class="banner"><strong>drafts live in memory; nothing here touches disk.</strong>
Studio never writes a file — schools/*.yaml stays exactly as it is. A fold validates and keeps
your text in this process only; a reset drops it back to disk truth. Preview sites render on
every request from the live manifest (draft first, if folded). Schools are re-globbed from
schools/*.yaml on every page view. Bound to 127.0.0.1 only.</div>
${table}
<h2>New school</h2>
<p class="faint">Write a manifest and create it here. If it validates, it joins the list above with a <em>draft</em> badge — in memory only.</p>
<textarea id="ta" class="code" spellcheck="false">${esc(NEW_TEMPLATE)}</textarea>
<p><button id="mk" class="btn">Create school (POST /api/new)</button> <span id="msg" class="faint"></span></p>
<script>
(function () {
  "use strict";
  var ta = document.getElementById("ta"), msg = document.getElementById("msg");
  document.getElementById("mk").addEventListener("click", async function () {
    msg.textContent = "…";
    try {
      var r = await fetch("/api/new", { method: "POST", headers: { "content-type": "text/plain" }, body: ta.value });
      var j = await r.json();
      if (j.ok) {
        msg.textContent = "";
        msg.append("created in memory — slug: ");
        var a = document.createElement("a");
        a.href = "/edit/" + encodeURIComponent(j.slug);
        a.textContent = j.slug + " → edit";
        msg.append(a, ". Reload the page to see it listed.");
      } else {
        msg.textContent = "";
        var ul = document.createElement("ul");
        (j.problems || ["refused"]).forEach(function (p) { var li = document.createElement("li"); li.textContent = p; ul.append(li); });
        msg.append(ul);
        msg.style.color = "#a31515";
      }
    } catch (e) {
      msg.style.color = "#a31515";
      msg.textContent = "network error: " + e.message;
    }
  });
})();
</script>
</div>`);
}

function editorPage(slug) {
  const S = JSON.stringify(slug); // safe injection of the URL-supplied slug into JS
  return chrome(`edit ${slug} — Topos Studio`, `<div class="bar">
<a href="/">← Studio</a>
<strong>/edit/${esc(slug)}</strong>
<span id="src" class="faint">loading…</span>
<span class="spacer"></span>
<button id="fold" class="btn">Fold</button>
<button id="reset" class="btn ghost">Reset to disk truth</button>
</div>
<div class="panes">
  <section class="pane">
    <textarea id="yaml" spellcheck="false" aria-label="manifest YAML"></textarea>
    <div id="status" class="status faint">Fold validates the YAML (schema + contract). If clean, it is kept as an in-memory draft the preview prefers. Nothing is written to disk.</div>
  </section>
  <section class="pane"><iframe id="frame" title="live preview of ${esc(slug)}"></iframe></section>
</div>
<script>
(function () {
  "use strict";
  var SLUG = ${S};
  var ta = document.getElementById("yaml");
  var frame = document.getElementById("frame");
  var src = document.getElementById("src");
  var status = document.getElementById("status");
  var LABELS = { draft: "draft (in memory — not on disk)", memory: "memory-new school", disk: "disk truth (schools/)" };
  function setStatus(items, cls, head) {
    status.className = "status " + cls;
    status.replaceChildren();
    if (head) status.append(head);
    var ul = document.createElement("ul");
    items.forEach(function (t) { var li = document.createElement("li"); li.textContent = t; ul.append(li); });
    status.append(ul);
  }
  async function loadText() {
    var r = await fetch("/api/manifest/" + encodeURIComponent(SLUG), { cache: "no-store" });
    if (!r.ok) { setStatus(["GET /api/manifest replied " + r.status + " — the school is unknown"], "bad"); return; }
    ta.value = await r.text();
    var k = r.headers.get("x-topos-source") || "unknown";
    src.textContent = "source: " + (LABELS[k] || k);
  }
  function previewUrl() { return "/school/" + encodeURIComponent(SLUG) + "/?fold=" + Date.now(); }
  document.getElementById("fold").addEventListener("click", async function () {
    try {
      var r = await fetch("/api/render/" + encodeURIComponent(SLUG), { method: "POST", headers: { "content-type": "text/plain" }, body: ta.value });
      var j = await r.json();
      if (j.ok) {
        setStatus(j.pages || [], "good", "✓ folded — draft now in memory, preview reloaded. Pages:");
        frame.src = previewUrl();
        src.textContent = "source: " + LABELS.draft;
      } else {
        setStatus(j.problems || ["refused"], "bad", "✗ not folded — the manifest does not hold the contract:");
      }
    } catch (e) { setStatus(["network error: " + e.message], "bad"); }
  });
  document.getElementById("reset").addEventListener("click", async function () {
    try {
      var r = await fetch("/api/reset/" + encodeURIComponent(SLUG), { method: "POST" });
      var j = await r.json();
      if (j.ok) {
        setStatus([j.hadDraft ? "✓ draft dropped — back to disk truth" : "no draft was present — already at disk truth"], "good");
        await loadText();
        frame.src = previewUrl();
      } else setStatus(j.problems || ["reset refused"], "bad");
    } catch (e) { setStatus(["network error: " + e.message], "bad"); }
  });
  loadText().then(function () { frame.src = previewUrl(); });
})();
</script>`);
}

function messagePage(title, head, lines, back) {
  const body = `<div class="wrap"><h1>${esc(title)}</h1><p>${esc(head)}</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<p>${back.map(([href, label]) => `<a href="${esc(href)}">${esc(label)}</a>`).join(" · ")}</p></div>`;
  return chrome(title, body);
}

/* ------------------------------- serving -------------------------------- */
function send(res, code, type, body, extra) {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...(extra || {}) });
  res.end(body);
}
const sendJSON = (res, code, obj) => send(res, code, "application/json; charset=utf-8", JSON.stringify(obj, null, 2));

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("body over 1 MiB — refused"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function decodeSegment(s) {
  try { return decodeURIComponent(s); } catch { return null; }
}

function routePreview(req, res, slugSeg, tailSegs) {
  const slug = decodeSegment(slugSeg);
  if (slug === null || !SLUG_RE.test(slug))
    return send(res, 400, "text/plain; charset=utf-8", `400 — "${slugSeg}" is not a school slug. Slugs must match /^[a-z0-9-]+$/.`);
  const kind = sourceKind(slug);
  if (!kind)
    return send(res, 404, "text/plain; charset=utf-8",
      `404 — no school "${slug}": it is neither in schools/*.yaml nor in Studio memory. Known slugs: ${[...knownSlugs().keys()].join(", ") || "(none)"}.`);
  const text = currentText(slug);
  if (text === null)
    return send(res, 404, "text/plain; charset=utf-8", `404 — the source of "${slug}" disappeared while reading.`);

  const chk = checkText(text);
  if (chk.problems)
    return send(res, 422, "text/html; charset=utf-8", messagePage(
      `${slug} — cannot render`, `The current source (${kind}) does not hold the contract, so Studio will not render it:`, chk.problems,
      [["/", "← Studio home"], [`/edit/${slug}`, "open the editor"]]));

  let pages;
  try { pages = renderSite(chk.manifest); }
  catch (e) { return send(res, 500, "text/plain; charset=utf-8", `500 — renderSite failed on a manifest that validated: ${e.message}`); }

  const tail = tailSegs.map(decodeSegment);
  if (tail.some((t) => t === null)) return send(res, 400, "text/plain; charset=utf-8", "400 — malformed percent-encoding in the path.");
  const path = ("/" + tail.join("/")).replace(/\/+$/, "") || "/";
  const html = pages[path];
  if (html === undefined)
    return send(res, 404, "text/html; charset=utf-8", messagePage(
      `404 — ${path}`,
      `Path "${path}" is not a page of ${slug}'s manifest (served from: ${kind}). This manifest defines:`,
      Object.keys(pages).sort(),
      [["/", "← Studio home"], [`/school/${slug}/`, `go to ${slug} home`]]));
  // the product, served as-is:
  return send(res, 200, "text/html; charset=utf-8", html, { "x-topos-source": kind });
}

async function route(req, res) {
  const u = new URL(req.url, `http://${HOST}:${PORT}`);
  const segs = u.pathname.split("/").filter(Boolean);
  const method = (req.method || "GET").toUpperCase();

  if (segs.length === 0 && method === "GET") return send(res, 200, "text/html; charset=utf-8", homePage());

  if (segs[0] === "school") return routePreview(req, res, segs[1] ?? "", segs.slice(2));

  if (segs[0] === "edit" && segs.length === 2) {
    if (method !== "GET") return send(res, 405, "text/plain; charset=utf-8", "405 — use GET");
    const slug = decodeSegment(segs[1]);
    if (slug === null || !SLUG_RE.test(slug)) return send(res, 400, "text/plain; charset=utf-8", `400 — "${segs[1]}" is not a school slug.`);
    if (!sourceKind(slug)) return send(res, 404, "text/plain; charset=utf-8", `404 — unknown school "${slug}".`);
    return send(res, 200, "text/html; charset=utf-8", editorPage(slug));
  }

  if (segs[0] === "api" && segs[1] === "manifest") {
    if (method !== "GET") return send(res, 405, "application/json; charset=utf-8", JSON.stringify({ ok: false, problems: ["use GET"] }));
    const slug = decodeSegment(segs[2] ?? "");
    if (slug === null || !SLUG_RE.test(slug)) return sendJSON(res, 400, { ok: false, problems: [`"${segs[2]}" is not a school slug`] });
    const kind = sourceKind(slug);
    if (!kind) return sendJSON(res, 404, { ok: false, problems: [`unknown school "${slug}"`] });
    const text = currentText(slug);
    if (text === null) return sendJSON(res, 404, { ok: false, problems: [`the source of "${slug}" disappeared`] });
    return send(res, 200, "text/plain; charset=utf-8", text, { "x-topos-source": kind });
  }

  if (segs[0] === "api" && segs[1] === "render") {
    if (method !== "POST") return sendJSON(res, 405, { ok: false, problems: ["use POST"] });
    const slug = decodeSegment(segs[2] ?? "");
    if (slug === null || !SLUG_RE.test(slug)) return sendJSON(res, 400, { ok: false, problems: [`"${segs[2]}" is not a school slug`] });
    if (!sourceKind(slug)) return sendJSON(res, 404, { ok: false, problems: [`unknown school "${slug}" — use POST /api/new to create a school`] });
    let body;
    try { body = await readBody(req); }
    catch (e) { return sendJSON(res, e.status || 400, { ok: false, problems: [e.message] }); }
    const chk = checkText(body);
    if (chk.problems) return sendJSON(res, 422, { ok: false, problems: chk.problems });
    let pages;
    try { pages = renderSite(chk.manifest); }
    catch (e) { return sendJSON(res, 422, { ok: false, problems: ["renderSite: " + e.message] }); }
    drafts.set(slug, body); // IN MEMORY ONLY — no write exists anywhere in this file
    return sendJSON(res, 200, { ok: true, pages: Object.keys(pages).sort(), source: "draft (in memory; nothing touched disk)" });
  }

  if (segs[0] === "api" && segs[1] === "new" && segs.length === 2) {
    if (method !== "POST") return sendJSON(res, 405, { ok: false, problems: ["use POST"] });
    let body;
    try { body = await readBody(req); }
    catch (e) { return sendJSON(res, e.status || 400, { ok: false, problems: [e.message] }); }
    const chk = checkText(body);
    if (chk.problems) return sendJSON(res, 422, { ok: false, problems: chk.problems });
    const base = slugFromDomain(chk.manifest.identity.domain);
    if (!base) return sendJSON(res, 422, { ok: false, problems: [`identity.domain "${chk.manifest.identity.domain}" yields no usable slug (^[a-z0-9-]+$)`] });
    const slug = uniqueSlug(base);
    if (!slug) return sendJSON(res, 422, { ok: false, problems: ["too many name collisions for this domain"] });
    memory.set(slug, body); // IN MEMORY ONLY
    return sendJSON(res, 201, { ok: true, slug });
  }

  if (segs[0] === "api" && segs[1] === "reset") {
    if (method !== "POST") return sendJSON(res, 405, { ok: false, problems: ["use POST"] });
    const slug = decodeSegment(segs[2] ?? "");
    if (slug === null || !SLUG_RE.test(slug)) return sendJSON(res, 400, { ok: false, problems: [`"${segs[2]}" is not a school slug`] });
    if (!sourceKind(slug)) return sendJSON(res, 404, { ok: false, problems: [`unknown school "${slug}"`] });
    const hadDraft = drafts.delete(slug);
    return sendJSON(res, 200, { ok: true, hadDraft, source: sourceKind(slug) });
  }

  return send(res, 404, "text/plain; charset=utf-8", `404 — no such Studio route. Try / , /edit/<slug> , /school/<slug>/… , /api/manifest/<slug>.`);
}

const server = createServer((req, res) => {
  route(req, res).catch((e) => {
    console.error("[studio] unhandled:", e);
    if (!res.headersSent) send(res, 500, "text/plain; charset=utf-8", `500 — studio hit an unexpected error: ${e.message}`);
    else res.end();
  });
});

server.on("error", (e) => {
  console.error(`[studio] cannot start: ${e.code || ""} ${e.message}`);
  console.error("[studio] the real server needs 127.0.0.1:8080 free — stop whatever holds it, or pass TOPOS_STUDIO_PORT.");
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Topos Studio → http://${HOST}:${PORT} · drafts live in memory only; nothing here touches disk`);
});
