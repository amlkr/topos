/**
 * tests/contract.test.mjs — the contract suite for the Topos engine.
 *
 * Imports the frozen organs from manifold/core.mjs directly (no CLI shell-outs).
 * Mutation fixtures are structuredClone()s of the parsed lotus manifest —
 * nobody hand-writes a second full manifest in here.
 *
 * Two tests are CHARACTERIZATION tests: core.mjs is frozen for this zone, so
 * where it disagrees with the contract's intent (/desk ignores price.published;
 * the home heading double-pluralizes) the suite records the current behavior
 * loudly. Fixing core flips those tests; that flip is the reminder to update
 * the requirement text, not to silently rewrite the suite.
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

test("(b) renderSite(aurora) returns exactly /, one /enrol/<code> per program, and /desk", () => {
  const expected = ["/", "/desk", ...aurora.programs.map((p) => `/enrol/${p.code}`)].sort();
  assert.deepEqual(Object.keys(auroraPages).sort(), expected);
  for (const [path, html] of Object.entries(auroraPages)) {
    assert.equal(typeof html, "string");
    assert.ok(html.startsWith("<!doctype html>"), `${path}: not an HTML document`);
    assert.ok(html.includes(aurora.identity.domain), `${path}: footer must carry the domain`);
  }
});

/* ----------------------- (c) unpublished price discipline ----------------- */

test("(c) the unpublished amount appears on no family-facing page (/, /enrol/*)", () => {
  // Both spellings: the raw amount string and the locale-grouped one money() emits.
  const needles = [String(hidden.price.amount), hidden.price.amount.toLocaleString()];
  for (const [path, html] of Object.entries(auroraPages)) {
    if (path === "/desk") continue; // staff view — covered by the characterization test below
    for (const needle of needles)
      assert.ok(!html.includes(needle), `${path} leaks unpublished amount "${needle}"`);
  }
});

test("(c-) the guard is not vacuous: a published amount DOES render", () => {
  assert.ok(auroraPages["/"].includes(shown.price.amount.toLocaleString()));
  const own = auroraPages[`/enrol/${shown.code}`];
  assert.ok(own.includes(shown.price.amount.toLocaleString()));
});

test("(c✗) CHARACTERIZATION — core.mjs defect, reported not fixed: /desk ignores price.published", () => {
  // core.mjs:144 calls money(p.price) unguarded, while the home and enrol pages
  // guard with `p.price.published ? … : ""`. The unpublished amount therefore
  // DOES appear on /desk. If core is ever fixed, this test flips — deliberately.
  const desk = auroraPages["/desk"];
  assert.ok(
    desk.includes(hidden.price.amount.toLocaleString()),
    "desk unexpectedly hides the unpublished amount — fix core, then delete this characterization",
  );
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

test("(e✗) CHARACTERIZATION — core.mjs defect, reported not fixed: the heading double-pluralizes", () => {
  // core.mjs:121 writes `Our ${plural(entity)}s` — an extra literal "s" after a
  // word the helper already pluralized: "coursess", "activitiess". The (e) tests
  // above pass on substring; this test records the exact defect.
  assert.match(auroraPages["/"], /<h2>Our coursess<\/h2>/);
  assert.match(renderSite(lotus)["/"], /<h2>Our activitiess<\/h2>/);
});
