/**
 * views.mjs — Topos dashboard v0: server-rendered HTML strings, no framework.
 *
 * The dashboard wears the same clothes as the landing page (site/src/index.css,
 * v2 palette): cream ground, navy ink, clay cards with the fat soft shadow,
 * Tallyhouse: Archivo voices, Inter body, tangerine-lavender-sage flat blocks on paper (design pivot 2026-11-21).
 * The tokens are *copied* here — this file must not import anything from
 * `site/`, because the dashboard is served by plain node with no build step.
 *
 * The renderer:
 *
 *   renderDashboard(manifest, store, session, opts) → one HTML page string
 *
 *   manifest : the parsed school manifest (identity + programs are read live)
 *   store    : what data.mjs open() returned (today/pipeline/money/people/stories)
 *   session  : { email, role } from the auth layer, or null
 *   opts     : { view, q, folded }
 *
 * opts.view is the tab: hoy | pipeline | money | people | stories | school
 * (default "hoy"; anything else renders an honest "vista no reconocida").
 * opts.q is the People search string, already read from the query by the
 * server. opts.folded is the server's own "I wrote the manifest" flag: the
 * SCHOOL tab only mentions a save when it is set, because this module did not
 * do the writing. Exports: renderDashboard (also `default`), esc,
 * DASHBOARD_VIEWS, STATUS_LABELS — exact shapes in DATA-API.md §5.
 *
 * There is no client JavaScript at all. The only interactive elements are
 * anchors with ?view= and one GET form for the search (plus the logout POST
 * the integrator's server has to answer).
 *
 * Contrast (WCAG, computed for the pairs used for text):
 *   navy #001433 on cream #EFEEEC ≈ 14.7 · navy on white ≈ 16.9
 *   navy on orange #FF7714 ≈ 6.4 · navy on sky #3BD3FD ≈ 9.7
 *   navy on lime #EEF773 ≈ 13.0 · navy on coral #FB4450 ≈ 4.8
 *   cream on navy #001433 ≈ 14.7 · cream on plum #46022F ≈ 11.8
 *   cream on green #035D44 ≈ 7.0 · muted #3B4658 on cream ≈ 7.0
 * Nothing lighter than that is used for text.
 */
import { readFileSync } from "node:fs";
import { ENROLMENT_STATUSES, formatAmount } from "./data.mjs";

