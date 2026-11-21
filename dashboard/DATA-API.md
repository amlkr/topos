# Topos dashboard v0 · DATA-API

The contract between `dashboard/data.mjs` (the store), `dashboard/views.mjs`
(the HTML) and **your** server. Nothing here talks to a database, a bank or a
mailbox: it is a JSON-file demo store for ONE school plus server-rendered HTML
strings. Read this file and you can wire the routes without opening the code.

Everything below was measured on 2026-11-21 against `schools/lotus.yaml` (and
against `schools/aurora.yaml`, to prove the topology bends). The numbers are
the smoke script's numbers, not the prose's.

```
dashboard/
├── data.mjs        the five primitives + seedDemo() + open()
├── views.mjs       renderDashboard() → one HTML string per request
├── smoke-data.mjs  the verification script (31 checks, exit 0)
├── DATA-API.md     this file
└── .data/<slug>/   the demo store on disk (generated, gitignore-friendly)
```

Requirements: **node 22 and the repo's own `yaml` package**. No other
dependency, no build step, no framework, no client JS in the output.

---

## 1. Where the data lives, and the gitignore line

`DATA_ROOT = <this folder>/.data`, one directory per school:

```
dashboard/.data/lotus/
  persons.json enrolments.json payments.json proofs.json
  threads.json ledger.json content.json _meta.json .gitignore
```

The slug comes **from the manifest path**: `schools/lotus.yaml` → `lotus`.
That is why `open()` and `seedDemo()` want a path (or `{ manifestPath }`). With
a parsed object only, the slug falls back to the first label of
`identity.domain` (`lvis.example` → `lvis`), then to `identity.altName`.

