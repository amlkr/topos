/**
 * crm.mjs — módulo CRM del panel Topos (contrato: dashboard/MODULE-API.md).
 *
 * Contactos de admisión: familias que han preguntado y AÚN NO están en
 * matrículas. Lo matriculado vive en el pipeline del núcleo; este tab solo
 * mueve leads entre estados y guarda notas internas de seguimiento.
 *
 * Propiedad: un solo archivo, importando únicamente ../module-kit.mjs.
 * Almacén: jsonStore(slug, "crm") → dashboard/.data/<slug>/crm.json.
 * Datos de demo: familias ficticias de Lotus Valley (docs/BOUNDARIES.md).
 * Sin JS de cliente: filtros por GET, escrituras por POST con redirect 303.
 */
import { jsonStore, esc, head, endHead, card, empty, field, select, submit, id, todayISO } from "../module-kit.mjs";

export const meta = { key: "crm", label: "CRM", order: 10, roles: ["director", "admissions"] };

const DEFAULTS = { leads: [], followups: [] };
const STATUSES = ["nuevo", "contactado", "visita", "matriculado", "perdido"];
const STATUS_TONE = { nuevo: "sky", contactado: "orange", visita: "lime", matriculado: "green", perdido: "none" };
const SOURCES = ["web", "referido", "llamada", "visita", "otro"];

/* ---------- pequeños helpers locales (el kit no los trae) ---------- */

function chip(text, tone) {
  return `<span class="chip chip--${tone}">${esc(text)}</span>`;
}

function plural(n, one, many) {
  return n === 1 ? `${n} ${one}` : `${n} ${many}`;
}

