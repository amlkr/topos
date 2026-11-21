/**
 * data.mjs — Topos dashboard v0: the five primitives as a small demo store.
 *
 * ONE school, JSON files on disk, no database, no client JS. The five
 * primitives the manifest names (`persons, enrolments, payments,
 * communication, content`) are what actually get stored; the dashboard's
 * other two surfaces are honest projections of them:
 *
 *   persons.json        families: parent name/email + children with ages
 *   enrolments.json     which program code, status new|confirmed|paid|completed, ref LVIS-XXXXXX
 *   payments.json       enrolment ref, amount, method bank-transfer, paid true/false, due date
 *   proofs.json         uploaded slip: filename, size, verified true|false|null
 *   threads.json        communication: subject, status open|answered, last message preview
 *   ledger.json         school expenses: title, amount, month
 *   content.json        the blog-draft queue (STORIES tab reads this)
 *   _meta.json          what seeded them, when, and against which programs
 *
 * Everything lives under `dashboard/.data/<slug>/` (see DATA_ROOT). That path
 * is deliberately dot-prefixed and inside this folder so it can be ignored
 * with one line — `dashboard/.data/` — and so nothing in it is ever real
 * pupil data. House rule: this is generated demo data; no payment is taken,
 * no message is sent, no mailbox receives anything.
 *
 * PUBLIC API (see DATA-API.md for the exact record shapes):
 *   resolveSource(manifestOrPath, opts) → { manifest, manifestPath, slug }
 *   seedDemo(manifestOrPath, opts)      → { slug, dir, manifestPath, reference, counts, records }
 *   ensureDemo(manifestOrPath, opts)    → store (seeds first if the files are missing)
 *   open(manifestOrPath, opts)          → { manifestPath, slug, dir, meta(), today(),
 *                                           pipeline(), money(), people(q), stories(), records() }
 *   formatAmount / currencySymbol / todayISO / addDays / daysBetween  (shared with views.mjs)
 *
 * Determinism: `seedDemo` runs on a fixed mulberry32 PRNG seeded from
 * PRNG_SEED + the school slug, so the same school seeds the same families,
 * references, sizes and offsets on every run. Only the *calendar anchor* moves:
 * dates are written relative to `opts.today` (default: today's local date), so
 * pass `{ today: "2027-01-15" }` for a byte-reproducible seed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));

/** dashboard/.data — the whole demo store. Add `dashboard/.data/` to .gitignore. */
export const DATA_ROOT = join(HERE, ".data");

const PRNG_SEED = 0x5eed1a;
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const ENROLMENT_STATUSES = ["new", "confirmed", "paid", "completed"];
/** verified | pending (uploaded, nobody has looked) | rejected | none (nothing uploaded) */
export const PROOF_STATES = ["verified", "pending", "rejected", "none"];

const FILES = {
  persons: "persons.json",
  enrolments: "enrolments.json",
  payments: "payments.json",
  proofs: "proofs.json",
  threads: "threads.json",
  ledger: "ledger.json",
  content: "content.json",
  meta: "_meta.json",
};

/* ------------------------------ dates ---------------------------------- *
 * Day arithmetic on "YYYY-MM-DD" strings, in UTC day numbers: no drift when
 * the box runs in Asia/Bangkok and no daylight-saving off-by-one. */