The seeder also writes `dashboard/.data/lotus/.gitignore` containing `*` +
`!.gitignore`, so the store cannot be committed even if the root file forgets
it. Measured today, the root `.gitignore` already carries the line (the
integrator's, not mine — I did not touch that file):

```gitignore
dashboard/.data/          # .gitignore line 5, verified with git check-ignore
```

Keep it: `dashboard/.data/` is now **shared** with the auth module, which
keeps `dashboard/.data/auth/` and `dashboard/.data/secret` there. A session
secret must never reach a commit. My seeder only ever writes inside
`dashboard/.data/<slug>/` — it will not touch a sibling.

Nothing in there is real pupil data: it is generated, disposable, and
`seedDemo()` overwrites it on purpose.

---

## 2. `data.mjs` — its 12 exports

`DATA_ROOT, ENROLMENT_STATUSES, PROOF_STATES, addDays, currencySymbol,
daysBetween, ensureDemo, formatAmount, open, resolveSource, seedDemo, todayISO`

### 2.1 `resolveSource(manifestOrPath, opts?) → { manifest, manifestPath, slug }`

Accepts a parsed manifest object **or** a path to a YAML manifest. Throws with
the path in the message if the file cannot be read or parsed.
`opts`: `{ school?, manifestPath? }` — `school` forces the slug (and so the
directory); `manifestPath` says where the YAML lives when you pass an object
(`loadManifest(path)` from `manifold/core.mjs` returns exactly such an object,
so pass the path along with it).

### 2.2 `seedDemo(manifestOrPath, opts?) → { slug, dir, manifestPath, reference, counts, meta, records }`

Writes the whole demo store for one school: **14 families (25 children), 18
enrolments, 18 payments, 6 proofs, 5 threads, 6 ledger lines, 4 drafts,
`_meta.json`**.

| `opts` | default | meaning |
|---|---|---|
| `school` | from the manifest path | force the slug / directory |
| `dataRoot` | `dashboard/.data` | write elsewhere (tests) |
| `today` | today's local date | calendar anchor for every derived date |
| `manifestPath` | — | see 2.1 |
| `dryRun` | `false` | build the records, write nothing |

`counts`, as measured:

```json
{ "persons": 14, "children": 25, "enrolments": 18,
  "byStatus": { "new": 5, "confirmed": 4, "paid": 7, "completed": 2 },
  "unpaidPayments": 5, "proofsUploaded": 6, "proofsToVerify": 2,
  "threadsOpen": 3, "ledgerItems": 6, "stories": 4 }
```

**Determinism.** A fixed mulberry32 PRNG seeded from `0x5eed1a + hash(slug)`
drives references, day offsets, file sizes and word counts. Verified: two seeds
into separate temp `dataRoot`s with `today: "2027-03-04"` produce **8
byte-identical JSON files** (`_meta.json` differs only in `seededAt`).
Everything date-shaped is relative to `reference`, which is stored in
`_meta.json` — so the deadline on screen does not drift a day at midnight.

`records` is the same data the files hold, returned in memory
(`{ persons, enrolments, payments, proofs, threads, ledger, stories, deadline,
currency }`) for a test that must not touch the disk.

**The manifest can switch part of the demo off.** With
`operations.features.proofs: false` (aurora) the seeder creates **no proof
records at all**, and HOY line 2 reads "esta escuela no recibe resguardos: el
manifiesto apaga operations.features.proofs" instead of counting a queue this
school does not have.

### 2.3 `open(manifestOrPath, opts?) → store`

Reads the JSON files fresh **on every method call** (no cache, on purpose — the
rule Studio follows: what is on disk is the truth). Throws, naming the
directory and the missing files, when nothing was seeded:

```
data.mjs: demo store incomplete in /…/dashboard/.data/lotus (missing persons.json, …)
— run seedDemo("…/schools/lotus.yaml") first
```

### 2.4 `ensureDemo(manifestOrPath, opts?) → store`

`open()`, seeding first **only when files are missing**. This is the one line
your server should call at boot.

### 2.5 Shared helpers

| export | example | note |
|---|---|---|
| `ENROLMENT_STATUSES` | `["new","confirmed","paid","completed"]` | group order |
| `PROOF_STATES` | `["verified","pending","rejected","none"]` | `pending` = `verified: null` |
| `todayISO(date?)` | `"2026-11-21"` | local date |
| `addDays(iso, n)` | `"2026-11-28"` / `null` | UTC day arithmetic, DST-proof |
| `daysBetween(a, b)` | `7` / `null` | b − a, in days |
| `currencySymbol("THB")` | `"฿"` | unknown codes fall back to `"XXX "` |
| `formatAmount(9500,"THB","term")` | `"฿9,500 / term"` | hand-grouped, ICU-independent |
| `DATA_ROOT` | `/…/dashboard/.data` | absolute |

---

## 3. The store, method by method

`store` keys: `slug, dir, manifestPath, manifest, dataRoot, meta(), records(),
today(), pipeline(), money(), people(), stories()`. `store.manifest` is the
parsed manifest, so nobody has to read it twice.

### 3.1 `meta() → the _meta.json object | null`

```jsonc
{ "kind": "topos-dashboard-demo", "slug": "lotus",
  "school": "Lotus Valley International School",
  "manifestPath": "/…/schools/lotus.yaml",
  "seededAt": "2026-11-21T09:29:46.452Z", "reference": "2026-11-21",
  "generatedFrom": "dashboard/data.mjs seedDemo()", "prngSeed": 6221082,
  "programCodes": ["LVIS-ROBOTICS-TERM", "LVIS-MUSIC-TERM"],
  "features": { "dashboard": true, "parentPortal": true, "proofs": true, "marketingEngine": true },
  "deadline": { "programCode": null, "programName": null, "date": "2026-11-28",
                "earlyBird": false,
                "source": "provisional: 7 days from the seed date (no price.deadline in the manifest)" },
  "currency": "THB", "counts": { …see 2.2… } }
```

**The deadline rule.** The nearest `price.deadline` among the manifest's
programs wins, with its `earlyBird` flag and its program name (aurora:
`2027-05-15`, "Astronomy & Rocketry Lab", `source: "manifest"`). If no program
publishes one, the seeder writes a **provisional** date 7 days after
`reference` and labels it — the card then reads "provisional: el manifiesto no
fija ninguna". A date the manifest never declared is never shown as if it had.

### 3.2 `today() → { date, counts, lines[4], deadline }`

Measured on lotus:

```js
{ date: "2026-11-21",
  counts: { families: 14, children: 25, enrolments: 18,
            byStatus: { new: 5, confirmed: 4, paid: 7, completed: 2 },
            threadsOpen: 3, proofsToVerify: 2, proofsRejected: 1,
            unpaid: 5, overdue: 2, unpaidTotal: 39400, paidTotal: 110000,
            currency: "THB", expensesThisMonth: 117500, ledgerThisMonthItems: 4 },
  lines: [ …4… ],
  deadline: { …meta.deadline…, daysLeft: 7 } }
```

Line shape: `{ key, label, value, unit, detail, empty, href, tone }`. The four
lines, in order, with lotus values today:

| # | `key` | `value` | `tone` | `href` | label |
|---|---|---|---|---|---|
| 1 | `threads` | `3` (number) | `sky` | `?view=pipeline#conversaciones` | Conversaciones sin respuesta |
| 2 | `proofs` | `2` (number) | `lime` (`grey` when the feature is off) | `?view=pipeline#resguardos` | Resguardos por verificar |
| 3 | `unpaid` | `5` (number) | `orange`, `coral` when anything is past due | `?view=money` | Matrículas sin pago registrado |
| 4 | `deadline` | `"7"` (**string**: days left; `"—"` if there is no date at all) | `plum` | `?view=school` | Fecha límite más próxima |

`empty: true` means no work in that line and the card prints "Nada pendiente" —
nothing is zero-filled to look busy, and no line is ever dropped. `detail` is
one sentence with substance (oldest wait, the refs pending, how much money is
out, whether the deadline came from the manifest). Every `href` lands somewhere
that exists: the smoke script fails if a `#anchor` is missing from the page the
line points at.

### 3.3 `pipeline() → { order, groups, total, totals, threads, proofs }`

```js
{ order: ["new","confirmed","paid","completed"], total: 18,
  totals: { paid: 13, unpaid: 5 },
  groups: [ { status, count, unpaid, total, currency, items[] }, …4… ],
  threads: { count: 5, open: 3, answered: 2, items[] },
  proofs:  { count: 6, pending: 2, rejected: 1, verified: 3, items[] } }
```

`groups[i].total` = money still outstanding in that group; items are sorted
newest request first. The inbox and the slips ride along because HOY points at
them (`#conversaciones`, `#resguardos`) — a count on screen always has a page
behind it.

**Enrolment row** (`groups[i].items[j]`, 32 keys):

```
id, ref ("LVIS-GF2WF9"), child ("Mint"), childAge (11), parentName, personId,
programCode, programName, programPlace, programAges ("10-17"),
ageInsideRange (true|false|null),
amount, amountRecorded, amountMatchesManifest, pricePublished, currency, unit,
status, requested, confirmedAt,
paid, method ("bank-transfer"), due|null, paidAt|null, overdue, daysToDue|null,
proofState ("verified"|"pending"|"rejected"|"none"),
proofFilename|null, proofSize|null, proofUploaded|null, proofNote|null,
inManifest
```

The manifest is the authority, and the row says when the two disagree:

* `amount` **is the manifest's published price** for `programCode` — that is
  what the page prints. `amountRecorded` is what the file says, and
  `amountMatchesManifest: false` puts a red chip on the row.
* `programName: null` + `inManifest: false` when the code is not in the
  manifest: the view shows the code and "no está en el manifiesto" instead of
  inventing a name.
* `ageInsideRange: false` means the child's age is outside the program's
  declared `ages` (lotus: 0 of 18; aurora, whose ranges differ: 9 of 18 — the
  chip is there so a desk sees the tear). `null` = no parsable range.
* `pricePublished: false` prints "precio no publicado" instead of the figure
  (aurora's Yunnan Textiles & Clay Studio: a price decided internally must not
  reach a family).

**Thread row** (`threads.items[j]`, open first): `id, subject, status,
parentName, email, locale, children ("Mint, Kaew"), refs[], funnel, lastAt,
lastFrom ("parent"|"desk"), preview, waitingDays`.

**Proof row** (`proofs.items[j]`, pending first): `id, ref, child, parentName,
programCode, amount, currency, paid, state, filename, size (bytes), uploaded,
verifiedAt|null, note|null`. `verified` in the file is literally
`true | false | null` — `null` is "uploaded, nobody has looked", which is what
HOY line 2 counts.

### 3.4 `money(opts?) → { month, asOf, currency, families, familiesWithoutEnrolments, totals, expenses }`

`opts.month` (`"YYYY-MM"`) picks a different expense month.

```js
{ month: "2026-11", asOf: "2026-11-21", currency: "THB",
  totals: { families: 14, paid: 110000, due: 39400, overdue: 13600 },
  familiesWithoutEnrolments: 0,
  families: [ { personId, name, email, locale, children ("Mint, Kaew"),
                refs [], enrolments, programs [codes],
                paid, due, overdue, nextDue|null, total, currency,
                state ("settled"|"overdue"|"waiting") }, … ],
  expenses: { month, items [raw ledger rows], count, total, empty,
              newestMonthWithData, otherMonths: [ { month, count, total } ] } }
```

Money is a plain **number** in `paid / due / overdue / total / amount` (whole
units, no cents) — print it with `formatAmount()`. `state` is `settled` when
`due === 0`, `overdue` when an unpaid `due` is already before `asOf`, `waiting`
otherwise; the view uses `asOf` to say "vence 2026-11-24" or "vencía el
2026-11-17". `expenses.items` are untouched `ledger.json` rows:

```jsonc
{ "id": "led-0001", "title": "Valley Campus rent — floors 2-3", "amount": 42000,
  "currency": "THB", "category": "campus", "month": "2026-11", "date": "2026-11-03",
  "status": "hecho",   // "hecho" once the date has passed, "previsto" before it
  "note": "gasto de la escuela, no de una familia" }
```

If the current month genuinely has no expenses, `expenses.empty` is `true`,
`total` is `0` and `newestMonthWithData` names the most recent month that does:
the tab prints that sentence instead of an empty box or a stale figure.

### 3.5 `people(q?, opts?) → { query, totalFamilies, count, shown, limited, limit, items }`

Case-insensitive substring match over **parent name, child names, email and
enrolment reference**. Empty/missing query → the first 8 families
(`limited: true, limit: 8`), so the tab is never a blank wall; a query returns
every match (`limit: null`). `opts.limit` changes the default.

`items[j]`: `{ personId, name, email, phone, locale, children [{name, age}],
refs[], programs [codes], enrolments, paid, due, firstContact, lastThread }`.
No currency on these rows — take it from the manifest or `money().currency`.
`query` is the trimmed lowercased needle (echo it, escaped, if you want the
page to show what was searched).

### 3.6 `stories() → { blogEnabled, marketingEnabled, mediaConsent, count, byStatus, items, editorHere: false }`

The content queue (`content.json`), newest first. `blogEnabled` is
`manifest.content.blog`, `marketingEnabled` is
`operations.features.marketingEngine`, `mediaConsent` is
`manifest.content.mediaConsent` — so the tab can say whether this school even
has a blog, and the editor is explicitly not here (`editorHere` is always
`false`). `items[j]`: `{ id, title, status, locale, author, updated, wordCount,
note }`; locales are clamped to `identity.locales`.

### 3.7 `records() → { persons, enrolments, payments, proofs, threads, ledger, content }`

The raw arrays, for anything this file does not already answer (a family detail
page, an export). Shapes in §4.

---

## 4. The JSON records on disk

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
  "paid": true,                        // a person marked it; there is no gateway
  "due": null,                         // a date when unpaid, null when paid
  "paidAt": "2026-10-20", "proofId": "prf-0001",
  "markedBy": "admissions desk (manual)" }

