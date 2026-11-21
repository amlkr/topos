# dashboard/AUTH-API.md — Topos dashboard authentication (v0)

Contract for the integrator. You should not need to read `auth.mjs` to wire
this in. **Boundary (owner rule): Topos is the owner's own independent
product; this module references and contains no client code or data.**

Zero dependencies: node 22 stdlib only (`node:crypto`, `node:fs`, `node:sqlite`).
No installs. Run the tests: `node --test dashboard/tests/*.test.mjs` (from the
repo root; `node --test "dashboard/tests/**/*.test.mjs"` works too — on this
node 22.23.2 a bare directory argument does **not** and the suite would
MODULE_NOT_FOUND, so use these two forms).

## Storage decision — measured, not assumed

On this box (node **v22.23.2**), `require('node:sqlite')` loads **without any
flag** and works; it only prints `ExperimentalWarning: SQLite is an
experimental feature` to stderr. Measured before choosing. So:

- **Primary store: `node:sqlite`** → `auth.sqlite` in `dir`. Real file,
  atomic statements, cheap janitor sweeps. Tables: `users`, `sessions`,
  `invites`. (Rate state is deliberately **not** a table — see §rateLimiter.)
- **Fallback store: JSON file** (`auth.json`, atomic tmp+rename writes, same
  internal API). It engages automatically only if the sqlite load/open
  throws — e.g. a node without `node:sqlite`. Single-process honest limit:
  concurrent writers would clobber each other.
- Force either with `createAuth({ store: "sqlite" | "json" })` (tests,
  debugging). `auth.store` reports `{ kind, path, sqliteError }` at runtime.

## The exported interface

```js
import { createAuth, COOKIE_NAME, COOKIE_ATTRS } from "./dashboard/auth.mjs";

const auth = createAuth({
  dir: "schools/lotus/dashboard-data", // store file lives here (created if missing)
  secret: process.env.TOPOS_AUTH_SECRET, // string >= 16 chars, PER SCHOOL, stable across restarts
  roles: ["director", "admissions", "finance", "coach"], // from the school manifest
  // optional: sessionTtlMs (default 24h), rateMax (default 8), rateWindowMs (default 60000), store
});
```

Bad config (`dir` missing, `secret` < 16 chars, `roles` not a non-empty
string array) **throws TypeError at create time** — fail loudly at boot, not
silently at login.

### Methods

| Call | Returns | Notes |
|---|---|---|
| `ensureUser(email, password, role)` | `{ok:true, email, role, created?existed:true}` or `{ok:false, reason}` | Idempotent seeding for the demo director. Existing account: `existed:true`, **never** re-hashed, role never overwritten. `reason`: `invalid-email`, `unknown-role` (role ∉ manifest list), `weak-password` (<8 chars). |
| `login(email, password)` | `{ok:true, cookie}` or `{ok:false, reason}` | `cookie` is a **complete Set-Cookie header value**. `reason` ∈ `invalid-credentials` (wrong password **and** unknown email — identical, on purpose, and timing-equalized with a dummy-hash compare), `rate-limited`. A successful login resets that email's throttle bucket. |
| `verify(cookie)` | `{email, role}` or `null` | Accepts the bare signed value, a `Set-Cookie` string, or a `Cookie:` header — it extracts `topos_auth` itself. `null` on: bad signature, tampered payload, expired cookie, unknown/expired session row, deleted user. Returns the **live** role from the user row, not a cookie-embedded one. |
| `logout(cookie)` | clearing `Set-Cookie` value | Deletes the session row if the cookie is well-formed; **always** send the returned header to the browser. Never throws. |
| `cookieFor(input)` | canonical `Set-Cookie` value or `null` | Accepts a bare signed value, a `Cookie:` header or a full `Set-Cookie` string; returns `topos_auth=<value>; <COOKIE_ATTRS>`. `login().cookie` already IS the header value — `cookieFor` is idempotent on it; use it only if your response layer separates value from attributes. |
| `invite(email, role)` | `{token, url, email, role, expiresAt}` | Capability token: **32 lowercase hex** (`crypto.randomBytes(16)`), 7-day expiry, single-use. `url` is `"/invite#" + token` — fragment only, so it never lands in Referer headers, server logs, or history the way a path token would. |
| `redeemInvite(token, email, password)` | `{ok:true, email, role}` or `{ok:false, reason:"invalid-invite"}` | Take `token` from the **POST body**, never the URL. Succeeds only if the token exists, is unused, is unexpired, **and** the presented email (case-insensitive) equals the invited email — all refusals are the same one reason; nothing about *which* condition failed is disclosed. A wrong email does **not** burn the token. The role always comes from the invite row, never from the caller. Redeeming finalizes/refreshes the account's password for the invited email. |
| `rateLimiter(key)` | `{ok, remaining, max, windowMs}` | **In-memory sliding window, per instance.** Records the attempt and says whether it fits. **Honest scope: it is not a wall** — it dies with a restart, is not shared across processes, and does not survive a failover. It exists to make online guessing expensive, nothing more. `login` already applies it per email (`login:<email>`); call it with an IP key too if you want per-IP throttling: `if (!auth.rateLimiter("ip:" + req.socket.remoteAddress).ok) → 429`. |
| `auth.close()` | — | Closes the sqlite handle. Call on server shutdown. |
| `auth.store`, `auth.rawBytes()` | introspection | For ops and the tests only; `rawBytes()` reads the store file for the plaintext-leak assertion. |

