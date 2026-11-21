# Topos dashboard v0 · DATA-API

The contract between `dashboard/data.mjs` (the store), `dashboard/views.mjs`
(the HTML) and **your** server. Nothing here talks to a database, a bank or a
mailbox: it is a JSON-file demo store for ONE school plus server-rendered HTML
strings. Read this file and you can wire the routes without opening the code.

```
dashboard/
├── data.mjs        the five primitives + seedDemo() + open()
├── views.mjs       renderDashboard() → one HTML string per request
├── smoke-data.mjs  the verification script (node dashboard/smoke-data.mjs)
├── DATA-API.md     this file
└── .data/<slug>/   the demo store on disk (generated, gitignore it)
```

Requirements: **node 22 and the repo's own `yaml` package**. No other
dependency, no build step, no client JavaScript in the output.

---

## 1. Where the data lives, and the gitignore line

`DATA_ROOT = <this folder>/.data`, and every school gets one directory:

```
dashboard/.data/lotus/
  persons.json enrolments.json payments.json proofs.json
  threads.json ledger.json content.json _meta.json .gitignore
```

The slug comes **from the manifest path**: `schools/lotus.yaml` → `lotus`.
That is why `open()` and `seedDemo()` want a path (or `{ manifestPath }`).
With an object only, the slug falls back to the first label of
`identity.domain` (`lvis.example` → `lvis`), then to `identity.altName`.

The seeder writes a self-ignoring `dashboard/.data/.gitignore` containing:

```gitignore
*
!.gitignore
```

so demo data never reaches git on its own. If you want it belt-and-braces,
add this one line to the repo `.gitignore` (**the integrator's call — I did not
touch it**):

```gitignore
dashboard/.data/
```

Nothing in there is real pupil data. It is generated, disposable, and
`seedDemo()` overwrites it on purpose.

---

## 2. `data.mjs` — exports

### 2.1 `resolveSource(manifestOrPath, opts?) → { manifest, manifestPath, slug }`

Accepts a parsed manifest object **or** a path to a YAML manifest. Throws with
the path in the message if the file cannot be read or parsed.

`opts`: `{ school?, manifestPath? }` — `school` forces the slug (and therefore
the data directory); `manifestPath` tells the store where the YAML lives when
you passed a parsed object (`loadManifest(path)` from `manifold/core.mjs`
returns exactly such an object, so pass the path with it).

### 2.2 `seedDemo(manifestOrPath, opts?) → { slug, dir, manifestPath, reference, counts, meta, records }`

Writes the whole demo store for one school (14 families, 18 enrolments, 18
payments, 6 proofs, 5 threads, 6 ledger lines, 4 drafts, `_meta.json`).

`opts`:

| key | default | meaning |
|---|---|---|
| `school` | from the manifest path | force the slug / directory |
| `dataRoot` | `dashboard/.data` | write somewhere else (tests) |
| `today` | today's local date | calendar anchor for every derived date |
| `dryRun` | `false` | build the records, write nothing |

`counts` (measured on `schools/lotus.yaml`, today `2026-11-21`):

```json
{ "persons": 14, "children": 25, "enrolments": 18,
  "byStatus": { "new": 5, "confirmed": 4, "paid": 7, "completed": 2 },
  "unpaidPayments": 5, "proofsUploaded": 6, "proofsToVerify": 2,
  "threadsOpen": 3, "ledgerItems": 6, "stories": 4 }
```

**Determinism.** A fixed mulberry32 PRNG seeded from `0x5eed1a + hash(slug)`
drives references, day offsets, file sizes and word counts: the same school
seeds byte-identical JSON every run (verified: two seeds into separate temp
`dataRoot`s with `today: "2027-03-04"` produce 8 identical files, `_meta.json`
differing only in `seededAt`). Everything relative to a date is relative to
`reference` (= `opts.today` or the real today), which is why `_meta.json`
stores `reference` — the dashboard reads the deadline from there instead of
recomputing it and drifting a day every midnight.

`records` is the same data the files hold, returned in memory
(`{ persons, enrolments, payments, proofs, threads, ledger, stories, deadline,
currency }`) if you want to seed and assert without touching the disk.

### 2.3 `open(manifestOrPath, opts?) → store`

