#!/usr/bin/env node
/**
 * server.mjs — the Topos dashboard integrator (owner's zone).
 *
 *   node dashboard/server.mjs                 → http://127.0.0.1:8090
 *   TOPOS_SCHOOL=/abs/path/schools/aurora.yaml … → fold another school
 *
 * Wires the modules by their delivered contracts:
 *   - auth  (AUTH-API.md): createAuth, verify(raw Cookie header), login
 *     returns the assembled Set-Cookie value, rateLimiter(k).ok, close().
 *   - data  (data.mjs): seedDemo(path) THEN open(path) → store with
 *     manifestPath (the school tab reads the YAML from disk through it).
 *   - views (views.mjs): ONE renderer, renderDashboard(manifest, store,
 *     session, {view, q}); login and the validation-refusal pages are the
 *     integrator's — written here in the same clay clothes.
 *
 * BOUNDARY (docs/BOUNDARIES.md): localhost only; local storage only; no
 * Supabase, no Vercel; demo data fictional; nothing from the client repo.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { loadManifest, validateManifest, contractProblems } from "../manifold/core.mjs";
import { createAuth } from "./auth.mjs";
import { open, seedDemo } from "./data.mjs";
import { renderDashboard } from "./views.mjs";
import { record as journalRecord } from "./journal.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PORT = Number(process.env.TOPOS_DASHBOARD_PORT ?? 8090);
const SCHOOL = process.env.TOPOS_SCHOOL ?? join(ROOT, "schools", "lotus.yaml");
const SECRET_FILE = join(HERE, ".data", "secret");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "spec", "manifest.schema.json"), "utf8"));

// ---- boot: the contract decides whether a school may open at all ----
const manifest = loadManifest(SCHOOL);
const bootProblems = [...validateManifest(manifest, SCHEMA), ...contractProblems(manifest)];
if (bootProblems.length) {
  console.error("refusing to open a school that does not hold the contract:");
  bootProblems.forEach((e) => console.error("  · " + e));
  process.exit(1);
}

let secret;
if (existsSync(SECRET_FILE)) secret = readFileSync(SECRET_FILE, "utf8").trim();
else {
  mkdirSync(dirname(SECRET_FILE), { recursive: true });
  secret = randomBytes(32).toString("hex");
  writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
}

const roles = ["director", "admissions", "finance", "coach"];
const auth = createAuth({ dir: join(HERE, ".data", "auth"), secret, roles });
auth.ensureUser("director@lotus.example", "topos-demo", "director");
auth.ensureUser("admissions@lotus.example", "topos-demo", "admissions");

seedDemo(SCHOOL);              // contract order: seed, then open
const store = open(SCHOOL);

/* ---- module registry (dashboard/MODULE-API.md) ----
 * Modules are discovered at boot from dashboard/modules/*.mjs. Each is
 * one file owning one tab; the server never imports their internals
 * beyond meta/render/handle/publicMeta. */
import { readdirSync } from "node:fs";
const MODULES = [];
{
  const dir = join(HERE, "modules");
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".mjs")).sort()) {
      const m = await import(join(dir, f));
      if (m.meta?.key && typeof m.render === "function") MODULES.push(m);
      else console.warn(`módulo ${f} ignorado: le falta meta.key o render() — el contrato manda`);
    }
  }
}
const byKey = new Map(MODULES.map((m) => [m.meta.key, m]));
const publicRoutes = new Map(MODULES.filter((m) => m.publicMeta?.path).map((m) => ["/" + m.publicMeta.path, m]));
const tabsFor = (role) => MODULES
  .filter((m) => !m.meta.roles?.length || m.meta.roles.includes(role))
  .sort((a, b) => (a.meta.order ?? 50) - (b.meta.order ?? 50))
  .map((m) => ({ key: m.meta.key, label: m.meta.label, href: `/m/${m.meta.key}` }));