// proofs.json — feature: proofs (the uploaded slip)
{ "id": "prf-0001", "paymentId": "pay-0001", "enrolmentId": "e-0001", "ref": "LVIS-GF2WF9",
  "filename": "transfer-20261019-nattaya.png", "size": 989579, "uploaded": "2026-10-19",
  "verified": true,                    // true | false | null ← null = nobody has looked
  "verifiedAt": "2026-10-23", "note": "matches the transfer on the bank statement" }

// threads.json — primitive: communication
{ "id": "th-0001", "personId": "p-0003", "parent": "Waruni Prasertkul",
  "email": "waruni.p@lvis.example", "funnel": "admissions@lvis.example",
  "subject": "Robotics — does a 12-year-old need to bring a laptop?",
  "status": "open",                    // open | answered
  "lastAt": "2026-11-20", "lastFrom": "parent",
  "preview": "We have an old Chromebook at home, is that enough for the making sessions?",
  "waitingDays": 1 }

// ledger.json — school expenses (never family money)
{ "id": "led-0001", "title": "Valley Campus rent — floors 2-3", "amount": 42000,
  "currency": "THB", "category": "campus", "month": "2026-11", "date": "2026-11-03",
  "status": "hecho", "note": "gasto de la escuela, no de una familia" }

// content.json — primitive: content (the STORIES queue)
{ "id": "st-0001", "title": "What a robot team learns when it loses", "status": "draft",
  "locale": "en", "author": "Mint's mum, desk notes", "updated": "2026-11-19",
  "wordCount": 755, "note": "borrador de demo; el editor real vive en el módulo marketing" }
