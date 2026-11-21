# MODULE-API.md — the contract for Topos dashboard modules

A module is ONE file: `dashboard/modules/<key>.mjs`. You own exactly that
file (plus, if you wish, tests in `dashboard/tests/<key>.test.mjs`). You
import `../module-kit.mjs` and nothing else from the dashboard internals.
The server discovers modules by reading `dashboard/modules/*.mjs` at boot
— no registration file to fight over.

## Required exports

```js
export const meta = {
  key: "crm",                       // [a-z-]{2,16}, unique, becomes /m/<key>
  label: "CRM",                     // nav label (Spanish, school-friendly)
  order: 10,                        // nav position (core views are 0-9)
  roles: ["director", "admissions"],// who sees the tab AND may act; [] = all staff
};

// GET /m/<key> → body HTML (NOT a full page — the shell wraps it)
export function render(ctx) { return "<section>…</section>"; }

// optional: POST /m/<key> with URL-encoded body → redirect or html
export function handle(ctx, form) { // form: URLSearchParams
  // mutate your jsonStore, then:
  return { redirect: "/m/" + meta.key };   // or { html: "…" } for 422-style feedback
}
```

## ctx (provided by the server)

```
{ manifest, store, session: {email, role}, slug, params: URLSearchParams (GET query),
  kit: <module-kit re-export, optional use> }
```

## Rules (the contract bites)

1. **Storage**: `jsonStore(slug, meta.key, defaultShape)` from module-kit.
   One file per school per module. Atomic. Never write outside
   `dashboard/.data/`. Never touch another module's file.
2. **Data**: fictional only (Lotus Valley families). **Zero references to
   the client repo** (docs/BOUNDARIES.md) — no a4k, no Esara, no Supabase,
   no Vercel.
3. **HTML**: every dynamic string goes through `esc()`. Use the kit parts
   (head/card/empty/field/select/submit) and the existing shell classes
   (`.section .kicker .page-title .sub .clay .card .grid .callout .btn
   .table .chip .note`). No client JavaScript. No new CSS unless added via
   a `<style>` inside YOUR body html, scoped to your elements.
4. **Roles**: the server already hides the tab and answers 403 for
   non-listed roles; still, check `ctx.session.role` in `handle()` for
   destructive actions (defence in depth).
5. **Honesty**: empty states say "no hay X todavía", never invented
   numbers; a demo module labels itself demo where that matters.
6. **Verify before reporting**: boot the server
   (`node dashboard/server.mjs`), log in with curl
   (`director@lotus.example` / `topos-demo`), GET /m/<key> (200 + your
   content), POST one real write, GET again and see it. Report the exact
   commands and exit codes. Kill any server you started on port 8090
   ONLY if you started it (the integrator runs one too — if EADDRINUSE,
   use TOPOS_DASHBOARD_PORT=8095 for your test).

## Addendum — public family routes (portal de padres)

A module may ALSO serve families without a staff session:

```js
export const publicMeta = { path: "familias" }; // → GET/POST /familias
export function renderPublic(ctx, form) { /* FULL page html (own <html> shell),
   or { redirect, html } on POST. ctx.query = URLSearchParams of the query. */ }
```

Rules: the token is a capability — take it from the query (GET) or the
body (POST), never the URL path; validate shape first; unknown/expired
tokens get ONE generic honest page (no enumeration). Families see only
their own data, ever. The page must be self-contained (the staff shell
and its login do not apply) and mobile-first.

## Example (minimal)

```js
import { jsonStore, esc, head, endHead, card, field, submit, id, todayISO } from "../module-kit.mjs";
export const meta = { key: "example", label: "Ejemplo", order: 90, roles: [] };
export function render(ctx) {
  const db = jsonStore(ctx.slug, "example", { items: [] });
  const items = db.load().items;
  return `${head({ kicker: "demo", title: "Ejemplo", sub: "módulo de muestra" })}
    <form method="post" action="/m/example">${field("text", "Texto")} ${submit("Guardar")}</form>
    ${items.map((i) => card(`<p>${esc(i.text)} · ${esc(i.day)}</p>`)).join("")}${endHead}`;
}
export function handle(ctx, form) {
  const db = jsonStore(ctx.slug, "example", { items: [] });
  const data = db.load();
  const text = String(form.get("text") ?? "").slice(0, 200);
  if (text) { data.items.push({ id: id(), text, day: todayISO() }); db.save(data); }
  return { redirect: "/m/example" };
}
```
