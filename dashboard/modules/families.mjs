/**
 * families.mjs — portal público de familias + pestaña de ayuda staff.
 *
 * Dos mitades, un archivo (dashboard/MODULE-API.md):
 *
 * 1. /familias?t=<token> — la familia abre UN enlace de capacidad (la misma
 *    disciplina que los enlaces de inscripción: el token ES la credencial;
 *    sin login, sin cookies, sin navegación al área staff). Ve SOLO su
 *    familia: hijos con las semanas del programa, estado de pago,
 *    consentimiento y — si el archivo del módulo comms existe en disco —
 *    los comunicados de la escuela (solo lectura).
 *
 * 2. /m/familias (rol director) — SOLO una página de ayuda para la demo:
 *    lista los enlaces de las familias ficticias para que un humano los
 *    abra. En producción el token se genera aleatorio, se guarda en el
 *    registro de la familia y se envía POR CORREO, uno por familia; nunca
 *    se lista para el staff. Esta pestaña existe porque la demo no tiene
 *    correo — y se etiqueta como demo.
 *
 * ── Derivación del token (demo) ─────────────────────────────────────────
 * token = 12 primeros hex de sha256("<slug>:<personId>"), siendo personId
 * la referencia de familia en store.records().persons[i].id (NUNCA el ref
 * de una inscripción). Determinista: misma familia, mismo enlace en cada
 * arranque, sin secretos en disco. NO es el esquema de producción — un
 * hash derivable de un id público es predecible para quien conozca el
 * formato; por eso la nota anterior.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Honestidad (docs/BOUNDARIES.md + regla de casa 1): no hay pasarela de
 * pago. "Pagado" se imprime siempre con quién lo registró (una persona del
 * equipo). "Vencido" se dice como vencido — nunca como pagado. Datos
 * ficticios. El consentimiento fotográfico es un valor DEMO derivado del
 * hash de la familia, y la página lo dice.
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { jsonStore, esc, head, endHead, card, money, todayISO } from "../module-kit.mjs";

export const meta = { key: "familias", label: "Familias (vista staff)", order: 80, roles: ["director"], feature: "portal" };

/** Ruta pública: /familias (GET con ?t=…, POST con t en el body). */
export const publicMeta = { path: "familias" };

/* ── token y estados, derivados siempre de store.records() ── */

const TOKEN_RE = /^[a-z0-9]{8,16}$/;

function familyToken(slug, personId) {
  // Demo: ver el bloque "Derivación del token" de la cabecera.
  return createHash("sha256").update(`${slug}:${personId}`).digest("hex").slice(0, 12);
}

function consentState(slug, personId) {
  // Valor DEMO determinista: primer hex del hash < 8 → "en el expediente".
  // La escuela real firma un consentimiento PDPA; aquí no hay PDF que leer.
  const h = createHash("sha256").update(`consent:${slug}:${personId}`).digest("hex");
  return parseInt(h[0], 16) < 8 ? "on-file" : "pending";
}

/** Estado de pago honesto: paid | pending | overdue | unknown. */
function payState(pay, asOf) {
  if (pay?.paid) return "paid";
  if (!pay?.due) return "unknown";
  return String(pay.due) < String(asOf) ? "overdue" : "pending";
}

const STATUS_TEXT = {
  paid: { label: "Pagado", tone: "lime" },
  pending: { label: "Pendiente", tone: "orange" },
  overdue: { label: "Vencido", tone: "coral" },
  unknown: { label: "Sin fecha registrada", tone: "sky" },
};

