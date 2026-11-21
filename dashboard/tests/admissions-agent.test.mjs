/**
 * dashboard/tests/admissions-agent.test.mjs — suite node --test del
 * Agente de Admisiones v0 (dashboard/modules/admissions-agent.mjs).
 *
 * Run:  node --test dashboard/tests/admissions-agent.test.mjs   (repo root)
 *
 * Hermetismo: el corazón del agente (compute / buildDraft / mergeDrafts /
 * classifyLead) es puro — se prueba con un objeto crm falso inyectado por
 * parámetro, sin disco. Los viajes por fs (readCrm / render / handle) usan
 * el slug "agenttest" bajo dashboard/.data/agenttest/, que se borra al
 * terminar, pase lo que pase.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  meta,
  RULES,
  daysSince,
  classifyLead,
  computeCandidates,
  buildDraft,
  compute,
  mergeDrafts,
  readCrm,
  render,
  handle,
} from "../modules/admissions-agent.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = join(HERE, "..", ".data", "agenttest"); // dashboard/.data/agenttest
const CLEAN = () => rmSync(AGENT_DIR, { recursive: true, force: true });
CLEAN(); // restos de una ejecución interrumpida no invalen esta
after(CLEAN);

/* ---------- reloj fijo para el bloque puro (sin carrera de medianoche) --- */
const TODAY = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date(TODAY + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/* ---------- manifiesto falso con la voz de Lotus (forma real) ----------- */
const MANIFEST = {
  identity: { name: "Lotus Valley International School", tagline: "Rooted locally, growing globally" },
  programs: [
    { name: "Robotics & Making", ages: "10-17", place: "Valley Campus, floors 2-3" },
    { name: "Thai & Western Ensemble", ages: "4-11", place: "Riverside arts hall" },
  ],
};

/* ---------- objeto crm FALSO, inyectado por parámetro (forma de crm.mjs) */
const mkLead = (id, status, touchedDaysAgo, extra = {}) => ({
  id,
  family: `Familia ${id}`,
  contact: `${id.toLowerCase()}@lvis.example`,
  source: "web",
  status,
  note: "demo: familia ficticia",
  day: daysAgo(touchedDaysAgo + 10),
  updatedAt: daysAgo(touchedDaysAgo),
  ...extra,
});

const CRM = {
  leads: [
    mkLead("OLD15", "visita", 16),          // → recuperación
    mkLead("SEG6", "contactado", 6),        // → seguimiento
    mkLead("NEW2", "nuevo", 2),             // → nada (fresco)
    mkLead("DOCS3", "contactado", 3),       // fresco PERO con needs-docs → documentación
    mkLead("MAT40", "matriculado", 40),     // terminal → nunca candidato
    mkLead("LOS30", "perdido", 30),         // terminal → nunca candidato
    mkLead("NOFECHA", "nuevo", 0, { updatedAt: null, day: null }), // sin fecha + needs-docs
  ],
  followups: [
    { id: "f1", leadId: "DOCS3", text: "Piden folleto; needs-docs: falta certificado de edad", day: daysAgo(1) },
    { id: "f2", leadId: "NOFECHA", text: "Llega sin fecha — NEEDS-DOCS en la ficha", day: TODAY },
    { id: "f3", leadId: "SEG6", text: "Llamada corta, sin más", day: daysAgo(6) },
  ],
};

/** Lista de prohibido (regla 1 de la casa) — ninguna puede aparecer. */
const FORBIDDEN = ["plaza reservada", "pago recibido", "confirmation email sent", "booking confirmed", "hemos guardado"];

const kindBy = (cands) => Object.fromEntries(cands.map((c) => [c.leadId, c.kind]));

/* ========================================================================= *
 * 1. El contrato del módulo                                                  *
 * ========================================================================= */

test("meta: clave, etiqueta, orden y roles exactos del diseño", () => {
  assert.deepEqual(meta, {
    key: "admisiones-agent",
    label: "Agente Admisiones",
    order: 70,
    roles: ["director", "admissions"],
  });
});

test("RULES: umbrales escritos y a la vista (5 / 15 / terminales / keyword)", () => {
  assert.equal(RULES.seguimientoDays, 5);
  assert.equal(RULES.recuperacionDays, 15);
  assert.deepEqual([...RULES.terminalStatuses].sort(), ["matriculado", "perdido"]);
  assert.equal(RULES.needsDocsKeyword, "needs-docs");
});

/* ========================================================================= *
 * 2. Reglas de candidatura — puras, con el crm falso inyectado               *
 * ========================================================================= */

test("daysSince: 6 días → 6; hoy → 0; fecha ilegible → null (no inventa)", () => {
  assert.equal(daysSince(daysAgo(6), TODAY), 6);
  assert.equal(daysSince(TODAY, TODAY), 0);
  assert.equal(daysSince("no-es-fecha", TODAY), null);
  assert.equal(daysSince(undefined, TODAY), null);
});

test("classifyLead: 6 días → seguimiento; 16 no matriculado → recuperación; fresco → none", () => {
  assert.equal(classifyLead(mkLead("A", "contactado", 6), [], TODAY).kind, "seguimiento");
  assert.equal(classifyLead(mkLead("B", "nuevo", 16), [], TODAY).kind, "recuperación");
  assert.equal(classifyLead(mkLead("C", "nuevo", 1), [], TODAY), null); // fresco, sin docs: nada
  assert.equal(classifyLead(mkLead("D", "nuevo", 14), [], TODAY).kind, "seguimiento"); // justo bajo 15
  assert.equal(classifyLead(mkLead("E", "nuevo", 15), [], TODAY).kind, "recuperación"); // umbral inclusivo
});

test("classifyLead: estados terminales nunca son candidatos, por viejos que estén", () => {
  assert.equal(classifyLead(mkLead("M", "matriculado", 40), [], TODAY), null);
  assert.equal(classifyLead(mkLead("P", "perdido", 30), [], TODAY), null);
});

test("classifyLead: needs-docs (keyword en followups) da candidatura sin umbrales de días", () => {
  const fu = [{ id: "x", leadId: "F", text: "falta expediente — needs-docs", day: TODAY }];
  const c = classifyLead(mkLead("F", "contactado", 1), fu, TODAY);
  assert.ok(c, "un lead fresco con needs-docs SÍ es candidato");
  assert.equal(c.kind, "documentación");
  assert.equal(c.needsDocs, true);
  // sin la keyword, el mismo lead no es candidato
  assert.equal(classifyLead(mkLead("F", "contactado", 1), [{ id: "x", leadId: "F", text: "todo en orden", day: TODAY }], TODAY), null);
});

test("computeCandidates sobre el crm falso: mapa exacto de kinds, terminales fuera", () => {
  const k = kindBy(computeCandidates(CRM, MANIFEST, TODAY));
  assert.equal(k.OLD15, "recuperación");
  assert.equal(k.SEG6, "seguimiento");
  assert.equal(k.DOCS3, "documentación");
  assert.equal(k.NOFECHA, "documentación"); // días null, keyword sí (case-insensitive: NEEDS-DOCS)
  assert.ok(!("NEW2" in k), "fresco sin needs-docs → ninguna candidatura");
  assert.ok(!("MAT40" in k), "matriculado no se toca");
  assert.ok(!("LOS30" in k), "perdido no se toca");
  assert.equal(Object.keys(k).length, 4);
});

/* ========================================================================= *
 * 3. El redactor: voz del manifiesto + datos del lead, cero promesas        *
 * ========================================================================= */

test("buildDraft: el cuerpo lleva el nombre de la escuela, la familia y el tagline", () => {
  const c = computeCandidates(CRM, MANIFEST, TODAY).find((x) => x.leadId === "OLD15");
  const { subject, body } = buildDraft(c, MANIFEST);
  assert.ok(body.includes(MANIFEST.identity.name), "cuerpo debe nombrar la escuela");
  assert.ok(body.includes(c.family), "cuerpo debe nombrar a la familia");
  assert.ok(subject.includes(MANIFEST.identity.name), "asunto debe nombrar la escuela");
  assert.ok(body.includes(MANIFEST.identity.tagline), "la firma lleva el tagline del manifiesto");
  assert.ok(body.includes("Robotics & Making"), "puede referenciar programas REALES del manifiesto");
});

test("buildDraft: ningún borrador (subject o body) contiene las frases prohibidas", () => {
  for (const c of computeCandidates(CRM, MANIFEST, TODAY)) {
    const { subject, body } = buildDraft(c, MANIFEST);
    for (const phrase of FORBIDDEN) {
      assert.ok(!subject.toLowerCase().includes(phrase), `${c.leadId}: el asunto no puede decir «${phrase}»`);
      assert.ok(!body.toLowerCase().includes(phrase), `${c.leadId}: el cuerpo no puede decir «${phrase}»`);
    }
  }
});

test("buildDraft: funciona aunque el manifiesto venga cojo (sin programs ni tagline)", () => {
  const c = classifyLead(mkLead("Z", "nuevo", 20), [], TODAY);
  const { body } = buildDraft(c, { identity: {} });
  assert.ok(body.includes("la escuela"));
  assert.ok(!body.includes("undefined"));
});

/* ========================================================================= *
 * 4. compute es puro y mergeDrafts respeta la permanencia de decisiones     *
 * ========================================================================= */

test("compute: mismo in → mismo out, y no toca el disco del test", () => {
  CLEAN();
  const a = compute(CRM, MANIFEST, TODAY);
  const b = compute(structuredClone(CRM), MANIFEST, TODAY);
  assert.deepEqual(a, b);
  assert.equal(a.drafts.length, 4);
  assert.equal(existsSync(AGENT_DIR), false, "compute() no escribe nada");
});

test("mergeDrafts: un borrador adoptado NO se regenera en el segundo compute", () => {
  const computed = compute(CRM, MANIFEST, TODAY).drafts;
  const first = mergeDrafts([], computed, "2026-01-01T00:00:00.000Z");
  assert.equal(first.length, 4);
  assert.ok(first.every((d) => d.adopted === "pendiente"));

  // una persona adopta el de OLD15 y descarta el de DOCS3
  const decided = first.map((d) =>
    d.leadId === "OLD15"
      ? { ...d, adopted: "adoptado", decidedBy: "director@lotus.example", decidedAt: "2026-01-02T10:00:00.000Z" }
      : d.leadId === "DOCS3"
        ? { ...d, adopted: "descartado", decidedBy: "admissions@lotus.example", decidedAt: "2026-01-02T11:00:00.000Z" }
        : d,
  );

  // segundo compute (otra visita, otro día): los decididos quedan intactos
  const second = mergeDrafts(decided, computed, "2026-06-01T00:00:00.000Z");
  const old15 = second.filter((d) => d.leadId === "OLD15");
  assert.equal(old15.length, 1, "ni duplicado ni regenerated");
  assert.equal(old15[0].adopted, "adoptado");
  assert.equal(old15[0].decidedBy, "director@lotus.example");
  assert.equal(old15[0].generatedAt, "2026-01-01T00:00:00.000Z", "registro permanente: sin reescritura");

  const docs3 = second.find((d) => d.leadId === "DOCS3");
  assert.equal(docs3.adopted, "descartado");
  assert.equal(docs3.decidedBy, "admissions@lotus.example");

  // los pendientes sí se regeneran con fecha nueva
  const seg6 = second.find((d) => d.leadId === "SEG6");
  assert.equal(seg6.adopted, "pendiente");
  assert.equal(seg6.generatedAt, "2026-06-01T00:00:00.000Z");
});

test("mergeDrafts: la decisión sobrevive incluso si el lead deja de ser candidato", () => {
  const first = mergeDrafts([], compute(CRM, MANIFEST, TODAY).drafts, "2026-01-01T00:00:00.000Z");
  const adopted = first.map((d) => (d.leadId === "OLD15" ? { ...d, adopted: "adoptado", decidedBy: "d@l.example", decidedAt: "x" } : d));
  const later = mergeDrafts(adopted, [], "2027-01-01T00:00:00.000Z"); // el lead ya no cruza nada
  assert.ok(later.find((d) => d.leadId === "OLD15" && d.adopted === "adoptado"), "archivo de auditoría intacto");
});

/* ========================================================================= *
 * 5. Lectura directa del CRM: degradación honesta, nunca crash              *
 * ========================================================================= */

test("readCrm: slug sin archivo → nota honesta y forma vacía (no lanza)", () => {
  CLEAN();
  const r = readCrm("agenttest");
  assert.ok(r.note && r.note.length > 10, "degrada con una línea honesta");
  assert.deepEqual(r.data, { leads: [], followups: [] });
});

test("readCrm: crm corrompido (escritura a medias) → nota, no excepción", () => {
  mkdirSync(AGENT_DIR, { recursive: true });
  writeFileSync(join(AGENT_DIR, "crm.json"), `{ "leads": [ { roto`);
  const r = readCrm("agenttest");
  assert.ok(r.note && /no se pudo interpretar|a medias/.test(r.note), r.note);
  assert.deepEqual(r.data.leads, []);
});

/* ========================================================================= *
 * 6. render + handle por fs (slug agenttest, limpio al final)               *
 * ========================================================================= */

test("render/handle: ciclo completo — propone, decide, regenera pendientes y preserva lo decidido", () => {
  CLEAN();
  const ctx = {
    slug: "agenttest",
    manifest: MANIFEST,
    session: { email: "director@lotus.example", role: "director" },
    query: new URLSearchParams(),
    params: new URLSearchParams(),
  };

  // (a) sin CRM en disco: render no revienta, degrada con línea honesta
  const html0 = render(ctx);
  assert.ok(html0.includes("callout--warn"), "muestra el aviso de degradación");
  assert.ok(html0.includes("Hoy sin trabajo"), "sección vacía honesta");
  assert.ok(html0.includes("Cómo decide este agente (v0)"), "explicabilidad como producto");

  // (b) CRM de prueba en disco → candidaturas visibles
  mkdirSync(AGENT_DIR, { recursive: true });
  writeFileSync(join(AGENT_DIR, "crm.json"), JSON.stringify(CRM));
  const html1 = render(ctx);
  assert.match(html1, /Borradores esperando a una persona \(4\)/);
  assert.ok(html1.includes("Familia OLD15") && html1.includes("Familia NOFECHA"));
  assert.ok(html1.includes("v0 determinista"), "la copia declara que no hay LLM ni envíos");
  assert.ok(!/<script|onclick/i.test(html1), "cero JS de cliente (contrato del módulo)");
  assert.ok(html1.includes("Robotics &amp; Making"), "todo string dinámico pasa por esc()");

  // forma del almacén propio (jsonStore(slug,'admisiones-agent'))
  const storePath = join(AGENT_DIR, "admisiones-agent.json");
  const store1 = JSON.parse(readFileSync(storePath, "utf8"));
  assert.ok(Array.isArray(store1.drafts));
  const d0 = store1.drafts.find((d) => d.leadId === "OLD15");
  for (const key of ["leadId", "kind", "subject", "body", "generatedAt", "adopted"])
    assert.ok(key in d0, `el draft debe tener ${key}`);
  assert.equal(d0.adopted, "pendiente");
  assert.equal(d0.kind, "recuperación");

  // (c) decisión humana: adoptar el borrador de OLD15
  const out = handle(ctx, new URLSearchParams({ action: "decide", draftId: "OLD15--recuperación", decision: "adoptado" }));
  assert.deepEqual(out, { redirect: "/m/admisiones-agent" });
  const store2 = JSON.parse(readFileSync(storePath, "utf8"));
  const d1 = store2.drafts.find((d) => d.leadId === "OLD15");
  assert.equal(d1.adopted, "adoptado");
  assert.equal(d1.decidedBy, "director@lotus.example", "actor registrado");
  assert.ok(!Number.isNaN(Date.parse(d1.decidedAt)), "timestamp registrado");

  // (d) render tras decidir: OLD15 sale de pendientes y entra al registro permanente…
  const html2 = render(ctx);
  assert.match(html2, /Borradores esperando a una persona \(3\)/);
  assert.ok(html2.includes("Decisiones humanas (1)"));
  // …y un segundo compute no ha tocado su cuerpo
  const store3 = JSON.parse(readFileSync(storePath, "utf8"));
  const d2 = store3.drafts.find((d) => d.leadId === "OLD15");
  assert.equal(d2.body, d1.body);
  assert.equal(d2.generatedAt, d1.generatedAt);

  // (e) decidir DOS VECES sobre el mismo borrador → 422, el registro no se reescribe
  const twice = handle(ctx, new URLSearchParams({ action: "decide", draftId: "OLD15--recuperación", decision: "descartado" }));
  assert.equal(twice.status, 422);
  const store4 = JSON.parse(readFileSync(storePath, "utf8"));
  assert.equal(store4.drafts.find((d) => d.leadId === "OLD15").adopted, "adoptado");

  // (f) descartar otro borrador también queda permanente
  const disc = handle(ctx, new URLSearchParams({ action: "decide", draftId: "SEG6--seguimiento", decision: "descartado" }));
  assert.ok(disc.redirect);

  // (g) validaciones honestas
  assert.equal(handle(ctx, new URLSearchParams({ action: "borrar-todo" })).status, 422, "única escritura: decide");
  assert.equal(handle(ctx, new URLSearchParams({ action: "decide", draftId: "DOCS3--documentación", decision: "aprobado" })).status, 422, "decisión fuera de los dos valores");
  assert.equal(handle(ctx, new URLSearchParams({ action: "decide", draftId: "NOEXISTE--x", decision: "adoptado" })).status, 422, "id desconocido");
  assert.equal(handle(ctx, new URLSearchParams({ action: "decide", decision: "adoptado" })).status, 422, "sin draftId");

  // (h) re-check de roles (defensa en profundidad)
  const coach = { ...ctx, session: { email: "coach@lotus.example", role: "coach" } };
  assert.equal(handle(coach, new URLSearchParams({ action: "decide", draftId: "DOCS3--documentación", decision: "adoptado" })).status, 403);

  // (i) el CRM de disco NO fue tocado por el agente (solo lee)
  assert.deepEqual(JSON.parse(readFileSync(join(AGENT_DIR, "crm.json"), "utf8")), CRM);

  // (j) con el CRM corrupto, el registro permanente sigue visible y nada revienta
  writeFileSync(join(AGENT_DIR, "crm.json"), "{{no es json");
  const html3 = render(ctx);
  assert.ok(html3.includes("callout--warn"), "degradación honesta del CRM ilegible");
  assert.ok(html3.includes("Decisiones humanas (2)"), "la auditoría sobrevive al fallo de lectura");
});

test("el agente declara su naturaleza v0 en su propia copia", () => {
  CLEAN();
  const html = render({ slug: "agenttest", manifest: MANIFEST, session: { email: "a@b.example", role: "director" }, query: new URLSearchParams() });
  assert.ok(html.includes("v0 determinista — reglas + voz del manifiesto; el borrador lo aprueba y lo envía una persona, a mano, hoy"));
  assert.ok(html.includes("Cero LLM") || html.includes("cero LLM") || html.includes("Sin LLM") || html.includes("sin LLM") || html.toLowerCase().includes("cero llm"));
});