Reads the files fresh **on every method call** (no cache, on purpose — same
rule as Studio: what's on disk is the truth). Throws with the directory and the
missing file names if the store was never seeded:

```
data.mjs: demo store incomplete in /…/dashboard/.data/lotus (missing persons.json, …)
— run seedDemo("…/schools/lotus.yaml") first
```

`opts` as in 2.1/2.2 (`school`, `manifestPath`, `dataRoot`).

### 2.4 `ensureDemo(manifestOrPath, opts?) → store`

`open()`, seeding first only when files are missing. **This is the one-liner
your server should call at boot.**

### 2.5 Small shared helpers

| export | signature | note |
|---|---|---|
| `DATA_ROOT` | string | absolute path of `dashboard/.data` |
| `ENROLMENT_STATUSES` | `["new","confirmed","paid","completed"]` | group order |
| `PROOF_STATES` | `["verified","pending","rejected","none"]` | |
| `todayISO(date?)` | → `"YYYY-MM-DD"` (local) | |
| `addDays(iso, n)` | → `"YYYY-MM-DD"` or `null` | UTC day arithmetic, DST-proof |
| `daysBetween(a, b)` | → `number` (b − a, in days) or `null` | |
| `currencySymbol("THB")` | → `"฿"` | unknown codes fall back to `"XXX "` |
| `formatAmount(9500,"THB","term")` | → `"฿9,500 / term"` | hand-grouped, ICU-independent |

---

## 3. The store — method by method

`store` keys: `slug, dir, manifestPath, manifest, dataRoot, meta(), records(),
today(), pipeline(), money(), people(), stories()`.

`store.manifest` is the parsed manifest, so views and you never re-read it.

### 3.1 `meta() → _meta.json | null`

```json
{ "kind": "topos-dashboard-demo", "slug": "lotus",
  "school": "Lotus Valley International School",
  "manifestPath": "/…/schools/lotus.yaml",
  "seededAt": "2026-11-21T09:29:46.452Z", "reference": "2026-11-21",
  "generatedFrom": "dashboard/data.mjs seedDemo()", "prngSeed": 6221082,
  "programCodes": ["LVIS-ROBOTICS-TERM", "LVIS-MUSIC-TERM"],
  "deadline": { "programCode": null, "programName": null, "date": "2026-11-28",
                "earlyBird": false,
                "source": "provisional: 7 days from the seed date (no price.deadline in the manifest)" },
  "currency": "THB", "counts": { …see 2.2… } }
```

**The deadline rule:** the nearest `price.deadline` among the manifest's
programs wins (with its `earlyBird` flag and its program). If no program
publishes one, the seeder writes a **provisional** date 7 days after
`reference` and labels it as such in `source` — and the page says
"provisional: el manifiesto no fija ninguna". A date the manifest never
declared is never shown as if it had.

### 3.2 `today() → { date, counts, lines[4], deadline }`

The morning briefing. Measured on lotus:

```js
{
  date: "2026-11-21",
  counts: { families: 14, children: 25, enrolments: 18,
            byStatus: { new: 5, confirmed: 4, paid: 7, completed: 2 },
            threadsOpen: 3, proofsToVerify: 2, proofsRejected: 1,
            unpaid: 5, overdue: 2, unpaidTotal: 39400, paidTotal: 110000,
            currency: "THB", expensesThisMonth: 117500, ledgerThisMonthItems: 4 },
  lines: [ { key, label, value, unit, detail, empty, href, tone }, … 4 … ],
  deadline: { …meta.deadline…, daysLeft: 7 }
}
```

Line keys, in order, and what they are worth on lotus today:

| # | `key` | value | `tone` | `href` | the honest question |
|---|---|---|---|---|---|
| 1 | `threads` | `3` (number) | `sky` | `?view=pipeline#conversaciones` | Conversaciones sin respuesta |
| 2 | `proofs` | `2` (number) | `lime` | `?view=pipeline#resguardos` | Resguardos por verificar |
| 3 | `unpaid` | `5` (number) | `orange`, or `coral` when anything is past due | `?view=money` | Matrículas sin pago registrado |
| 4 | `deadline` | `"7"` (**string** — days left; `"—"` if the manifest has no date at all) | `plum` | `?view=school` | Fecha límite más próxima |

`empty: true` means zero work in that line, and the view then prints
"Nada pendiente" — nothing is zero-filled to look busy, and no line is dropped.
`detail` is one sentence of substance (oldest wait in days, the refs pending,
how much money is outstanding, whether the deadline came from the manifest).
Every `href` points at something that exists on the page it names — the smoke
test fails if a `#anchor` is missing.

### 3.3 `pipeline() → { order, groups[], total, totals, threads, proofs }`

```js
{ order: ["new","confirmed","paid","completed"],
  total: 18, totals: { paid: 13, unpaid: 5 },
  groups: [ { status, count, unpaid, total, currency, items[ ] }, … 4 … ],
  threads: { count: 5, open: 3, answered: 2, items[ ] },
  proofs:  { count: 6, pending: 2, rejected: 1, verified: 3, items[ ] } }
```

`groups[i].total` = money still outstanding in that group. `groups[i].items`
are sorted newest request first.

**Enrolment row** (`groups[i].items[j]`) — 29 keys:

```
id, ref ("LVIS-GF2WF9"), child ("Mint"), childAge (11),
parentName, personId, programCode, programName, programPlace,
amount, amountRecorded, amountMatchesManifest, pricePublished, currency, unit,
status, requested, confirmedAt,
paid (bool), method ("bank-transfer"), due (string|null), paidAt (string|null),
overdue (bool), daysToDue (number|null),
proofState ("verified"|"pending"|"rejected"|"none"),
proofFilename, proofSize (bytes), proofUploaded, proofNote,
inManifest (bool)
```

`amount` is **the manifest's published price for `programCode`**, which is what
the page prints. `amountRecorded` is what the enrolment file says, and
`amountMatchesManifest` is `false` when the two disagree (the PIPELINE tab then
shows a red chip: the record no longer agrees with the contract). `amount`
falls back to the recorded figure when the program has no numeric price. If a
`programCode` is not in the manifest at all, `programName` is `null` and
`inManifest` is `false` — the view shows the code plus "no está en el
manifiesto" instead of inventing a name.

**Thread row** (`threads.items[j]`, open ones first):

```
id, subject, status ("open"|"answered"), parentName, email, locale,
children ("Mint, Kaew"), refs ["LVIS-…"], funnel ("admissions@lvis.example"),
lastAt, lastFrom ("parent"|"desk"), preview, waitingDays (0 when answered)
```

**Proof row** (`proofs.items[j]`, pending first):

```
id, ref, child, parentName, programCode, amount, currency, paid,
state ("pending"|"rejected"|"verified"), filename, size (bytes),
uploaded, verifiedAt (null until a person looks), note
```

`verified` in `proofs.json` is literally `true | false | null` — `null` is
"uploaded, nobody has looked", which is the number HOY line 2 counts.

### 3.4 `money(opts?) → { month, asOf, currency, families[], totals, expenses }`

`opts.month` (`"YYYY-MM"`) overrides which expense month you mean.

```js
{ month: "2026-11", asOf: "2026-11-21", currency: "THB",
  totals: { families: 14, paid: 110000, due: 39400, overdue: 13600 },
  familiesWithoutEnrolments: 0,
  families: [ { personId, name, email, locale, children ("Mint, Kaew"),
                refs [], enrolments (2), programs [code],
                paid, due, overdue, nextDue, total, currency,
                state ("settled"|"overdue"|"waiting") }, … ],
  expenses: { month, items [raw ledger rows], count, total, empty,
              newestMonthWithData, otherMonths: [ { month, count, total } ] } }
```

Money is a plain **number** in `paid / due / overdue / total / amount` — format
it with `formatAmount()`. A family is `settled` when `due === 0`, `overdue` when
some unpaid payment's `due` date is already past `asOf`, `waiting` otherwise.
`expenses.items` are the untouched `ledger.json` rows:

```
{ id, title, amount, currency, category, month ("YYYY-MM"), date, status, note }
```

If the current month genuinely has no expenses, `expenses.empty` is `true`,
`total` is `0` and `newestMonthWithData` names the most recent month that does
— the tab prints that sentence rather than showing an empty box or a stale one.

### 3.5 `people(q?, opts?) → { query, totalFamilies, count, shown, limited, limit, items[] }`

Case-insensitive substring match over **parent name, child names, email and
enrolment references**. Empty/missing query → the first 8 families
(`limited: true, limit: 8`), which is why the tab is never a blank wall.
A query returns every match (`limit: null`). `opts.limit` changes the default.

`items[j]`: `{ personId, name, email, phone, locale, children [{name, age}],
refs [], programs [codes], enrolments, paid, due, firstContact, lastThread }`.
No currency here — take it from the manifest (or `money().currency`).

`query` is the **trimmed lowercased** needle; echo `people().query` (escaped) if
you want the page to show what was searched.

### 3.6 `stories() → { blogEnabled, mediaConsent, count, byStatus, items[], editorHere: false }`

The content queue (`content.json`), newest first. `blogEnabled` is
`manifest.content.blog` and `mediaConsent` is `manifest.content.mediaConsent`,
so the tab can say honestly whether this school even has a blog. `editorHere`
is always `false`: this panel lists, it does not edit — the editor arrives with
the marketing module. `items[j]`: `{ id, title, status, locale, author,
updated, wordCount, note }`; locales are clamped to `identity.locales`.

### 3.7 `records() → { persons, enrolments, payments, proofs, threads, ledger, content }`

The raw arrays, for anything this file does not already answer (a family detail
page, an export). Shapes below.

---

## 4. The JSON record shapes (what's on disk)

```jsonc
// persons.json — primitive: persons
{ "id": "p-0001",
  "parent": { "name": "Nattaya Chaiyaporn", "email": "nattaya.chaiyaporn@lvis.example" },
  "children": [ { "name": "Mint", "age": 11 }, { "name": "Kaew", "age": 7 } ],
  "locale": "th", "phone": "+66 78 6207374",
  "firstContact": "2026-06-04", "source": "admissions@lvis.example" }

// enrolments.json — primitive: enrolments
{ "id": "e-0001", "ref": "LVIS-GF2WF9", "personId": "p-0001",
  "child": "Mint", "childAge": 11, "programCode": "LVIS-ROBOTICS-TERM",
  "status": "paid",                    // new | confirmed | paid | completed
  "amount": 9500, "currency": "THB", "unit": "term",
  "requested": "2026-10-17", "confirmedAt": "2026-10-26",
  "paymentMethod": "bank-transfer" }

// payments.json — primitive: payments
{ "id": "pay-0001", "enrolmentId": "e-0001", "ref": "LVIS-GF2WF9", "personId": "p-0001",
  "amount": 9500, "currency": "THB", "method": "bank-transfer",
  "paid": true,          // a person marked it; there is no gateway
  "due": null,           // string date when unpaid, null when paid
  "paidAt": "2026-10-20", "proofId": "prf-0001",
  "markedBy": "admissions desk (manual)" }

// proofs.json — feature: proofs (the uploaded slip)
{ "id": "prf-0001", "paymentId": "pay-0001", "enrolmentId": "e-0001", "ref": "LVIS-GF2WF9",
  "filename": "transfer-20261019-nattaya.png", "size": 989579,
  "uploaded": "2026-10-19",
  "verified": true,      // true | false | null  ← null = nobody has looked
  "verifiedAt": "2026-10-23",
  "note": "matches the transfer on the bank statement" }

// threads.json — primitive: communication
{ "id": "th-0001", "personId": "p-0003", "parent": "Waruni Prasertkul",
  "email": "waruni.p@lvis.example", "funnel": "admissions@lvis.example",
  "subject": "Robotics — does a 12-year-old need to bring a laptop?",
  "status": "open",      // open | answered
  "lastAt": "2026-11-20", "lastFrom": "parent",
  "preview": "We have an old Chromebook at home, is that enough for the making sessions?",
  "waitingDays": 1 }

// ledger.json — school expenses (not family money)
{ "id": "led-0001", "title": "Valley Campus rent — floors 2-3", "amount": 42000,
  "currency": "THB", "category": "campus", "month": "2026-11", "date": "2026-11-03",
  "status": "hecho",   // "hecho" when the date has passed, "previsto" when it has not
  "note": "gasto de la escuela, no de una familia" }

// content.json — primitive: content (the STORIES queue)
{ "id": "st-0001", "title": "What a robot team learns when it loses", "status": "draft",
  "locale": "en", "author": "Mint's mum, desk notes", "updated": "2026-11-19",
  "wordCount": 755, "note": "borrador de demo; el editor real vive en el módulo marketing" }
```

`ref` is always `<program prefix>-6 chars` (prefix = first segment of the
program code → `LVIS-…`; alphabet excludes `I O 0 1` so a reference survives a
phone call). One payment per enrolment, at most one proof per payment — v0's
simplification, documented rather than hidden.

---

## 5. `views.mjs` — exports

### 5.1 `renderDashboard(manifest, store, session, opts?) → string`

One complete `<!doctype html>` page, UTF-8, `lang="es"`. **Never throws**: a
missing/broken store renders an honest error card, an unknown `view` renders an
honest "no existe" card. It reads the manifest YAML from disk once (SCHOOL tab)
and nothing else.

| arg | what it must be |
|---|---|
| `manifest` | the parsed manifest (or `store.manifest`). `null` is tolerated — the chrome falls back to "Escuela sin nombre" |
| `store` | the object from `open()` / `ensureDemo()` |
| `session` | `{ email, role }` from **your** auth, or `null` → the badge reads "sin sesión" and the email slot says "demo local, nadie autenticado" |
| `opts.view` | `hoy` \| `pipeline` \| `money` \| `people` \| `stories` \| `school`; `desk`/empty → `hoy`; anything else → the 404 card |
| `opts.q` | the search string for PEOPLE (read it from the URL yourself: `new URL(req.url, base).searchParams.get("q")`) |

There is deliberately **no client JS**: the only interactive things are anchors
with `?view=` and one `method="get"` form.

### 5.2 `esc(value) → string`

`& < > " '` → entities, `null`/`undefined` → `""`. Used on **every** string that
came from disk, the manifest, the URL or a person. `renderDashboard`'s `sub:`
head argument is the only place that takes trusted HTML — pass escaped strings
inside it, never raw data.

### 5.3 `DASHBOARD_VIEWS`, `STATUS_LABELS`, `default`

`["hoy","pipeline","money","people","stories","school"]` (validate `?view=` with
it) and `{ new: "Nuevas peticiones", confirmed: "Confirmadas", paid: "Pagadas",
completed: "Terminadas" }` (the same words PIPELINE prints). `default` is
`renderDashboard`.

### 5.4 What each tab is

| tab | on screen |
|---|---|
| **Hoy** | the four morning lines as big clay cards with real numbers, a chip strip (families / children / enrolments / per-status / overdue), and a note explaining that "pagada" was marked by a person |
| **Pipeline** | `#conversaciones` (threads: subject, family, refs, last message preview + who said it, days waiting) → the four status groups (reference, child + age, parent, program **name** from the manifest, amount **from the manifest price**, paid/not chip, proof chip with filename · size · date) → `#resguardos` (every uploaded slip with its `true/false/null` verification state) |
| **Money** | per-family table (refs, children, cobrado, pendiente, vencido chip, next due date) with a totals row, then the month's expenses with its total, then the manifest's own price list so the figures have a source |
| **People** | `<form method="get">` with `<label>` + `<input id="q" name="q" type="search">` + hidden `view=people` + a `.btn.min-h-11` submit (and a "Limpiar" ghost link when a query is live); results table; three different honest messages for: no query (first 8 of N), no matches (with the count in the store), matches |
| **Stories** | the draft queue (title, status chip, locale/words/updated, author) + "El editor completo llega con el módulo marketing" + a warning card when the manifest says `content.blog: false` |
| **Escuela** | the current YAML text read from disk in a `<pre class="yaml" tabindex="0">`, the manifest's own palette as swatches, what it declares (entity/groupsBy/ages, locales, primitives, funnels) and the programs with prices — read-only, with the note that editing/folding/validating lives in Topos Studio (`manifold/studio.mjs`), reachable at `?view=school` |

### 5.5 The look (v2 tokens, copied — nothing imported from `site/`)

cream `#efeeec` · navy `#001433` · orange `#ff7714` · sky `#3bd3fd` · lime
`#eef773` · coral `#fb4450` · green `#035d44` · plum `#46022f` · card `#fff`,
radius `1.75rem`, `.clay` shadow `0 10px 0 rgba(0,20,51,.08), 0 24px 48px
rgba(0,20,51,.10)` with the squish on hover — and the same Google Fonts request
as `site/index.html` (Fredoka + Nunito, with `preconnect`). `muted #3b4658` is
the only secondary text colour.

Text pairs are all ≥4.5:1 (navy on cream 14.7 / on white 16.9 / on orange 6.4 /
on sky 9.7 / on lime 13.0 / on coral 4.8; cream on navy 14.7 / on plum 11.8 /
on green 7.0). Focus ring: `:focus-visible{outline:3px solid navy}` (lime on the
dark badge area). `prefers-reduced-motion: reduce` kills every transform and
transition. Tables scroll horizontally on narrow screens, the header bar wraps
under 640px, and there is a skip link.

---

## 6. What your server has to do (nothing here does it)

```js
import { ensureDemo } from "./dashboard/data.mjs";
import { renderDashboard, DASHBOARD_VIEWS } from "./dashboard/views.mjs";
import { loadManifest } from "./manifold/core.mjs";

const manifestPath = "schools/lotus.yaml";
const manifest = loadManifest(manifestPath);            // your read of the contract
const store = ensureDemo(manifest, { manifestPath });   // seeds once, then opens

server.get("/desk", (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const view = DASHBOARD_VIEWS.includes(url.searchParams.get("view"))
    ? url.searchParams.get("view") : "hoy";
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(renderDashboard(manifest, store, session(req), {   // ← your auth
    view,
    q: url.searchParams.get("q") ?? "",
  }));
});
```

The HTML already asks the server for these:

* `GET /desk?view=…` — the six tabs; anchors already use relative `?view=` so
  the page works at any path.
* `GET /desk?view=people&q=…` — the search form posts to the *current* URL with
  `method="get"`, so it works at any path and keeps `view=people` in a hidden
  field.
* `POST /logout` — the header's logout form. **You own that route**; v0 has no
  session to invalidate.
* Session `{ email, role }` — read from the cookie/session you create. Nothing
  here authenticates anybody, and nothing here checks a role: an unauthenticated
  request still renders (badged "sin sesión"). Put the gate in front.
* `manifestPath` — pass it. Without it the SCHOOL tab has no YAML to read and
  says so.

Also: every store call re-reads the JSON files, so editing `persons.json` by
hand shows up on refresh. If you want a cache, put it above these methods, not
inside them.

---

## 7. How this was verified (real numbers, real exit codes)

```
$ node dashboard/smoke-data.mjs ; echo $?      # 27 checks
…
OK — 0 failing checks · store at /…/dashboard/.data/lotus
0
```

It runs 27 checks: seeds for real, prints the four morning lines and the money totals, seeds
twice into temp directories to prove byte-identical output, opens the store and
asserts the promised mix (14 / 25 / 18 · new 5 · confirmed 4 · paid 7 ·
completed 2 · 5 unpaid · 2 proofs to verify · 3 open threads · 1 rejected slip ·
4 expenses in the current month), renders **all six tabs plus an unknown one**
and fails if any page contains `undefined`, `NaN`, `[object Object]`, `<script>`,
the school name missing, or the phrases **`pago recibido` / `payment received` /
`booking confirmed` / `confirmation email`** (house rule 1: a screen may not say
what the system has not done — `paid: true` here means a person checked the
bank statement), plus an escaping test against a hostile manifest
(`<script>alert("x")</script> & Cía` as the school name).

```
$ node dashboard/data.mjs schools/lotus.yaml    # seed + print the numbers
seeded lotus → /…/dashboard/.data/lotus
today 2026-11-21: Conversaciones sin respuesta 3 · Resguardos por verificar 2 · Matrículas sin pago registrado 5 · Fecha límite más próxima 7
money: cobrado ฿110,000 · pendiente ฿39,400 · gastos 2026-11 ฿117,500

$ node dashboard/smoke-data.mjs --html pipeline > /tmp/pipeline.html   # one page to stdout
```

`--html <view>` prints a page to stdout and writes nothing into the repo;
`--keep` leaves the temp store for inspection.

## 8. Limits of v0 (stated, not hidden)

One school, no multi-tenant routing beyond the slug. No writes from the
dashboard — the JSON files are edited by the seeder or by a human, never by a
request. No uploads: `proofs.json` describes a slip that a real system would
have received; no file exists on disk and no path is served. No email, no
password reset, no webhook. `payments.method` is always `bank-transfer` because
that is the only route these schools have. Money is a number in minor-less
whole units (`9500` = ฿9,500), no floats, no cents.