```

`ref` = `<program prefix>-6 chars`: the prefix is the first segment of the
program code (`LVIS-…`, and `AUR-…` at aurora), and the alphabet leaves out
`I O 0 1` so a reference survives being read over the phone. One payment per
enrolment, at most one proof per payment — a v0 simplification, stated rather
than hidden.

---

## 5. `views.mjs` — its 5 exports

`renderDashboard, esc, DASHBOARD_VIEWS, STATUS_LABELS, default`

### 5.1 `renderDashboard(manifest, store, session, opts?) → string`

One complete `<!doctype html>` page, UTF-8, `lang="es"`. **Never throws**: a
missing or broken store renders an honest error card, an unknown `view` renders
an honest "no existe" card. It reads the manifest YAML from disk once (SCHOOL
tab) and touches nothing else.

| arg | what it must be |
|---|---|
| `manifest` | the parsed manifest, or `store.manifest`. `null` is tolerated — the chrome falls back to "Escuela sin nombre" |
| `store` | the object from `open()` / `ensureDemo()` |
| `session` | `{ email, role }` from **your** auth, or `null` → the badge reads "sin sesión" and the email slot reads "demo local, nadie autenticado" |
| `opts.view` | `hoy \| pipeline \| money \| people \| stories \| school`; `desk`/empty → `hoy`; anything else → the 404 card |
| `opts.q` | the PEOPLE search string — read it yourself: `new URL(req.url, base).searchParams.get("q")` |
| `opts.folded` | set it **only after a write to the manifest actually succeeded** (your `/school/save` redirect uses `?view=school&folded=1`). The SCHOOL tab then says the text on screen is a fresh read of the disk *because of that save*; without the flag the page never mentions a save. The smoke script checks both halves of that promise |

Output size per tab (lotus): hoy 13.4 KB · pipeline 29.5 · money 19.7 ·
people 18.3 · stories 13.2 · school 16.6. **No `<script>` in any of them.**

### 5.2 `esc(value) → string`

`& < > " '` → entities; `null`/`undefined` → `""`. Applied to **every** string
that came from disk, the manifest, the URL or a person. The `sub:` argument of
the internal `head()` is the only place in this module that takes trusted HTML
— escape data before putting it inside.