const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtDateEs(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!m) return String(value ?? "");
  return `${Number(m[3])} ${MESES_ES[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * Todo lo que una familia puede ver, en un objeto plano propio: se leen
 * hojas sueltas de records() y del manifiesto; nada vivo cruza la página.
 */
function familyView(store, personId) {
  const rec = store.records();
  const person = (rec.persons ?? []).find((p) => p.id === personId);
  if (!person) return null;

  // ancla de fechas: la referencia del seed (_meta.json), para que un
  // "vence mañana" no se convierta en "vencía ayer" a medianoche.
  const asOf = store.meta()?.reference ?? todayISO();

  const programs = new Map((store.manifest?.programs ?? []).map((p) => [p.code, p]));
  const payByEnrolment = new Map((rec.payments ?? []).map((pay) => [pay.enrolmentId, pay]));

  const kids = (rec.enrolments ?? [])
    .filter((e) => e.personId === personId)
    .map((e) => {
      const prog = programs.get(e.programCode) ?? null;
      const pay = payByEnrolment.get(e.id) ?? null;
      return {
        child: String(e.child ?? ""),
        age: Number.isFinite(Number(e.childAge)) ? Number(e.childAge) : null,
        ref: String(e.ref ?? ""),
        programName: prog ? String(prog.name) : String(e.programCode ?? ""),
        place: prog ? String(prog.place ?? "") : "",
        termStart: prog?.season?.starts ?? null,
        termEnd: prog?.season?.ends ?? null,
        inManifest: Boolean(prog),
        amount: Number(pay?.amount ?? e.amount ?? 0),
        currency: String(pay?.currency ?? e.currency ?? "THB"),
        state: payState(pay, asOf),
        due: pay?.due ?? null,
        paidAt: pay?.paidAt ?? null,
        markedBy: pay?.markedBy ?? null,
      };
    });

  return {
    personId,
    parentName: String(person.parent?.name ?? ""),
    children: (person.children ?? []).map((c) => ({
      name: String(c.name ?? ""),
      age: Number.isFinite(Number(c.age)) ? Number(c.age) : null,
    })),
    kids,
    consent: consentState(store.slug, personId),
    asOf,
  };
}

/* ── comunicados: solo lectura; manda el archivo del módulo comms ── */

function readAnnouncements(slug) {
  // null = el archivo no existe (el módulo de comunicados no está instalado):
  // la sección se omite, sin inventar titulares. [] = existe pero no publica.
  // Forma leída de dashboard/.data/<slug>/comms.json (medida en vivo):
  // { posts: [{ title, body, day, … }], tasks: [...] } — solo miramos posts.
  const db = jsonStore(slug, "comms", { announcements: [] });
  if (!existsSync(db.path)) return null;
  let data;
  try { data = JSON.parse(readFileSync(db.path, "utf8")); } catch { return null; }
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.posts) ? data.posts
    : Array.isArray(data?.announcements) ? data.announcements
    : Array.isArray(data?.items) ? data.items
    : null;
  if (!list) return [];
  return list
    .slice(0, 6)
    .map((a) => ({
      title: String(a?.title ?? "").slice(0, 140),
      text: String(a?.body ?? a?.text ?? "").slice(0, 400),
      date: String(a?.day ?? a?.date ?? a?.when ?? "").slice(0, 10),
    }))
    .filter((a) => a.title || a.text);
}

/* ── mitad pública: shell propio, mobile-first, cero cookies ── */

function publicPage(title, body, identity) {
  const name = String(identity?.name ?? "Escuela sin nombre");
  const alt = identity?.altName ? `<span class="alt">${esc(identity.altName)}</span>` : "";
  const tag = identity?.tagline ? `<p class="tag">${esc(identity.tagline)}</p>` : "";
  const initial = esc(name.trim().charAt(0).toUpperCase() || "T");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#EFEEEC">
<title>${esc(title)} · ${esc(name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
/* Tallyhouse re-skin (owner design pivot 2026-11-21): flat blocks, 2px ink
   borders, radius 0, paper/ink/tangerine/lavender/sage. Class names kept —
   the body builders in this file were written against them. */
:root{--paper:#fff;--ink:#0b0b0b;--tangerine:#fe7141;--lavender:#cdabfe;--sage:#d1ddd3;--graphite:#595959}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif;font-size:16px;line-height:1.45}
.wrap{max-width:680px;margin:0 auto;padding:20px 16px 56px}
header.school{padding:18px 2px 6px;border-bottom:3px solid var(--ink)}
.band{display:flex;align-items:center;gap:10px}
.dot{width:40px;height:40px;background:var(--tangerine);color:var(--ink);display:grid;place-items:center;font-family:Archivo;font-weight:600;font-size:1.3rem;flex:none;border:2px solid var(--ink)}
h1{font-family:Archivo;margin:0;font-size:1.45rem;line-height:1.05;letter-spacing:-.03em;font-weight:500}
h2{font-family:Archivo;margin:0 0 10px;font-size:1.15rem;font-weight:500;letter-spacing:-.02em}
.alt{font-family:Archivo;font-weight:600;color:var(--graphite);font-size:.85rem;margin-left:auto}
.tag{color:var(--graphite);margin:6px 0 0;font-size:.9rem}
.card{background:var(--paper);border:2px solid var(--ink);padding:20px;margin-top:16px}
.row{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline;justify-content:space-between}
.chip{display:inline-block;font-family:Archivo;font-weight:600;font-size:.8rem;padding:4px 12px;border:2px solid var(--ink);color:var(--ink)}
.chip.lime{background:var(--sage)}
.chip.orange{background:var(--tangerine)}
.chip.coral{background:var(--ink);color:var(--tangerine)}
.chip.sky{background:var(--lavender)}
.kv{margin:6px 0;color:var(--graphite);font-size:.95rem}
.kv strong{color:var(--ink)}
.note{color:var(--graphite);font-size:.82rem;margin:12px 0 0}
.demo{background:var(--sage);border:2px solid var(--ink);padding:14px 20px;font-size:.85rem;color:var(--ink);margin-top:16px}
a{color:var(--ink);font-weight:700;background:var(--lavender);padding:0 4px;text-decoration:none;border:2px solid var(--ink)}
a:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
ul{margin:8px 0 0;padding-left:1.2em}
li{margin:4px 0}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
</style>
</head>
<body>
<main class="wrap">
<header class="school"><div class="band"><span class="dot" aria-hidden="true">${initial}</span><h1>${esc(name)}</h1>${alt}</div>${tag}</header>
${body}
</main>
</body>
</html>`;
}