// ---- integrator pages (same clay clothes as views.mjs, kept small) ----
const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const CHROME = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#EFEEEC"><title>Topos — acceso</title><link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet"><style>
:root{--cream:#EFEEEC;--navy:#001433;--orange:#FF7714;--lime:#EEF773;--card:#fff}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--navy);font-family:Nunito,system-ui,sans-serif}
.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{background:var(--card);border-radius:1.75rem;box-shadow:0 10px 0 rgba(0,20,51,.08),0 24px 48px rgba(0,20,51,.10);padding:36px;max-width:420px;width:100%}
h1{font-family:Fredoka;margin:0 0 4px;font-size:1.6rem}.sub{color:#3B4658;margin:0 0 22px;font-size:.95rem}
label{display:block;font-weight:700;font-size:.85rem;margin:14px 0 4px}input{width:100%;padding:12px 14px;border-radius:14px;border:2px solid rgba(0,20,51,.12);font:inherit;background:#fff}
input:focus-visible{outline:3px solid var(--navy);outline-offset:2px}
button{margin-top:20px;width:100%;min-height:48px;border:0;border-radius:999px;background:var(--orange);color:var(--navy);font-family:Fredoka;font-weight:700;font-size:1rem;cursor:pointer;box-shadow:0 6px 0 rgba(0,20,51,.15)}
button:active{transform:translateY(2px)}.err{background:#FFE9E4;border-radius:14px;padding:12px 14px;font-size:.9rem;margin:0 0 6px}
.brand{display:flex;gap:10px;align-items:center;margin-bottom:18px}.dot{width:34px;height:34px;border-radius:50%;background:var(--orange);display:grid;place-items:center;font-weight:900}
ul.problems{margin:0;padding-left:1.2rem;font-size:.9rem;line-height:1.6}a{color:#035D44;font-weight:700}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}</style></head><body><div class="wrap"><div class="card">`;
const END = "</div></div></body></html>";

const loginPage = (error) => `${CHROME}
  <div class="brand"><span class="dot" aria-hidden="true">t</span><strong style="font-family:Fredoka;font-size:1.2rem">topos · panel</strong></div>
  <h1>${esc(manifest.identity.name)}</h1>
  <p class="sub">Acceso del personal. Datos de demostración ficticios — docs/BOUNDARIES.md.</p>
  ${error ? `<p class="err">${esc(error)}</p>` : ""}
  <form method="post" action="/login"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Entrar</button></form>
  <p class="sub" style="margin-top:18px;font-size:.8rem">demo: director@lotus.example · topos-demo</p>${END}`;

const problemsPage = (problems) => `${CHROME}
  <h1>El contrato mordió</h1>
  <p class="sub">El manifiesto no se guardó: estas líneas no pasan el contrato de Topos.</p>
  <ul class="problems">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
  <p style="margin-top:20px"><a href="/?view=school">← volver al manifiesto</a></p>${END}`;

// ---- server ----
const readBody = (req) => new Promise((res) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => res(new URLSearchParams(d))); });
const send = (r, code, html, headers = {}) => { r.writeHead(code, { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff", ...headers }); r.end(html); };

/* ---- audit journal (dashboard/journal.mjs) --------------------------------
 * ONE helper for every hook; the routes below only call journalWrite() at
 * their write points and stay otherwise intact. Entries: auth (login-ok,
 * login-fail, logout), school (fold, fold-refused), and one per module key
 * (the form's `action`, ref = id of the record acted on when the form
 * carries one). journal.record never throws, so a dead disk changes no
 * response — the audit degrades to a console.error line, the panel lives. */
const JOURNAL_REF_FIELDS = ["ref", "lead", "lead_id", "leadId", "expense", "expense_id", "expenseId", "person", "thread", "post", "task", "id", "done", "pin"];
function journalWrite(req, { form = null, actor = "", role = "", module = "", action = "", ref = "" }) {
  let r = String(ref ?? "");
  if (!r && form) {
    for (const f of JOURNAL_REF_FIELDS) {
      const v = String(form.get(f) ?? "").trim();
      if (v) { r = v; break; }
    }
  }
  journalRecord({
    slug: store.slug,
    entry: {
      ts: new Date().toISOString(),
      actor: String(actor || "anonymous"),
      role: String(role || "unknown"),
      module: String(module),
      action: String(action),
      ref: r.slice(0, 120),
      ip: String(req.socket.remoteAddress ?? ""),
    },
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  // ---- public module routes (families portal): no staff session ----
  const pub = publicRoutes.get(path);
  if (pub) {
    const ctx = { manifest, store, slug: store.slug, query: url.searchParams };
    try {
      if (req.method === "POST") {
        const form = await readBody(req);
        let out = pub.renderPublic ? await pub.renderPublic(ctx, form) : { html: "<p>renderPublic pendiente</p>" };
        if (typeof out === "string") out = { html: out }; // modules may return a bare page; the POST branch used to swallow it (families agent caught this)
        if (out?.redirect) { res.writeHead(303, { location: out.redirect }); return res.end(); }
        return send(res, out?.status ?? 200, out?.html ?? "");
      }
      {
        const got = pub.renderPublic ? await pub.renderPublic(ctx) : { html: "<p>renderPublic pendiente</p>" };
        return send(res, got?.status ?? 200, typeof got === "string" ? got : (got?.html ?? ""));
      }
    } catch (e) {
      return send(res, 500, `<p style="font-family:sans-serif;padding:2rem">El portal de familias falló honestamente: ${esc(e.message)}</p>`);
    }
  }

  const who = auth.verify(req.headers.cookie ?? "");

  if (path === "/login") {
    if (req.method === "POST") {
      if (!auth.rateLimiter("ip:" + (req.socket.remoteAddress ?? "unknown")).ok) {
        journalWrite(req, { module: "auth", action: "login-fail", ref: "rate-limited" }); // sin cuerpo leído: actor 'anonymous'
        return send(res, 429, loginPage("Demasiados intentos desde tu red — espera un minuto."));
      }
      const b = await readBody(req);
      const attempt = String(b.get("email") ?? "");
      const out = auth.login(attempt, String(b.get("password") ?? ""));
      if (out.ok) {
        const sess = auth.verify(out.cookie) ?? {}; // email/role canónicos de la sesión recién creada
        journalWrite(req, { actor: sess.email || attempt, role: sess.role || "", module: "auth", action: "login-ok" });
        return send(res, 303, "", { location: "/", "set-cookie": out.cookie });
      }
      // motivo genérico: auth ya colapsa email-desconocido y contraseña-incorrecta en
      // «invalid-credentials» a propósito; el diario repite ese mismo, nada más.
      journalWrite(req, { actor: attempt, role: "unknown", module: "auth", action: "login-fail", ref: out.reason === "rate-limited" ? "rate-limited" : "invalid-credentials" });
      const msg = out.reason === "rate-limited" ? "Demasiados intentos — espera un minuto." : "Credenciales incorrectas.";
      return send(res, 401, loginPage(msg));
    }
    return who ? send(res, 303, "", { location: "/" }) : send(res, 200, loginPage());
  }

  if (!who) { res.writeHead(303, { location: "/login" }); return res.end(); }

  if (path === "/logout" && req.method === "POST") {
    journalWrite(req, { actor: who.email, role: who.role, module: "auth", action: "logout" });
    return send(res, 303, "", { location: "/login", "set-cookie": auth.logout(req.headers.cookie ?? "") });
  }

  // School tab save: validate BEFORE touching disk; only the director folds.
  if (path === "/school/save" && req.method === "POST") {
    if (who.role !== "director") return send(res, 403, problemsPage(["Solo el director puede plegar el manifiesto de la escuela."])); // no es escritura: no se registra
    const draft = (await readBody(req)).get("manifest") ?? "";
    let parsed;
    try { parsed = YAML.parse(draft); }
    catch (e) {
      journalWrite(req, { actor: who.email, role: who.role, module: "school", action: "fold-refused", ref: "1" }); // un problema: el YAML
      return send(res, 422, problemsPage(["YAML inválido: " + e.message]));
    }
    const problems = [...validateManifest(parsed, SCHEMA), ...contractProblems(parsed)];
    if (problems.length) {
      journalWrite(req, { actor: who.email, role: who.role, module: "school", action: "fold-refused", ref: String(problems.length) }); // ref = nº de problemas
      return send(res, 422, problemsPage(problems));
    }
    copyFileSync(SCHOOL, SCHOOL + ".bak"); // the previous fold survives
    writeFileSync(SCHOOL, draft);
    journalWrite(req, { actor: who.email, role: who.role, module: "school", action: "fold", ref: `${draft.length}B` });
    res.writeHead(303, { location: "/?view=school&folded=1" }); return res.end();
  }

  // ---- module routes ----
  if (path.startsWith("/m/")) {
    const key = path.slice(3);
    const mod = byKey.get(key);
    if (!mod) { res.writeHead(303, { location: "/" }); return res.end(); }
    if (mod.meta.roles?.length && !mod.meta.roles.includes(who.role))
      return send(res, 403, problemsPage([`El rol «${who.role}» no gobierna el módulo ${mod.meta.label}.`]));
    const ctx = { manifest, store, session: who, slug: store.slug, query: url.searchParams };
    if (req.method === "POST") {
      if (typeof mod.handle !== "function") return send(res, 405, problemsPage(["este módulo no acepta escrituras"]));
      const form = await readBody(req);
      let out = await mod.handle(ctx, form);
      if (typeof out === "string") out = { html: out };
      // el diario registra el POST saliente SIN estado de error (4xx/5xx = no cuentan;
      // un redirect de módulo es su éxito); el 403 de roles ni llega aquí.
      if (Number(out?.status ?? 200) < 400)
        journalWrite(req, { form, actor: who.email, role: who.role, module: key, action: String(form.get("action") ?? "post") });
      if (out?.redirect) { res.writeHead(303, { location: out.redirect }); return res.end(); }
      return send(res, out?.status ?? 200, page(mod, ctx, out?.html ?? ""));
    }
    return send(res, 200, page(mod, ctx, mod.render(ctx)));
  }

  if (path === "/" || path === "") {
    return send(res, 200, renderDashboard(manifest, store, who, {
      view: url.searchParams.get("view") ?? "hoy",
      q: url.searchParams.get("q") ?? "",
      folded: url.searchParams.get("folded") === "1",
      extraTabs: tabsFor(who.role),
    }));
  }

  res.writeHead(303, { location: "/" }); res.end();
});

// a module body rides the dashboard shell (views.mjs bodyOverride hook)
function page(mod, ctx, bodyHtml) {
  return renderDashboard(manifest, store, ctx.session, {
    view: mod.meta.key,
    title: mod.meta.label,
    bodyOverride: bodyHtml,
    extraTabs: tabsFor(ctx.session.role),
  });
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Topos dashboard (${manifest.identity.name}) → http://localhost:${PORT}`);
  console.log("demo staff (fictional — docs/BOUNDARIES.md): director@lotus.example / topos-demo");
});

process.on("SIGINT", () => { auth.close?.(); server.close(() => process.exit(0)); });
