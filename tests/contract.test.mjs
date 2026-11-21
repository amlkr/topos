/**
 * tests/contract.test.mjs — the contract suite for the Topos engine.
 *
 * Imports the frozen organs from manifold/core.mjs directly (no CLI shell-outs).
 * Mutation fixtures are structuredClone()s of the parsed lotus manifest —
 * nobody hand-writes a second full manifest in here.
 *
 * Two tests were CHARACTERIZATION tests pinning known core defects
 * (/desk ignored price.published; the heading double-pluralized).
 * v0.2.1 (2026-11-21) fixed core — the flips happened exactly as this
 * header predicted, and the tests now assert the CORRECT behavior:
 * desk guards unpublished amounts, pluralization is single, and the
 * page map is keyed by the manifest's door field (a required contract
 * field the engine used to ignore — a Thom tear, now closed).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest, validateManifest, contractProblems, renderSite } from "../manifold/core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "spec", "manifest.schema.json"), "utf8"));

const lotus = loadManifest(join(ROOT, "schools", "lotus.yaml"));
const aurora = loadManifest(join(ROOT, "schools", "aurora.yaml"));
const auroraPages = renderSite(aurora);
const hidden = aurora.programs.find((p) => p.price.published === false);
const shown = aurora.programs.find((p) => p.price.published === true);

/** The same problem list the CLI computes: schema first, contract after. */
const problems = (m) => [...validateManifest(m, SCHEMA), ...contractProblems(m)];

/** Every mutation fixture forks from the parsed lotus, never from scratch. */
const base = () => structuredClone(lotus);

const assertFails = (m, needle) => {
  const errs = problems(m);
  assert.ok(errs.length > 0, `expected a problem containing "${needle}" — but the manifest validated clean`);
  assert.ok(
    errs.some((e) => e.includes(needle)),
    `expected a problem containing "${needle}", got: ${JSON.stringify(errs)}`,
  );
};

/* --------------------------- (a) shipped schools -------------------------- */

test("(a) lotus.yaml validates clean — schema and contract", () => {
  assert.deepEqual(problems(lotus), []);
});

test("(a) aurora.yaml validates clean — schema and contract", () => {
  assert.deepEqual(problems(aurora), []);
});

test("(a+) aurora bends every knob the contract says can bend", () => {
  assert.equal(aurora.topology.entity, "course");
  assert.equal(aurora.topology.groupsBy, "level");
  assert.deepEqual(aurora.identity.locales, ["en", "zh"]);
  assert.notEqual(aurora.content.mediaConsent, lotus.content.mediaConsent); // gdpr vs pdpa
  assert.equal(aurora.content.mediaConsent, "gdpr");
  assert.equal(aurora.operations.features.marketingEngine, true);
  assert.equal(aurora.operations.features.proofs, false);
  assert.ok(aurora.programs.length >= 3, "at least 3 programs");
  assert.ok(new Set(aurora.programs.map((p) => p.ages)).size >= 3, "varied ages");
  assert.ok(new Set(aurora.programs.map((p) => p.season.starts)).size >= 3, "varied terms");
  assert.ok(hidden, "one program with price.published false");
});

/* ------------------------------ (b) page map ------------------------------ */

test("(b) renderSite(aurora) returns exactly /, one page per program door, and /desk", () => {
  const expected = ["/", "/desk", ...aurora.programs.map((p) => p.door)].sort();
  assert.deepEqual(Object.keys(auroraPages).sort(), expected);
  for (const [path, html] of Object.entries(auroraPages)) {
    assert.equal(typeof html, "string");
    assert.ok(html.startsWith("<!doctype html>"), `${path}: not an HTML document`);
    assert.ok(html.includes(aurora.identity.domain), `${path}: footer must carry the domain`);
  }
});

/* ----------------------- (c) unpublished price discipline ----------------- */

test("(c) the unpublished amount appears on NO page at all — family or desk", () => {
  // Both spellings: the raw amount string and the locale-grouped one money() emits.
  const needles = [String(hidden.price.amount), hidden.price.amount.toLocaleString()];
  for (const [path, html] of Object.entries(auroraPages)) {
    for (const needle of needles)
      assert.ok(!html.includes(needle), `${path} leaks unpublished amount "${needle}"`);
  }
});

test("(c-) the guard is not vacuous: a published amount DOES render", () => {
  assert.ok(auroraPages["/"].includes(shown.price.amount.toLocaleString()));
  const own = auroraPages[shown.door];
  assert.ok(own.includes(shown.price.amount.toLocaleString()));
});

test("(c✓) v0.2.1: /desk guards price.published too (was a characterization defect)", () => {
  const desk = auroraPages["/desk"];
  assert.ok(!desk.includes(hidden.price.amount.toLocaleString()), "desk must not leak the unpublished amount");
  assert.ok(desk.includes("price not published"), "desk must say so honestly instead");
});

/* --------------------- (d) fixtures that MUST fail validation ------------- */

test("(d) rejects an invented published price (published: true, amount: 0)", () => {
  const m = base();
  m.programs[0].price.amount = 0;
  m.programs[0].price.published = true;
  assertFails(m, "published price must be a real amount");
});

test("(d) rejects duplicate program codes", () => {
  const m = base();
  m.programs.push(structuredClone(m.programs[0]));
  assertFails(m, `duplicate code ${m.programs[0].code}`);
});

