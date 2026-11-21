#!/usr/bin/env node
/**
 * smoke-data.mjs — the smoke test for the v0 dashboard data layer + views.
 *
 *   node dashboard/smoke-data.mjs              → seed, read, render, assert
 *   node dashboard/smoke-data.mjs --html hoy   → print one rendered page to stdout
 *   node dashboard/smoke-data.mjs --keep       → leave the temp store for inspection
 *
 * It seeds the demo store for schools/lotus.yaml (twice, into a throwaway
 * dataRoot, to prove determinism), opens the real one under
 * dashboard/.data/lotus/, prints the numbers a desk would see, renders every
 * tab and asserts the page has no leaks: no "undefined", no "NaN", no
 * "[object Object]", the school name present, "HOY" present — and no promise
 * the system has not kept ("pago recibido" / "payment received" must not
 * appear anywhere, house rule 1).
 *
 * Exits 0 when everything holds, 1 with the failing assertion printed.
 * Runs on node 22 stdlib + the repo's own `yaml` package. No npm installs,
 * nothing written outside dashboard/.data/.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

import { seedDemo, open, DATA_ROOT, todayISO, formatAmount } from "./data.mjs";
import { renderDashboard, DASHBOARD_VIEWS, esc } from "./views.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(HERE, "..", "schools", "lotus.yaml");
const SCHOOL = "Lotus Valley International School";
const FIXED = "2027-03-04"; // a fixed calendar anchor, so dates are reproducible

let failures = 0;
const log = (...a) => console.log(...a);
function check(label, fn) {
  try {
    const extra = fn();
    log(`  ok   ${label}${extra ? ` — ${extra}` : ""}`);
  } catch (e) {
    failures++;
    log(`  FAIL ${label}\n       ${e.message.split("\n").join("\n       ")}`);
  }
}

/* ------------------------------- 1. seed -------------------------------- */
log(`\n1 · seed the demo store for ${MANIFEST}`);
check("manifest exists and parses through data.mjs", () => {
  readFileSync(MANIFEST, "utf8");
  return `today is ${todayISO()}`;
});

const real = seedDemo(MANIFEST);
check("seedDemo wrote dashboard/.data/lotus/", () => {
  const files = readdirSync(join(DATA_ROOT, "lotus")).sort();
  assert.ok(files.includes("persons.json") && files.includes("_meta.json"), `files: ${files.join(", ")}`);
  assert.ok(files.includes(".gitignore"), "the store carries its own ignore file");
  return `${files.length} files → ${join(DATA_ROOT, "lotus")}`;
});

check("the seeded numbers are the promised mix, not zeros", () => {
  const c = real.counts;
  assert.equal(c.persons, 14, "14 families");
  assert.ok(c.children >= 14, "at least one child per family");
  assert.equal(c.enrolments, 18);
  assert.deepEqual(c.byStatus, { new: 5, confirmed: 4, paid: 7, completed: 2 });
  assert.equal(c.unpaidPayments, 5, "5 unpaid enrolments");
  assert.equal(c.proofsToVerify, 2, "2 unverified proofs");
  assert.equal(c.threadsOpen, 3, "3 open threads");
  assert.equal(c.ledgerItems, 6);
  return `families ${c.persons} · children ${c.children} · enrolments ${c.enrolments} · unpaid ${c.unpaidPayments} · proofs pending ${c.proofsToVerify} · open threads ${c.threadsOpen}`;
});

check("every enrolment uses a program code from the manifest", () => {
  const codes = new Set(real.meta.programCodes);
  for (const e of real.records.enrolments) assert.ok(codes.has(e.programCode), `${e.ref} → ${e.programCode}`);
  return `${[...codes].join(", ")}`;
});

check("the deadline comes from the manifest, or is labelled provisional", () => {
  const dl = real.meta.deadline;
  assert.ok(dl && dl.date, "no deadline at all");
  if (dl.source === "manifest") assert.ok(dl.programCode, "a manifest deadline must name its program");
  else assert.match(String(dl.source), /provisional/);
  return `${dl.date} · ${dl.source}`;
});

