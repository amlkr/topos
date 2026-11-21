/**
 * marketing.mjs — el stub HONESTO del plan (integrador, 2026-11-21).
 *
 * El orden del producto dice que marketing es el último módulo: depende
 * del blog (contenido), del currículo (historias reales) y de conectores
 * (LINE/Meta/TikTok) cuyo proceso de aprobación no se carga antes de
 * tener escuelas que lo pidan. Este módulo existe para que el mapa se
 * vea completo SIN fingir un motor que no existe: muestra lo que hay
 * (la cola de historias del core) y lo que falta, con nombre y apellido.
 *
 * Regla 1 de la casa aplicada a nosotros mismos: nada en pantalla que
 * el sistema no haga. No hay botón "publicar" porque no hay conector.
 */
import { esc, head, endHead, card } from "../module-kit.mjs";

export const meta = { key: "marketing", label: "Marketing", order: 50, roles: ["director"] };

export function render(ctx) {
  let stories = [];
  let storeError = null;
  try {
    stories = ctx.store.stories().queued ?? [];
  } catch (e) {
    storeError = e.message;
  }
  const queue = stories.length
    ? stories.map((s) => card(`<p><strong>${esc(s.title)}</strong><br><span class="note">${esc(s.locale ?? "")} · ${esc(s.status ?? "borrador")}</span></p>`)).join("")
    : `<p class="clay callout">${storeError ? "La cola no respondió: " + esc(storeError) : "No hay historias en cola todavía."}</p>`;

  return `${head({ kicker: "planificado — no construido", title: "Marketing", sub: "El mapa completo, sin fingimientos: esto es lo que existe y lo que falta." })}
    <p class="clay callout" style="border-left-color:var(--orange)"><strong>Estado: planeado.</strong> La cola de contenido existe (son los borradores del blog que ves abajo). El motor de publicación NO existe todavía: no hay conectores a LINE, Meta ni TikTok, y no los habrá hasta que escuelas reales lo pidan — cada módulo se construye cuando alguien lo necesita, no cuando a nosotros se nos ocurre.</p>
    <h2 class="page-title" style="font-size:1.3rem">Cola de historias (leída del core, en vivo)</h2>
    ${queue}
    <h2 class="page-title" style="font-size:1.3rem">Falta, en orden honesto</h2>
    ${card(`<ul class="table" style="list-style:none;padding:0">
      <li>1. Conectores con aprobación humana previa a publicar (el borrador lo propone la máquina, lo envía una persona).</li>
      <li>2. Calendario editorial unificado: blog + redes desde la misma cola.</li>
      <li>3. Métricas de embudo por campaña (el beacon propio ya sabe de dónde vino cada ficha).</li>
      <li>4. Voz por escuela: el manifiesto ya trae identity/tagline; falta el tono como dato.</li>
    </ul>`)}
  ${endHead}`;
}