/* --------------------------------- esc ----------------------------------- */
/** Escape every string that came from disk, the manifest, the URL or a person. */
export function esc(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ------------------------------ tiny format ------------------------------ */
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function prettyDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return String(iso ?? "");
  const day = Number(m[3]);
  const month = Number(m[2]);
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(m[1]), month - 1, day)).getUTCDay()];
  return `${weekday} ${day} de ${MONTHS[month - 1]} de ${m[1]}`;
}
function monthLabel(isoMonth) {
  const m = /^(\d{4})-(\d{2})/.exec(String(isoMonth ?? ""));
  if (!m) return String(isoMonth ?? "");
  return `${MONTHS[Number(m[2]) - 1]} de ${m[1]}`;
}
function formatBytes(n) {
  const b = Number(n);
  if (!Number.isFinite(b) || b <= 0) return "tamaño desconocido";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function pluralCount(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/* --------------------------------- chrome -------------------------------- */
const CSS = `
/* Tallyhouse language (template MIT, 8b): paper/ink/tangerine/lavender/sage,
   radius 0, flat blocks with solid ink borders, giant tight display type.
   Class NAMES kept from the clay era (.clay=.flat block now) because the
   seven modules render against them — the contract is the name, the look
   is this file. Attribution: site/CREDITS-TEMPLATE.md + git history. */
:root{
  --paper:#ffffff; --ink:#0b0b0b; --tangerine:#fe7141; --lavender:#cdabfe; --sage:#d1ddd3;
  --graphite:#595959; --silver:#a8a8a8;
  /* legacy aliases so any old inline var(--navy) keeps working, mapped to the new language */
  --cream:var(--paper); --navy:var(--ink); --orange:var(--tangerine); --sky:var(--lavender);
  --lime:var(--sage); --coral:var(--tangerine); --green:var(--ink); --plum:var(--lavender);
  --card:var(--paper); --muted:var(--graphite); --line:var(--ink); --tint:#f2f1ef;
  --radius:0;
}
*{box-sizing:border-box}
html{color-scheme:light;scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-family:"Inter",ui-sans-serif,system-ui,sans-serif;font-size:17px;line-height:1.45;letter-spacing:-.01em;-webkit-font-smoothing:antialiased}
h1,h2,h3,.brand,.num,.tab,.chip,.btn,.badge{font-family:"Archivo","Inter",ui-sans-serif,sans-serif}
h1{font-size:clamp(26px,3vw,36px);font-weight:500;line-height:1;letter-spacing:-.045em;margin:.2rem 0 .9rem}
h2{font-size:clamp(17px,1.7vw,21px);font-weight:500;line-height:1.14;letter-spacing:-.03em;margin:0}
h3{font-size:1rem;margin:0;font-weight:600}
p{margin:.4rem 0}
a{color:var(--ink);text-underline-offset:3px}
:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.on-dark :focus-visible{outline-color:var(--sage)}
::selection{background:var(--lavender);color:var(--ink)}
.skip{position:absolute;left:-9999px}
.skip:focus{left:14px;top:14px;z-index:30;background:var(--ink);color:var(--sage);padding:10px 16px;text-decoration:none;font-weight:700}
.shell{display:flex;min-height:100vh}
.side{width:248px;flex:none;border-right:2px solid var(--ink);padding:18px 12px;display:flex;flex-direction:column;gap:10px;position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--ink);color:var(--paper)}
.side-brand{padding:2px 8px 12px;border-bottom:2px solid var(--graphite)}
.main-col{flex:1;min-width:0}
.nav-group{font-size:.66rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--sage);margin:14px 0 4px;padding:0 8px}
.side-who{margin-top:auto;border-top:2px solid var(--graphite);padding-top:12px;display:flex;flex-direction:column;gap:8px;padding-left:8px}
.brand{font-size:1.15rem;font-weight:600;margin:0;line-height:1.15;max-width:34ch;letter-spacing:-.03em}
.side .kicker{color:var(--tangerine)}
.side .brand{color:var(--paper)}
.side .note{color:var(--sage)}
.kicker{font-size:.7rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--graphite);margin:0}
.side-nav{display:flex;flex-direction:column;gap:3px}
.tab{display:flex;align-items:center;justify-content:flex-start;min-height:44px;padding:0 12px;text-decoration:none;font-weight:600;font-size:.95rem;border:2px solid transparent;color:var(--paper)}
.side .tab:hover{border-color:var(--tangerine);color:var(--tangerine)}
.side .tab[aria-current="page"]{background:var(--tangerine);color:var(--ink);border-color:var(--tangerine)}
.who{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{display:inline-block;background:var(--ink);color:var(--sage);padding:.3rem .7rem;font-size:.74rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.email{font-size:.82rem;color:var(--graphite);max-width:24ch;overflow-wrap:anywhere}
.wrap{max-width:1180px;margin:0 auto;padding:22px 26px 56px}
.section{margin:0 0 34px}
.head{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;margin-bottom:14px}
.head p.sub{color:var(--graphite);margin:0;font-size:.95rem}
.clay{border:2px solid var(--ink);background:var(--card)}
.clay:hover{background:var(--card)}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.grid--wide{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.stat{background:var(--card);padding:14px 16px;display:flex;flex-direction:column;gap:2px;border:2px solid var(--ink);border-top-width:6px;border-top-color:var(--tangerine)}
.stat--sky{border-top-color:var(--lavender)}
.stat--lime{border-top-color:var(--sage)}
.stat--coral{border-top-color:var(--tangerine)}
.stat--plum{border-top-color:var(--lavender)}
.stat--grey{border-top-color:var(--graphite)}
.stat-label{font-size:.82rem;font-weight:700;color:var(--graphite);letter-spacing:.02em;margin:0}
.num{font-size:clamp(26px,3vw,36px);font-weight:500;line-height:.94;letter-spacing:-.05em;font-variant-numeric:tabular-nums;margin:.2rem 0 0;font-family:"Archivo","Inter",sans-serif}
.unit{font-size:.85rem;font-weight:700;color:var(--graphite);margin:0}
.detail{font-size:.9rem;margin:.5rem 0 0;color:var(--ink)}
.empty-note{font-size:.95rem;font-weight:700;margin:.4rem 0 0}
.stat-link{margin-top:auto;padding-top:10px;font-weight:700;font-size:.88rem}
.strip{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}
.group{background:var(--card);padding:16px 16px 6px;margin-bottom:20px;border:2px solid var(--ink)}
.group-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 12px;padding-bottom:8px}
.count{display:inline-flex;align-items:center;justify-content:center;min-width:2rem;padding:.1rem .55rem;background:var(--ink);color:var(--paper);font-weight:700;font-size:.85rem}
.note{font-size:.85rem;color:var(--graphite)}
.tw{overflow-x:auto;border:2px solid var(--ink);background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:.9rem}
caption{caption-side:bottom;text-align:left;padding:10px 12px;font-size:.82rem;color:var(--graphite)}
th,td{padding:8px 10px;text-align:left;vertical-align:top;border-bottom:2px solid var(--tint)}
tbody tr:last-child td,tbody tr:last-child th{border-bottom:0}
thead th{font-family:"Archivo","Inter",sans-serif;font-size:.74rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);border-bottom:3px solid var(--ink);white-space:nowrap;background:var(--paper)}
tbody tr:nth-child(even){background:#fafaf9}
.num-col{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.ref{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.82rem;white-space:nowrap}
.strong{font-weight:700}
.chip{display:inline-block;padding:.16rem .6rem;font-size:.74rem;font-weight:700;letter-spacing:.02em;white-space:nowrap;border:2px solid transparent}
.chip--green{background:var(--sage);color:var(--ink)}
.chip--orange{background:var(--tangerine);color:var(--ink)}
.chip--lime{background:var(--sage);color:var(--ink)}
.chip--coral{background:var(--ink);color:var(--tangerine)}
.chip--sky{background:var(--lavender);color:var(--ink)}
.chip--navy{background:var(--ink);color:var(--paper)}
.chip--plum{background:var(--lavender);color:var(--ink)}
.chip--none{background:var(--paper);color:var(--ink);border-color:var(--ink)}
.total-row th,.total-row td{border-top:3px solid var(--ink);font-weight:700;background:var(--sage)}
.search{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;background:var(--card);padding:16px;margin-bottom:16px;border:2px solid var(--ink)}
.search fieldset{border:0;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}
.search legend{font-weight:700;font-size:.82rem;color:var(--graphite);margin-bottom:6px;letter-spacing:.06em;text-transform:uppercase;padding:0}
.search label{display:block;font-weight:700;font-size:.85rem;min-width:min(100%,22rem);flex:1 1 20rem}
.search .hint{display:block;font-weight:400;font-size:.78rem;color:var(--graphite);margin-top:4px}
input[type=search]{display:block;width:100%;min-height:2.75rem;margin-top:6px;padding:0 14px;border:2px solid var(--ink);background:var(--paper);color:var(--ink);font:inherit;font-size:1rem}
.min-h-11{min-height:2.75rem}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;min-height:2.75rem;background:var(--tangerine);color:var(--ink);border:2px solid var(--ink);padding:.5rem 1.25rem;font-weight:700;font-size:.95rem;cursor:pointer;text-decoration:none;font-family:"Archivo","Inter",sans-serif}
.btn:hover{background:var(--ink);color:var(--tangerine)}
.btn:active{transform:translateY(1px)}
.btn--ghost{background:var(--paper);color:var(--ink)}
.btn--ghost:hover{background:var(--sage);color:var(--ink)}
.list{list-style:none;margin:0;padding:0}
.list>li{padding:12px 0;border-bottom:2px solid var(--tint);display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline}
.list>li:last-child{border-bottom:0}
.story-title{font-weight:700;font-size:1rem}
pre.yaml{margin:0;background:var(--ink);color:var(--paper);border:2px solid var(--ink);padding:16px;overflow:auto;max-height:60vh;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.78rem;line-height:1.6;white-space:pre}
.swatches{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}
.swatch{display:flex;align-items:center;gap:8px;background:var(--card);border:2px solid var(--ink);padding:6px 12px 6px 6px;font-size:.76rem;font-weight:700;color:var(--ink)}
.swatch i{width:22px;height:22px;display:inline-block;border:2px solid var(--ink)}
.callout{background:var(--lavender);border:2px solid var(--ink);padding:12px 16px;font-size:.9rem;margin:16px 0;color:var(--ink)}
.callout--warn{background:var(--tangerine)}
.callout--quiet{background:var(--sage)}
.allclear{background:var(--sage);border:2px solid var(--ink);padding:18px 20px;margin-bottom:16px;font-weight:700}
.stamp{border-top:3px solid var(--ink);background:var(--ink);padding:18px;font-size:.82rem;color:var(--sage)}
.stamp-in{max-width:1160px;margin:0 auto}
.stamp strong{color:var(--paper)}
@media (max-width:900px){
  .shell{display:block}
  .side{position:static;height:auto;width:auto;border-right:0;border-bottom:2px solid var(--ink);padding:12px}
  .side-brand{border-bottom:0;padding-bottom:4px}
  .side-nav{flex-direction:row;overflow-x:auto;gap:6px;padding-bottom:6px}
  .side-nav .nav-group{display:none}
  .tab{flex:none;white-space:nowrap;width:auto}
  .side-who{margin-top:6px;flex-direction:row;align-items:center;border-top:0;padding:0;gap:10px;flex-wrap:wrap}
  .wrap{padding:18px 14px 44px}
}
@supports (animation-timeline: view()){
  @media (prefers-reduced-motion: no-preference){
    .section{animation:rise-in linear both;animation-timeline:view();animation-range:entry 10% cover 30%}
    @keyframes rise-in{from{opacity:.4;transform:translateY(14px)}to{opacity:1;transform:none}}
  }
}
@media (prefers-reduced-motion: reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
`;

const VIEWS = [
  { key: "hoy", label: "Hoy" },
  { key: "pipeline", label: "Matrículas" },
  { key: "money", label: "Cobros" },
  { key: "people", label: "Personas" },
  { key: "stories", label: "Historias" },
  { key: "school", label: "Manifiesto" },
];

const STATUS_LABEL = {
  new: "Nuevas peticiones",
  confirmed: "Confirmadas",
  paid: "Pagadas",
  completed: "Terminadas",
};

function chip(text, tone) {
  return `<span class="chip chip--${tone}">${esc(text)}</span>`;
}

function paidChip(row) {
  if (row.paid) return chip("pagada (marcada a mano)", "green");
  if (row.overdue) return chip(`sin pago · venció ${row.due ?? "sin fecha"}`, "coral");
  if (row.due) return chip(`sin pago · vence ${row.due}`, "orange");
  return chip("sin pago · sin fecha acordada", "orange");
}

function proofChip(row) {
  switch (row.proofState) {
    case "verified":
      return chip("resguardo verificado", "green");
    case "pending":
      return chip("resguardo por verificar", "lime");
    case "rejected":
      return chip("resguardo rechazado", "coral");
    default:
      return chip("sin resguardo subido", "none");
  }
}

function head({ kicker, title, sub }) {
  return `<div class="head"><div><p class="kicker">${esc(kicker)}</p><h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div></div>`;
}

/* ---------------------------------- HOY ---------------------------------- */
function viewHoy(manifest, store, t) {
  const cards = t.lines.map((l) => {
    const tone = l.tone === "orange" ? "" : ` stat--${l.tone}`;
    const body = l.empty
      ? `<p class="num">0</p><p class="unit">${esc(l.unit)}</p><p class="empty-note">Nada pendiente</p><p class="detail">${esc(l.detail)}</p>`
      : `<p class="num">${esc(String(l.value))}</p><p class="unit">${esc(l.unit)}</p><p class="detail">${esc(l.detail)}</p>`;
    const linkLabel = { threads: "abrir comunicación", proofs: "ver resguardos", unpaid: "ver cobros", deadline: "ver admisiones" }[l.key] ?? "ver";
    const html = `<article class="clay stat${tone}">
      <p class="stat-label">${esc(l.label)}</p>
      ${body}
      <a class="stat-link" href="${esc(l.href)}">${esc(linkLabel)} →</a>
    </article>`;
    return { key: l.key, html };
  });
  const cardByKey = Object.fromEntries(cards.map((cd) => [cd.key, cd.html]));

  const allClear = t.lines.every((l) => l.empty);
  const c = t.counts;
  const AREA_OF = { threads: "Comunicación", proofs: "Finanzas", unpaid: "Finanzas", deadline: "Admisiones" };
  const byArea = new Map();
  t.lines.forEach((l) => {
    const area = AREA_OF[l.key] ?? "Escuela";
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push(cardByKey[l.key]);
  });
  const areaBlocks = [...byArea.entries()].map(([area, cardsIn]) => `
    <p class="nav-group" style="color:var(--ink);margin:18px 0 8px">${esc(area)}</p>
    <div class="grid">${cardsIn.join("")}</div>`).join("");
  const strip = [
    chip(`${c.families} familias`, "navy"),
    chip(`${c.children} niños y niñas`, "sky"),
    chip(`${c.enrolments} matrículas`, "plum"),
    chip(`${ENROLMENT_STATUSES.map((st) => `${c.byStatus[st] ?? 0} ${{ new: "nuevas", confirmed: "confirmadas", paid: "pagadas", completed: "terminadas" }[st] ?? st}`).join(" · ")}`, "none"),
    c.overdue ? chip(`${pluralCount(c.overdue, "pago vencido", "pagos vencidos")}`, "coral") : chip("nada vencido", "green"),
  ].join("");

  return `<section class="section">
    ${head({
      kicker: `HOY · ${prettyDate(t.date)}`,
      title: `Lo que ${manifest.identity?.altName ?? manifest.identity?.name ?? "la escuela"} tiene sin resolver`,
      sub: `${esc(manifest.identity?.name ?? "Escuela")} · leído del almacén de demo <code>${esc(store.slug)}</code>: ${c.families} familias, ${c.enrolments} matrículas, todo organizado por departamento.`,
    })}
    ${allClear ? `<p class="clay allclear">Río tranquilo: todas las líneas del día están a cero esta mañana.</p>` : ""}
    ${areaBlocks}
    <div class="strip">${strip}</div>
    <div class="callout"><strong>Cómo se lee «pagada».</strong> No hay pasarela de pago en Topos v0: una persona de la mesa marca el pago al cotejar el transferente. Cada cifra de esta página viene de un fichero JSON del almacén de demo, no de un banco.</div>
  </section>`;
}

/* ------------------------------- PIPELINE -------------------------------- */
function viewPipeline(manifest, store, p) {
  const threads = `<section class="clay group" id="conversaciones">
  <div class="group-head">
    <h2>Conversaciones</h2>
    <span class="count">${p.threads.open}</span>
    <p class="note">${p.threads.open ? `${pluralCount(p.threads.open, "abierta y sin respuesta", "abiertas y sin respuesta")} · ${p.threads.answered} ya contestadas` : "todo contestado"}</p>
  </div>
  <div class="tw"><table>
    <caption>Primitiva <code>communication</code>: cada hilo existe porque un funnel del manifiesto recibió un correo. Aquí se lee; contestar se hace en el buzón de verdad, no en esta página.</caption>
    <thead><tr><th scope="col">Asunto</th><th scope="col">Familia</th><th scope="col">Referencias</th><th scope="col">Último mensaje</th><th scope="col">Espera</th></tr></thead>
    <tbody>${p.threads.items
      .map(
        (x) => `<tr>
  <th scope="row">${esc(x.subject)}<br><span class="note ref">${esc(x.funnel)}</span></th>
  <td><span class="strong">${esc(x.parentName)}</span>${x.email ? `<br><a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ""}<br><span class="note">${esc(x.children)}</span></td>
  <td class="ref">${x.refs.length ? x.refs.map((r) => esc(r)).join("<br>") : `<span class="note">sin matrícula</span>`}</td>
  <td>${chip(x.lastFrom === "parent" ? "dice la familia" : "dice la mesa", x.lastFrom === "parent" ? "sky" : "navy")}<span class="note" style="display:block;max-width:38ch">${esc(x.preview)}</span><span class="note">${esc(x.lastAt)}</span></td>
  <td>${x.status === "open" ? (x.waitingDays > 2 ? chip(`${x.waitingDays} días esperando`, "coral") : chip(`${x.waitingDays} días`, "orange")) : chip("contestado", "green")}</td>
</tr>`,
      )
      .join("")}</tbody>
  </table></div>
</section>`;

  const proofs = `<section class="clay group" id="resguardos">
  <div class="group-head">
    <h2>Resguardos subidos</h2>
    <span class="count">${p.proofs.pending}</span>
    <p class="note">${p.proofs.count} justificantes en el almacén: ${p.proofs.verified} verificados, ${p.proofs.pending} por ver, ${p.proofs.rejected} rechazados. Verificar es marcar a mano tras cotejar el banco; nadie más queda avisado.</p>
  </div>
  ${manifest?.operations?.features?.proofs === false ? `<p class="clay callout callout--warn"><strong>El manifiesto dice <code>operations.features.proofs: false</code>.</strong> Esta escuela no recibe justificantes: lo que hay debajo es el almacén de demo, y en producción esa fila estaría vacía.</p>` : ""}
  <div class="tw"><table>
    <caption>Función <code>proofs</code>: nombre de fichero, tamaño y fecha de subida salen de <code>proofs.json</code>. Ningún fichero se abre ni se sirve desde este panel.</caption>
    <thead><tr><th scope="col">Ref.</th><th scope="col">Familia</th><th scope="col">Fichero</th><th scope="col" class="num-col">Importe</th><th scope="col">Pago</th><th scope="col">Verificación</th></tr></thead>
    <tbody>${p.proofs.items.length
      ? p.proofs.items
          .map(
            (x) => `<tr>
  <th scope="row" class="ref">${esc(x.ref)}</th>
  <td><span class="strong">${esc(x.child ?? "—")}</span><br><span class="note">${esc(x.parentName ?? "—")}</span></td>
  <td class="note ref">${esc(x.filename)}<br>${esc(formatBytes(x.size))} · subido ${esc(x.uploaded)}</td>
  <td class="num-col">${esc(formatAmount(x.amount, x.currency))}</td>
  <td>${x.paid ? chip("cobrado", "green") : chip("sin cobrar", "orange")}</td>
  <td>${x.state === "verified" ? chip("verificado", "green") : x.state === "rejected" ? chip("rechazado", "coral") : chip("por ver", "lime")}${x.verifiedAt ? `<br><span class="note">${esc(x.verifiedAt)}</span>` : ""}${x.note ? `<br><span class="note">${esc(x.note)}</span>` : ""}</td>
</tr>`,
          )
          .join("")
      : `<tr><td colspan="6" class="note">Nadie ha subido un solo resguardo todavía.</td></tr>`}</tbody>
  </table></div>
</section>`;

  const groups = p.groups.map((g) => {
    const rows = g.items.length
      ? g.items
          .map(
            (r) => `<tr>
  <th scope="row" class="ref">${esc(r.ref)}</th>
  <td><span class="strong">${esc(r.child)}</span>, ${esc(r.childAge)} años<br><span class="note">${esc(r.parentName)}</span></td>
  <td>${r.inManifest ? esc(r.programName ?? r.programCode) : `<span class="strong">${esc(r.programCode)}</span><br><span class="note">no está en el manifiesto</span>`}${r.programPlace ? `<br><span class="note">${esc(r.programPlace)}</span>` : ""}${r.ageInsideRange === false ? `<br>${chip(`edad ${r.childAge} fuera del rango ${r.programAges} del manifiesto`, "coral")}` : ""}</td>
  <td class="num-col">${esc(formatAmount(r.amount, r.currency, r.unit))}${r.pricePublished === false ? `<br><span class="note">precio no publicado</span>` : ""}${r.amountMatchesManifest === false ? `<br>${chip(`el registro dice ${formatAmount(r.amountRecorded, r.currency)}`, "coral")}` : ""}</td>
  <td>${paidChip(r)}</td>
  <td>${proofChip(r)}${r.proofFilename ? `<br><span class="note ref">${esc(r.proofFilename)} · ${esc(formatBytes(r.proofSize))} · ${esc(r.proofUploaded ?? "")}</span>${r.proofNote ? `<br><span class="note">${esc(r.proofNote)}</span>` : ""}` : ""}</td>
</tr>`,
          )
          .join("")
      : `<tr><td colspan="6" class="note">Nada en este estado ahora mismo.</td></tr>`;
    return `<section class="clay group">
  <div class="group-head">
    <h2>${esc(STATUS_LABEL[g.status] ?? g.status)}</h2>
    <span class="count">${g.count}</span>
    <p class="note">${g.count ? `${pluralCount(g.unpaid, "sin pago registrado", "sin pago registrado")}${g.total ? ` · ${esc(formatAmount(g.total, g.currency))} pendientes` : ""}` : "sin matrículas"}</p>
  </div>
  <div class="tw"><table>
    <caption>Petición registrada en la puerta del manifiesto (${esc(g.status)}). El importe es el precio publicado por el manifiesto, no una cifra de pantalla.</caption>
    <thead><tr><th scope="col">Ref.</th><th scope="col">Niño/a y familia</th><th scope="col">Programa</th><th scope="col" class="num-col">Importe</th><th scope="col">Pago</th><th scope="col">Resguardo</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</section>`;
  });

  return `<section class="section">
    ${head({
      kicker: "PIPELINE",
      title: "Matrículas por estado",
      sub: `${p.total} matrículas · ${p.totals.paid} con pago registrado · ${p.totals.unpaid} sin pago · ${p.threads.open} conversaciones abiertas · ${p.proofs.pending} resguardos por ver.`,
    })}
    ${threads}
    ${groups.join("")}
    ${proofs}
  </section>`;
}

/* --------------------------------- MONEY --------------------------------- */
function viewMoney(manifest, store, m) {
  const famRows = m.families
    .slice()
    .sort((a, b) => b.due - a.due || a.name.localeCompare(b.name))
    .map(
      (f) => `<tr>
  <th scope="row"><span class="strong">${esc(f.name)}</span><br><span class="note">${esc(f.email)}</span></th>
  <td class="ref">${f.refs.length ? f.refs.map((r) => esc(r)).join("<br>") : `<span class="note">sin matrículas</span>`}</td>
  <td class="note">${esc(f.children)}</td>
  <td class="num-col">${esc(formatAmount(f.paid, f.currency))}</td>
  <td class="num-col">${f.due ? esc(formatAmount(f.due, f.currency)) : `<span class="note">—</span>`}${f.overdue ? `<br>${chip(`vencido ${formatAmount(f.overdue, f.currency)}`, "coral")}` : ""}${f.nextDue ? `<br><span class="note">${f.nextDue <= m.asOf ? `vencía el ${esc(f.nextDue)}` : `vence ${esc(f.nextDue)}`}</span>` : ""}</td>
  <td>${f.state === "settled" ? chip("al día", "green") : f.state === "overdue" ? chip("vencido", "coral") : chip("a la espera", "orange")}</td>
</tr>`,
    )
    .join("");

  const exp = m.expenses;
  const expItems = exp.items.length
    ? exp.items
        .map((l) => `<li><span class="story-title">${esc(l.title)}</span>${chip(l.status === "hecho" ? "gasto hecho" : "previsto", l.status === "hecho" ? "green" : "sky")}<span class="note">${esc(l.category)} · ${esc(l.date)}</span><span class="num-col strong" style="margin-left:auto">${esc(formatAmount(l.amount, l.currency))}</span></li>`)
        .join("")
    : `<li><span class="note">Sin gastos registrados en ${esc(monthLabel(exp.month))}.</span></li>`;

  const otherMonths = exp.otherMonths.length
    ? `<p class="note">Otros meses con partidas: ${exp.otherMonths.map((o) => `${esc(monthLabel(o.month))} — ${pluralCount(o.count, "gasto", "gastos")}, ${esc(formatAmount(o.total, m.currency))}`).join(" · ")}.</p>`
    : "";

  return `<section class="section">
    ${head({
      kicker: "MONEY",
      title: "Qué está cobrado y qué falta",
      sub: `${m.totals.families} familias con matrículas · cobrado ${esc(formatAmount(m.totals.paid, m.currency))} · pendiente ${esc(formatAmount(m.totals.due, m.currency))}${m.totals.overdue ? ` (de ello ${esc(formatAmount(m.totals.overdue, m.currency))} con la fecha vencida)` : ""}.`,
    })}
    <div class="callout--quiet callout">Aquí «cobrado» significa que una persona de la mesa lo marcó tras cotejar el transferente bancario. En Topos v0 no existe pasarela de pago: ninguna pantalla emite un comprobante y ninguna familia recibe aviso automático alguno.</div>
    <div class="tw clay" style="padding:0;overflow:hidden"><table>
      <caption>Una fila por familia. El debe es la suma de sus pagos sin marcar; el haber, los marcados.</caption>
      <thead><tr><th scope="col">Familia</th><th scope="col">Refs.</th><th scope="col">Niños/as</th><th scope="col" class="num-col">Cobrado</th><th scope="col" class="num-col">Pendiente</th><th scope="col">Estado</th></tr></thead>
      <tbody>
        ${famRows}
        <tr class="total-row"><th scope="row" colspan="3">Total (${m.totals.families} familias${m.familiesWithoutEnrolments ? `, ${m.familiesWithoutEnrolments} sin matrículas` : ""})</th><td class="num-col">${esc(formatAmount(m.totals.paid, m.currency))}</td><td class="num-col">${esc(formatAmount(m.totals.due, m.currency))}</td><td>${m.totals.overdue ? chip(`${formatAmount(m.totals.overdue, m.currency)} vencido`, "coral") : chip("nada vencido", "green")}</td></tr>
      </tbody>
    </table></div>

    <div class="grid grid--wide" style="margin-top:22px">
      <section class="clay group">
        <div class="group-head"><h2>Gastos de ${esc(monthLabel(exp.month))}</h2><span class="count">${exp.count}</span></div>
        <ul class="list">${expItems}</ul>
        <div class="tw" style="border:0;background:transparent;margin:10px 0 14px"><table style="width:auto">
          <tbody><tr class="total-row"><th scope="row">Total del mes</th><td class="num-col">${esc(formatAmount(exp.total, m.currency))}</td></tr></tbody>
        </table></div>
        ${exp.empty ? `<p class="note">El mes en curso está vacío en el almacén; el mes con partidas más reciente es ${esc(monthLabel(exp.newestMonthWithData))}.</p>` : ""}
        ${otherMonths}
      </section>
      <section class="clay group">
        <div class="group-head"><h2>De dónde sale el dinero</h2></div>
        <p class="note">Los importes de matrícula no se inventan aquí: se leen del manifiesto (${esc(manifest.identity?.name ?? "—")}, programa por programa). Si un registro y el manifiesto no cuadran, el pipeline lo marca en rojo.</p>
        <ul class="list">${(manifest.programs ?? [])
          .map((p) => `<li><span class="story-title">${esc(p.name)}</span><span class="note ref">${esc(p.code)}</span><span class="num-col strong" style="margin-left:auto">${p.price?.published ? esc(formatAmount(p.price.amount, p.price.currency, p.price.unit)) : "precio no publicado"}</span></li>`)
          .join("")}</ul>
      </section>
    </div>
  </section>`;
}

/* --------------------------------- PEOPLE -------------------------------- */
function viewPeople(manifest, store, q, briefing) {
  const currency = manifest?.programs?.[0]?.price?.currency ?? "THB";
  // the search hints come from the school's own contract, not from lotus
  const domain = manifest?.identity?.domain ?? "la escuela";
  const refShape = `${String(manifest?.programs?.[0]?.code ?? "REF").split("-")[0]}-XXXXXX`;
  const programNames = new Map((manifest?.programs ?? []).map((p) => [p.code, p.name]));
  const res = store.people(q);
  const children = briefing?.counts?.children ?? res.items.reduce((n, p) => n + p.children.length, 0);
  const rows = res.items
    .map(
      (p) => `<tr>
  <th scope="row"><span class="strong">${esc(p.name)}</span><br><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></th>
  <td>${p.children.map((c) => `${esc(c.name)}, ${esc(c.age)}`).join("<br>")}</td>
  <td class="ref">${p.refs.length ? p.refs.map((r) => esc(r)).join("<br>") : `<span class="note">sin matrículas</span>`}</td>
  <td class="note">${esc(p.locale)} · ${esc(p.phone ?? "sin teléfono")}<br>desde ${esc(p.firstContact ?? "—")}</td>
  <td>${p.programs.length ? p.programs.map((code) => esc(programNames.get(code) ?? `${code} (fuera del manifiesto)`)).join("<br>") : `<span class="note">sin programa</span>`}</td>
  <td class="num-col">${esc(formatAmount(p.paid, currency))}</td>
  <td class="num-col">${p.due ? esc(formatAmount(p.due, currency)) : `<span class="note">—</span>`}</td>
</tr>`,
    )
    .join("");

  const feedback = res.query
    ? res.count === 0
      ? `<p class="clay callout callout--warn"><strong>Sin coincidencias para «${esc(res.query)}».</strong> Se busca por nombre del adulto o del niño, correo y referencia (formato ${esc(refShape)}). ${res.totalFamilies} familias hay en el almacén.</p>`
      : `<p class="note">${pluralCount(res.count, "familia coincide", "familias coinciden")} con «${esc(res.query)}».</p>`
    : `<p class="note">Mostrando las primeras ${res.shown} de ${res.totalFamilies} familias. Escribe para buscar por nombre, correo o referencia.</p>`;

  return `<section class="section">
    ${head({ kicker: "PEOPLE", title: "Familias", sub: `${res.totalFamilies} familias · ${children} niños y niñas en el almacén de demo.` })}
    <form class="search clay" method="get" action="">
      <fieldset>
        <legend>Buscar familias</legend>
        <label for="q">Nombre, correo o referencia
          <span class="hint">Sin distinción de mayúsculas. Vacío = las primeras 8.</span>
          <input id="q" name="q" type="search" value="${esc(res.query)}" autocomplete="off" placeholder="p. ej. un nombre, @${esc(domain)} o ${esc(refShape)}">
        </label>
        <input type="hidden" name="view" value="people">
        <button class="btn min-h-11" type="submit">Buscar</button>
        ${res.query ? `<a class="btn btn--ghost min-h-11" href="?view=people">Limpiar</a>` : ""}
      </fieldset>
    </form>
    ${feedback}
    ${res.count ? `<div class="tw clay" style="margin-top:14px;padding:0;overflow:hidden"><table>
      <caption>El correo, el teléfono y el idioma preferido salen de <code>persons.json</code>; el dinero, de <code>payments.json</code>; los nombres de programa, del manifiesto.</caption>
      <thead><tr><th scope="col">Familia</th><th scope="col">Niños/as (edad)</th><th scope="col">Refs.</th><th scope="col">Contacto</th><th scope="col">Programas</th><th scope="col" class="num-col">Cobrado</th><th scope="col" class="num-col">Pendiente</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : ""}
  </section>`;
}

/* -------------------------------- STORIES -------------------------------- */
function viewStories(manifest, store) {
  const s = store.stories();
  const tone = { draft: "lime", queued: "sky", idea: "none", published: "green" };
  const rows = s.items.length
    ? s.items
        .map(
          (x) => `<tr>
  <th scope="row">${esc(x.title)}</th>
  <td>${chip(x.status, tone[x.status] ?? "navy")}</td>
  <td class="note">${esc(x.locale)} · ${esc(x.wordCount)} palabras · tocado por última vez el ${esc(x.updated)}</td>
  <td class="note">${esc(x.author)}</td>
</tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="note">La cola está vacía en el almacén de demo.</td></tr>`;

  return `<section class="section">
    ${head({ kicker: "STORIES", title: "Cola de borradores", sub: `${s.count} borradores en la cola · blog en el manifiesto: ${s.blogEnabled ? "activado" : "desactivado"} · módulo de marketing: ${s.marketingEnabled ? "activado" : "apagado"} · consentimiento de imágenes: ${esc(s.mediaConsent ?? "sin declarar")} · los idiomas se ciñen a los que declara <code>identity.locales</code>.` })}
    <div class="tw clay" style="padding:0;overflow:hidden"><table>
      <caption>Cada fila es una entrada de <code>content.json</code>. Ninguna se ha publicado: el estado lo escribe una persona, no esta página.</caption>
      <thead><tr><th scope="col">Borrador</th><th scope="col">Estado</th><th scope="col">Datos</th><th scope="col">Autoría</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${s.blogEnabled ? "" : `<p class="clay callout callout--warn"><strong>El manifiesto dice <code>content.blog: false</code>.</strong> Esta escuela no tiene blog activado; la cola se muestra igual para que la mesa vea lo que hay, pero nada de esto puede publicarse.</p>`}
    <p class="clay callout"><strong>El editor completo llega con el módulo marketing.</strong> Aquí solo se lee la cola: este panel no abre un editor, no sube imágenes y no escribe en <code>content.json</code>. Lo que se ve son los borradores de demo que sembró <code>seedDemo()</code>.</p>
  </section>`;
}

/* --------------------------------- SCHOOL -------------------------------- */
function viewSchool(manifest, store, opts = {}) {
  let text = null;
  let problem = null;
  if (!store.manifestPath) {
    problem = "El servidor no pasó la ruta del manifiesto (`manifestPath`), así que no hay texto que leer en disco.";
  } else {
    try {
      text = readFileSync(store.manifestPath, "utf8");
    } catch (e) {
      problem = `No se pudo leer ${store.manifestPath}: ${e.message}`;
    }
  }

  const pal = manifest.brand?.palette ?? {};
  const swatches = Object.entries(pal)
    .filter(([, v]) => typeof v === "string" && /^#([0-9a-f]{3,8})$/i.test(v))
    .map(([k, v]) => `<span class="swatch"><i style="background:${esc(v)}"></i>${esc(k)} <span class="ref">${esc(v)}</span></span>`)
    .join("");

  return `<section class="section">
    ${head({
      kicker: "SCHOOL",
      title: "El manifiesto de esta escuela",
      sub: `Texto leído del disco en cada petición — la fuente de verdad, no una copia en memoria. ${store.manifestPath ? "" : "(sin ruta)"}`,
    })}
    <p class="clay callout callout--quiet"><strong>Solo lectura, y así se queda.</strong> Editar, plegar por secciones y validar el YAML vive en Topos Studio (<code>manifold/studio.mjs</code>), no en este panel; el integrador enlaza ahí. Este dashboard solo lee el manifiesto para poner nombres e importes reales.</p>
    ${opts.folded ? `<p class="clay callout" style="border-left-color:var(--lime)"><strong>El servidor dice que el manifiesto se guardó.</strong> El texto de abajo es la lectura del disco hecha en esta misma petición, así que si algo no coincide con lo que acabas de escribir, lo que manda es lo que se ve. <code>${esc(store.manifestPath ?? "sin ruta")}</code></p>` : ""}
    ${problem ? `<p class="clay callout callout--warn">${esc(problem)}</p>` : ""}
    <pre class="yaml" tabindex="0" aria-label="Manifiesto YAML de la escuela, solo lectura">${text === null ? "<sin texto>" : esc(text)}</pre>
    <p class="note" style="margin-top:12px">Ruta: <code class="ref">${esc(store.manifestPath ?? "—")}</code> · Slug del almacén de demo: <code class="ref">${esc(store.slug)}</code> · Datos en <code class="ref">${esc(store.dir)}</code></p>
    ${swatches ? `<div class="swatches">${swatches}</div>` : ""}
    <div class="grid grid--wide" style="margin-top:20px">
      <section class="clay group">
        <div class="group-head"><h2>Lo que el manifiesto declara</h2></div>
        <ul class="list">
          <li><span class="story-title">Entidad</span><span class="note">${esc(manifest.topology?.entity ?? "—")}, agrupado por ${esc(manifest.topology?.groupsBy ?? "—")}, edades ${esc(manifest.topology?.agesRange ?? "—")}</span></li>
          <li><span class="story-title">Idiomas</span><span class="note">${(manifest.identity?.locales ?? []).map((l) => esc(l)).join(" · ")} (por defecto ${esc(manifest.identity?.defaultLocale ?? "—")})</span></li>
          <li><span class="story-title">Primitivas</span><span class="note">${(manifest.operations?.primitives ?? []).map((x) => esc(x)).join(", ")}</span></li>
          <li><span class="story-title">Funnels</span><span class="note">${(manifest.communication?.funnels ?? []).map((f) => `${esc(f.address)} — ${esc(f.purpose)}`).join(" · ")}</span></li>
        </ul>
      </section>
      <section class="clay group">
        <div class="group-head"><h2>Programas</h2><span class="count">${(manifest.programs ?? []).length}</span></div>
        <ul class="list">${(manifest.programs ?? [])
          .map(
            (p) => `<li><span class="story-title">${esc(p.name)}</span><span class="note ref">${esc(p.code)}</span><span class="note">${esc(p.place ?? "—")} · ages ${esc(p.ages ?? "—")} · ${esc(p.season?.starts ?? "—")} → ${esc(p.season?.ends ?? "—")}</span><span class="num-col strong" style="margin-left:auto">${p.price?.published ? esc(formatAmount(p.price.amount, p.price.currency, p.price.unit)) : "no publicado"}</span></li>`,
          )
          .join("")}</ul>
      </section>
    </div>
    <p class="note" style="margin-top:10px"><a href="?view=school">Esta pestaña</a> vuelve a leer el fichero: si alguien edita el YAML en Studio y lo guarda, aquí aparece sin reiniciar nada.</p>
  </section>`;
}

/* --------------------------------- render -------------------------------- */
/**
 * renderDashboard(manifest, store, session, opts) → HTML for one page.
 * Never throws on bad data: a broken store renders an honest error card.
 */
export function renderDashboard(manifest, store, session, opts = {}) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) manifest = { identity: {} };
  const requested = String(opts.view ?? "hoy").toLowerCase();
  const view = VIEWS.some((v) => v.key === requested) ? requested : requested === "desk" || requested === "" ? "hoy" : requested;
  const schoolName = manifest?.identity?.name ?? "Escuela sin nombre";
  const role = session && session.role ? String(session.role) : null;
  const email = session && session.email ? String(session.email) : null;

  let bodyHtml;
  let briefing = null;
  let storeError = null;
  if (!store || typeof store.today !== "function") {
    storeError = "No hay almacén: el servidor tiene que pasar el objeto que devuelve open(manifest) de dashboard/data.mjs.";
  } else {
    try {
      briefing = store.today();
    } catch (e) {
      storeError = e && e.message ? e.message : String(e);
    }
  }

  if (storeError) {
    bodyHtml = `<section class="section">
      ${head({ kicker: "ERROR", title: "El almacén no respondió", sub: "La página se renderiza igual, con la verdad por delante." })}
      <p class="clay callout callout--warn"><code>${esc(storeError)}</code></p>
      <p class="note">Falta sembrar el almacén de demo: <code>node dashboard/data.mjs schools/&lt;escuela&gt;.yaml</code>, o desde el servidor <code>seedDemo(path)</code> seguido de <code>open(path)</code> (dashboard/DATA-API.md).</p>
    </section>`;
  } else {
    try {
      if (view === "hoy") bodyHtml = viewHoy(manifest, store, briefing);
      else if (view === "pipeline") bodyHtml = viewPipeline(manifest, store, store.pipeline());
      else if (view === "money") bodyHtml = viewMoney(manifest, store, store.money());
      else if (view === "people") bodyHtml = viewPeople(manifest, store, opts.q ?? "", briefing);
      else if (view === "stories") bodyHtml = viewStories(manifest, store);
      else if (view === "school") bodyHtml = viewSchool(manifest, store, opts);
      else
        bodyHtml = `<section class="section">
        ${head({ kicker: "404", title: `La vista «${view}» no existe`, sub: `Las vistas de este panel son: ${VIEWS.map((v) => v.label).join(", ")}.` })}
        <p class="clay callout callout--warn">Nada se inventó para rellenar esta página. Vuelve a <a href="?view=hoy">Hoy</a> o elige una vista de la barra de arriba.</p>
      </section>`;
    } catch (e) {
      bodyHtml = `<section class="section">
        ${head({ kicker: "ERROR", title: "Esta vista no se pudo construir", sub: "El resto del panel sigue en pie." })}
        <p class="clay callout callout--warn"><code>${esc(e && e.message ? e.message : String(e))}</code></p>
      </section>`;
    }
  }

  const t = briefing;

  // v0.1 module-registry support (additive): the server may pass
  // bodyOverride (a module's body inside this shell) and extraTabs
  // (registered modules). With neither, the six core views behave
  // exactly as before — including opts.folded on the school tab.
  if (typeof opts.bodyOverride === "string") bodyHtml = opts.bodyOverride;

  const allTabs = [...VIEWS.map((v) => ({ key: v.key, label: v.label, href: `?view=${v.key}` })), ...(opts.extraTabs ?? [])];
  const GROUPS = [
    ["Admisiones", ["pipeline", "crm", "admisiones-agent", "people"]],
    ["Finanzas", ["money", "finance"]],
    ["Académico", ["curriculum"]],
    ["Comunicación", ["comms", "stories", "marketing", "familias"]],
    ["Escuela", ["school", "journal", "example"]],
  ];
  const tabLink = (v) => `<a class="tab" href="${esc(v.href)}"${v.key === view ? ' aria-current="page"' : ""}>${esc(v.label)}</a>`;
  const grouped = new Set(GROUPS.flatMap((g) => g[1]));
  const navHtml = GROUPS.map(([name, keys]) => {
    const items = allTabs.filter((t) => keys.includes(t.key));
    if (!items.length) return "";
    return `<p class="nav-group">${esc(name)}</p>` + items.map(tabLink).join("");
  }).join("") + (allTabs.filter((t) => !grouped.has(t.key)).map(tabLink).join(""));

  let meta = null;
  try {
    meta = store?.meta?.() ?? null;
  } catch {
    meta = null;
  }

  const title = `${VIEWS.find((v) => v.key === view)?.label ?? opts.title ?? "Hoy"} · ${schoolName}`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<meta name="description" content="Panel de mesa de ${esc(schoolName)} — Topos v0, datos de demostración leídos de un almacén JSON.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#main">Saltar al contenido</a>
<div class="shell">
<aside class="side">
  <div class="side-brand">
    <p class="kicker">topos · panel</p>
    <p class="brand">${esc(schoolName)}</p>
    ${manifest?.identity?.domain ? `<p class="note">${esc(manifest.identity.domain)}</p>` : ""}
  </div>
  <nav class="side-nav" aria-label="Navegación del panel">${navHtml}</nav>
  <div class="side-who">
    <span class="badge">${esc(role ?? "sin sesión")}</span>
    <span class="email">${esc(email ?? "demo local, nadie autenticado")}</span>
    <form class="logout" method="post" action="/logout">
      <button class="btn btn--ghost min-h-11" type="submit">Salir</button>
    </form>
  </div>
</aside>
<div class="main-col"><main id="main"><div class="wrap">
${bodyHtml}
</div></main></div>
</div>
<footer class="stamp"><div class="stamp-in">
  <strong>${esc(schoolName)}</strong> · panel v0 renderizado en el servidor por <code>dashboard/views.mjs</code> desde <code>dashboard/.data/${esc(store?.slug ?? "…")}/</code>.
  ${t ? `${esc(t.counts.families)} familias · ${esc(t.counts.enrolments)} matrículas · ${esc(t.counts.unpaid)} sin pago registrado.` : ""}
  ${meta ? ` Almacén sembrado el ${esc(String(meta.seededAt ?? "").slice(0, 10))} con fecha de referencia ${esc(meta.reference ?? "")}.` : ""}
  Datos de demostración generados por <code>seedDemo()</code>: no se ha cobrado nada, no se ha enviado un solo correo, no hay buzón al otro lado.
</div></footer>
</body>
</html>
`;
}

/** The tab list, so the integrator's router can validate ?view= the same way. */
export const DASHBOARD_VIEWS = VIEWS.map((v) => v.key);
/** status key → Spanish heading used by PIPELINE, so a router can reuse the words. */
export const STATUS_LABELS = STATUS_LABEL;
export { renderDashboard as default };