export function todayISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function dayNum(iso) {
  const n = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(n) ? NaN : Math.floor(n / 86400000);
}
function isoFromDay(n) {
  return new Date(Math.round(n) * 86400000).toISOString().slice(0, 10);
}
export function addDays(iso, days) {
  const n = dayNum(iso);
  return Number.isNaN(n) ? null : isoFromDay(n + days);
}
export function daysBetween(fromIso, toIso) {
  const a = dayNum(fromIso);
  const b = dayNum(toIso);
  return Number.isNaN(a) || Number.isNaN(b) ? null : b - a;
}
const monthOf = (iso) => String(iso).slice(0, 7);
/** "2026-11" shifted by whole calendar months. */
function shiftMonth(isoMonth, delta) {
  const [y, m] = String(isoMonth).slice(0, 7).split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${String(Math.floor(idx / 12)).padStart(4, "0")}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/* ------------------------------- PRNG ------------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(s) {
  let h = 2166136261 >>> 0;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

/* ---------------------------- money format ------------------------------- */
export function currencySymbol(currency) {
  return ({ THB: "฿", USD: "$", EUR: "€", GBP: "£", CNY: "¥", JPY: "¥" })[currency] ?? String(currency ?? "") + " ";
}
/** ฿9,500 / term — grouping done by hand so it does not depend on ICU data. */
export function formatAmount(amount, currency = "THB", unit = "") {
  const n = Number(amount);
  const digits = Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—";
  const sym = currencySymbol(currency);
  const head = sym.startsWith(" ") ? `${digits}${sym}` : `${sym}${digits}`;
  return unit ? `${head} / ${unit}` : head;
}

/* ------------------------- where do the files live? ---------------------- */
function slugify(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
}
function slugFromPathOrManifest(manifestPath, manifest) {
  if (manifestPath) {
    const fromFile = slugify(basename(manifestPath, extname(manifestPath)));
    if (fromFile) return fromFile; // schools/lotus.yaml → "lotus"
  }
  const domain = slugify(String(manifest?.identity?.domain ?? "").split(".")[0]);
  return domain || slugify(manifest?.identity?.altName ?? "") || "demo";
}

/**
 * Accepts a parsed manifest, a path to a YAML manifest, or an object plus
 * `{ manifestPath }`. Always returns `{ manifest, manifestPath, slug }`.
 * The path matters: `dashboard/.data/<slug>/` is named from it (lotus.yaml →
 * "lotus"), and the SCHOOL tab of the dashboard reads it back off the disk.
 */
export function resolveSource(manifestOrPath, opts = {}) {
  const asPath = typeof manifestOrPath === "string";
  const manifestPath = asPath
    ? resolve(manifestOrPath)
    : opts.manifestPath
      ? resolve(opts.manifestPath)
      : null;

  let manifest = asPath ? null : manifestOrPath;
  if (asPath) {
    let text;
    try {
      text = readFileSync(manifestPath, "utf8");
    } catch {
      throw new Error(`data.mjs: manifest not readable at ${manifestPath}`);
    }
    try {
      manifest = YAML.parse(text);
    } catch (e) {
      throw new Error(`data.mjs: manifest does not parse (${manifestPath}): ${e.message}`);
    }
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
    throw new Error("data.mjs: need a manifest object, or the path to one");

  const slug = slugify(opts.school) || slugFromPathOrManifest(manifestPath, manifest);
  return { manifest, manifestPath, slug };
}

function dirFor(slug, opts = {}) {
  return join(opts.dataRoot ?? DATA_ROOT, slug);
}

/* ----------------------------- the seed ---------------------------------- *
 * 14 families with Thai / Chinese / European names, the two Lotus Valley
 * programs (chosen by index into manifest.programs, so any school bends), and
 * a plan that produces real, checkable numbers:
 *   18 enrolments · 5 of them unpaid · 3 open threads · 2 proofs to verify
 *   1 rejected proof · 3 verified proofs · 4 expenses in the current month.
 * `child` names the kid so the plan reads like a desk, not like noise; if the
 * name is not in that family the age range of the program decides. */

const FAMILIES = [
  { parent: "Nattaya Chaiyaporn", local: "nattaya.chaiyaporn", locale: "th", children: [{ name: "Mint", age: 11 }, { name: "Kaew", age: 7 }] },
  { parent: "Somkid Tranont", local: "somkid.tranont", locale: "th", children: [{ name: "Aof", age: 14 }, { name: "Jane", age: 9 }] },
  { parent: "Waruni Prasertkul", local: "waruni.p", locale: "th", children: [{ name: "Nene", age: 9 }, { name: "Poom", age: 12 }] },
  { parent: "Chaiyo Srisawat", local: "chaiyo.srisawat", locale: "th", children: [{ name: "Film", age: 16 }, { name: "Nay", age: 6 }] },
  { parent: "Mei-Ling Zhao", local: "meiling.zhao", locale: "zh", children: [{ name: "Kevin", age: 13 }, { name: "Lian", age: 5 }] },
  { parent: "Daniel Whitcombe", local: "d.whitcombe", locale: "en", children: [{ name: "Ellie", age: 10 }, { name: "Sam", age: 8 }] },
  { parent: "Pimpaka Duangdee", local: "pimpaka.d", locale: "th", children: [{ name: "Bas", age: 8 }] },
  { parent: "Anucha Bunyakan", local: "anucha.b", locale: "th", children: [{ name: "Eye", age: 17 }, { name: "Milk", age: 11 }] },
  { parent: "Suphapak Maneechai", local: "suphapak.m", locale: "th", children: [{ name: "Namtan", age: 5 }, { name: "Time", age: 11 }] },
  { parent: "Lin Setthaporne", local: "lin.setthaporne", locale: "en", children: [{ name: "Chompu", age: 10 }, { name: "Phupha", age: 15 }] },
  { parent: "Apirak Nilakho", local: "apirak.n", locale: "th", children: [{ name: "Aun", age: 4 }] },
  { parent: "Grace Sathienkul", local: "grace.sathienkul", locale: "en", children: [{ name: "Twinkle", age: 15 }, { name: "Pat", age: 7 }] },
  { parent: "Philippe Marchand", local: "p.marchand", locale: "en", children: [{ name: "Anaïs", age: 9 }] },
  { parent: "Karnyawat Sirikul", local: "karnyawat.s", locale: "th", children: [{ name: "Bank", age: 13 }, { name: "Bua", age: 8 }] },
];

/** fam = index into FAMILIES, prog = index into manifest.programs. */
const ENROLMENT_PLAN = [
  // paid (7) — money in, desk marked it by hand. Three have a verified slip.
  { fam: 0, prog: 0, child: "Mint", status: "paid", paid: true, proof: "verified" },
  { fam: 1, prog: 0, child: "Aof", status: "paid", paid: true, proof: "none" },
  { fam: 4, prog: 0, child: "Kevin", status: "paid", paid: true, proof: "none" },
  { fam: 6, prog: 1, child: "Bas", status: "paid", paid: true, proof: "none" },
  { fam: 8, prog: 0, child: "Time", status: "paid", paid: true, proof: "verified" },
  { fam: 9, prog: 0, child: "Chompu", status: "paid", paid: true, proof: "none" },
  { fam: 12, prog: 1, child: "Anaïs", status: "paid", paid: true, proof: "none" },
  // completed (2) — a term already finished.
  { fam: 2, prog: 1, child: "Nene", status: "completed", paid: true, proof: "none" },
  { fam: 7, prog: 0, child: "Eye", status: "completed", paid: true, proof: "verified" },
  // confirmed (4) — a person said yes; 1 transfer still outstanding.
  { fam: 3, prog: 0, child: "Film", status: "confirmed", paid: false, proof: "none" },
  { fam: 5, prog: 0, child: "Ellie", status: "confirmed", paid: true, proof: "none" },
  { fam: 10, prog: 1, child: "Aun", status: "confirmed", paid: true, proof: "none" },
  { fam: 11, prog: 0, child: "Twinkle", status: "confirmed", paid: true, proof: "none" },
  // new (5) — requests on the desk: 4 unpaid, 1 family already transferred.
  { fam: 1, prog: 1, child: "Jane", status: "new", paid: false, proof: "pending" },
  { fam: 7, prog: 1, child: "Milk", status: "new", paid: false, proof: "none" },
  { fam: 4, prog: 1, child: "Lian", status: "new", paid: false, proof: "pending" },
  { fam: 13, prog: 0, child: "Bank", status: "new", paid: false, proof: "rejected" },
  { fam: 13, prog: 1, child: "Bua", status: "new", paid: true, proof: "none" },
];

const THREAD_PLAN = [
  { fam: 2, status: "open", funnel: "admissions", subject: "Robotics — does a 12-year-old need to bring a laptop?", from: "parent", preview: "We have an old Chromebook at home, is that enough for the making sessions?" },
  { fam: 5, status: "open", funnel: "admissions", subject: "Could the Ensemble fee be paid in two transfers?", from: "parent", preview: "Second transfer before the end of March — would that hold Ellie's place?" },
  { fam: 10, status: "open", funnel: "general", subject: "Aun was absent on the 12th — can we make the session up?", from: "parent", preview: "He had the dentist. Is there a Saturday group we could join instead?" },
  { fam: 0, status: "answered", funnel: "general", subject: "Pick-up time and where to wait on Fridays", from: "desk", preview: "Riverside arts hall side door, 16:30. A teacher stays until 17:00 every Friday." },
  { fam: 4, status: "answered", funnel: "admissions", subject: "Thai ensemble — instrument list and what to buy", from: "desk", preview: "Nothing to buy for the first term; the hall has the strings and the percussion." },
];

const LEDGER_PLAN = [
  { title: "Valley Campus rent — floors 2-3", amount: 42000, category: "campus", monthOffset: 0, day: 3 },
  { title: "Riverside arts hall hire", amount: 18000, category: "campus", monthOffset: 0, day: 5 },
  { title: "Teacher stipends — robotics", amount: 36000, category: "people", monthOffset: 0, day: 2 },
  { title: "Robotics kits — 12 boxes", amount: 21500, category: "materials", monthOffset: 0, day: 9 },
  { title: "Insurance for the term", amount: 9800, category: "admin", monthOffset: -1, day: 11 },
  { title: "Bus route trial", amount: 6200, category: "transport", monthOffset: -1, day: 19 },
];

const STORY_PLAN = [
  { title: "What a robot team learns when it loses", status: "draft", locale: "en", ago: 2, author: "Mint's mum, desk notes" },
  { title: "Why the ensemble starts on the river, not in the hall", status: "queued", locale: "en", ago: 6, author: "admissions desk" },
  { title: "PDPA and your child's photo: what we ask and why", status: "draft", locale: "en", ago: 11, author: "desk" },
  { title: "Open classroom: Friday 16:30", status: "idea", locale: "th", ago: 20, author: "unassigned" },
];

function ageRange(ages) {
  const m = String(ages ?? "").match(/(\d+)\s*[-–]\s*(\d+)/);
  return m ? { min: Number(m[1]), max: Number(m[2]) } : null;
}

/** Every primitive of one demo school, built in one deterministic pass. */
function buildSeed(manifest, slug, reference) {
  const programs = Array.isArray(manifest.programs) ? manifest.programs : [];
  if (!programs.length) throw new Error("data.mjs: this manifest has no programs to enrol anyone in");
  const domain = manifest.identity?.domain || "example.com";
  const funnels = manifest.communication?.funnels ?? [];
  const funnelAddress = (key) => (funnels.find((f) => f.key === key) ?? funnels[0])?.address ?? null;
  const rng = mulberry32(hashString(`${slug}:${PRNG_SEED}`));
  // A school may switch a feature off in its manifest. The demo store obeys:
  // with `proofs: false` nobody uploads a slip, and the dashboard says so
  // instead of counting a queue that this school does not have.
  const features = manifest.operations?.features ?? {};
  const proofsOn = features.proofs !== false;

  const persons = FAMILIES.map((f, i) => ({
    id: `p-${String(i + 1).padStart(4, "0")}`,
    parent: { name: f.parent, email: `${f.local}@${domain}` },
    children: f.children.map((c) => ({ name: c.name, age: c.age })),
    locale: (manifest.identity?.locales ?? ["en"]).includes(f.locale) ? f.locale : (manifest.identity?.locales ?? ["en"])[0],
    phone: `+66 ${int(rng, 60, 89)} ${String(int(rng, 1000000, 9999999))}`,
    firstContact: addDays(reference, -int(rng, 40, 190)),
    source: funnelAddress("admissions") ?? "front door",
  }));

  const enrolments = [];
  const payments = [];
  const proofs = [];
  const usedRefs = new Set();

  const makeRef = (program) => {
    const prefix = String(program.code ?? "ENR").split("-")[0].toUpperCase().replace(/[^A-Z0-9]/g, "") || "ENR";
    for (let attempt = 0; attempt < 200; attempt++) {
      let tail = "";
      for (let i = 0; i < 6; i++) tail += REF_ALPHABET[Math.floor(rng() * REF_ALPHABET.length)];
      const ref = `${prefix}-${tail}`;
      if (!usedRefs.has(ref)) {
        usedRefs.add(ref);
        return ref;
      }
    }
    throw new Error("data.mjs: ran out of references (this should not happen with a 32-char alphabet)");
  };

  const pickChild = (person, program, wantedName) => {
    const byName = person.children.find((c) => c.name === wantedName);
    if (byName) return byName;
    const range = ageRange(program.ages);
    if (range) {
      const fit = person.children.find((c) => c.age >= range.min && c.age <= range.max);
      if (fit) return fit;
    }
    return person.children[0];
  };

  for (const row of ENROLMENT_PLAN) {
    const person = persons[row.fam];
    const program = programs[row.prog % programs.length];
    const child = pickChild(person, program, row.child);
    const price = program.price ?? {};
    const finished = row.status === "completed";
    const back = finished ? int(rng, 150, 220) : int(rng, 21, 96);
    const requested = addDays(reference, -back);
    const confirmedAt = row.status === "new" ? null : addDays(requested, int(rng, 1, 9));
    const paidAt = row.paid ? addDays(requested, Math.min(int(rng, 2, 26), back)) : null;
    const due = row.paid ? null : addDays(reference, int(rng, -4, 16));

    const enrolment = {
      id: `e-${String(enrolments.length + 1).padStart(4, "0")}`,
      ref: makeRef(program),
      personId: person.id,
      child: child.name,
      childAge: child.age,
      programCode: program.code,
      status: row.status,
      amount: typeof price.amount === "number" ? price.amount : 0,
      currency: price.currency ?? "THB",
      unit: price.unit ?? "term",
      requested,
      confirmedAt,
      paymentMethod: "bank-transfer",
    };
    enrolments.push(enrolment);

    const payment = {
      id: `pay-${String(payments.length + 1).padStart(4, "0")}`,
      enrolmentId: enrolment.id,
      ref: enrolment.ref,
      personId: person.id,
      amount: enrolment.amount,
      currency: enrolment.currency,
      method: "bank-transfer",
      paid: Boolean(row.paid),
      due,
      paidAt,
      proofId: null,
      markedBy: row.paid ? "admissions desk (manual)" : null,
    };
    payments.push(payment);

    if (row.proof !== "none") {
      const uploaded = addDays(paidAt ?? due ?? requested, -int(rng, 0, 3));
      const proof = {
        id: `prf-${String(proofs.length + 1).padStart(4, "0")}`,
        paymentId: payment.id,
        enrolmentId: enrolment.id,
        ref: enrolment.ref,
        filename: `transfer-${String(uploaded).replace(/-/g, "")}-${person.parent.name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "")}.${["jpg", "png", "pdf"][int(rng, 0, 2)]}`,
        size: int(rng, 84_000, 1_480_000),
        uploaded,
        verified: row.proof === "verified" ? true : row.proof === "rejected" ? false : null,
        verifiedAt: row.proof === "verified" ? addDays(uploaded, int(rng, 1, 4)) : row.proof === "rejected" ? addDays(uploaded, int(rng, 1, 3)) : null,
        note: row.proof === "rejected" ? "amount on the slip does not match the published price" : row.proof === "verified" ? "matches the transfer on the bank statement" : null,
      };
      proofs.push(proof);
      payment.proofId = proof.id;
    }
  }

  const threads = THREAD_PLAN.map((t, i) => {
    const person = persons[t.fam];
    const lastAt = addDays(reference, -int(rng, 0, 9));
    return {
      id: `th-${String(i + 1).padStart(4, "0")}`,
      personId: person.id,
      parent: person.parent.name,
      email: person.parent.email,
      funnel: funnelAddress(t.funnel) ?? t.funnel,
      subject: t.subject,
      status: t.status,
      lastAt,
      lastFrom: t.from,
      preview: t.preview,
      waitingDays: t.status === "open" ? daysBetween(lastAt, reference) : 0,
    };
  });

  const currency = programs[0]?.price?.currency ?? "THB";
  const thisMonth = monthOf(reference);
  const ledger = LEDGER_PLAN.map((l, i) => {
    const month = shiftMonth(thisMonth, l.monthOffset);
    const date = `${month}-${String(l.day).padStart(2, "0")}`;
    return {
      id: `led-${String(i + 1).padStart(4, "0")}`,
      title: l.title,
      amount: l.amount,
      currency,
      category: l.category,
      month,
      date,
      status: daysBetween(date, reference) >= 0 ? "hecho" : "previsto",
      note: "gasto de la escuela, no de una familia",
    };
  });

  const stories = STORY_PLAN.map((s, i) => ({
    id: `st-${String(i + 1).padStart(4, "0")}`,
    title: s.title,
    status: s.status,
    locale: (manifest.identity?.locales ?? ["en"]).includes(s.locale) ? s.locale : (manifest.identity?.locales ?? ["en"])[0],
    author: s.author,
    updated: addDays(reference, -s.ago),
    wordCount: int(rng, 180, 940),
    note: "borrador de demo; el editor real vive en el módulo marketing",
  }));

  // The early-bird-style deadline: the manifest's own price.deadline if any
  // program publishes one, otherwise a provisional date 7 days out — labelled
  // provisional in the store and on screen, because the manifest never said it.
  const dated = programs
    .filter((p) => p?.price?.deadline)
    .map((p) => ({ programCode: p.code, programName: p.name, date: String(p.price.deadline).slice(0, 10), earlyBird: Boolean(p.price.earlyBird), source: "manifest" }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const deadline = dated.length
    ? dated[0]
    : { programCode: null, programName: null, date: addDays(reference, 7), earlyBird: false, source: "provisional: 7 days from the seed date (no price.deadline in the manifest)" };

  return { persons, enrolments, payments, proofs, threads, ledger, stories, deadline, currency };
}

function writeJSON(file, value) {
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/**
 * seedDemo(manifestOrPath, opts) — (re)write the whole demo store for one
 * school. Overwrites the JSON files in dashboard/.data/<slug>/ by design: it
 * is a seeder, not a migration. opts: { school, dataRoot, today, dryRun }.
 */
export function seedDemo(manifestOrPath, opts = {}) {
  const { manifest, manifestPath, slug } = resolveSource(manifestOrPath, opts);
  const reference = opts.today ? String(opts.today).slice(0, 10) : todayISO();
  const seed = buildSeed(manifest, slug, reference);
  const dir = dirFor(slug, opts);

  const counts = {
    persons: seed.persons.length,
    children: seed.persons.reduce((n, p) => n + p.children.length, 0),
    enrolments: seed.enrolments.length,
    byStatus: ENROLMENT_STATUSES.reduce((acc, s) => {
      acc[s] = seed.enrolments.filter((e) => e.status === s).length;
      return acc;
    }, {}),
    unpaidPayments: seed.payments.filter((p) => !p.paid).length,
    proofsUploaded: seed.proofs.length,
    proofsToVerify: seed.proofs.filter((p) => p.verified === null).length,
    threadsOpen: seed.threads.filter((t) => t.status === "open").length,
    ledgerItems: seed.ledger.length,
    stories: seed.stories.length,
  };

  const meta = {
    kind: "topos-dashboard-demo",
    slug,
    school: manifest.identity?.name ?? slug,
    manifestPath,
    seededAt: new Date().toISOString(),
    reference,
    generatedFrom: "dashboard/data.mjs seedDemo()",
    prngSeed: PRNG_SEED,
    programCodes: (manifest.programs ?? []).map((p) => p.code),
    deadline: seed.deadline,
    currency: seed.currency,
    counts,
  };

  if (!opts.dryRun) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".gitignore"), "*\n!.gitignore\n", "utf8");
    writeJSON(join(dir, FILES.persons), seed.persons);
    writeJSON(join(dir, FILES.enrolments), seed.enrolments);
    writeJSON(join(dir, FILES.payments), seed.payments);
    writeJSON(join(dir, FILES.proofs), seed.proofs);
    writeJSON(join(dir, FILES.threads), seed.threads);
    writeJSON(join(dir, FILES.ledger), seed.ledger);
    writeJSON(join(dir, FILES.content), seed.stories);
    writeJSON(join(dir, FILES.meta), meta);
  }

  return { slug, dir, manifestPath, reference, counts, meta, records: seed };
}

/* ------------------------------- the store ------------------------------- */
function readList(file, label) {
  if (!existsSync(file)) return null;
  try {
    const v = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * open(manifestOrPath, opts) → the store the dashboard renders from.
 * Throws (loudly, with the path) if the demo store has not been seeded.
 */
export function open(manifestOrPath, opts = {}) {
  const { manifest, manifestPath, slug } = resolveSource(manifestOrPath, opts);
  const dir = dirFor(slug, opts);

  const load = () => {
    const out = {};
    const missing = [];
    for (const [key, file] of Object.entries(FILES)) {
      if (key === "meta") continue;
      const v = readList(join(dir, file), key);
      if (v === null) missing.push(file);
      else out[key] = v;
    }
    return { out, missing };
  };

  const { missing } = load();
  if (missing.length)
    throw new Error(
      `data.mjs: demo store incomplete in ${dir} (missing ${missing.join(", ")}) — run seedDemo(${JSON.stringify(manifestPath ?? slug)}) first`,
    );

  const programMap = new Map((manifest.programs ?? []).map((p) => [p.code, p]));
  const readMeta = () => {
    try {
      return JSON.parse(readFileSync(join(dir, FILES.meta), "utf8"));
    } catch {
      return null;
    }
  };

  const store = {
    slug,
    dir,
    manifestPath,
    manifest,
    dataRoot: opts.dataRoot ?? DATA_ROOT,

    /** the _meta.json the seeder wrote (school, reference date, counts). */
    meta() {
      return readMeta();
    },

    /** everything on disk, freshly read: { persons, enrolments, payments, proofs, threads, ledger, content }. */
    records() {
      const { out } = load();
      return out;
    },

    /**
     * today() → the morning briefing: `{ date, counts, lines[4], deadline }`.
     * `lines` is exactly the four things a desk looks at before the phone
     * starts: unanswered threads, proofs to verify, enrolments unpaid, and the
     * nearest deadline with its days left. A line with value 0 is `empty: true`
     * — the view says "nada pendiente", it does not pretend there is work.
     */
    today() {
      const r = this.records();
      const meta = readMeta();
      const date = todayISO();
      const open = r.threads.filter((t) => t.status === "open");
      const pending = r.proofs.filter((p) => p.verified === null);
      const unpaid = r.payments.filter((p) => !p.paid);
      const overdue = unpaid.filter((p) => p.due && daysBetween(p.due, date) > 0);
      const dl = meta?.deadline ?? null;
      const daysLeft = dl?.date ? daysBetween(date, dl.date) : null;

      const threadsWaiting = open.reduce((n, t) => n + (daysBetween(t.lastAt, date) ?? 0), 0);
      const dueWeek = unpaid.filter((p) => p.due && daysBetween(date, p.due) >= 0 && daysBetween(date, p.due) <= 7).length;

      const lines = [
        {
          key: "threads",
          label: "Conversaciones sin respuesta",
          value: open.length,
          unit: open.length === 1 ? "hilo" : "hilos",
          detail: open.length ? `el más antiguo espera ${Math.max(0, ...open.map((t) => daysBetween(t.lastAt, date) ?? 0))} días · ${threadsWaiting} días de espera en total` : "todos los hilos contestados",
          empty: open.length === 0,
          href: "?view=pipeline#conversaciones",
          tone: "sky",
        },
        {
          key: "proofs",
          label: "Resguardos por verificar",
          value: pending.length,
          unit: pending.length === 1 ? "justificante" : "justificantes",
          detail: pending.length ? `${pending.map((p) => p.ref).join(", ")} — subidos y a la espera de una persona` : "ningún resguardo subido esperando revisión",
          empty: pending.length === 0,
          href: "?view=pipeline#resguardos",
          tone: "lime",
        },
        {
          key: "unpaid",
          label: "Matrículas sin pago registrado",
          value: unpaid.length,
          unit: unpaid.length === 1 ? "pendiente" : "pendientes",
          detail: unpaid.length
            ? `${overdue.length} con la fecha vencida · ${dueWeek} vencen en 7 días · ${formatAmount(unpaid.reduce((n, p) => n + Number(p.amount || 0), 0), unpaid[0]?.currency ?? "THB")} en total`
            : "no hay matrículas sin pago",
          empty: unpaid.length === 0,
          href: "?view=money",
          tone: overdue.length ? "coral" : "orange",
        },
        {
          key: "deadline",
          label: dl?.earlyBird ? "Early Bird más próximo" : "Fecha límite más próxima",
          value: daysLeft === null ? "—" : daysLeft < 0 ? `${Math.abs(daysLeft)}` : `${daysLeft}`,
          unit: daysLeft === null ? "" : daysLeft === 1 ? "día" : "días",
          detail: dl?.date
            ? daysLeft !== null && daysLeft < 0
              ? `${dl.date} venció hace ${Math.abs(daysLeft)} días · ${dl.programName ?? "sin programa en el manifiesto"}`
              : `${dl.date} · ${dl.programName ?? "escuela en general (sin fecha por programa)"}${dl.source === "manifest" ? " · viene del manifiesto" : " · provisional: el manifiesto no fija ninguna"}`
            : "el manifiesto no declara ninguna fecha límite",
          empty: !dl?.date,
          href: "?view=school",
          tone: "plum",
        },
      ];

      return {
        date,
        counts: {
          families: r.persons.length,
          children: r.persons.reduce((n, p) => n + p.children.length, 0),
          enrolments: r.enrolments.length,
          byStatus: ENROLMENT_STATUSES.reduce((acc, s) => {
            acc[s] = r.enrolments.filter((e) => e.status === s).length;
            return acc;
          }, {}),
          threadsOpen: open.length,
          proofsToVerify: pending.length,
          proofsRejected: r.proofs.filter((p) => p.verified === false).length,
          unpaid: unpaid.length,
          overdue: overdue.length,
          unpaidTotal: unpaid.reduce((n, p) => n + Number(p.amount || 0), 0),
          paidTotal: r.payments.filter((p) => p.paid).reduce((n, p) => n + Number(p.amount || 0), 0),
          currency: unpaid[0]?.currency ?? r.payments[0]?.currency ?? manifest.programs?.[0]?.price?.currency ?? "THB",
          expensesThisMonth: r.ledger.filter((l) => l.month === monthOf(date)).reduce((n, l) => n + Number(l.amount || 0), 0),
          ledgerThisMonthItems: r.ledger.filter((l) => l.month === monthOf(date)).length,
        },
        lines,
        deadline: dl ? { ...dl, daysLeft } : null,
      };
    },

    /**
     * pipeline() → enrolments grouped by status, in ENROLMENT_STATUSES order,
     * each row carrying the program NAME and the amount from the manifest
     * (the record's own amount is kept too and `amountMatchesManifest` says
     * whether the two agree — a mismatch is a tear, so the view can show it).
     */
    pipeline() {
      const r = this.records();
      const byPerson = new Map(r.persons.map((p) => [p.id, p]));
      const byEnrolment = new Map(r.enrolments.map((e) => [e.id, e]));
      const payByEnrolment = new Map();
      for (const p of r.payments) payByEnrolment.set(p.enrolmentId, p);
      const proofById = new Map(r.proofs.map((p) => [p.id, p]));
      const date = todayISO();

      const rows = r.enrolments.map((e) => {
        const program = programMap.get(e.programCode) ?? null;
        const payment = payByEnrolment.get(e.id) ?? null;
        const proof = payment?.proofId ? proofById.get(payment.proofId) ?? null : null;
        const person = byPerson.get(e.personId) ?? null;
        const price = program?.price ?? {};
        const state = !proof ? "none" : proof.verified === true ? "verified" : proof.verified === false ? "rejected" : "pending";
        const dueInDays = payment && !payment.paid && payment.due ? daysBetween(date, payment.due) : null;
        return {
          id: e.id,
          ref: e.ref,
          child: e.child,
          childAge: e.childAge,
          parentName: person?.parent?.name ?? "(familia no encontrada)",
          personId: e.personId,
          programCode: e.programCode,
          programName: program?.name ?? null,
          programPlace: program?.place ?? null,
          /** the figure the manifest publishes right now */
          amount: typeof price.amount === "number" ? price.amount : Number(e.amount || 0),
          amountRecorded: Number(e.amount || 0),
          amountMatchesManifest: typeof price.amount === "number" ? Number(price.amount) === Number(e.amount || 0) : null,
          pricePublished: program ? Boolean(price.published) : null,
          currency: price.currency ?? e.currency ?? "THB",
          unit: price.unit ?? e.unit ?? "",
          status: e.status,
          requested: e.requested,
          confirmedAt: e.confirmedAt ?? null,
          paid: Boolean(payment?.paid),
          method: payment?.method ?? null,
          due: payment?.due ?? null,
          paidAt: payment?.paidAt ?? null,
          overdue: dueInDays !== null && dueInDays < 0,
          daysToDue: dueInDays,
          proofState: state,
          proofFilename: proof?.filename ?? null,
          proofSize: proof?.size ?? null,
          proofUploaded: proof?.uploaded ?? null,
          proofNote: proof?.note ?? null,
          inManifest: Boolean(program),
        };
      });

      const groups = ENROLMENT_STATUSES.map((status) => {
        const items = rows
          .filter((x) => x.status === status)
          .sort((a, b) => (a.requested < b.requested ? 1 : a.requested > b.requested ? -1 : a.ref < b.ref ? -1 : 1));
        return {
          status,
          count: items.length,
          unpaid: items.filter((x) => !x.paid).length,
          total: items.reduce((n, x) => n + (x.paid ? 0 : Number(x.amount || 0)), 0),
          currency: items[0]?.currency ?? "THB",
          items,
        };
      });

      // Two more surfaces of the same queue: the inbox (primitive
      // `communication`) and the slips (feature `proofs`). The HOY lines link
      // straight into them, so every count on screen has a page behind it.
      const threads = r.threads
        .map((x) => {
          const person = byPerson.get(x.personId) ?? null;
          const waiting = daysBetween(x.lastAt, date);
          return {
            id: x.id,
            subject: x.subject,
            status: x.status,
            parentName: person?.parent?.name ?? "(familia no encontrada)",
            email: person?.parent?.email ?? null,
            locale: person?.locale ?? null,
            children: (person?.children ?? []).map((c) => c.name).join(", "),
            refs: r.payments.filter((p) => p.personId === x.personId).map((p) => p.ref),
            funnel: x.funnel,
            lastAt: x.lastAt,
            lastFrom: x.lastFrom,
            preview: x.preview,
            waitingDays: x.status === "open" ? Math.max(0, waiting ?? 0) : 0,
          };
        })
        .sort((a, b) => (a.status === b.status ? (a.lastAt < b.lastAt ? -1 : 1) : a.status === "open" ? -1 : 1));

      const proofRows = r.proofs
        .map((x) => {
          const enrolment = byEnrolment.get(x.enrolmentId) ?? null;
          const payment = payByEnrolment.get(x.enrolmentId) ?? null;
          const person = enrolment ? byPerson.get(enrolment.personId) ?? null : null;
          return {
            id: x.id,
            ref: x.ref,
            child: enrolment?.child ?? null,
            parentName: person?.parent?.name ?? null,
            programCode: enrolment?.programCode ?? null,
            amount: payment ? Number(payment.amount || 0) : Number(enrolment?.amount || 0),
            currency: payment?.currency ?? "THB",
            paid: Boolean(payment?.paid),
            state: x.verified === true ? "verified" : x.verified === false ? "rejected" : "pending",
            filename: x.filename,
            size: x.size,
            uploaded: x.uploaded,
            verifiedAt: x.verifiedAt ?? null,
            note: x.note ?? null,
          };
        })
        .sort((a, b) => (a.state === b.state ? (a.uploaded < b.uploaded ? 1 : -1) : a.state === "pending" ? -1 : b.state === "pending" ? 1 : a.state === "rejected" ? -1 : 1));

      return {
        order: ENROLMENT_STATUSES,
        groups,
        total: rows.length,
        totals: { paid: rows.filter((x) => x.paid).length, unpaid: rows.filter((x) => !x.paid).length },
        threads: {
          count: threads.length,
          open: threads.filter((x) => x.status === "open").length,
          answered: threads.filter((x) => x.status === "answered").length,
          items: threads,
        },
        proofs: {
          count: proofRows.length,
          pending: proofRows.filter((x) => x.state === "pending").length,
          rejected: proofRows.filter((x) => x.state === "rejected").length,
          verified: proofRows.filter((x) => x.state === "verified").length,
          items: proofRows,
        },
      };
    },

    /**
     * money() → per-family paid/due + this-month expenses total.
     * "paid" means a person of the desk marked it: there is no payment gateway
     * in Topos v0, and the view says so.
     */
    money(opts = {}) {
      const r = this.records();
      const date = todayISO();
      const month = opts.month ?? monthOf(date);
      const byPerson = new Map(r.persons.map((p) => [p.id, p]));
      const enrolById = new Map(r.enrolments.map((e) => [e.id, e]));

      const families = r.persons.map((person) => {
        const pays = r.payments.filter((p) => p.personId === person.id);
        const paid = pays.filter((p) => p.paid).reduce((n, p) => n + Number(p.amount || 0), 0);
        const due = pays.filter((p) => !p.paid).reduce((n, p) => n + Number(p.amount || 0), 0);
        const overdue = pays.filter((p) => !p.paid && p.due && daysBetween(p.due, date) > 0).reduce((n, p) => n + Number(p.amount || 0), 0);
        const nextDue = pays.filter((p) => !p.paid && p.due).map((p) => p.due).sort()[0] ?? null;
        return {
          personId: person.id,
          name: person.parent.name,
          email: person.parent.email,
          locale: person.locale,
          children: person.children.map((c) => c.name).join(", "),
          refs: pays.map((p) => p.ref),
          enrolments: pays.length,
          programs: [...new Set(pays.map((p) => enrolById.get(p.enrolmentId)?.programCode).filter(Boolean))],
          paid,
          due,
          overdue,
          nextDue,
          total: paid + due,
          state: due === 0 ? "settled" : overdue > 0 ? "overdue" : "waiting",
          currency: pays[0]?.currency ?? "THB",
        };
      });

      const withActivity = families.filter((f) => f.enrolments > 0);
      const items = r.ledger.filter((l) => l.month === month).sort((a, b) => (a.date < b.date ? -1 : 1));
      const total = items.reduce((n, l) => n + Number(l.amount || 0), 0);
      const months = [...new Set(r.ledger.map((l) => l.month))].sort();
      const newest = months[months.length - 1] ?? null;

      return {
        month,
        asOf: date,
        currency: manifest.programs?.[0]?.price?.currency ?? r.payments[0]?.currency ?? "THB",
        families: withActivity,
        familiesWithoutEnrolments: families.filter((f) => f.enrolments === 0).length,
        totals: {
          families: withActivity.length,
          paid: withActivity.reduce((n, f) => n + f.paid, 0),
          due: withActivity.reduce((n, f) => n + f.due, 0),
          overdue: withActivity.reduce((n, f) => n + f.overdue, 0),
        },
        expenses: {
          month,
          items,
          count: items.length,
          total,
          empty: items.length === 0,
          newestMonthWithData: newest,
          otherMonths: months.filter((m) => m !== month).map((m) => ({
            month: m,
            count: r.ledger.filter((l) => l.month === m).length,
            total: r.ledger.filter((l) => l.month === m).reduce((n, l) => n + Number(l.amount || 0), 0),
          })),
        },
      };
    },

    /**
     * people(q) → families whose parent name, child name, email or enrolment
     * reference matches q (case-insensitive, trimmed). Empty query → the
     * first 8, so the tab is never a blank wall.
     */
    people(q = "", opts = {}) {
      const r = this.records();
      const limit = opts.limit ?? 8;
      const payByPerson = new Map();
      for (const p of r.payments) {
        if (!payByPerson.has(p.personId)) payByPerson.set(p.personId, []);
        payByPerson.get(p.personId).push(p);
      }
      const enrolById = new Map(r.enrolments.map((e) => [e.id, e]));

      const all = r.persons.map((person) => {
        const pays = payByPerson.get(person.id) ?? [];
        const thread = r.threads.find((t) => t.personId === person.id) ?? null;
        return {
          personId: person.id,
          name: person.parent.name,
          email: person.parent.email,
          phone: person.phone,
          locale: person.locale,
          children: person.children,
          refs: pays.map((p) => p.ref),
          programs: [...new Set(pays.map((p) => enrolById.get(p.enrolmentId)?.programCode).filter(Boolean))],
          enrolments: pays.length,
          paid: pays.filter((p) => p.paid).reduce((n, p) => n + Number(p.amount || 0), 0),
          due: pays.filter((p) => !p.paid).reduce((n, p) => n + Number(p.amount || 0), 0),
          firstContact: person.firstContact,
          lastThread: thread?.lastAt ?? null,
          _haystack: [person.parent.name, person.parent.email, person.children.map((c) => c.name).join(" "), pays.map((p) => p.ref).join(" ")].join(" | ").toLowerCase(),
        };
      });

      const needle = String(q ?? "").trim().toLowerCase();
      const matched = needle ? all.filter((p) => p._haystack.includes(needle)) : all.slice(0, limit);
      return {
        query: needle,
        totalFamilies: all.length,
        count: matched.length,
        shown: matched.length,
        limited: !needle && all.length > limit,
        limit: needle ? null : limit,
        items: matched.map(({ _haystack, ...rest }) => rest),
      };
    },

    /** stories() → the content queue behind the STORIES tab. */
    stories() {
      const r = this.records();
      const items = (r.content ?? []).slice().sort((a, b) => (a.updated < b.updated ? 1 : -1));
      return {
        blogEnabled: Boolean(manifest.content?.blog),
        mediaConsent: manifest.content?.mediaConsent ?? null,
        count: items.length,
        byStatus: items.reduce((acc, s) => {
          acc[s.status] = (acc[s.status] ?? 0) + 1;
          return acc;
        }, {}),
        items,
        editorHere: false,
      };
    },
  };

  return store;
}

/** open(), seeding the demo store first when the files are not there. */
export function ensureDemo(manifestOrPath, opts = {}) {
  const { slug, manifestPath, manifest } = resolveSource(manifestOrPath, opts);
  const dir = dirFor(slug, opts);
  const needed = Object.values(FILES).filter((f) => !existsSync(join(dir, f)));
  if (needed.length) seedDemo(manifest ?? manifestPath ?? { identity: { domain: slug } }, { ...opts, school: slug, manifestPath });
  return open(manifest ?? manifestPath, { ...opts, school: slug, manifestPath });
}

/* -------------------------------- CLI ------------------------------------ *
 * node dashboard/data.mjs schools/lotus.yaml [today]  → seed and print numbers
 * (a convenience for the integrator; the smoke script is smoke-data.mjs). */
if (process.argv[1] && basename(process.argv[1]) === "data.mjs") {
  const path = process.argv[2] ?? join(HERE, "..", "schools", "lotus.yaml");
  const out = seedDemo(path, { today: process.argv[3] });
  const store = open(path, { today: process.argv[3] });
  const t = store.today();
  const m = store.money();
  console.log(`seeded ${out.slug} → ${out.dir}`);
  console.log(`today ${t.date}: ${t.lines.map((l) => `${l.label} ${l.value}`).join(" · ")}`);
  console.log(`money: cobrado ${formatAmount(m.totals.paid, m.currency)} · pendiente ${formatAmount(m.totals.due, m.currency)} · gastos ${m.expenses.month} ${formatAmount(m.expenses.total, m.currency)}`);
}