### 5.3 `DASHBOARD_VIEWS`, `STATUS_LABELS`, `default`

`["hoy","pipeline","money","people","stories","school"]` — validate `?view=`
against it — and `{ new: "Nuevas peticiones", confirmed: "Confirmadas",
paid: "Pagadas", completed: "Terminadas" }`, the words PIPELINE prints.
`default` is `renderDashboard`.

### 5.4 What each tab is

| tab | on screen |
|---|---|
| **Hoy** | the four morning lines as clay cards with the real numbers; a chip strip (families / children / enrolments / per-status / overdue); and a note saying "pagada" was marked by a person, not by a gateway |
| **Pipeline** | `#conversaciones` — subject, family, refs, last message preview with who said it, days waiting → the four status groups — reference, child + age, parent, program **name** and place from the manifest, amount **from the manifest price**, paid/not chip, proof chip with filename · size · upload date → `#resguardos` — every slip with its `true/false/null` state (plus a warning card and an empty queue when the manifest turns `proofs` off) |
| **Money** | per-family table (refs, children, cobrado, pendiente, vencido chip, next due as "vence"/"vencía") with a totals row; then the month's expenses and their total; then the manifest's own price list, so every figure has a source on the same page |
| **People** | `<form method="get">` with `<fieldset>/<legend>`, `<label for="q">` + `<input id="q" name="q" type="search">`, hidden `view=people`, `.btn.min-h-11` submit and a "Limpiar" ghost link when a query is live; the results table; three different honest messages: no query ("las primeras 8 de 14"), matches ("5 familias coinciden"), no matches (what to try + how many families exist) |
| **Stories** | the draft queue (title, status chip, locale · words · last touched, author) + "El editor completo llega con el módulo marketing" + a warning card when `content.blog` is false, with the marketing/blog/consent state of the manifest in the subtitle |
| **Escuela** | the current YAML text read from disk in `<pre class="yaml" tabindex="0">`; the manifest's own palette as swatches; what it declares (entity / groupsBy / ages, locales, primitives, funnels) and its programs with prices — read-only, with the note that editing, folding and validating live in Topos Studio (`manifold/studio.mjs`), reachable at `?view=school` |