test("(d) rejects a broken primitives array", () => {
  const m = base();
  m.operations.primitives = ["persons", "enrolments", "payments"]; // three of the five invariants
  assertFails(m, "operations.primitives: expected const");
});

test("(d) rejects a fake funnel address (admissions@localhost)", () => {
  const m = base();
  m.communication.funnels[0].address = "admissions@localhost";
  assertFails(m, "address is not an address");
});

test("(d) rejects a missing identity.domain", () => {
  const m = base();
  delete m.identity.domain;
  assertFails(m, "identity.domain: required and missing");
});

test("(d) rejects a wrong apiVersion const", () => {
  const m = base();
  m.apiVersion = "topos/v1";
  assertFails(m, 'apiVersion: expected const "topos/v0"');
});

/* ------------------------- (e) the plural helper -------------------------- */

test('(e) entity "course" renders plural "courses" in the home heading', () => {
  assert.match(auroraPages["/"], /<h2>Our courses/);
});

test("(e+) the plural helper bends other entities too (mutation fixtures)", () => {
  const cases = [
    ["activity", "activities"], // y → ies
    ["class", "classes"],       // s → +es
    ["workshop", "workshops"],  // plain +s
  ];
  for (const [entity, plural] of cases) {
    const m = base();
    m.topology.entity = entity;
    assert.ok(renderSite(m)["/"].includes(`Our ${plural}`), `entity "${entity}" must render "${plural}"`);
  }
});

test("(e✓) v0.2.1: the heading pluralizes once (was a characterization defect)", () => {
  assert.match(auroraPages["/"], /<h2>Our courses<\/h2>/);
  assert.match(renderSite(lotus)["/"], /<h2>Our activities<\/h2>/);
  assert.ok(!auroraPages["/"].includes("coursess") && !renderSite(lotus)["/"].includes("activitiess"));
});

/* --------------------- (f) admissions funnel + feature gates ----------------
 * v0.3: the funnel became data (`admissions.funnel`) and `operations.features`
 * grew the dashboard tab gates (crm/comms/finance/marketing/learning/portal).
 * Backward compatible: an absent `admissions` section still validates clean. */

test("(f) both shipped schools now carry an honest terminal funnel", () => {
  assert.deepEqual(lotus.admissions.funnel, ["consulta", "visita", "matriculado"]);
  assert.deepEqual(aurora.admissions.funnel, ["enquiry", "documents", "interview", "enrolled"]);
  for (const m of [lotus, aurora]) {
    const last = m.admissions.funnel[m.admissions.funnel.length - 1];
    assert.match(last, /matricul|enrol|pagad|paid/i, `${m.identity.name}: terminal must be an enrolment truth`);
  }
});

test("(f) absent admissions is still a valid manifest (backward compatible)", () => {
  const m = base();
  delete m.admissions;
  assert.deepEqual(problems(m), []);
});

test("(f) admissions without forms validates clean (forms is optional)", () => {
  const m = base();
  m.admissions = { funnel: ["consulta", "visita", "matriculado"] };
  assert.deepEqual(problems(m), []);
});

test("(f) rejects a two-state funnel (below minItems 3)", () => {
  const m = base();
  m.admissions = { funnel: ["consulta", "matriculado"] };
  assertFails(m, "admissions.funnel: needs at least 3 items");
});

test("(f) rejects duplicate funnel states", () => {
  const m = base();
  m.admissions = { funnel: ["consulta", "consulta", "matriculado"] };
  assertFails(m, 'admissions.funnel: duplicate state "consulta"');
});

test("(f) rejects an empty funnel state", () => {
  const m = base();
  m.admissions = { funnel: ["", "visita", "matriculado"] };
  assertFails(m, "admissions.funnel: a state name must not be empty");
});

test("(f) rejects a non-lowercase / spaced funnel state", () => {
  const m = base();
  m.admissions = { funnel: ["Visita", "documentos", "matriculado"] };
  assertFails(m, 'admissions.funnel: state "Visita" must be one lowercase word');
});

test("(f) rejects demo/test as funnel states — no placeholders in the truth", () => {
  for (const junk of ["demo", "test"]) {
    const m = base();
    m.admissions = { funnel: [junk, "visita", "matriculado"] };
    assertFails(m, `admissions.funnel: state "${junk}" is a placeholder`);
  }
});

test("(f) rejects a dishonest terminal: the funnel may not end on 'perdido'", () => {
  const m = base();
  m.admissions = { funnel: ["consulta", "visita", "perdido"] };
  assertFails(m, 'last state "perdido" is not an honest terminal');
});

test("(f) accepts every honest terminal family (matriculado|enrolled|pagado|paid)", () => {
  for (const last of ["matriculado", "enrolled", "pagado", "paid"]) {
    const m = base();
    m.admissions = { funnel: ["consulta", "documentos", last] };
    const errs = problems(m).filter((e) => e.includes("honest terminal"));
    assert.deepEqual(errs, [], `terminal "${last}" must be accepted`);
  }
});

test("(f) new feature gates validate; wrong types are refused", () => {
  const m = base();
  m.operations.features = { ...m.operations.features, crm: true, comms: true, finance: true, marketing: false, learning: false };
  assert.deepEqual(problems(m), []);
  const bad = base();
  bad.operations.features.crm = "yes";
  assertFails(bad, "operations.features.crm: must be a boolean");
});