/** Fecha ISO de hace n días (en UTC, como todayISO del kit). */
function dayOffsetISO(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Días transcurridos desde una fecha ISO; null si no es legible. */
function daysSince(iso) {
  const a = Date.parse(String(iso ?? "") + "T00:00:00Z");
  const b = Date.parse(todayISO() + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

const cleanFilter = (v) => (STATUSES.includes(v) ? v : "");

/* ---------- semilla de demo: cinco leads ficticios de Lotus Valley ---------- */

function seedLeads(data) {
  const mk = (family, contact, source, status, createdDaysAgo, touchedDaysAgo, note) => ({
    id: id(), family, contact, source, status, note,
    day: dayOffsetISO(createdDaysAgo), updatedAt: dayOffsetISO(touchedDaysAgo),
  });
  const leads = [
    mk("Whitmore–Chaiyapruek", "+66 81 555 0148", "referido", "nuevo", 2, 2,
      "demo: familia ficticia; recomendada por una familia ya matriculada, aún no llamada"),
    mk("Familia Sirikul–Tan", "sirikul.tan@lvis.example", "web", "contactado", 6, 1,
      "demo: familia ficticia; pidió por la web el folleto del term de mayo"),
    mk("Familia Vandermeer", "vandermeer.kids@lvis.example", "visita", "visita", 25, 22,
      "demo: familia ficticia; vinieron al Open Day y nadie ha vuelto a escribirles"),
    mk("Familia Wongchali", "wongchali.fam@lvis.example", "llamada", "matriculado", 40, 12,
      "demo: familia ficticia; pasó a matrículas — su expediente vive en el pipeline"),
    mk("Anantachai–Wilson", "+66 81 555 0113", "otro", "perdido", 31, 18,
      "demo: familia ficticia; eligieron otra escuela, recontactar en el próximo term"),
  ];
  const fu = (i, text, daysAgo) => ({ id: id(), leadId: leads[i].id, text, day: dayOffsetISO(daysAgo) });
  data.leads = leads;
  data.followups = [
    fu(1, "Correos de bienvenida enviados; respondieron preguntando por los ages del ensemble.", 5),
    fu(1, "Llamada corta: piden precios del term de mayo y horarios del Valley Campus.", 1),
    fu(2, "Recorrido de 40 minutos con la coordinadora; la madre pidió material en inglés.", 22),
    fu(3, "Confirmaron plaza en la llamada; el alta se cerró fuera de este tab.", 12),
    fu(4, "Última llamada: prefirieron otra escuela por proximidad. Cerrar sin insistir.", 18),
  ];
  return data;
}

/** Lee el almacén; si está vacío (primera carga), siembra la demo. */
function loadSeeded(db) {
  const data = db.load();
  if (!Array.isArray(data.leads)) data.leads = [];
  if (!Array.isArray(data.followups)) data.followups = [];
  if (data.leads.length === 0 && data.followups.length === 0) db.save(seedLeads(data));
  return data;
}

function lastFollowup(followups, leadId) {
  let best = null;
  for (const f of followups) {
    if (!f || f.leadId !== leadId) continue;
    if (!best || String(f.day) >= String(best.day)) best = f;
  }
  return best;
}

/* ---------- render (GET /m/crm) ---------- */

export function render(ctx) {
  const db = jsonStore(ctx.slug, meta.key, DEFAULTS);
  const data = loadSeeded(db);
  const qp = ctx.query ?? ctx.params ?? new URLSearchParams();
  const filter = cleanFilter(String(qp.get("status") ?? ""));

  const total = data.leads.length;
  const counts = Object.fromEntries(STATUSES.map((s) => [s, data.leads.filter((l) => l.status === s).length]));
  const shown = (filter ? data.leads.filter((l) => l.status === filter) : data.leads)
    .slice()
    .sort((a, b) => String(a.updatedAt ?? a.day ?? "").localeCompare(String(b.updatedAt ?? b.day ?? "")));

  /* chips resumen, enlazados al filtro ?status= */
  const chipStyle = "text-decoration:none";
  const activeStyle = `${chipStyle};outline:3px solid var(--navy);outline-offset:2px`;
  const chips = [
    `<a class="chip chip--navy" href="/m/${meta.key}"${filter ? "" : ' aria-current="page"'} style="${filter ? chipStyle : activeStyle}">${esc(plural(total, "lead", "leads"))}</a>`,
    ...STATUSES.map((s) => {
      const active = filter === s;
      return `<a class="chip chip--${STATUS_TONE[s]}" href="/m/${meta.key}?status=${encodeURIComponent(s)}"${active ? ' aria-current="page"' : ""} style="${active ? activeStyle : chipStyle}">${esc(counts[s])} ${esc(s)}</a>`;
    }),
  ].join(" ");

  /* formulario de filtro (GET puro, sin JS) */
  const filterForm = `<form method="get" action="/m/${meta.key}" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:4px 0 18px">
    <label for="crm-filter">Ver solo el estado</label>
    <select id="crm-filter" name="status">${[`<option value=""${filter ? "" : " selected"}>todos</option>`,
      ...STATUSES.map((s) => `<option value="${esc(s)}"${s === filter ? " selected" : ""}>${esc(s)}</option>`)].join("")}</select>
    <button class="btn min-h-11" type="submit">Filtrar</button>${filter ? `<a class="btn btn--ghost min-h-11" href="/m/${meta.key}">Quitar filtro</a>` : ""}
  </form>`;

  /* una tarjeta por lead, con su mini-formulario de acciones */
  const rows = shown.map((l) => {
    const lid = String(l.id ?? "");
    const days = daysSince(l.updatedAt ?? l.day);
    const tone = days === null ? "none" : days >= 15 ? "coral" : days >= 8 ? "orange" : "none";
    const stale = days === null ? chip("sin fecha", tone)
      : days <= 0 ? chip("tocado hoy", tone)
      : chip(`sin tocar hace ${days} ${days === 1 ? "día" : "días"}`, tone);
    const lf = lastFollowup(data.followups, lid);
    const statusOptions = STATUSES.map((s) => `<option value="${esc(s)}"${s === l.status ? " selected" : ""}>${esc(s)}</option>`).join("");
    return card(`
      <h3 style="margin:0 0 4px">${esc(l.family)}</h3>
      <p style="margin:0 0 8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${chip(l.status, STATUS_TONE[l.status] ?? "navy")}
        ${chip("vino por " + l.source, "none")}
        ${stale}
      </p>
      <p class="note" style="margin:0 0 6px">contacto: ${esc(l.contact)} · alta el ${esc(l.day)} · último cambio el ${esc(l.updatedAt ?? l.day)}</p>
      ${l.note ? `<p class="note" style="margin:0 0 6px">${esc(l.note)}</p>` : ""}
      <p class="note" style="margin:0 0 10px">${lf ? `última nota de seguimiento (${esc(lf.day)}): ${esc(lf.text)}` : "sin notas de seguimiento todavía"}</p>
      <form method="post" action="/m/${meta.key}" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:0">
        <input type="hidden" name="leadId" value="${esc(lid)}">
        <input type="hidden" name="filter" value="${esc(filter)}">
        <span><label for="crm-st-${esc(lid)}">Estado</label>
        <select id="crm-st-${esc(lid)}" name="status">${statusOptions}</select></span>
        <span style="flex:1;min-width:220px"><label for="crm-fu-${esc(lid)}">Nota de seguimiento (interna)</label>
        <input id="crm-fu-${esc(lid)}" name="text" type="text" maxlength="200" autocomplete="off" placeholder="qué pasó, qué sigue"></span>
        <button class="btn" type="submit" name="action" value="set-status">Guardar estado</button>
        <button class="btn btn--ghost" type="submit" name="action" value="add-followup">Añadir nota</button>
      </form>
    `);
  }).join("");

  const listBlock = total === 0
    ? empty("No hay leads todavía — añade el primero con el formulario de abajo. Los datos de este tab viven solo en este ordenador.")
    : shown.length === 0
      ? empty(`Ningún lead en estado «${filter}» ahora mismo. Hay ${plural(total, "lead", "leads")} en total; quita el filtro para verlos.`)
      : rows;

  const addForm = card(`
    <h3 style="margin:0 0 10px">Nuevo lead de admisión</h3>
    <form method="post" action="/m/${meta.key}" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
      <input type="hidden" name="action" value="add-lead">
      <input type="hidden" name="filter" value="${esc(filter)}">
      <span style="flex:1;min-width:200px">${field("family", "Familia (obligatorio)")}</span>
      <span style="flex:1;min-width:200px">${field("contact", "Email o teléfono")}</span>
      <span>${select("source", "Vino por", SOURCES, "web")}</span>
      <span style="flex:2;min-width:240px">${field("note", "Nota (opcional)")}</span>
      ${submit("Añadir lead")}
    </form>
    <p class="note" style="margin:10px 0 0">El lead entra con estado «nuevo». Este formulario no escribe en el pipeline de matrículas ni envía nada a ninguna familia: solo guarda en el almacén local.</p>
  `);

  return `${head({
    kicker: "admisiones",
    title: "CRM · contactos de admisión",
    sub: "Familias que han preguntado y aún no están en matrículas. Lo matriculado de verdad se gestiona en el pipeline del núcleo, no aquí.",
  })}
    <p class="clay callout"><strong>Datos de demo, locales.</strong> Este tab escribe solo en <code>dashboard/.data/${esc(ctx.slug)}/crm.json</code>: no hay envíos, ni avisos a las familias, ni sincronización con otro sistema. Los cinco leads sembrados el día uno son familias ficticias de Lotus Valley y llevan «demo:» en su nota.</p>
    <p style="display:flex;flex-wrap:wrap;gap:8px;margin:14px 0">${chips}</p>
    ${filterForm}
    ${filter ? `<p class="note" style="margin:0 0 10px">Mostrando solo «${esc(filter)}» — ordenados con el más antiguo sin tocar primero.</p>` : `<p class="note" style="margin:0 0 10px">Ordenados con el más antiguo sin tocar primero, para que lo vencido se vea antes.</p>`}
    ${listBlock}
    <div style="margin-top:18px">${addForm}</div>
  ${endHead}`;
}

/* ---------- handle (POST /m/crm) ---------- */

export function handle(ctx, form) {
  // defensa en profundidad: el server ya filtra roles, pero el módulo también mira.
  if (meta.roles.length && !meta.roles.includes(ctx.session?.role)) {
    return { status: 403, html: `<p class="clay callout callout--warn">Tu rol no puede escribir en el CRM.</p>` };
  }

  const db = jsonStore(ctx.slug, meta.key, DEFAULTS);
  const data = loadSeeded(db);
  const qp = ctx.query ?? ctx.params ?? new URLSearchParams();
  const filter = cleanFilter(String(form.get("filter") ?? qp.get("status") ?? ""));
  const target = filter ? `/m/${meta.key}?status=${encodeURIComponent(filter)}` : `/m/${meta.key}`;
  const back = { redirect: target };
  const fail = (msg) => ({
    status: 422,
    html: `<section class="section"><p class="clay callout callout--warn">${esc(msg)}</p>
      <p><a class="btn" href="${esc(target)}">Volver al listado</a></p></section>`,
  });

  const action = String(form.get("action") ?? "");
  const slice = (v) => String(form.get(v) ?? "").trim().slice(0, 200);
  const today = todayISO();

  if (action === "add-lead") {
    const family = slice("family");
    if (!family) return fail("Sin familia no hay lead: el campo «Familia» es obligatorio y no puede ir vacío.");
    const contact = slice("contact");
    const source = SOURCES.includes(String(form.get("source") ?? "")) ? String(form.get("source")) : "otro";
    const note = slice("note");
    data.leads.unshift({ id: id(), family, contact, source, status: "nuevo", note, day: today, updatedAt: today });
    db.save(data);
    return back;
  }

  const leadId = String(form.get("leadId") ?? "");
  const lead = data.leads.find((l) => l && String(l.id) === leadId);

  if (action === "set-status") {
    if (!lead) return fail("Ese lead ya no está en el almacén — recarga la página y prueba de nuevo.");
    const status = String(form.get("status") ?? "");
    if (!STATUSES.includes(status)) return fail(`«${status || "(vacío)"}» no es un estado que este CRM conozca.`);
    if (status !== lead.status) {
      lead.status = status;
      lead.updatedAt = today;
      db.save(data);
    }
    return back;
  }

  if (action === "add-followup") {
    if (!lead) return fail("Ese lead ya no está en el almacén — recarga la página y prueba de nuevo.");
    const text = slice("text");
    if (!text) return fail("La nota de seguimiento llegó vacía: escribe qué pasó o qué sigue, o no la guardes.");
    data.followups.push({ id: id(), leadId: lead.id, text, day: today });
    lead.updatedAt = today;
    db.save(data);
    return back;
  }

  return fail("Acción no reconocida en el CRM; nada se cambió.");
}
