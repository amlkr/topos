/**
 * example.mjs — el módulo de muestra del contrato MODULE-API.md.
 * Vive para siempre como prueba viva del registry: si este tab funciona,
 * cualquier módulo futuro usa el mismo camino.
 */
import { jsonStore, esc, head, endHead, card, field, submit, id, todayISO } from "../module-kit.mjs";

export const meta = { key: "example", label: "Ejemplo", order: 90, roles: [] };

export function render(ctx) {
  const db = jsonStore(ctx.slug, "example", { items: [] });
  const items = db.load().items;
  return `${head({ kicker: "registry", title: "Módulo de ejemplo", sub: "así se ve un módulo Topos: un archivo, un jsonStore, cero JS de cliente" })}
    <form method="post" action="/m/example" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">${field("text", "Nota")} ${submit("Guardar")}</form>
    ${items.length ? items.map((i) => card(`<p><strong>${esc(i.id)}</strong> · ${esc(i.text)} <span class="note">(${esc(i.day)})</span></p>`)).join("") : `<p class="clay callout">No hay notas todavía — guarda la primera.</p>`}
  ${endHead}`;
}

export function handle(ctx, form) {
  const db = jsonStore(ctx.slug, "example", { items: [] });
  const data = db.load();
  const text = String(form.get("text") ?? "").trim().slice(0, 200);
  if (text) { data.items.unshift({ id: id(), text, day: todayISO() }); db.save(data); }
  return { redirect: "/m/example" };
}
