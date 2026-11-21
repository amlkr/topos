/**
 * journal.mjs — «Diario»: la vista de auditoría del panel Topos
 * (contrato dashboard/MODULE-API.md; el almacén es dashboard/journal.mjs).
 *
 * Las últimas entradas del JSONL de la escuela, más nuevas primero, con
 * filtro ?mod=. Aquí solo se lee: quien escribe es el server.mjs en sus
 * ganchos de registro (login/logout, POST /m/<clave>, /school/save).
 *
 * Honestidad (docs/BOUNDARIES.md): el diario es un JSONL local por
 * instancia — no un muro, no prueba legal. Se dice en pantalla, no solo
 * en el código. Datos ficticios de demo.
 */
import { esc, head, endHead, card, empty } from "../module-kit.mjs";
import { read } from "../journal.mjs";

export const meta = { key: "journal", label: "Diario", order: 85, roles: ["director"] };

const WINDOW = 50;

/** ISO-UTC → «MM-DD HH:MM:SS» legible; lo que no es ISO se muestra crudo. */
function stamp(ts) {
  const s = String(ts ?? "");
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s) ? `${s.slice(5, 10)} ${s.slice(11, 19)}` : s || "—";
}

const chip = (mod) => `<span class="chip chip--none">${esc(mod || "—")}</span>`;

export function render(ctx) {
  // el server pasa ctx.query; el doc prometía ctx.params — leemos ambos sin drama
  const q = ctx.query ?? ctx.params ?? new URLSearchParams();
  const modFilter = String(q.get("mod") ?? "");
  const view = read(ctx.slug, { limit: WINDOW, module: modFilter });
  // la ventana sin filtro da el recuento de accesos fallidos y el listado de módulos
  const win = modFilter ? read(ctx.slug, { limit: WINDOW }) : view;
  const fails = win.entries.filter((e) => e.module === "auth" && e.action === "login-fail").length;
  const mods = [...new Set(win.entries.map((e) => e.module).filter(Boolean))].sort();

  const filters = [
    `<a class="chip ${modFilter ? "chip--none" : "chip--navy"}" href="/m/journal">todos</a>`,
    ...mods.map((m) => `<a class="chip ${modFilter === m ? "chip--navy" : "chip--none"}" href="/m/journal?mod=${encodeURIComponent(m)}">${esc(m)}</a>`),
  ].join(" ");

  const row = (e) => `<li class="jrow">
      <span class="jt">${esc(stamp(e.ts))}</span>
      <span class="jactor">${esc(e.actor || "—")}${e.role && e.role !== "unknown" ? ` <span class="note">(${esc(e.role)})</span>` : ""}</span>
      ${chip(e.module)}
      <span class="jaction">${esc(e.action || "—")}</span>
      ${e.ref ? `<span class="jref" title="referencia">${esc(e.ref)}</span>` : ""}
    </li>`;

  const list = view.entries.length
    ? card(`<ul class="jlist">${view.entries.map(row).join("")}</ul>`)
    : empty(modFilter
      ? `No hay entradas de «${modFilter}» en las últimas ${WINDOW} líneas del diario.`
      : "No hay entradas todavía en el diario — se escribe con cada registro de acceso y cada POST del panel.");

  return `${head({ kicker: "auditoría", title: "Diario", sub: `Quién, cuándo, qué módulo, qué acción — las últimas ${WINDOW} entradas, las más nuevas primero (hora UTC)` })}
    <style>
      #journal .jmeta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 14px}
      #journal .jlist{list-style:none;margin:0;padding:0;display:grid;gap:6px}
      #journal .jrow{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;border-bottom:1px dashed var(--line,rgba(0,20,51,.12));padding:6px 2px;font-size:.92rem}
      #journal .jrow:last-child{border-bottom:0}
      #journal .jt{font-variant-numeric:tabular-nums;font-weight:800;min-width:9.5ch}
      #journal .jactor{font-weight:700}
      #journal .jaction{font-family:"Fredoka",ui-rounded,system-ui,sans-serif}
      #journal .jref{color:var(--muted,#3B4658);font-size:.85rem;word-break:break-all}
      #journal .filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 14px}
      #journal .filters a{text-decoration:none}
      #journal .jfails{margin:0 0 14px}
    </style>
    <div id="journal">
      <p class="clay callout callout--quiet">Diario honesto: un archivo JSONL local, de solo-append, <strong>por instancia y por
        escuela</strong> (dashboard/.data/${esc(ctx.slug ?? "—")}/journal.jsonl). Sirve para que el equipo se recuerde; no es un muro
        antiadulteración ni prueba legal — sin hash encadenado ni réplica, y un segundo panel escribiendo en el mismo disco puede
        entrelazar líneas. docs/BOUNDARIES.md.</p>
      <p class="clay callout ${fails ? "callout--warn" : "callout--quiet"} jfails">
        Accesos fallidos en la ventana leída: <strong>${fails}</strong>${fails ? ` — <a href="/m/journal?mod=auth">ver entradas de auth</a>` : ""}.
      </p>
      <p class="filters"><span class="note">Filtrar:</span> ${filters}</p>
      ${modFilter ? `<p class="note">Mostrando solo «${esc(modFilter)}»${view.entries.length ? ` (${view.entries.length} de la ventana)` : ""}. <a href="/m/journal">Quitar filtro</a></p>` : ""}
      ${list}
      <p class="note">${view.corrupt ? `Se saltaron ${view.corrupt} línea(s) ilegible(s) del archivo — recuento visible, no silencioso. ` : ""}${view.hidden ? `Además hay ${view.hidden} entrada(s) más antiguas fuera de la ventana de ${WINDOW}. ` : ""}Leídos ${win.total} línea(s) sanas en total del archivo.</p>
    </div>
  ${endHead}`;
}

// sin handle(): el diario es de solo lectura por contrato; un POST devuelve
// 405 desde el server («este módulo no acepta escrituras») y no se registra.
