/**
 * curriculum.mjs — el Currículo de Topos: los packs como DATA.
 *
 * Un pack es una clase estructurada — semanas, actividades, edades,
 * materiales, objetivos — con la misma filosofía que el manifiesto:
 * editable, validable, portable. Este módulo guarda packs y los muestra;
 * el editor profundo llegará después.
 *
 * Contrato: dashboard/MODULE-API.md.
 * Schema:   spec/pack.schema.json, validado con validateManifest() de
 *           manifold/core.mjs (el mismo validador del repo). Ese validador
 *           es un subset y no mira `pattern`, `integer` ni `maximum`:
 *           packContract() muerde esas partes del schema antes de guardar,
 *           igual que contractProblems() muerde el manifiesto.
 *
 * Cero JS de cliente. Todo lo dinámico pasa por esc(). Estilos inline.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { jsonStore, esc, head, endHead, card, submit } from "../module-kit.mjs";
import { validateManifest } from "../../manifold/core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_SCHEMA = JSON.parse(readFileSync(join(HERE, "..", "..", "spec", "pack.schema.json"), "utf8"));

export const meta = { key: "curriculum", label: "Currículo", order: 40, roles: ["director", "coach"] };

const CODE_RE = /^[A-Z0-9-]{6,24}$/;
const AGES_RE = /^\d{1,2}-\d{1,2}$/;
const SPACE_TEXT = { indoor: "⌂ interior", outdoor: "☀ exterior", either: "⌂☀ interior o exterior" };

/* ---- demo seed: UN pack ficticio completo (Lotus Valley no existe) ---- */
const DEMO_PACKS = [
  {
    code: "LVIS-ROBOTS-P1",
    name: "Robótica y Making — nivel 1",
    program: "LVIS-ROBOTICS-TERM",
    ages: "10-17",
    term: "Primavera 2027",
    createdBy: "director@lotus.example",
    version: 1,
    weeks: [
      {
        week: 1,
        title: "¿Qué es un robot?",
        objectives: [
          "Distinguir un robot de una máquina que no lo es, con ejemplos del barrio",
          "Nombrar sensor, procesado y actuador en tres aparatos reales",
          "Trabajar en equipos de tres con roles que rotan cada sesión",
        ],
        activities: [
          { name: "Carreras de escoba", materials: ["palos de helado", "globos", "cuerdas"], space: "outdoor" },
          { name: "Desmontar para entender", materials: ["teclados viejos", "juguetes averiados", "destornilladores"], space: "indoor" },
        ],
      },
      {
        week: 2,
        title: "Circuitos: la electricidad toma forma",
        objectives: [
          "Cerrar un circuito simple y explicar por qué la luz enciende",
          "Diferenciar conductor de aislante probando materiales del aula",
          "Registrar en el cuaderno de making qué se intentó y qué pasó",
        ],
        activities: [
          { name: "Linternas de cartón", materials: ["LEDs", "pilas botón", "cartón", "cinta de cobre"], space: "indoor" },
          { name: "Circuito humano", materials: ["cable largo aislado", "pila grande", "bombilla"], space: "either" },
        ],
      },
      {
        week: 3,
        title: "Sonar y luces: el robot siente",
        objectives: [
          "Medir distancias con un sensor ultrasónico y comparar con pasos",
          "Programar una reacción ante luz y sonido en bloques",
          "Tratar el error como dato: registrar tres fallos y su causa",
        ],
        activities: [
          { name: "Semáforo con bloques", materials: ["placas micro:bit", "ordenadores", "proyector"], space: "indoor" },
          { name: "El pasillo sonámbulo", materials: ["sensores ultrasónicos", "cinta adhesiva", "obstáculos blandos"], space: "indoor" },
        ],
      },
      {
        week: 4,
        title: "Demo day para familias",
        objectives: [
          "Presentar un prototipo en tres minutos cronometrados",
          "Contar qué falló y qué se aprendió, no solo lo que funcionó",
          "Invitar a las familias a probar los robots por turnos",
        ],
        activities: [
          { name: "Montaje del patio", materials: ["mesas", "carteles", "cables de extensión"], space: "outdoor" },
          { name: "Feria de prototipos", materials: ["prototipos de cada equipo", "hojas de valoración", "fotos solo con consentimiento firmado"], space: "either" },
        ],
      },
    ],
  },
];

/* ---- store helpers ---- */
function dbOf(ctx) {
  const db = jsonStore(ctx.slug, "curriculum", { packs: [] });
  const data = db.load();
  if (!Array.isArray(data.packs)) { data.packs = []; }
  if (data.packs.length === 0) { // demo seed on empty — fictional, labelled as demo
    data.packs = structuredClone(DEMO_PACKS);
    db.save(data);
  }
  return data;
}

