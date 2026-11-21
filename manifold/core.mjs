/**
 * core.mjs — the shared organs of manifold: read, judge, fold.
 *
 * STABLE INTERFACES (frozen for the other builders):
 *   loadManifest(path)            → parsed object
 *   validateManifest(value, schema) → string[] of problems (empty = holds)
 *   contractProblems(manifest)      → string[] of beyond-schema problems
 *   renderSite(manifest)            → Record<"/path", html> — every page the school has
 *
 * renderSite grew from one page to a map of pages on 2026-11-21 (v0.2);
 * consumers must treat the return as "pages to write", keyed by URL path.
 */
import { readFileSync } from "node:fs";
import YAML from "yaml";

export function loadManifest(path) {
  return YAML.parse(readFileSync(path, "utf8"));
}

/* ---------------- tiny honest JSON Schema validator (subset) ------------- */
export function validateManifest(value, schema, path = "$", errors = []) {
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const))
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value))
    errors.push(`${path}: must be one of ${schema.enum.join(", ")}`);
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) { errors.push(`${path}: must be an object`); return errors; }
    for (const req of schema.required ?? [])
      if (!(req in value)) errors.push(`${path}.${req}: required and missing`);
    for (const [k, sub] of Object.entries(schema.properties ?? {}))
      if (k in value) validateManifest(value[k], sub, `${path}.${k}`, errors);
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) { errors.push(`${path}: must be an array`); return errors; }
    if (value.length < (schema.minItems ?? 0)) errors.push(`${path}: needs at least ${schema.minItems} items`);
    if (schema.items) value.forEach((v, i) => validateManifest(v, schema.items, `${path}[${i}]`, errors));
  } else if (schema.type === "string") {
    if (typeof value !== "string") errors.push(`${path}: must be a string`);
  } else if (schema.type === "number") {
    if (typeof value !== "number") errors.push(`${path}: must be a number`);
    else if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: must be >= ${schema.minimum}`);
  } else if (schema.type === "boolean") {
    if (typeof value !== "boolean") errors.push(`${path}: must be a boolean`);
  }
  return errors;
}

/* ---------------- extra contract beyond the schema ----------------------- */
export function contractProblems(manifest) {
  const problems = [];
  const seen = new Set();
  for (const p of manifest.programs ?? []) {
    if (seen.has(p.code)) problems.push(`programs: duplicate code ${p.code}`);
    seen.add(p.code);
    if (p.price?.published && !(p.price.amount > 0))
      problems.push(`program ${p.code}: published price must be a real amount (no invented figures)`);
  }
  for (const f of manifest.communication?.funnels ?? [])
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(f.address))
      problems.push(`funnel ${f.key}: address is not an address (it must be a real, proven mailbox)`);
  return problems;
}

/* ---------------- render: the manifest IS the school ---------------------- */
function shell(m, title, body, path) {
  const c = m.brand.palette;
  const nav = [["/", "Home"], ...m.programs.map((p) => [`/enrol/${p.code}`, p.name])];
  return `<!doctype html>
<html lang="${m.identity.defaultLocale}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { --brand:${c.brand}; --deep:${c.brandDeep}; --sun:${c.sun}; --teal:${c.teal}; --ink:${c.ink}; --paper:${c.paper}; --shell:${c.shell}; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:${m.brand.fonts.display}, system-ui, sans-serif; color:var(--ink); background:var(--paper); }
  header.site { background:var(--deep); color:white; padding:20px 24px; }
  header.site a { color:var(--sun); text-decoration:none; font-weight:700; }
  nav { display:flex; gap:14px; flex-wrap:wrap; padding:12px 24px; background:var(--shell); border-bottom:1px solid rgb(0 0 0 / 0.06); }
  nav a { color:var(--brand); text-decoration:none; font-weight:600; font-size:.9rem; }
  nav a[aria-current] { color:var(--ink); border-bottom:2px solid var(--sun); }
  main { max-width:960px; margin:0 auto; padding:32px 20px; }
  .hero { background:var(--deep); color:white; padding:44px 24px; text-align:center; }
  .hero h1 { margin:0; font-size:clamp(1.6rem,4vw,3rem); }
  .hero .tag { color:var(--sun); font-weight:700; margin-top:8px; }
  .grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); }
  .card { background:var(--shell); border-radius:20px; padding:20px; box-shadow:0 6px 20px rgb(47 29 58 / 0.10); }
  .card h3 { margin:0 0 6px; color:var(--deep); }
  .meta { font-size:.85rem; color:var(--brand); margin:0 0 8px; }
  .price { font-weight:700; } .eb { color:var(--teal); font-size:.8rem; }
  a.btn,.door { display:inline-block; background:var(--sun); color:var(--deep); padding:10px 18px; border-radius:999px; text-decoration:none; font-weight:700; border:0; }
  footer { background:var(--deep); color:white; padding:28px 24px; font-size:.9rem; }
  footer a { color:var(--sun); }
  .stamp { text-align:center; opacity:.55; font-size:.75rem; padding:10px; }
  form input, form select { display:block; width:100%; margin:10px 0; padding:10px; border-radius:10px; border:1px solid rgb(0 0 0 / 0.15); }
  .note { background:var(--shell); border-left:4px solid var(--teal); padding:10px 14px; font-size:.85rem; }
