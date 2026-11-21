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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const who = auth.verify(req.headers.cookie ?? "");

  if (path === "/login") {
    if (req.method === "POST") {
      if (!auth.rateLimiter("ip:" + (req.socket.remoteAddress ?? "unknown")).ok)
        return send(res, 429, loginPage("Demasiados intentos desde tu red — espera un minuto."));
      const b = await readBody(req);
      const out = auth.login(String(b.get("email") ?? ""), String(b.get("password") ?? ""));
      if (out.ok) return send(res, 303, "", { location: "/", "set-cookie": out.cookie });
      return send(res, 401, loginPage(out.reason === "rate-limited" ? "Demasiados intentos — espera un minuto." : "Credenciales incorrectas."));
    }
    return who ? send(res, 303, "", { location: "/" }) : send(res, 200, loginPage());
  }

  if (!who) { res.writeHead(303, { location: "/login" }); return res.end(); }

  if (path === "/logout" && req.method === "POST") {
    return send(res, 303, "", { location: "/login", "set-cookie": auth.logout(req.headers.cookie ?? "") });
  }

  // School tab save: validate BEFORE touching disk; only the director folds.
  if (path === "/school/save" && req.method === "POST") {
    if (who.role !== "director") return send(res, 403, problemsPage(["Solo el director puede plegar el manifiesto de la escuela."]));
    const draft = (await readBody(req)).get("manifest") ?? "";
    let parsed;
    try { parsed = YAML.parse(draft); }
    catch (e) { return send(res, 422, problemsPage(["YAML inválido: " + e.message])); }
    const problems = [...validateManifest(parsed, SCHEMA), ...contractProblems(parsed)];
    if (problems.length) return send(res, 422, problemsPage(problems));
    copyFileSync(SCHOOL, SCHOOL + ".bak"); // the previous fold survives
    writeFileSync(SCHOOL, draft);
    res.writeHead(303, { location: "/?view=school&folded=1" }); return res.end();
  }

  if (path === "/" || path === "") {
    return send(res, 200, renderDashboard(manifest, store, who, {
      view: url.searchParams.get("view") ?? "hoy",
      q: url.searchParams.get("q") ?? "",
    }));
  }

  res.writeHead(303, { location: "/" }); res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Topos dashboard (${manifest.identity.name}) → http://localhost:${PORT}`);
  console.log("demo staff (fictional — docs/BOUNDARIES.md): director@lotus.example / topos-demo");
});

process.on("SIGINT", () => { auth.close?.(); server.close(() => process.exit(0)); });