/** The parts of pack.schema.json the subset validator does not look at,
 *  plus the cross-pack contract: codes are unique, weeks are not repeated,
 *  the program must exist in this school's manifest. */
function packContract(pack, data, manifest) {
  const problems = [];
  if (typeof pack.code === "string" && !CODE_RE.test(pack.code))
    problems.push("$.code: debe encajar en ^[A-Z0-9-]{6,24}$ (mayúsculas, dígitos y guiones, 6-24 caracteres)");
  if (typeof pack.code === "string" && data.packs.some((p) => p.code === pack.code))
    problems.push(`$.code: ya existe un pack guardado con el código ${pack.code} — edítalo más tarde o elige otro código`);
  if (typeof pack.ages === "string" && !AGES_RE.test(pack.ages))
    problems.push('$.ages: debe tener forma "X-Y", por ejemplo "10-17"');
  if (pack.version !== undefined && !(Number.isInteger(pack.version) && pack.version >= 1))
    problems.push("$.version: debe ser un entero >= 1");
  if (typeof pack.program === "string" && Array.isArray(manifest?.programs) && manifest.programs.length)
    if (!manifest.programs.some((p) => p.code === pack.program))
      problems.push(`$.program: «${pack.program}» no es un programa del manifiesto de esta escuela`);
  const seen = new Set();
  if (Array.isArray(pack.weeks)) {
    pack.weeks.forEach((w, i) => {
      if (!w || typeof w !== "object" || Array.isArray(w)) return;
      if (w.week !== undefined && !(Number.isInteger(w.week) && w.week >= 1 && w.week <= 60))
        problems.push(`$.weeks[${i}].week: debe ser un entero entre 1 y 60`);
      if (Number.isInteger(w.week)) {
        if (seen.has(w.week)) problems.push(`$.weeks[${i}].week: la semana ${w.week} está repetida`);
        seen.add(w.week);
      }
    });
  }
  return problems;
}

/* ---- view parts ---- */
const chip = (text) => `<span class="chip" style="margin:2px 4px 2px 0">${esc(text)}</span>`;

function packCard(p) {
  const weeks = Array.isArray(p.weeks) ? p.weeks.length : 0;
  return card(`<h3 style="margin:0 0 6px;font-family:Fredoka,ui-rounded,system-ui,sans-serif">${esc(p.name)}</h3>
    <p style="margin:0 0 4px"><a class="btn" style="display:inline-block;text-decoration:none" href="/m/curriculum?pack=${encodeURIComponent(String(p.code))}">${esc(p.code)} →</a></p>
    <p class="note" style="margin:8px 0 0">Programa ${esc(p.program)} · edades ${esc(p.ages)} · ${weeks} ${weeks === 1 ? "semana" : "semanas"} · ${esc(p.term)}</p>`);
}

function draftForm(draft = "") {
  return `<form method="post" action="/m/curriculum" style="display:grid;gap:10px">
    <label for="pack-yaml" style="font-weight:800;font-size:.9rem">Define el pack en YAML (formato del pack)</label>
    <textarea id="pack-yaml" name="pack" rows="18" spellcheck="false" style="width:100%;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85rem;padding:14px;border-radius:14px;border:2px solid rgba(0,20,51,.14);background:#fff;color:#001433;box-sizing:border-box;resize:vertical">${esc(draft)}</textarea>
    <p class="note" style="margin:0">createdBy y version los escribe el panel al guardar: el borrador no necesita incluirlos.</p>
    ${submit("Validar y guardar")}
  </form>`;
}

function problemList(problems, draft) {
  return `<p class="clay callout" style="background:#FFE9E4">El contrato mordió antes de guardar: este pack no se almacenó. Corrige y vuelve a enviar.</p>
    <ul class="problems" style="margin:12px 0;padding-left:1.3rem;font-size:.9rem;line-height:1.6">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    ${draftForm(draft)}`;
}