/**
 * Página única para token inválido, caducado o desconocido: el MISMO texto
 * en los tres casos, sin eco del token y sin decir qué falló — ni una
 * pista de enumeración. Su tamaño es constante.
 */
function refusalPage(identity) {
  return publicPage("Enlace no válido", `
  <section class="card">
    <h2>Este enlace no abre ninguna familia</h2>
    <p class="kv">El enlace puede estar incompleto o haber caducado. No hemos mostrado ningún dato.</p>
    <p class="kv">Cómo seguir:</p>
    <ul>
      <li>Abre de nuevo el enlace que te envió la escuela, copiado entero.</li>
      <li>Si vuelve a fallar, pide un enlace en recepción.</li>
    </ul>
    <p class="note">Cada familia recibe su propio enlace privado. Esta página no necesita contraseña, no inicia sesión en ningún sitio y no guarda cookies.</p>
  </section>`, identity);
}

function familyPage(v, announcements, identity) {
  const chip = (state) => {
    const st = STATUS_TEXT[state] ?? STATUS_TEXT.unknown;
    return `<span class="chip ${st.tone}">${esc(st.label)}</span>`;
  };

  const kidCards = v.kids.map((k) => {
    const term = k.termStart && k.termEnd
      ? `${fmtDateEs(k.termStart)} → ${fmtDateEs(k.termEnd)}`
      : "fechas del programa no publicadas";
    let payLine;
    if (k.state === "paid") {
      payLine = `<p class="kv">Pago: <strong>${esc(money(k.amount, k.currency))}</strong> · ${chip("paid")}${k.paidAt ? ` · registrado el <strong>${esc(fmtDateEs(k.paidAt))}</strong>` : ""}</p>
      <p class="note">"Pagado" lo marca una persona del equipo al cotejar la transferencia — aquí no hay pasarela de pago${k.markedBy ? `; registró: ${esc(k.markedBy)}` : ""}.</p>`;
    } else if (k.state === "overdue") {
      payLine = `<p class="kv">Pago: <strong>${esc(money(k.amount, k.currency))}</strong> · ${chip("overdue")}</p>
      <p class="kv">La fecha límite era el <strong>${esc(fmtDateEs(k.due))}</strong> y no consta registrado. Si ya hiciste la transferencia, avisa a la escuela para que una persona lo revise; si no, el pago se acuerda contigo al confirmar la plaza.</p>`;
    } else if (k.state === "pending") {
      payLine = `<p class="kv">Pago: <strong>${esc(money(k.amount, k.currency))}</strong> · ${chip("pending")}</p>
      <p class="kv">Vence el <strong>${esc(fmtDateEs(k.due))}</strong>. El pago, si lo hay, se acuerda con la escuela — esta página no cobra nada.</p>`;
    } else {
      payLine = `<p class="kv">Pago: <strong>${esc(money(k.amount, k.currency))}</strong> · ${chip("unknown")}</p>`;
    }
    return `<article class="card">
      <div class="row"><h2>${esc(k.child)}${k.age !== null ? ` · ${esc(String(k.age))} años` : ""}</h2>${chip(k.state)}</div>
      <p class="kv"><strong>${esc(k.programName)}</strong>${k.place ? ` · ${esc(k.place)}` : ""}${k.inManifest ? "" : " · programa no publicado en el manifiesto"}</p>
      <p class="kv">Semanas del programa: <strong>${esc(term)}</strong></p>
      <p class="kv">Referencia de inscripción: ${esc(k.ref)}</p>
      ${payLine}
    </article>`;
  }).join("\n");

  const roster = v.children
    .map((c) => `${esc(c.name)}${c.age !== null ? ` (${esc(String(c.age))})` : ""}`)
    .join(", ") || "—";

  const outstanding = v.kids
    .filter((k) => k.state === "pending" || k.state === "overdue")
    .reduce((n, k) => n + k.amount, 0);
  const anyOverdue = v.kids.some((k) => k.state === "overdue");
  const moneySummary = !v.kids.length
    ? `<p class="kv">No hay inscripciones registradas todavía para esta familia.</p>`
    : anyOverdue
      ? `<p class="kv">Hay un pago <strong>vencido</strong> en esta familia (${esc(money(outstanding, v.kids[0].currency))} en total). Desde esta página no se cobra nada: escribid o pasad por recepción y lo acordamos.</p>`
      : outstanding > 0
        ? `<p class="kv">Pendiente de registro: <strong>${esc(money(outstanding, v.kids[0].currency))}</strong>. Se acuerda con la escuela; no hay cobro automático.</p>`
        : `<p class="kv">Todos los pagos de esta familia están registrados por el equipo. Si algo no cuadra, avisad a recepción.</p>`;

  const consentLine = v.consent === "on-file"
    ? "Consentimiento fotográfico: en el expediente (estado DEMO)."
    : "Consentimiento fotográfico: pendiente de firmar (estado DEMO). Para firmarlo o revisarlo, pasad por recepción.";

  const annSection = announcements === null
    ? "" // sin archivo comms: la sección se omite — nada de titulares inventados.
    : announcements.length === 0
      ? `<section class="card"><h2>Comunicados</h2><p class="kv">No hay comunicados publicados todavía.</p></section>`
      : `<section class="card"><h2>Comunicados de la escuela</h2>${announcements
          .map((a) => `<p class="kv"><strong>${esc(a.title)}${a.date ? ` · ${esc(fmtDateEs(a.date))}` : ""}</strong>${a.text ? ` — ${esc(a.text)}` : ""}</p>`)
          .join("")}</section>`;

  return publicPage("Mi familia", `
  <section class="card">
    <h2>Hola, ${esc(v.parentName)}</h2>
    <p class="kv">Hijos de la familia: ${roster}</p>
    ${moneySummary}
    <p class="kv">${esc(consentLine)} Documentos en papel: en la secretaría de la escuela.</p>
    <p class="note">Estás viendo solo los datos de tu familia, a través de un enlace privado. Página de demostración con datos ficticios; los estados de pago los escribe una persona del equipo, no un sistema de cobro. Fechas calculadas sobre ${esc(fmtDateEs(v.asOf))}.</p>
  </section>
  ${kidCards}
  ${annSection}
  <p class="demo">Enlace privado de demostración: cada enlace abre una sola familia. Si te llega otro enlace, abre otra familia — nadie ve la tuya sin tu enlace.</p>`, identity);
}