### 5.5 The look (v2 tokens copied — nothing imported from `site/`)

cream `#efeeec` · navy `#001433` · orange `#ff7714` · sky `#3bd3fd` · lime
`#eef773` · coral `#fb4450` · green `#035d44` · plum `#46022f` · card `#fff`;
radius `1.75rem`; `.clay` shadow `0 10px 0 rgba(0,20,51,.08), 0 24px 48px
rgba(0,20,51,.10)` with the squish on hover; the same Google Fonts request as
`site/index.html` (Fredoka + Nunito, both `preconnect`s included).

Text pairs are all ≥4.5:1 — navy on cream 14.7, on white 16.9, on orange 6.4,
on sky 9.7, on lime 13.0, on coral 4.8; cream on navy 14.7, on plum 11.8, on
green 7.0; `--muted #3b4658` on cream 7.0 is the only secondary text colour.
`:focus-visible{outline:3px solid navy}` (lime inside the dark badge area),
`prefers-reduced-motion: reduce` kills every transform and transition, tables
scroll horizontally, the header wraps under 640 px, and there is a skip link.

---

## 6. What your server has to do (nothing here does it)

`dashboard/server.mjs` (the integrator's zone) already does exactly this, and
this is the shape my modules are tested against:

```js
import { loadManifest } from "./manifold/core.mjs";
import { open, seedDemo } from "./dashboard/data.mjs";
import { renderDashboard } from "./dashboard/views.mjs";

const manifest = loadManifest(SCHOOL);   // an absolute path to schools/x.yaml
seedDemo(SCHOOL);                        // boot order that works
const store = open(SCHOOL);

// GET /?view=people&q=nattaya   (mounted at / — the anchors are all relative)
const url = new URL(req.url, "http://localhost");
res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
res.end(renderDashboard(manifest, store, who, {           // who = your auth.verify()
  view: url.searchParams.get("view") ?? "hoy",            // null, "" and junk are safe
  q: url.searchParams.get("q") ?? "",                     // a hostile q is escaped
  folded: url.searchParams.get("folded"),                 // after a real manifest save
}));
```

`ensureDemo(manifestOrPath, { manifestPath })` is the alternative when you do
not want to seed on every boot: it seeds only if the files are missing.

What the HTML already asks your server for:

* `GET …?view=<one of the six>` — anchors are relative, so the page works
  mounted at any path.
* `GET …?view=people&q=…` — the search form is `method="get"` with `action=""`
  (it submits to the current URL) and a hidden `view=people`.
* `POST /logout` — the header's logout form. **That route is yours**; v0 keeps
  no session to invalidate.
* `session = { email, role }` — from your cookie/session. Nothing here
  authenticates or authorises anybody: an unauthenticated request still
  renders, badged "sin sesión". Put the gate in front.
* `manifestPath` — pass it. Without it the SCHOOL tab has no YAML to read, and
  it says so instead of printing an invented manifest.

Every store call re-reads the JSON files, so a hand edit shows up on refresh.
If you want a cache, put it above these methods, not inside them.

---

## 7. How this was verified (real numbers, real exit codes)

```
$ node dashboard/smoke-data.mjs ; echo $?     # 31 checks
…
OK — 0 failing checks · store at /…/dashboard/.data/lotus
0
```

The script seeds for real; prints the four morning lines and the money totals;
seeds **twice into throwaway directories** to prove byte-identical output;
opens the store and asserts the promised mix (14 families · 25 children · 18
enrolments · new 5 / confirmed 4 / paid 7 / completed 2 · 5 unpaid · 2 proofs
to verify · 3 open threads · 1 rejected slip · 4 expenses in the current
month); then renders all six tabs plus an unknown one and fails if a page
contains `undefined`, `NaN`, `[object Object]`, `<script>`, a missing school
name, a missing clay / Fredoka / focus-visible / reduced-motion affordance, or
the phrases **`pago recibido` / `payment received` / `booking confirmed` /
`confirmation email`** — house rule 1: a screen may not claim what the system
has not done, and `paid: true` here means a person checked the bank statement.
It also checks that every HOY link lands on an anchor that exists, that a
hostile manifest (`<script>alert("x")</script> & Cía` as the school name) is
escaped, that a null store degrades with a message, and finally that the same
code **bends** to `schools/aurora.yaml`: own slug, CNY money, unpublished
price, 4 programs, `proofs: false` → 0 slips and an explained empty line, and
the manifest's own `2027-05-15` early-bird date preferred over any provisional
one.

```
$ node dashboard/data.mjs schools/lotus.yaml         # seed + print the numbers
seeded lotus → /…/dashboard/.data/lotus
today 2026-11-21: Conversaciones sin respuesta 3 · Resguardos por verificar 2 · Matrículas sin pago registrado 5 · Fecha límite más próxima 7
money: cobrado ฿110,000 · pendiente ฿39,400 · gastos 2026-11 ฿117,500

$ node dashboard/smoke-data.mjs --html pipeline > /tmp/pipeline.html
$ node dashboard/smoke-data.mjs --keep           # leave the temp store to inspect
```

`--html <view>` prints one page to stdout and writes nothing into the repo.

## 8. Limits of v0 (stated, not hidden)

One school per store; multi-tenant routing is the slug plus your session.
No writes from the dashboard: the JSON files change through the seeder or
through a human with an editor, never through a request. No uploads —
`proofs.json` describes slips a real system would have received; no such file
exists on disk and no path serves one. No email, no password reset, no webhook,
no background job, no roles beyond the one badge the session carries.
`payments.method` is always `bank-transfer` because that is the only route
these schools have. No client JS, so the search is a GET and the pipeline is
one read per refresh.
