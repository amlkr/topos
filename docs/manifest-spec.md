# Topos School Manifest — v0

The human-readable companion to `spec/manifest.schema.json` (JSON Schema draft-07,
`$id: https://topos.school/spec/manifest.schema.json`). Where this document and the
schema disagree, the schema wins — this file explains, it does not define.

A manifest is one YAML document describing one school. **All nine top-level fields are
required**: `apiVersion`, `kind`, `identity`, `brand`, `topology`, `programs`,
`communication`, `content`, `operations`. There is no optional section: a school either
states all of itself or it is invalid. Every field below is transcribed from the schema;
nothing here adds a field the schema does not have.

Two notes on the shape of the v0 schema before the sections:

- The schema is **open**: it does not set `additionalProperties: false`. Unknown keys do
  not fail validation — they are simply not part of the contract, and the engine will
  never read them. A manifest full of invented keys validates and renders; the keys are
  dead weight. Write less, mean it.
- The engine's validator (`manifold/core.mjs`) is a deliberate subset of draft-07 —
  `const`, `enum`, `type`, `required`, `properties`, `items`, `minItems`, `minimum`.
  Do not rely on richer draft-07 features; the validator will not enforce them.

---

## 1. Identity

Who the school is and where it lives.

| Field | Required | Type | Meaning |
|---|---|---|---|
| `apiVersion` | ✅ | const | Must be exactly `"topos/v0"`. Pins the contract version so a v1 engine never silently accepts a v0 document. |
| `kind` | ✅ | const | Must be exactly `"School"`. v0 has one document type; the constant says so. |
| `identity.name` | ✅ | string | The school's name as it signs itself. |
| `identity.domain` | ✅ | string | The school's own domain. A school is not a subpage of the platform — it is a place with its own door. |
| `identity.defaultLocale` | ✅ | string | The primary language. Today the engine renders pages in this locale only (see §9). |
| `identity.locales` | ✅ | array of string, `minItems: 1` | The set of locales the school operates in. Declaration, not routing. |
| `identity.altName` | ⬜ | string | Short or alternate name (an acronym, a local name). |
| `identity.tagline` | ⬜ | string | One line of promise. Shown in the hero; if it cannot be kept, do not write it. |

## 2. Brand

What the school looks like. The engine maps the palette directly onto CSS custom
properties (`--brand`, `--deep`, `--sun`, `--teal`, `--ink`, `--paper`, `--shell`), so
every required key is a slot the renderer actually fills.

| Field | Required | Type | Meaning |
|---|---|---|---|
| `brand.palette.brand` | ✅ | string | Primary colour. |
| `brand.palette.brandDeep` | ✅ | string | Dark companion — header, footer, hero. |
| `brand.palette.sun` | ✅ | string | Accent; calls to action. |
| `brand.palette.ink` | ✅ | string | Text on light ground. |
| `brand.palette.paper` | ✅ | string | Page background. |
| `brand.palette.shell` | ✅ | string | Card/nav surface. |
| `brand.palette.teal` | ⬜ | string | Secondary accent (used for Early-Bird notes and asides). |
| `brand.fonts.display` | ✅ | string | Heading face. |
| `brand.fonts.body` | ✅ | string | Body face. The only optional font is `hand` — a handwriting face. |

A school may pick any colours and any fonts. What it may not pick is a different set of
slots: the palette keys are the shared nervous system, so a manifold can restyle a
school without ever re-learning where its yellow lives.

## 3. Topology

How this school folds the shared substance into its own coordinates. This is the whole
idea in three fields: the engine never hardcodes "camp" or "season" — the school says
what its unit and its grouping are called, and everything downstream bends.

| Field | Required | Type | Meaning |
|---|---|---|---|
| `topology.entity` | ✅ | string | What this school calls a program: `camp`, `activity`, `course`, … The renderer pluralises it into headings. |
| `topology.groupsBy` | ✅ | string | How programs are grouped: `season`, `term`, `level`, … |
| `topology.agesRange` | ✅ | string | The span served, as the school states it (e.g. `"4-17"`). Free text — a string, not a range type, because schools describe ages differently. |

`lotus.yaml` bends this on purpose: `entity: activity`, `groupsBy: term`. Nothing in the
engine changed. That is the test of the fold.

## 4. Programs

The array of things a family can enrol in. `programs` is a top-level required array with
`minItems: 1`: a school with no programs is not a school, it is a poster.

Per program, **all of** `code`, `name`, `place`, `ages`, `season`, `price`, `door` are
required:

| Field | Required | Type | Meaning |
|---|---|---|---|
| `code` | ✅ | string | Stable identifier. Must be unique across the school — duplicates are a contract problem, not a schema one (§8). It becomes the enrolment URL (`/enrol/<code>`). |
| `name` | ✅ | string | Program name as advertised. |
| `place` | ✅ | string | Where it happens. Physical schools state a physical place. |
| `ages` | ✅ | string | Who it is for, as a string (e.g. `"10-17"`). |
| `season.starts` / `season.ends` | ✅ / ✅ | string | The run window. Both dates or neither section exists. |
| `price.amount` | ✅ | number, `minimum: 0` | The figure. |
| `price.currency` | ✅ | string | Its currency (`THB`, `USD`, …). |
| `price.unit` | ✅ | string | What the amount is per: `term`, `week`, `session`. A price without a unit is a rumour. |
| `price.published` | ✅ | boolean | Whether the figure is shown publicly. A school may carry an internal price and not publish it. |
| `price.earlyBird` | ⬜ | boolean | Early-Bird rate in effect — only meaningful together with `deadline`. |
| `price.deadline` | ⬜ | string | When the early window closes. |
| `door` | ✅ | string | The enrolment route on the school's own site (a path like `/enrol/robotics`). The door belongs to the school, not the platform. |

## 5. Communication

Where a real human can be reached. Every field is required; `funnels` is `minItems: 1`.

| Field | Required | Type | Meaning |
|---|---|---|---|
| `communication.funnels[]` | ✅ | array ≥ 1 | Named postboxes, each with `key`, `address`, `purpose` — all three required. `key` is the machine name (`admissions`, `general`); `purpose` is the human promise ("Places and enrolment"). A funnel without a purpose is a mailbox nobody knows how to answer. |
| `communication.phone` | ✅ | string | A reachable number. |
| `communication.postalAddress` | ✅ | string | A mailing address. |

The addresses land verbatim in the site footer as `mailto:`/`tel:` links. Publishing an
address is publishing a promise that someone reads it — hence the contract rule in §8,
which enforces shape only; proving the mailbox is an operator's act, not a validator's.

## 6. Content

Both fields required — even the answers "no" and "none" must be stated.

| Field | Required | Type | Meaning |
|---|---|---|---|
| `content.blog` | ✅ | boolean | Whether the school publishes a blog. Not optional-to-exist; it is either on or off. |
| `content.mediaConsent` | ✅ | enum | One of `"pdpa"`, `"gdpr"`, `"none-required"`. Which consent regime governs photos and video of children. `none-required` is a claim, not a default — a school that says it must be able to defend that. |

## 7. Operations

How the school runs.

| Field | Required | Type | Meaning |
|---|---|---|---|
| `operations.primitives` | ✅ | const array | Must be **exactly** `["persons", "enrolments", "payments", "communication", "content"]`. |
| `operations.features.dashboard` | ✅ | boolean | Staff desk on/off. |
| `operations.features.parentPortal` | ✅ | boolean | Parent-facing area on/off. |
| `operations.features.proofs` | ✅ | boolean | Payment-proof handling on/off. |
| `operations.features.marketingEngine` | ✅ | boolean | Outbound engine on/off. |

### The five primitives, and why they are `const`

A school may rename everything else — its entity, its grouping, its colours, its doors.
These five are not vocabulary, they are **substance**: the organs every school must have
for the manifold to be one manifold.

- **persons** — someone exists, with a name and a relationship to the school.
- **enrolments** — a request for a place, which a human grants.
- **payments** — money is owed, offered, and marked received by a person (the primitive
  exists; a gateway does not — v0 shows prices, it never charges them).
- **communication** — messages go out and come back, and both are recorded.
- **content** — the school tells its families things.

The schema enforces them with `const` on the whole array, and the engine's validator
compares the JSON — so the values, the count, **and the order** must match exactly.
Anything else is an error, not a variation. The reason is the README's own claim:
*"locally its own coordinates, globally one substance."* If schools could swap a
primitive, two manifests would describe different kinds of school and no shared engine
could serve both — the manifold would silently become a pile of tenants. The five
primitives are precisely the part of the contract that freedom is exercised *on*, never
*inside*.

`features`, by contrast, are switches: four booleans, all required, each freely
`true` or `false`. Opting out of the marketing engine is allowed; opting out of
payments is not — that would not be a different school, it would be a hole.

---

## 8. Contract rules beyond the schema

JSON Schema says a document is well-shaped. Three further rules come from the engine
(`contractProblems()` in `manifold/core.mjs`) and say a document is *honest*. A manifest
that passes the schema but fails these is refused.

1. **No duplicate program codes.** Two programs sharing a `code` would share one door —
   the second silently overwrites the first's enrolment page. Codes are unique per
   school, enforced by the engine, not by the schema.