/* ── punto de entrada público (GET y POST) ── */

export function renderPublic(ctx, form) {
  const identity = ctx.manifest?.identity ?? null;
  const rawToken = String((form?.get?.("t") ?? ctx.query?.get?.("t")) ?? "");
  // Forma primero, existencia después: un token mal formado y un token
  // inexistente producen exactamente la misma respuesta.
  const html = resolvePage(rawToken, ctx, identity);
  // GET: el server manda el string tal cual. POST: el server lee out.html —
  // devolver el objeto { html } evita un cuerpo vacío (medido: 0B).
  return form ? { status: 200, html } : html;
}

function resolvePage(rawToken, ctx, identity) {
  if (!TOKEN_RE.test(rawToken)) return refusalPage(identity);

  const persons = ctx.store.records().persons ?? [];
  const hit = persons.find((p) => familyToken(ctx.slug, p.id) === rawToken);
  if (!hit) return refusalPage(identity);

  const v = familyView(ctx.store, hit.id);
  if (!v) return refusalPage(identity);

  return familyPage(v, readAnnouncements(ctx.slug), identity);
}

/* ── mitad staff: /m/familias — ayuda de la demo, solo director ── */

export function render(ctx) {
  const rec = ctx.store.records();
  const persons = (rec.persons ?? [])
    .slice()
    .sort((a, b) => String(a.parent?.name ?? "").localeCompare(String(b.parent?.name ?? "")));

  const rows = persons.map((p) => {
    const token = familyToken(ctx.slug, p.id);
    const kids = (rec.enrolments ?? []).filter((e) => e.personId === p.id).map((e) => e.child);
    return `<tr>
      <td>${esc(p.parent?.name ?? p.id)}</td>
      <td>${esc(kids.length ? kids.join(", ") : "sin inscripción")}</td>
      <td><a href="/familias?t=${esc(token)}" target="_blank" rel="noopener">abrir enlace</a> · <code>${esc(token)}</code></td>
    </tr>`;
  }).join("");

  return `${head({
    kicker: "portal de familias",
    title: "Enlaces de familias (demo)",
    sub: "Ayuda de la demo: abajo están los enlaces de las familias ficticias para que puedas abrirlos. En producción el token se genera aleatorio, se guarda en el registro de la familia y se envía POR CORREO, uno por familia — nunca se lista aquí.",
  })}
  ${card(`
    <p><strong>Cómo funciona el enlace:</strong> un padre abre <code>/familias?t=…</code> y ve SOLO su familia — hijos, semanas del programa, estado de pago y consentimiento. Sin login, sin cookies, sin salida al área staff. Un token inválido o desconocido abre una única página genérica que no dice qué falló.</p>
    <p class="note">Derivación demo: token = 12 primeros hex de sha256("${esc(ctx.slug)}:&lt;personId&gt;"). Es determinista porque la demo no tiene correo; NO es el esquema de producción — un hash de un id público es predecible para quien conozca el formato.</p>
    <table class="table"><thead><tr><th>Padre / madre</th><th>Hijos inscritos</th><th>Enlace de la familia</th></tr></thead><tbody>${rows}</tbody></table>
  `)}
  ${endHead}`;
}

// handle() se omite a propósito (contrato MODULE-API.md): la pestaña staff
// es de solo lectura; no hay escritura que ofrecer en la demo.