</style>
</head>
<body>
  <header class="site"><a href="/">${m.identity.name}</a></header>
  <nav>${nav.map(([href, label]) => `<a href="${href}"${href === path ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
  ${body}
  <footer>
    <strong>${m.identity.name}</strong> · ${m.identity.domain}<br>
    ${m.communication.postalAddress} · <a href="tel:${m.communication.phone}">${m.communication.phone}</a><br>
    ${(m.communication.funnels ?? []).map((f) => `<a href="mailto:${f.address}">${f.address}</a> · ${f.purpose}`).join("<br>")}
  </footer>
  <div class="stamp">generated by manifold from the manifest — the manifest IS the school</div>
</body>
</html>`;
}

const money = (p) => `${p.currency === "THB" ? "฿" : p.currency + " "}${p.amount.toLocaleString()} / ${p.unit}`;
const plural = (w) => (/y$/.test(w) ? w.slice(0, -1) + "ies" : /s$|sh$|ch$|x$/.test(w) ? w + "es" : w + "s");

export function renderSite(m) {
  const pages = {};
  const entity = m.topology.entity;

  pages["/"] = shell(m, `${m.identity.name} — generated by manifold`, `
  <div class="hero"><h1>${m.identity.name}</h1><div class="tag">${m.identity.tagline ?? ""}</div></div>
  <main><h2>Our ${plural(entity)}s</h2><div class="grid">${m.programs.map((p) => `
    <article class="card"><h3>${p.name}</h3>
      <p class="meta">${p.place} · ages ${p.ages} · ${p.season.starts} → ${p.season.ends}</p>
      ${p.price.published ? `<p class="price">${money(p.price)}${p.price.earlyBird ? ` <span class="eb">Early Bird until ${p.price.deadline}</span>` : ""}</p>` : ""}
      <a class="door" href="/enrol/${p.code}">Enrol →</a></article>`).join("")}</div></main>`, "/");

  for (const p of m.programs) {
    pages[`/enrol/${p.code}`] = shell(m, `${p.name} — ${m.identity.name}`, `
    <main><h2>Enrol: ${p.name}</h2>
      <p class="meta">${p.place} · ages ${p.ages} · ${p.season.starts} → ${p.season.ends}</p>
      ${p.price.published ? `<p class="price">${money(p.price)}</p>` : ""}
      <div class="note"><strong>This is a generated demo school.</strong> No payment is taken here and no message is sent anywhere — the form below only shows what a real Topos school puts on this page.</div>
      <form method="get" action="/enrol/${p.code}">
        <label>Parent name<input name="parent" placeholder="Full name"></label>
        <label>Child name and age<input name="child" placeholder="Name, age"></label>
        <label>Contact email<input name="email" type="email" placeholder="you@example.com"></label>
        <button class="btn" type="submit">Request a place</button>
      </form></main>`, `/enrol/${p.code}`);
  }

  pages["/desk"] = shell(m, `Desk — ${m.identity.name}`, `
  <main><h2>Admissions desk (demo)</h2>
    <p class="note">A real Topos desk shows live enrolment requests and payment proofs. This scaffold shows the shape of it — ${m.operations.features.dashboard ? "dashboard: on" : "dashboard: off in the manifest"}.</p>
    <div class="grid">${m.programs.map((p) => `<article class="card"><h3>${p.name}</h3><p class="meta">${money(p.price)} · ${p.season.starts} → ${p.season.ends}</p><p>Requests: <em>none yet (demo)</em></p></article>`).join("")}</div></main>`, "/desk");

  return pages;
}
