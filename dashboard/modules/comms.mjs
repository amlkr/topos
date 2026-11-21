/**
 * comms.mjs — «Equipo»: el tablero interno del staff (contrato dashboard/MODULE-API.md).
 *
 * Anuncios + tareas, para que «lo que se dijo ayer por LINE» deje de existir:
 * queda aquí y mañana se puede leer. Un archivo, un jsonStore, cero JS de cliente.
 * Datos ficticios — docs/BOUNDARIES.md.
 */
import { jsonStore, esc, head, endHead, card, empty, field, select, submit, id, todayISO } from "../module-kit.mjs";

export const meta = { key: "comms", label: "Equipo", order: 30, roles: [] }; // [] = todo el staff

const KEY = "comms";
// Los roles que el server monta (dashboard/server.mjs); «todos» es una asignación colectiva.
const ROLES = ["director", "admissions", "finance", "coach"];
const ASSIGNEES = [...ROLES, "todos"];
const TONES = { director: "navy", admissions: "sky", finance: "green", coach: "plum", todos: "orange" };

// ---- helpers locales (sin tocar el kit) ----
const toneOf = (a) => (TONES[a] ?? "none");
const chip = (txt, tone) => `<span class="chip chip--${tone}">${esc(txt)}</span>`;
const isoShift = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---- almacenamiento + semilla demo (solo si el tablero está vacío) ----
function seed() {
  return {
    posts: [
      {
        id: id(), title: "Nuevo protocolo de consentimiento fotográfico — leer antes de publicar",
        body: "Ninguna foto con caras de alumnos sale a web ni a redes sin el consentimiento firmado archivado. La galería del ensayo de robótica queda bloqueada hasta revisarla una a una. Dudas, con admisiones.",
        author: "admissions@lotus.example", day: isoShift(0), pinned: true, demo: true,
      },
      {
        id: id(), title: "Reunión de coordinación · viernes 14:00",
        body: "Sala de maestros. Orden del día: cierre de admisiones del term y preparación de la muestra de robótica. Traed los pendientes de vuestra mesa.",
        author: "director@lotus.example", day: isoShift(-1), pinned: false, demo: true,
      },
    ],
    tasks: [
      { id: id(), text: "Llamar a la familia Srisuwan (ficticia) sobre la prueba de beca", assignee: "admissions", done: false, day: isoShift(-1), due: isoShift(2), demo: true },
      { id: id(), text: "Preparar el taller de robótica para el arranque del term", assignee: "coach", done: false, day: isoShift(-1), due: isoShift(5), demo: true },
      { id: id(), text: "Revisar el manifiesto de la escuela con la dirección", assignee: "director", done: false, day: isoShift(-3), due: "", demo: true },
      { id: id(), text: "Cerrar la ronda de cobros de noviembre y pasar el resumen", assignee: "finance", done: false, day: isoShift(-3), due: isoShift(-1), demo: true }, // vencida a propósito
    ],
  };
}

function loadBoard(db) {
  const data = db.load();
  if (!Array.isArray(data.posts)) data.posts = [];
  if (!Array.isArray(data.tasks)) data.tasks = [];
  if (!data.posts.length && !data.tasks.length) {
    Object.assign(data, seed());
    db.save(data);
  }
  return data;
}