Emails are normalized (trim + lowercase) at every entry point; compare
normalized values in your own code.

## Cookie contract

- **Name:** `topos_auth` (`COOKIE_NAME`). **Attributes:** `Path=/; HttpOnly;
  Secure; SameSite=Lax` (`COOKIE_ATTRS`) — `login()` already returns the
  assembled `Set-Cookie` value; use it verbatim. `Secure` means HTTPS only:
  on a local-http demo you may *only* relax this by rebuilding the header
  yourself; never relax `HttpOnly`/`SameSite`.
- **Format:** `base64url(JSON).sig` where the JSON payload is `{p: <64-hex session token>, e: <expiry epoch ms>}` and `sig` is `base64url(HMAC-SHA256(secret, base64url(JSON)))`. Signature checked with `timingSafeEqual`; expiry checked twice (cookie `e` AND the session row).
- **Server side:** sessions store only `sha256(token)` — a store dump is not
  a session dump. Session TTL default 24 h (settable via `sessionTtlMs`).
- Logout sends back `topos_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`.

## Password & token parameters (documented because they are policy)

- **scrypt** (`scryptSync`): `N=2^15 (32768)`, `r=8`, `p=1`, 16-byte random
  salt per user, 32-byte hex output. **`maxmem` must be 64 MB** — measured on
  this box: with node's default 32 MB these params throw `memory limit
  exceeded`. Cost ≈ **135 ms/hash** here: that's the login latency *and* the
  attacker's per-guess price. Store format: `salt:hash`, both hex, in `users`.
- Session token: `randomBytes(32)` hex; stored hashed (sha256) — see above.
- Invite token: `randomBytes(16)` → 32 hex chars. Stored **in plain hex** in
  `invites`: it is a capability token — short-lived, single-use, and the row
  itself is what "holds the door"; hashing it buys nothing at v0 (documented
  deviation, revisit if the invite table can outlive 7 days).

## Minimal wiring example (node:http)

```js
import { createServer } from "node:http";
// … create `auth` as above; parse bodies yourself (JSON, size-capped)
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "POST" && url.pathname === "/auth/login") {
    const { email, password } = await readJson(req);
    const r = auth.login(email, password);
    if (!r.ok) { res.writeHead(r.reason === "rate-limited" ? 429 : 401); res.end("no"); return; }
    res.writeHead(204, { "Set-Cookie": r.cookie }); res.end();
    return;
  }
  // protect the dashboard:
  const who = auth.verify(req.headers.cookie);
  if (!who) { res.writeHead(302, { Location: "/login" }); res.end(); return; }
  // who.role ∈ ["director","admissions","finance","coach"] → gate sections by it
  if (req.method === "POST" && url.pathname === "/auth/invite") {
    const { email, role } = await readJson(req);
    const i = auth.invite(email, role);            // send i.url to staff; the #fragment
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(i)); return;
  }
  if (req.method === "POST" && url.pathname === "/auth/redeem") {
    const { token, email, password } = await readJson(req); // token from BODY, never the URL
    const i = auth.redeemInvite(token, email, password);
    res.writeHead(i.ok ? 200 : 400); res.end(JSON.stringify(i.ok ? { ok: true } : { ok: false })); return;
  }
  // … /auth/logout → auth.logout(req.headers.cookie) as Set-Cookie
});
```

The invite **page** at `/invite` must read the token from `location.hash`
(client-side) and POST it as JSON body. Never log the full token server-side.

### Integrator delta checklist (three things servers commonly get wrong)

1. **Cookie name is `topos_auth`, not `topos_session`.** Easiest correct
   call: `auth.verify(req.headers.cookie)` — it extracts the right cookie
   itself, so no parsing or name typo is possible. If you stored the value
   under a different name, rename or send back `auth.cookieFor(value)`.
2. **`rateLimiter(key)` returns an object, not a boolean.** Check
   `auth.rateLimiter(k).ok === false` (truthiness of the return is never
   false). `login` already throttles per email — you only need to add an
   `ip:`-keyed call if you want per-IP too; use a distinct key prefix, not
   `login:`, to keep the buckets meaningful.
3. **`login().cookie` is already the complete `Set-Cookie` header value.**
   Put it in the response headers verbatim; do not re-wrap or expect a bare
   value (`cookieFor()` exists for response layers that need it).

## Honesty notes (per the house rules)

- The rate limiter is a **throttle, not a wall** (see table).
- `scryptSync` is synchronous by design at v0 (small staff population).
- Roles are manifest-driven: a role removed from the `roles` list locks its
  users out of login immediately (measured by test).
- `secret` is the cookie HMAC key: losing it logs everyone out; sharing it
  across schools shares identity. Per school, from env, not committed.
- Nothing in this module claims an email was sent — `invite()` hands you a
  URL; delivery is the server's honest problem (rule 1).

## Tests

`node --test dashboard/tests/*.test.mjs` — 10 tests, all passing on
node v22.23.2 with real exit code 0. They cover: good/bad login,
indistinguishable wrong-password vs unknown-email reasons, verify + expiry,
raw session token absent from the store file (only sha256 present),
logout, invite→redeem→login incl. wrong-email-not-burning-token and
double-redeem refusal, rate limiter tripping (direct + through `login`),
tampered-cookie refusal (7 mutations incl. one-char flips in payload and
signature), **no plaintext password in the store file read raw**, manifest
role removal, config throws, weak-password.