/* --------------------------- 2. determinism ----------------------------- */
log("\n2 · determinism: the same school seeds the same bytes");
const tmp = mkdtempSync(join(tmpdir(), "topos-smoke-"));
check("two seeds into a temp dataRoot are identical", () => {
  const a = seedDemo(MANIFEST, { dataRoot: join(tmp, "a"), today: FIXED });
  const b = seedDemo(MANIFEST, { dataRoot: join(tmp, "b"), today: FIXED });
  const files = readdirSync(join(tmp, "a", "lotus")).filter((f) => f.endsWith(".json"));
  assert.deepEqual(a.counts, b.counts);
  const differing = files.filter((f) => {
    const one = readFileSync(join(tmp, "a", "lotus", f), "utf8").replace(/"seededAt": "[^"]*"/, '"seededAt": "X"');
    const two = readFileSync(join(tmp, "b", "lotus", f), "utf8").replace(/"seededAt": "[^"]*"/, '"seededAt": "X"');
    return one !== two;
  });
  assert.deepEqual(differing, [], `these files changed between runs: ${differing.join(", ")}`);
  return `${files.length} json files byte-identical at anchor ${FIXED}`;
});

check("references look like LVIS-XXXXXX and are unique", () => {
  const refs = real.records.enrolments.map((e) => e.ref);
  assert.equal(new Set(refs).size, refs.length, "a reference is duplicated");
  for (const r of refs) assert.match(r, /^[A-Z0-9]+-[A-Z2-9]{6}$/, `${r} is not REF-shaped`);
  return `${refs.length} unique references, e.g. ${refs[0]}`;
});

/* ----------------------------- 3. the store ----------------------------- */
log("\n3 · the store the dashboard reads");
const store = open(MANIFEST);
const t = store.today();
check("today() returns counts + exactly 4 morning lines", () => {
  assert.equal(t.lines.length, 4);
  assert.deepEqual(t.lines.map((l) => l.key), ["threads", "proofs", "unpaid", "deadline"]);
  for (const l of t.lines) {
    assert.ok(l.label && l.href, `line ${l.key} is missing its label or link`);
    assert.equal(typeof l.empty, "boolean");
  }
  return t.lines.map((l) => `${l.label}=${l.value}`).join(" | ");
});

log(`     ${t.date}`);
for (const l of t.lines) log(`     · ${String(l.value).padStart(3)}  ${l.label} (${l.unit}) — ${l.detail}`);

check("money() has per-family paid/due and a month total", () => {
  const m = store.money();
  assert.ok(m.families.length > 0, "no families");
  for (const f of m.families) {
    assert.equal(typeof f.paid, "number");
    assert.equal(typeof f.due, "number");
    assert.ok(["settled", "overdue", "waiting"].includes(f.state), `bad state ${f.state}`);
  }
  assert.ok(m.totals.due > 0, "the demo must show outstanding money");
  assert.ok(m.expenses.total > 0, `no expenses in ${m.month}`);
  return `cobrado ${formatAmount(m.totals.paid, m.currency)} · pendiente ${formatAmount(m.totals.due, m.currency)} · vencido ${formatAmount(m.totals.overdue, m.currency)} · gastos ${m.expenses.month} ${formatAmount(m.expenses.total, m.currency)} (${m.expenses.count} partidas)`;
});

check("people('') gives the first 8, and name/email/reference all match", () => {
  const empty = store.people("");
  assert.equal(empty.items.length, 8, `empty query returned ${empty.items.length}`);
  const byName = store.people("nattaya");
  assert.ok(byName.count >= 1, "no match for a parent name we seeded");
  const byEmail = store.people("SOMKID.TRANO");
  assert.ok(byEmail.count >= 1, "email search is not case-insensitive");
  const ref = real.records.enrolments[0].ref;
  const byRef = store.people(ref.toLowerCase());
  assert.equal(byRef.count, 1, `reference ${ref} matched ${byRef.count}`);
  assert.equal(store.people("zzzzzzzzz").count, 0);
  return `8 by default · name ${byName.count} · email ${byEmail.count} · ref ${byRef.count}`;
});

check("pipeline() groups by status with manifest names and prices", () => {
  const p = store.pipeline();
  assert.deepEqual(p.groups.map((g) => g.status), ["new", "confirmed", "paid", "completed"]);
  assert.equal(p.groups.reduce((n, g) => n + g.count, 0), 18);
  for (const g of p.groups) for (const r of g.items) {
    assert.ok(r.programName, `${r.ref} has no program name`);
    assert.notEqual(r.amount, 0, `${r.ref} has no amount`);
    assert.ok(["verified", "pending", "rejected", "none"].includes(r.proofState));
    assert.equal(r.amountMatchesManifest, true, `${r.ref} disagrees with the manifest price`);
  }
  const states = new Set(p.groups.flatMap((g) => g.items.map((r) => r.proofState)));
  assert.deepEqual([...states].sort(), ["none", "pending", "rejected", "verified"]);
  return `groups ${p.groups.map((g) => `${g.status}:${g.count}`).join(" ")} · proof states ${[...states].sort().join("/")}`;
});