2. **A published price must be a real amount.** If `price.published` is `true`, then
   `amount > 0`. The schema allows `0` (a real, unpublished, to-be-agreed figure); the
   contract forbids *publishing* a zero. The message names the reason: *"no invented
   figures."* A number shown to families must be a number someone intends to charge.
3. **A funnel address must be an address.** `address` must pass an email-shape check
   (`local@domain.tld`). The rule as written in the engine: *"it must be a real, proven
   mailbox."* The validator can only prove shape; **proof of the mailbox is the
   operator's duty** — a published address must have been written to and answered in
   its inbox before launch. The schema and the example below use `.example` domains
   precisely to mark "not proven, do not believe."

---

## 9. What v0 deliberately does not say

v0 is a contract, not a roadmap. These are absences by decision — each one is something
an honest v0 could not state without inventing machinery it does not have:

- **No auth model.** No credentials, no sessions, no roles, no login fields anywhere in
  the schema. `parentPortal` and `dashboard` declare *that* the area exists, not *who*
  gets in. Anyone who writes v1 auth writes it against a manifold that today has no
  concept of a user beyond `persons`.
- **No data migration.** There is no `v0 → v1` story, no versioned field renames, no
  upgrade hooks. `apiVersion` is a const so wrong versions are *rejected*, not
  translated. If a v1 exists, migration will be its first real design problem.
- **No multi-locale content routing.** `locales` declares the set of locales a school
  lives in; nothing maps content between them. The engine renders one site, in
  `defaultLocale`, with English chrome (`"Enrol"`, `"Our activities"`). A three-locale
  manifest like `lotus.yaml` is a statement of intent the engine cannot yet honour —
  the field is honest about the school's reality, the spec is honest about its limits.
- **No payment collection.** `price` is a disclosure, never a charge: there is no
  gateway field, no checkout, no "payment received" claim anywhere in the surface.
  Payment confirmation is a human act (the `payments` primitive), and v0 refuses to
  encode a promise its engine cannot keep.
- **No capacity, enrolment, or people records.** `programs[].ages` is a string for a
  reason. The manifest describes the offer; the roster, the places left, and the
  family data belong to the primitives at runtime, not to the contract at rest.
- **No consent-capture workflow.** `mediaConsent` names the regime; the form, the
  signature, and the storage of consent are outside v0.

This list is the spec's way of keeping its own Rule of Thom: what cannot be expressed in
the manifest is not a feature — and v0 will not imply features it has not expressed.

---

## 10. The Rule of Thom

> **"If it cannot be expressed in the manifest, it is not a feature — it is a tear."**

Every school capability must land as a field: a new switch goes under `features`, a new
disclosure under `programs` or `communication`. A capability that has no field is
something one school has and the contract does not know about — invisible to the engine,
invisible to the manifold, a tear in the shared substance. The repair is never "add it
in code for this school anyway"; the repair is to extend the schema (v1), or to accept
that it is not a feature of Topos. The open-schema behaviour in §1 is the warning light,
not the loophole: unknown keys validate silently, and render nothing, forever.

---

## 11. A minimal valid example

The smallest manifest that passes both the schema and all three contract rules — one
program, one funnel, every required field present. Trimmed from `schools/lotus.yaml`.

```yaml
apiVersion: topos/v0
kind: School

identity:
  name: River School
  domain: river.example
  defaultLocale: en
  locales: [en]

brand:
  palette:
    brand: "#0f6e5c"
    brandDeep: "#083d33"
    sun: "#e8a33d"
    ink: "#1c2321"
    paper: "#f6f8f7"
    shell: "#ffffff"
  fonts:
    display: Fraunces
    body: system

topology:
  entity: camp
  groupsBy: season
  agesRange: "5-12"

programs:
  - code: RIV-SUMMER-1
    name: Summer Discovery Camp
    place: Riverside grounds
    ages: "5-12"
    season: { starts: "2027-07-05", ends: "2027-07-30" }
    price: { amount: 450, currency: USD, unit: week, published: true }
    door: /enrol/summer

communication:
  funnels:
    - key: admissions
      address: admissions@river.example
      purpose: Places and enrolment
  phone: "+10000000000"
  postalAddress: "1 River Lane, Example Town"

content:
  blog: false
  mediaConsent: none-required

operations:
  primitives: [persons, enrolments, payments, communication, content]
  features:
    dashboard: true
    parentPortal: false
    proofs: true
    marketingEngine: false
```

`river.example` passes the address-shape rule but is not a proven mailbox — `.example`
is the flag that says exactly that. Before a real school ships, §8 rule 3 is completed
by a human, not by the validator.

Check your own manifest with the engine:

```
node manifold/cli.mjs validate schools/your-school.yaml
```
