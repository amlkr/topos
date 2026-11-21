/**
 * finance.mjs — Módulo Finanzas del panel Topos.
 * Contrato: dashboard/MODULE-API.md · datos: dashboard/DATA-API.md.
 *
 * El libro de gastos es de este módulo: jsonStore(slug, "finance") →
 * dashboard/.data/<slug>/finance.json, escrita atómica, única dueña.
 * Lo que las familias deben por matrículas NO se copia ni se inventa:
 * se lee en cada carga de store.money() (primitivas payments/enrolments
 * del almacén central) y aparece etiquetado con su origen.
 *
 * v0 honesta: no hay pasarela de pago («cobrado» = una persona marcó el
 * transferente tras cotejarlo), no hay borrado de gastos (solo el cambio
 * hecho ↔ previsto), y los cuatro apuntes sembrados con el store vacío
 * van marcados como demo. Datos ficticios de Lotus Valley —
 * docs/BOUNDARIES.md. Sin JS de cliente; todo string dinámico, esc().
 */
import {
  jsonStore, esc, money, head, endHead, card, empty,
  field, select, submit, id, todayISO,
} from "../module-kit.mjs";

export const meta = { key: "finance", label: "Finanzas", order: 20, roles: ["director", "finance"] };

/* ------------------------------------------------------------------ */
/* vocabulario del libro                                              */
/* ------------------------------------------------------------------ */
const CATEGORIES = [
  { value: "personal", label: "Personal y honorarios" },
  { value: "instalaciones", label: "Instalaciones" },
  { value: "actividades", label: "Actividades y salidas" },
  { value: "marketing", label: "Marketing" },
  { value: "otros", label: "Otros" },
];
const CATS = new Set(CATEGORIES.map((c) => c.value));
const STATUSES = ["hecho", "previsto"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const monthOf = (iso) => String(iso ?? "").slice(0, 7);
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
function validDay(v) {
  if (!DATE_RE.test(v)) return false;
  return new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
}
function shiftMonth(ym, n) {
  const mo = Number(ym.slice(5, 7)) - 1 + n;
  const y = Number(ym.slice(0, 4)) + Math.floor(mo / 12);
  return `${String(y).padStart(4, "0")}-${String(((mo % 12) + 12) % 12 + 1).padStart(2, "0")}`;
}
function monthLabel(ym) {
  return `${MESES[Number(ym.slice(5, 7)) - 1] ?? "mes"} ${ym.slice(0, 4)}`;
}

/* ------------------------------------------------------------------ */
/* libro propio (jsonStore) + lectura del almacén central              */
/* ------------------------------------------------------------------ */
function seedRows(today) {
  const thisMonth = monthOf(today);
  const next = shiftMonth(thisMonth, 1);
  return [
    { id: id(), title: "Honorarios de coaches invitados — Robotics", amount: 6000, category: "personal", day: `${thisMonth}-06`, status: "hecho", demo: true },
    { id: id(), title: "Materiales de arte — term 2 (papel, tintas, arcilla)", amount: 1850, category: "actividades", day: `${thisMonth}-11`, status: "hecho", demo: true },
    { id: id(), title: "Hosting del sitio y el correo de la escuela", amount: 950, category: "otros", day: `${thisMonth}-03`, status: "hecho", demo: true },
    { id: id(), title: "Alquiler de autobús — salida al río", amount: 3200, category: "actividades", day: `${next}-10`, status: "previsto", demo: true },
  ];
}

/** Lee el libro; lo siembra (demo, ficticio) solo si está vacío y seed=true. */
function book(db, seed) {
  const data = db.load();
  if (!Array.isArray(data.expenses)) data.expenses = [];
  if (seed && data.expenses.length === 0) {
    data.expenses = seedRows(todayISO());
    db.save(data);
  }
  return data.expenses;
}

/** store.money() nunca puede tumbar la página: si falla, se dice y no se inventa nada. */
function core(store) {
  try { return { ok: true, m: store.money() }; }
  catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
}

/* ------------------------------------------------------------------ */
/* piezas locales (clases del shell; CSS propio solo .fin-*, scoped)   */
/* ------------------------------------------------------------------ */
const chip = (text, tone) => `<span class="chip chip--${tone}">${esc(text)}</span>`;
const sum = (list) => list.reduce((n, e) => n + (Number(e.amount) || 0), 0);

function selectCat(name, label, selected) {
  const opts = CATEGORIES.map((c) => `<option value="${esc(c.value)}"${c.value === selected ? " selected" : ""}>${esc(c.label)}</option>`).join("");
  return `<label for="${esc(name)}">${esc(label)}</label><select id="${esc(name)}" name="${esc(name)}">${opts}</select>`;
}

function stat(tone, label, value, unit, detailHtml, source) {
  return `<div class="clay stat${tone ? ` stat--${tone}` : ""}">
    <p class="stat-label">${esc(label)}${source ? ` ${chip(source, "none")}` : ""}</p>
    <p class="num">${esc(value)}</p>
    ${unit ? `<p class="unit">${esc(unit)}</p>` : ""}
    <p class="detail">${detailHtml}</p>
  </div>`;
}

const FIN_CSS = `<style>
.fin-form{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));align-items:end}
.fin-form label{display:block;font-weight:800;font-size:.85rem;margin:0 0 4px}
.fin-form input,.fin-form select{display:block;width:100%;min-height:2.75rem;padding:0 14px;border:2px solid var(--navy);border-radius:14px;background:var(--cream);color:var(--navy);font:inherit;font-size:1rem}
.fin-form input:focus-visible,.fin-form select:focus-visible{outline:3px solid var(--navy);outline-offset:2px}
.fin-note{grid-column:1/-1;margin:0}
.fin-act{display:inline;margin:0}
.fin-btn{padding:.3rem .85rem;font-size:.8rem;min-height:2.2rem}
</style>`;

/* ------------------------------------------------------------------ */
/* cuerpo del módulo                                                   */
/* ------------------------------------------------------------------ */
/** fb = null | { problems: string[], values?: {...crudos} }. */
function body(ctx, fb, seed = false) {
  const db = jsonStore(ctx.slug, "finance", { expenses: [] });
  const expenses = book(db, seed);
  const today = todayISO();
  const thisMonth = monthOf(today);
  const { ok, m, error } = core(ctx.store);
  const currency = ok ? m.currency : "THB";
  const fmt = (n) => money(n, currency);

  /* --- resumen del mes --- */
  const hechos = expenses.filter((e) => monthOf(e.day) === thisMonth && e.status === "hecho");
  const previstosMes = expenses.filter((e) => monthOf(e.day) === thisMonth && e.status === "previsto");
  const previstosFut = expenses.filter((e) => monthOf(e.day) > thisMonth && e.status === "previsto");

  const resumen = `<h2 class="fin-h2" style="font-size:1.15rem;margin:20px 0 10px">Resumen — ${esc(monthLabel(thisMonth))}</h2>
  <div class="grid">
    ${stat("", "Gastos hechos", fmt(sum(hechos)), monthLabel(thisMonth),
      `${hechos.length} ${hechos.length === 1 ? "apunte en" : "apuntes en"} el libro de Finanzas`, "módulo Finanzas")}
    ${stat("sky", "Gastos previstos", fmt(sum(previstosMes)), monthLabel(thisMonth),
      previstosFut.length
        ? `y ${esc(fmt(sum(previstosFut)))} previstos en ${previstosFut.length} ${previstosFut.length === 1 ? "apunte de mes futuro" : "apuntes de meses futuros"}`
        : "nada previsto para los meses siguientes", "módulo Finanzas")}
    ${ok
      ? stat("lime", "Matrículas cobradas", fmt(m.totals.paid), `${m.totals.families} familias con matrícula`,
        `pagos marcados a mano por la mesa tras cotejar el transferente — no hay pasarela`, "store.money()")
      : stat("grey", "Matrículas cobradas", "—", "sin lectura del almacén central", "ver el aviso bajo este bloque", "store.money()")}
    ${ok
      ? stat("coral", "Matrículas pendientes", fmt(m.totals.due), m.totals.overdue > 0 ? `${fmt(m.totals.overdue)} ya vencidos` : "nada vencido",
        `de ${m.totals.families} familias del almacén central, ${m.families.filter((f) => f.due > 0).length} deben algo hoy`, "store.money()")
      : stat("grey", "Matrículas pendientes", "—", "sin lectura del almacén central", "ver el aviso bajo este bloque", "store.money()")}
  </div>
  ${ok ? "" : `<p class="clay callout callout--warn"><strong>Sin cifras de matrículas.</strong> <code>store.money()</code> respondió: <code>${esc(error)}</code> — nada se inventa aquí; el libro propio sigue funcionando.</p>`}`;

  /* --- quién debe (leído del core, nunca duplicado) --- */
  let deudores = "";
  if (ok) {
    const debtors = m.families.filter((f) => Number(f.due) > 0)
      .sort((a, b) => (Number(b.overdue) - Number(a.overdue)) || (Number(b.due) - Number(a.due)));
    deudores = `<section class="clay group" id="quien-debe">
      <div class="group-head">
        <h2>Quién debe (matrículas)</h2>
        <span class="count">${debtors.length}</span>
        <p class="note">cifras leídas de <code>store.money()</code> en esta misma carga (${esc(m.asOf)}) — este módulo no las copia ni las escribe</p>
      </div>
      ${debtors.length ? `<div class="tw"><table>
        <thead><tr><th scope="col">Familia</th><th scope="col">Refs</th><th scope="col" class="num-col">Cobrado</th><th scope="col" class="num-col">Pendiente</th><th scope="col">Vencido</th><th scope="col">Próximo vencimiento</th></tr></thead>
        <tbody>${debtors.map((f) => `<tr>
          <th scope="row"><span class="strong">${esc(f.name)}</span><br><span class="note">${esc(f.children)}</span></th>
          <td class="ref">${f.refs.length ? f.refs.map((r) => esc(r)).join("<br>") : `<span class="note">sin refs</span>`}</td>
          <td class="num-col">${esc(fmt(Number(f.paid) || 0))}</td>
          <td class="num-col strong">${esc(fmt(Number(f.due) || 0))}</td>
          <td>${Number(f.overdue) > 0 ? chip(`${fmt(Number(f.overdue))} vencido`, "coral") : chip("al día de fecha", "sky")}</td>
          <td>${f.nextDue ? (f.nextDue < m.asOf ? `vencía el ${esc(f.nextDue)}` : `vence ${esc(f.nextDue)}`) : `<span class="note">sin fecha fijada</span>`}</td>
        </tr>`).join("")}</tbody>
        <tfoot><tr class="total-row"><th scope="row" colspan="2">Total — ${debtors.length} ${debtors.length === 1 ? "familia" : "familias"}</th>
          <td class="num-col">${esc(fmt(m.totals.paid))}</td><td class="num-col">${esc(fmt(m.totals.due))}</td>
          <td>${esc(fmt(m.totals.overdue))}</td><td></td></tr></tfoot>
      </table></div>` : empty("Ninguna familia del almacén central tiene pendiente hoy: todo figura cobrado.")}
    </section>`;
  } else {
    deudores = `<section class="clay group"><div class="group-head"><h2>Quién debe (matrículas)</h2></div>
      ${empty("Sin lectura posible del almacén central: no hay lista de deudores que mostrar esta vez.")}</section>`;
  }

  /* --- formulario de alta (con valores pegajosos si hubo problemas) --- */
  const v = fb?.values ?? {};
  const form = card(`<h2 style="margin:0 0 10px;font-size:1.1rem">Añadir gasto</h2>
    <form method="post" action="/m/finance" class="fin-form">
      <input type="hidden" name="action" value="add-expense">
      ${field("title", "Título del gasto", v.title ?? "")}
      ${field("amount", `Importe (${currency})`, v.amount ?? "", "number")}
      ${selectCat("category", "Categoría", CATS.has(v.category) ? v.category : "personal")}
      ${field("day", "Día", v.day ?? today, "date")}
      ${select("status", "Estado", STATUSES, STATUSES.includes(v.status) ? v.status : "hecho")}
      <span class="fin-submit">${submit("Añadir gasto")}</span>
      <p class="note fin-note">v0: no hay borrado — un apunte solo puede cambiar entre <em>hecho</em> y <em>previsto</em>, abajo en la tabla.</p>
    </form>`);

  /* --- tabla del libro, agrupada por categoría con subtotales --- */
  const groups = CATEGORIES.map((c) => {
    const list = expenses.filter((e) => e.category === c.value)
      .sort((a, b) => String(b.day).localeCompare(String(a.day)));
    if (!list.length) return "";
    return `<section class="clay group">
      <div class="group-head"><h2>${esc(c.label)}</h2><span class="count">${list.length}</span>
        <p class="note">subtotal del libro en esta categoría</p></div>
      <div class="tw"><table>
        <caption>Apuntes guardados en <code>finance.json</code> — store propio del módulo Finanzas, único sitio donde esta página escribe.</caption>
        <thead><tr><th scope="col">Día</th><th scope="col">Gasto</th><th scope="col">Estado</th><th scope="col" class="num-col">Importe</th><th scope="col">Acción</th></tr></thead>
        <tbody>${list.map((e) => `<tr>
          <th scope="row" class="ref">${esc(e.day)}</th>
          <td><span class="strong">${esc(e.title)}</span><br><span class="note ref">${esc(e.id)}</span>${e.demo ? ` ${chip("demo", "navy")}` : ""}</td>
          <td>${chip(e.status === "previsto" ? "previsto" : "hecho", e.status === "previsto" ? "orange" : "green")}</td>
          <td class="num-col strong">${esc(fmt(Number(e.amount) || 0))}</td>
          <td><form method="post" action="/m/finance" class="fin-act"><input type="hidden" name="action" value="toggle-status"><input type="hidden" name="id" value="${esc(e.id)}"><button class="btn fin-btn" type="submit">${esc(e.status === "hecho" ? "Marcar previsto" : "Marcar hecho")}</button></form></td>
        </tr>`).join("")}</tbody>
        <tfoot><tr class="total-row"><th scope="row" colspan="3">Subtotal — ${esc(c.label)}</th><td class="num-col">${esc(fmt(sum(list)))}</td><td></td></tr></tfoot>
      </table></div>
    </section>`;
  }).join("");

  const libro = `<section class="clay group">
    <div class="group-head"><h2>El libro de gastos</h2><span class="count">${expenses.length}</span>
      <p class="note">hechos ${esc(fmt(sum(expenses.filter((e) => e.status === "hecho"))))} · previstos ${esc(fmt(sum(expenses.filter((e) => e.status === "previsto"))))} (todos los meses)</p></div>
    ${expenses.some((e) => e.demo) ? `<p class="note" style="margin:0 0 10px">Los apuntes con chip «demo» son ficticios (Lotus Valley) y se sembraron la primera vez que se abrió este módulo con el libro vacío.</p>` : ""}
    ${expenses.length ? groups : empty("No hay gastos en el libro todavía — añade el primero arriba.")}
  </section>`;

  /* --- procedencia de las cifras (regla de honestidad) --- */
  const fuentes = `<div class="callout callout--quiet"><strong>De dónde sale cada número.</strong>
    Gastos: el libro propio de este módulo (<code>jsonStore → dashboard/.data/${esc(ctx.slug)}/finance.json</code>).
    Cobrado, pendiente y vencido de matrículas: <code>store.money()</code> del almacén central, leído en cada carga y <em>no duplicado</em> aquí.
    «Cobrado» significa que una persona de la mesa marcó el pago tras cotejar el extracto — en Topos v0 no existe pasarela de pago ni comprobantes automáticos.</div>`;

  const problems = fb?.problems?.length
    ? `<p class="clay callout callout--warn"><strong>No se guardó nada:</strong></p>
       <ul style="margin:0 0 12px;padding-left:1.3rem">${fb.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
    : "";

  return `${head({
    kicker: "módulo · finanzas",
    title: "Finanzas",
    sub: "el libro de gastos de la escuela, y una mirada honesta a quién debe matrículas — esas cifras se leen del almacén central, nunca se copian",
  })}
  ${FIN_CSS}
  ${problems}
  ${resumen}
  ${deudores}
  ${form}
  ${libro}
  ${fuentes}
  ${endHead}`;
}

export function render(ctx) {
  return body(ctx, null, true); // el seed demo solo ocurre con el libro vacío, al leer
}

/* ------------------------------------------------------------------ */
/* escrituras                                                          */
/* ------------------------------------------------------------------ */
export function handle(ctx, form) {
  // defensa en profundidad: el server ya filtra roles, aquí se vuelve a comprobar
  if (!meta.roles.includes(ctx.session?.role)) {
    return { status: 403, html: body(ctx, { problems: [`El rol «${ctx.session?.role ?? "desconocido"}» no gobierna el módulo Finanzas.`] }) };
  }
  const db = jsonStore(ctx.slug, "finance", { expenses: [] });
  const action = String(form.get("action") ?? "");

  if (action === "add-expense") {
    const raw = {
      title: String(form.get("title") ?? ""),
      amount: String(form.get("amount") ?? ""),
      category: String(form.get("category") ?? ""),
      day: String(form.get("day") ?? ""),
      status: String(form.get("status") ?? ""),
    };
    const problems = [];
    const title = raw.title.trim().slice(0, 120);
    if (!title) problems.push("El título del gasto no puede quedar vacío.");
    const amountRaw = raw.amount.trim();
    const num = Number(amountRaw);
    if (!amountRaw) problems.push("El importe es obligatorio.");
    else if (!Number.isFinite(num)) problems.push("El importe debe ser un número.");
    else if (!(num > 0)) problems.push(`El importe debe ser mayor que cero — llegó «${amountRaw}».`);
    if (!CATS.has(raw.category)) problems.push("La categoría elegida no está en la lista del módulo.");
    let day = raw.day.trim();
    if (!day) day = todayISO();
    else if (!validDay(day)) problems.push("La fecha debe tener formato AAAA-MM-DD y existir en el calendario.");
    const status = raw.status === "previsto" ? "previsto" : "hecho";

    if (problems.length) return { status: 422, html: body(ctx, { problems, values: raw }) };

    const data = db.load();
    if (!Array.isArray(data.expenses)) data.expenses = [];
    data.expenses.unshift({ id: id(), title, amount: num, category: raw.category, day, status });
    db.save(data);
    return { redirect: "/m/" + meta.key };
  }

  if (action === "toggle-status") {
    const wanted = String(form.get("id") ?? "").trim();
    const data = db.load();
    const list = Array.isArray(data.expenses) ? data.expenses : [];
    const found = list.find((e) => String(e.id) === wanted);
    if (!found) {
      return { status: 422, html: body(ctx, { problems: [`No hay ningún gasto con la referencia «${wanted || "(vacía)"}» — nada cambió.`] }) };
    }
    found.status = found.status === "hecho" ? "previsto" : "hecho";
    db.save(data);
    return { redirect: "/m/" + meta.key };
  }

  return { status: 422, html: body(ctx, { problems: ["El módulo Finanzas solo entiende dos acciones: add-expense y toggle-status."] }) };
}
