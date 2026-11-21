/**
 * dashboard/tests/funnel.test.mjs — el funnel de admisiones es datos del
 * manifiesto, y el CRM del panel los pinta. Suite node --test, sin deps.
 *
 * Cubre (encargo v0.3):
 *   · lotus.yaml y aurora.yaml validan limpios con su `admissions.funnel`;
 *   · el contrato rechaza estados duplicados, vacíos y un terminal deshonesto
 *     (la última puerta tiene que ser una verdad de matrícula/pago);
 *   · crm.render usa el funnel del manifiesto cuando existe y conserva los
 *     estados por defecto cuando no — y un lead con estado desconocido se
 *     pinta como «estado fuera del funnel: X», nunca se esconde.
 *
 * Hermético: escribe solo bajo dashboard/.data/lotustest/ y lo borra antes y
 * después de cada test. Ninguna otra escuela ve tocado su almacén.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest, validateManifest, contractProblems } from "../../manifold/core.mjs";
import { render, handle } from "../modules/crm.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "spec", "manifest.schema.json"), "utf8"));
const lotus = loadManifest(join(ROOT, "schools", "lotus.yaml"));
const aurora = loadManifest(join(ROOT, "schools", "aurora.yaml"));

const SLUG = "lotustest";
const DATA_DIR = join(HERE, "..", ".data", SLUG);
const CLEAN = () => rmSync(DATA_DIR, { recursive: true, force: true });

/** ctx mínimo que crm.mjs usa de verdad: manifest, slug y (en handle) session. */
const ctxFor = (manifest, query) => ({
  manifest,
  slug: SLUG,
  session: { email: "t@e", role: "director" },
  store: { money: () => ({}) }, // el CRM no llama a store — si algún día lo hace, este test lo grita
  query: query ?? new URLSearchParams(),
});

const problems = (m) => [...validateManifest(m, SCHEMA), ...contractProblems(m)];

test.beforeEach(CLEAN);
test.after(CLEAN);

/* --------------------------- manifiestos con funnel ----------------------- */

test("lotus.yaml validates clean and carries the camp funnel", () => {
  assert.deepEqual(problems(lotus), []);
  assert.deepEqual(lotus.admissions.funnel, ["consulta", "visita", "matriculado"]);
});

test("aurora.yaml validates clean and carries the school funnel", () => {
  assert.deepEqual(problems(aurora), []);
  assert.deepEqual(aurora.admissions.funnel, ["enquiry", "documents", "interview", "enrolled"]);
});

test("a funnel with duplicate states fails the contract", () => {
  const m = structuredClone(lotus);
  m.admissions.funnel = ["visita", "visita", "matriculado"];
  const errs = problems(m);
  assert.ok(errs.some((e) => e.includes('duplicate state "visita"')), JSON.stringify(errs));
});

test("a funnel with an empty state fails the contract", () => {
  const m = structuredClone(lotus);
  m.admissions.funnel = ["consulta", "", "matriculado"];
  const errs = problems(m);
  assert.ok(errs.some((e) => e.includes("must not be empty")), JSON.stringify(errs));
});

test("a funnel whose terminal is 'perdido' fails: the end must be an enrolment truth", () => {
  const m = structuredClone(lotus);
  m.admissions.funnel = ["consulta", "visita", "perdido"];
  const errs = problems(m);
  assert.ok(errs.some((e) => e.includes("honest terminal") && e.includes("perdido")), JSON.stringify(errs));
});

test("a funnel of eight states fails the 3–7 bound", () => {
  const m = structuredClone(lotus);
  m.admissions.funnel = ["a", "b", "c", "d", "e", "f", "g", "paid"];
  const errs = problems(m);
  assert.ok(errs.some((e) => e.includes("needs 3 to 7 states")), JSON.stringify(errs));
});

/* ------------------------------ CRM con funnel ---------------------------- */

test("crm renders with the manifest funnel: chips, selects and seed use its names", () => {
  const html = render(ctxFor(lotus));
  for (const state of lotus.admissions.funnel)
    assert.ok(html.includes(state), `funnel state "${state}" must render`);
  // los estados por defecto que NO están en el funnel de lotus no aparecen
  for (const gone of ["nuevo", "contactado", "perdido"])
    assert.ok(!html.includes(gone), `default state "${gone}" must not render when a manifest funnel exists`);
  assert.match(html, /admissions\.funnel/, "the tab must say where the states come from");
});

test("crm seeds demo leads on the manifest funnel names", () => {
  render(ctxFor(lotus));
  const stored = JSON.parse(readFileSync(join(DATA_DIR, "crm.json"), "utf8"));
  const statuses = stored.leads.map((l) => l.status);
  assert.deepEqual([...new Set(statuses)].sort(), [...lotus.admissions.funnel].sort());
  assert.ok(stored.leads.every((l) => l.note.startsWith("demo:")), "seeded notes stay honest");
});

test("crm with NO funnel manifest keeps the current default statuses", () => {
  const bare = structuredClone(lotus);
  delete bare.admissions;
  const html = render(ctxFor(bare));
  for (const def of ["nuevo", "contactado", "visita", "matriculado", "perdido"])
    assert.ok(html.includes(def), `default state "${def}" must render without a manifest funnel`);
  assert.ok(!html.includes("admissions.funnel"), "no funnel talk when there is no funnel");
});

test("a lead with an unknown status renders honestly, not hidden", () => {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, "crm.json"), JSON.stringify({
    leads: [{ id: "X1", family: "Familia Test", contact: "t@e", source: "web", status: "extraviado", note: "", day: "2027-01-01", updatedAt: "2027-01-01" }],
    followups: [],
  }));
  const html = render(ctxFor(lotus));
  assert.ok(html.includes("estado fuera del funnel: extraviado"), "unknown status must be named on the card");
  assert.ok(html.includes("Familia Test"), "the lead itself must still be listed");
});

test("set-status refuses an out-of-funnel value (422) and accepts a funnel one (303)", () => {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, "crm.json"), JSON.stringify({
    leads: [{ id: "X1", family: "Familia Test", contact: "t@e", source: "web", status: "consulta", note: "", day: "2027-01-01", updatedAt: "2027-01-01" }],
    followups: [],
  }));
  const bad = handle(ctxFor(lotus), new URLSearchParams({ action: "set-status", leadId: "X1", status: "extraviado" }));
  assert.equal(bad.status, 422);
  assert.ok(bad.html.includes("no es un estado que este CRM conozca"));
  const good = handle(ctxFor(lotus), new URLSearchParams({ action: "set-status", leadId: "X1", status: "matriculado" }));
  assert.deepEqual(good, { redirect: "/m/crm" });
  const stored = JSON.parse(readFileSync(join(DATA_DIR, "crm.json"), "utf8"));
  assert.equal(stored.leads[0].status, "matriculado");
});

test("add-lead enters on the funnel's first state, not on 'nuevo'", () => {
  const out = handle(ctxFor(lotus), new URLSearchParams({ action: "add-lead", family: "Familia Nueva" }));
  assert.deepEqual(out, { redirect: "/m/crm" });
  const stored = JSON.parse(readFileSync(join(DATA_DIR, "crm.json"), "utf8"));
  assert.equal(stored.leads[0].status, "consulta");
});