function detailView(p) {
  const weeks = Array.isArray(p.weeks) ? p.weeks : [];
  const rows = weeks.map((w) => `<tr>
      <td style="text-align:center;font-weight:800">${esc(w.week)}</td>
      <td style="font-weight:700">${esc(w.title)}</td>
      <td><ul style="margin:0;padding-left:1.1rem">${(Array.isArray(w.objectives) ? w.objectives : []).map((o) => `<li>${esc(o)}</li>`).join("")}</ul></td>
      <td>${(Array.isArray(w.activities) ? w.activities : []).map((a) => `<p style="margin:0 0 6px"><strong>${esc(a.name)}</strong> — <span class="note">${esc(SPACE_TEXT[a.space] ?? a.space ?? "espacio sin definir")}</span><br>${(Array.isArray(a.materials) ? a.materials : []).map(chip).join("")}</p>`).join("")}</td>
    </tr>`).join("");
  return `${head({ kicker: "pack", title: p.name, sub: `${p.code} · programa ${p.program} · edades ${p.ages} · ${p.term}` })}
    <p style="margin:0 0 16px"><a class="btn" style="display:inline-block;text-decoration:none" href="/m/curriculum">← todos los packs</a></p>
    <div class="tw clay" style="padding:0;overflow:hidden"><table>
      <thead><tr><th style="padding:10px 14px">Sem</th><th style="padding:10px 14px;text-align:left">Título</th><th style="padding:10px 14px;text-align:left">Objetivos</th><th style="padding:10px 14px;text-align:left">Actividades y materiales</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="note" style="margin-top:14px">version ${esc(p.version)} · creado por ${esc(p.createdBy)} · el editor profundo de semanas llegará después; mientras, se corrige reenviando el pack por YAML.</p>
  ${endHead}`;
}

/* ---- routes ---- */
export function render(ctx) {
  const data = dbOf(ctx);
  const q = ctx.params ?? ctx.query ?? new URLSearchParams();
  const code = String(q.get("pack") ?? "").toUpperCase();

  if (code) {
    const pack = data.packs.find((p) => String(p.code).toUpperCase() === code);
    if (!pack)
      return `${head({ kicker: "currículo", title: "Pack no encontrado", sub: `no hay ningún pack con el código ${code}` })}
        <p style="margin:0 0 16px"><a class="btn" style="display:inline-block;text-decoration:none" href="/m/curriculum">← todos los packs</a></p>
      ${endHead}`;
    return detailView(pack);
  }

  const cards = data.packs.map(packCard).join("");
  return `${head({ kicker: "currículo", title: "Packs de clase", sub: "la clase como dato: semanas, actividades, materiales y objetivos — editable y validable, como el manifiesto" })}
    ${cards ? `<div class="grid" style="margin-bottom:26px">${cards}</div>` : `<p class="clay callout">No hay packs todavía.</p>`}
    <h2 style="font-family:Fredoka,ui-rounded,system-ui,sans-serif;margin:0 0 8px">Nuevo borrador</h2>
    ${draftForm()}
  ${endHead}`;
}

export function handle(ctx, form) {
  if (!meta.roles.includes(ctx.session.role))
    return { status: 403, html: `${head({ kicker: "currículo", title: "Sin permiso" })}<p class="clay callout">El rol «${esc(ctx.session.role)}» no gobierna el Currículo.</p>${endHead}` };

  const data = dbOf(ctx);
  const draft = String(form.get("pack") ?? "");
  let pack;
  try {
    pack = YAML.parse(draft);
  } catch (e) {
    return { status: 422, html: `${head({ kicker: "currículo", title: "El borrador no pasa", sub: "el pack no se guardó" })}${problemList(["YAML inválido: " + e.message], draft)}${endHead}` };
  }
  if (pack === null || pack === undefined || String(draft).trim() === "") {
    return { status: 422, html: `${head({ kicker: "currículo", title: "El borrador no pasa", sub: "el pack no se guardó" })}${problemList(["$.: el borrador está vacío — escribe el pack en YAML."], draft)}${endHead}` };
  }
  if (typeof pack !== "object") { // a YAML scalar is not a pack; guard BEFORE touching properties
    return { status: 422, html: `${head({ kicker: "currículo", title: "El borrador no pasa", sub: "el pack no se guardó" })}${problemList([`$.: el borrador debe ser un pack (claves code, name, program, ages, term, weeks…), no un valor ${typeof pack}.`], draft)}${endHead}` };
  }

  // createdBy and version are written by the panel, never trusted from the draft.
  pack.createdBy = ctx.session.email;
  pack.version = 1;

  const problems = [...validateManifest(pack, PACK_SCHEMA), ...packContract(pack, data, ctx.manifest)];
  if (problems.length)
    return { status: 422, html: `${head({ kicker: "currículo", title: "El borrador no pasa", sub: "el pack no se guardó — contract before disk" })}${problemList(problems, draft)}${endHead}` };

  data.packs.unshift(pack);
  jsonStore(ctx.slug, "curriculum", { packs: [] }).save(data);
  return { redirect: `/m/curriculum?pack=${encodeURIComponent(String(pack.code))}` };
}