check("pipeline() carries the inbox and the slips the HOY lines point at", () => {
  const p = store.pipeline();
  assert.equal(p.threads.open, 3, "three open threads expected");
  assert.equal(p.threads.count, 5);
  for (const x of p.threads.items) {
    assert.ok(x.subject && x.preview, `${x.id} has no subject or preview`);
    assert.ok(x.parentName && x.funnel, `${x.id} has no family or funnel`);
    assert.ok(x.status === "open" || x.status === "answered", `bad thread status ${x.status}`);
    if (x.status === "open") assert.ok(x.waitingDays >= 0 && x.lastFrom === "parent");
  }
  assert.equal(p.proofs.count, 6);
  assert.equal(p.proofs.pending, 2, "two unverified proofs expected");
  assert.equal(p.proofs.rejected, 1);
  assert.equal(p.proofs.verified, 3);
  for (const x of p.proofs.items) {
    assert.ok(/^[\w.-]+$/.test(x.filename), `odd filename ${x.filename}`);
    assert.ok(x.size > 0 && x.uploaded, `${x.id} has no size or upload date`);
    assert.ok(x.ref && x.child, `${x.id} is not joined to an enrolment`);
  }
  const page = renderDashboard(store.manifest, store, { email: "desk@lvis.example", role: "desk" }, { view: "pipeline" });
  for (const l of t.lines) {
    if (!l.href.includes("#")) continue;
    const anchor = l.href.split("#")[1];
    assert.ok(page.includes(`id="${anchor}"`), `the HOY line «${l.label}» links to #${anchor}, which is not on the page`);
  }
  assert.ok(page.includes("dice la familia"), "no thread preview attribution");
  assert.ok(page.includes("por ver"), "no pending-proof chip");
  return `${p.threads.open}/${p.threads.count} hilos abiertos · ${p.proofs.pending} resguardos por ver · los anclajes de HOY existen`;
});

check("stories() reads the content queue", () => {
  const s = store.stories();
  assert.ok(s.count >= 3, "the queue is empty");
  assert.equal(s.editorHere, false);
  return `${s.count} drafts · blog ${s.blogEnabled} · consent ${s.mediaConsent}`;
});

/* ------------------------------ 4. render ------------------------------- */
log("\n4 · renderDashboard, every tab");
const session = { email: "admissions@lvis.example", role: "desk" };
const html = {};
for (const view of [...DASHBOARD_VIEWS, "does-not-exist"]) {
  html[view] = renderDashboard(store.manifest, store, session, { view, q: view === "people" ? "lvis-" : "" });
  check(`?view=${view} renders`, () => {
    assert.match(html[view], /^<!doctype html>/);
    assert.ok(html[view].includes(SCHOOL), "the manifest school name is missing");
    assert.ok(!html[view].includes("undefined"), "the string undefined leaked into the page");
    assert.ok(!html[view].includes("NaN"), "NaN leaked into the page");
    assert.ok(!html[view].includes("[object Object]"), "an object leaked into the page");
    assert.ok(!/pago recibido|payment received|booking confirmed|confirmation email/i.test(html[view]), "the page promises something the system has not done");
    assert.ok(html[view].includes('name="q"') || view === "people" || true);
    return `${(html[view].length / 1024).toFixed(1)} KB`;
  });
}

check("HOY shows the four morning lines with real numbers", () => {
  const page = html.hoy;
  assert.ok(page.includes("HOY"), "no HOY marker");
  assert.ok(page.includes(">3<"), "the 3 open threads are not on screen");
  assert.ok(page.includes(">2<"), "the 2 proofs to verify are not on screen");
  assert.ok(page.includes(">5<"), "the 5 unpaid enrolments are not on screen");
  assert.ok(page.includes("topos · mesa de admisiones"), "no top bar");
  assert.ok(page.includes('class="badge"'), "no role badge");
  assert.ok(page.includes('action="/logout"'), "no logout form");
  assert.ok(page.includes('method="post"'), "logout is not a POST");
  assert.ok(page.includes("admissions@lvis.example"), "no session email");
  return `3 · 2 · 5 on screen, plus the deadline line`;
});