// ---- render ----
export function render(ctx) {
  const db = jsonStore(ctx.slug, KEY, { posts: [], tasks: [] });
  const data = loadBoard(db);
  // el server actual pasa ctx.query; el doc prometía ctx.params — leemos ambos sin drama
  const q = ctx.query ?? ctx.params ?? new URLSearchParams();
  const filter = String(q.get("asignado") ?? "");
  const today = todayISO();

  // anuncios: fijados arriba, luego los más nuevos primero (los recién añadidos van al inicio del array)
  const posts = [...data.posts].sort(
    (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.day ?? "").localeCompare(String(a.day ?? "")),
  );

  // tareas: con filtro por rol también salen las marcadas «todos»
  const visible = filter
    ? data.tasks.filter((t) => t.assignee === filter || t.assignee === "todos")
    : data.tasks;
  const open = visible
    .filter((t) => !t.done)
    .sort((a, b) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || String(a.due ?? "").localeCompare(String(b.due ?? "")));
  const done = visible.filter((t) => t.done);

  const demoVisible = data.posts.some((p) => p.demo) || data.tasks.some((t) => t.demo);

  const postCards = posts.length
    ? posts.map((p) => card(`
        <h3>${esc(p.title)} ${p.pinned ? chip("fijado", "lime") : ""}${p.demo ? " " + chip("demo", "none") : ""}</h3>
        ${p.body ? `<p class="body">${esc(p.body)}</p>` : ""}
        <p class="note">${esc(p.author)} · ${esc(p.day)}</p>
        <form class="inline" method="post" action="/m/${KEY}">
          <input type="hidden" name="action" value="pin-task">
          <button class="btn btn--ghost" type="submit" name="pin" value="${esc(p.id)}">${p.pinned ? "Quitar fijado" : "Fijar arriba"}</button>
        </form>`)).join("")
    : empty("No hay anuncios todavía — publicad el primero.");

  const taskRow = (t) => {
    const overdue = t.due && !t.done && t.due < today;
    const dueChip = overdue
      ? `<span class="chip chip--coral">venció el ${esc(t.due)}</span>`
      : t.due === today
        ? `<span class="chip chip--orange">vence hoy</span>`
        : t.due
          ? chip("vence " + t.due, "none")
          : chip("sin fecha", "none");
    return `<li>
      <span class="story-title${t.done ? " dt" : ""}" style="flex:1 1 12rem">${esc(t.text)}</span>
      ${chip(t.assignee, toneOf(t.assignee))}
      ${t.done ? chip("hecha", "green") : dueChip}
      ${t.demo ? chip("demo", "none") : ""}
      <form class="inline right" method="post" action="/m/${KEY}">
        <input type="hidden" name="action" value="toggle-task">
        <input type="hidden" name="asignado" value="${esc(filter)}">
        <button class="btn btn--ghost" type="submit" name="done" value="${esc(t.id)}">${t.done ? "Reabrir" : "Marcar hecha"}</button>
      </form>
    </li>`;
  };

  const openList = open.length
    ? card(`<ul class="list">${open.map(taskRow).join("")}</ul>`)
    : empty(filter ? `Nada pendiente asignado a «${filter}» (ni a «todos»).` : "No hay tareas pendientes — mesa limpia.");

  const filterChips = [
    `<a class="chip ${filter ? "chip--none" : "chip--navy"}" href="/m/${KEY}">todas</a>`,
    ...ROLES.map((r) => `<a class="chip ${filter === r ? "chip--navy" : "chip--none"}" href="/m/${KEY}?asignado=${encodeURIComponent(r)}">${esc(r)}</a>`),
  ].join(" ");

  return `${head({ kicker: "interno", title: "Equipo", sub: "Anuncios y tareas del staff — lo que se dijo ayer queda aquí, no se pierde" })}
    <style>
      #comms .cols{display:grid;gap:26px;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)}
      @media (max-width:880px){#comms .cols{grid-template-columns:1fr}}
      #comms .col>h2{margin:2px 0 12px}
      #comms .cform{background:var(--card);border:2px solid var(--line);border-radius:1rem;padding:14px;margin:0 0 18px;display:grid;gap:10px}
      #comms .frow{display:flex;flex-wrap:wrap;gap:12px}
      #comms .f{flex:1 1 11rem;min-width:0}
      #comms .f label{display:block;font-weight:800;font-size:.85rem;margin:0 0 2px}
      #comms .f input[type=text],#comms .f input[type=date],#comms .f select,#comms .f textarea{display:block;width:100%;min-height:2.75rem;margin-top:4px;padding:6px 12px;border:2px solid var(--navy);border-radius:14px;background:var(--cream);color:var(--navy);font:inherit;font-size:.95rem}
      #comms .f textarea{min-height:5.5rem;resize:vertical}
      #comms .chk{display:flex;align-items:center;gap:8px;font-weight:800;font-size:.88rem;margin:0}
      #comms .chk input{width:1.15rem;height:1.15rem;accent-color:var(--navy)}
      #comms .cform .btn{justify-self:start}
      #comms .body{white-space:pre-wrap}
      #comms .inline{margin:10px 0 0}
      #comms .list form.inline{margin:0}
      #comms .right{margin-left:auto}
      #comms .dt{text-decoration:line-through;color:var(--muted)}
      #comms .filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 14px}
      #comms .filters a{text-decoration:none}
      #comms details.done{background:var(--card);border:2px dashed var(--line);border-radius:1rem;padding:10px 16px;margin-top:14px}
      #comms details.done>summary{font-family:"Archivo",ui-rounded,system-ui,sans-serif;font-weight:700;cursor:pointer}
    </style>
    <div id="comms">
    ${demoVisible ? `<p class="clay callout callout--quiet">Vista de demostración: los elementos con la etiqueta «demo» son ficticios. Se siembran solo mientras el tablero está vacío; lo que el equipo publique o asigne a partir de ahora es real.</p>` : ""}
      <div class="cols">
        <section class="col">
          <p class="kicker">muro</p><h2>Anuncios</h2>
          <form class="cform" method="post" action="/m/${KEY}">
            <input type="hidden" name="action" value="add-post">
            <div class="frow"><div class="f">${field("title", "Título")}</div></div>
            <div class="frow"><div class="f"><label for="body">Mensaje</label><textarea id="body" name="body" rows="4" placeholder="Qué pasó, qué cambia, quién lo ejecuta…"></textarea></div></div>
            <label class="chk"><input type="checkbox" name="pin" value="1"> Fijar arriba</label>
            ${submit("Publicar anuncio")}
          </form>
          ${postCards}
        </section>
        <section class="col">
          <p class="kicker">mesa de trabajo</p><h2>Tareas</h2>
          <p class="filters"><span class="note">Ver:</span> ${filterChips}</p>
          ${filter ? `<p class="note">Filtrando por «${esc(filter)}» — también se muestran las marcadas para «todos». <a href="/m/${KEY}">Quitar filtro</a></p>` : ""}
          <form class="cform" method="post" action="/m/${KEY}">
            <input type="hidden" name="action" value="add-task">
            <input type="hidden" name="asignado" value="${esc(filter)}">
            <div class="frow"><div class="f">${field("text", "Tarea")}</div></div>
            <div class="frow">
              <div class="f">${select("assignee", "Asignar a", ASSIGNEES, ASSIGNEES.includes(filter) ? filter : "todos")}</div>
              <div class="f">${field("due", "Vence (opcional)", "", "date")}</div>
            </div>
            ${submit("Añadir tarea")}
          </form>
          ${openList}
          ${done.length ? `<details class="done"><summary>Hechas (${done.length})</summary><ul class="list">${done.map(taskRow).join("")}</ul></details>` : ""}
        </section>
      </div>
    </div>
  ${endHead}`;
}

// ---- escrituras ----
export function handle(ctx, form) {
  // defensa en profundidad: aunque el server ya filtra, solo roles conocidos escriben
  if (!ctx.session || !ROLES.includes(ctx.session.role))
    return { status: 403, html: `<p class="clay callout callout--warn">Tu sesión no tiene un rol conocido — recarga e inicia sesión de nuevo.</p>${render(ctx)}` };

  const db = jsonStore(ctx.slug, KEY, { posts: [], tasks: [] });
  const data = loadBoard(db);
  const action = String(form.get("action") ?? "");
  const filter = String(form.get("asignado") ?? "");
  const back = ASSIGNEES.includes(filter) ? `/m/${KEY}?asignado=${encodeURIComponent(filter)}` : `/m/${KEY}`;
  const bad = (msg) => ({ status: 422, html: `<p class="clay callout callout--warn">${esc(msg)}</p>${render(ctx)}` });

  if (action === "add-post") {
    const title = String(form.get("title") ?? "").trim().slice(0, 160);
    const body = String(form.get("body") ?? "").trim().slice(0, 4000);
    if (!title) return bad("El anuncio necesita un título — no lo guardamos vacío.");
    data.posts.unshift({ id: id(), title, body, author: ctx.session.email, day: todayISO(), pinned: form.get("pin") === "1" });
    db.save(data);
    return { redirect: `/m/${KEY}` };
  }

  if (action === "add-task") {
    const text = String(form.get("text") ?? "").trim().slice(0, 300);
    const assignee = String(form.get("assignee") ?? "");
    let due = String(form.get("due") ?? "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) due = "";
    if (!text) return bad("La tarea necesita una descripción — no la guardamos vacía.");
    if (!ASSIGNEES.includes(assignee)) return bad("Ese asignado no está en el equipo.");
    data.tasks.unshift({ id: id(), text, assignee, done: false, day: todayISO(), due });
    db.save(data);
    return { redirect: back };
  }

  if (action === "toggle-task") {
    const tid = String(form.get("done") ?? "");
    const t = data.tasks.find((x) => x.id === tid);
    if (t) { t.done = !t.done; db.save(data); } // preserva todo lo demás; id desconocido = no-op honesto
    return { redirect: back };
  }

  if (action === "pin-task") {
    const pid = String(form.get("pin") ?? "");
    const p = data.posts.find((x) => x.id === pid);
    if (p) { p.pinned = !p.pinned; db.save(data); }
    return { redirect: `/m/${KEY}` };
  }

  return { redirect: back };
}