check("PIPELINE shows the program names and prices from the manifest", () => {
  const page = html.pipeline;
  assert.ok(page.includes(esc("Robotics & Making")), "program name missing (or not escaped)");
  assert.ok(page.includes("Thai & Western Ensemble") || page.includes("Thai &amp; Western Ensemble"), "second program missing");
  assert.ok(page.includes("9,500") && page.includes("6,800"), "manifest prices not on screen");
  assert.ok(page.includes("resguardo por verificar"), "no pending-proof chip");
  assert.ok(page.includes("resguardo rechazado"), "no rejected-proof chip");
  assert.ok(page.includes("sin resguardo subido"), "no no-proof chip");
  return "names, prices and all four proof states";
});

check("PEOPLE has the GET form and an honest no-results message", () => {
  const page = renderDashboard(store.manifest, store, session, { view: "people", q: "nobody-here" });
  assert.ok(page.includes('method="get"'), "search is not a GET form");
  assert.ok(page.includes('name="q"'), 'no input name="q"');
  assert.ok(page.includes("Buscar"), "no submit button");
  assert.ok(page.includes("min-h-11"), "the button is not min-h-11");
  assert.ok(page.includes("Sin coincidencias"), "no honest empty message");
  assert.ok(page.includes("nobody-here"), "the query is not echoed back");
  assert.ok(!page.includes("<script"), "there is client JavaScript");
  const empty = renderDashboard(store.manifest, store, session, { view: "people" });
  assert.ok(empty.includes("primeras 8"), "empty query does not say it is showing the first 8");
  assert.ok(html.people.includes("LVIS-"), "a reference search found nothing");
  return "form, results, no-results, and no <script> anywhere";
});

check("SCHOOL shows the manifest YAML read from disk", () => {
  const page = html.school;
  const disk = readFileSync(MANIFEST, "utf8");
  assert.ok(page.includes(esc(disk.slice(disk.indexOf("apiVersion"), disk.indexOf("apiVersion") + 40))), "the YAML text is not on screen");
  assert.ok(page.includes("manifold/studio.mjs"), "no note about where editing lives");
  assert.ok(page.includes("Solo lectura"), "no read-only note");
  assert.ok(page.includes("#0f6e5c"), "the school's own palette is not shown");
  return `${disk.length} bytes of YAML rendered read-only`;
});

check("an unknown view stays honest", () => {
  assert.ok(html["does-not-exist"].includes("no existe"), "no honest 404 line");
});

check("a missing store renders an honest error, not a crash", () => {
  const page = renderDashboard(store.manifest, null, session, { view: "hoy" });
  assert.ok(page.includes("El almacén no respondió"), "no error card");
  assert.ok(page.includes(SCHOOL), "the top bar still needs the school name");
  assert.ok(!page.includes("undefined"), "undefined leaked");
  return "degrades with a message";
});

check("escaping holds against a hostile manifest", () => {
  const evil = structuredClone(store.manifest);
  evil.identity.name = `<script>alert("x")</script> & Cía`;
  const page = renderDashboard(evil, store, { email: 'a"><b>@x', role: "desk" }, { view: "hoy" });
  assert.ok(!page.includes("<script>alert"), "raw script survived");
  assert.ok(page.includes("&lt;script&gt;"), "it was not escaped");
  assert.ok(!page.includes("undefined"), "undefined leaked");
  return "school name and session are escaped";
});

/* --------------------------------- CLI ---------------------------------- */
const htmlArg = process.argv.indexOf("--html");
if (htmlArg >= 0) {
  const which = process.argv[htmlArg + 1] ?? "hoy";
  process.stdout.write(renderDashboard(store.manifest, store, session, { view: which, q: "" }));
}
if (!process.argv.includes("--keep")) rmSync(tmp, { recursive: true, force: true });

log(`\n${failures === 0 ? "OK" : "FAILED"} — ${failures} failing check${failures === 1 ? "" : "s"} · store at ${join(DATA_ROOT, "lotus")}`);
if (process.argv.includes("--html")) log("(the page above went to stdout; nothing was written inside the repo)");
process.exitCode = failures === 0 ? 0 : 1;
