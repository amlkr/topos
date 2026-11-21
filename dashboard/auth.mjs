/**
 * dashboard/auth.mjs — authentication for the Topos per-school dashboard (v0).
 *
 * House pattern: CAPABILITY TOKENS. An invite token IS the access — there is
 * no side channel, no email-link service, no state beyond the row. A token
 * redeems exactly once, only for the email it names, until it expires. A
 * session cookie is a signed envelope around a session token; the server
 * stores only the SHA-256 of that token, so a store dump is not a session
 * dump.
 *
 * Zero dependencies: node:crypto, node:fs, node:path, node:module (and
 * node:sqlite when present). Measured on node v22.23.2 on this box:
 * `require('node:sqlite')` loads WITHOUT a flag (only an ExperimentalWarning
 * on stderr), so SQLite is the primary store; if it ever fails to load, an
 * equivalent JSON-file store takes over with the same internal API.
 * See AUTH-API.md for the decision and the full interface contract.
 *
 * Boundaries (owner rule): Topos is its own product. Nothing here reads,
 * imports, or mirrors code or data from any client workspace.
 *
 * Threat model honesty (v0):
 *  - The rate limiter is an in-memory sliding window, PER PROCESS. It slows
 *    a network attacker down; it is not a wall and it dies with a restart.
 *  - scryptSync is synchronous on purpose (single small dashboard, no DB of
 *    millions); at N=2^15 it costs ~135 ms per verify on this box, which is
 *    also the brute-force cost.
 *  - Login is deliberately mute about whether an account exists: one generic
 *    reason for wrong password AND unknown email, plus a dummy-hash compare
 *    so both paths take the same time.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

/* ------------------------------------------------------------------ config */

export const COOKIE_NAME = "topos_auth";

/** Full Set-Cookie attributes the server should use (see AUTH-API.md). */
export const COOKIE_ATTRS = "Path=/; HttpOnly; Secure; SameSite=Lax";

const SESSION_TOKEN_BYTES = 32;      // random 32 bytes; stored as sha256 hex
const INVITE_TOKEN_BYTES = 16;       // -> 32 lowercase hex chars, the capability
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, per spec
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const DEFAULT_RATE_MAX = 8;          // attempts per window
const DEFAULT_RATE_WINDOW_MS = 60_000;

// scrypt parameters (documented in AUTH-API.md). OWASP-style: N=2^15, r=8,
// p=1, 16-byte random salt per user, 32-byte output. maxmem MUST be raised:
// with node's default 32 MB these params throw; 64 MB is measured to work
// (~135 ms/hash on this box).
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 32, saltLen: 16, maxmem: 64 * 1024 * 1024 };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HEX32_RE = /^[0-9a-f]{32}$/;

/* ------------------------------------------------------------------ helpers */

const sha256hex = (s) => createHash("sha256").update(s).digest("hex");
const now = () => Date.now();

const b64url = (x) => Buffer.from(x).toString("base64url");

function safeEqualHex(aHex, bHex) {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/** scrypt one-way function over a fresh random salt. Returns {salt, hash} hex. */
function hashPassword(password) {
  const salt = randomBytes(SCRYPT.saltLen).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem,
  }).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, saltHex, expectedHashHex) {
  const actual = scryptSync(password, saltHex, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem,
  }).toString("hex");
  return safeEqualHex(actual, expectedHashHex);
}

// Constant for the "unknown email" path: hashing against this dummy makes a
// wrong-password attempt and an unknown-email attempt cost the same time.
const DUMMY = hashPassword("topos-timing-equalizer-" + randomBytes(8).toString("hex"));

/* --------------------------------------------------------------- the stores
 * Both stores implement exactly this internal API (same names, same shapes):
 *   getUser(email) -> row | undefined
 *   putUser(row) / touchUser?  (users are insert-only here)
 *   putSession(row) / getSession(tokenHash) / deleteSession(tokenHash)
 *   sweepSessions(nowMs) -> deleted count
 *   putInvite(row) / getInvite(token) / useInvite(token, nowMs) -> bool (atomic single-use)
 *   sweepInvites(nowMs)
 *   kind/path + rawBytes() -> the store file's bytes (for the plaintext-leak test)
 */

function openSqliteStore(dir) {
  // createRequire so we can try the same call the brief names: require('node:sqlite')
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require("node:sqlite");
  const path = join(dir, "auth.sqlite");
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = DELETE;      -- one file, no -wal strays to leak-scan
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,     -- sha256(session token); never the token
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invites (
      token TEXT PRIMARY KEY,          -- capability token: the token IS the access
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS sessions_email ON sessions(email);
    CREATE INDEX IF NOT EXISTS invites_email ON invites(email);
  `);
  return {
    kind: "sqlite",
    path,
    close: () => db.close(),
    getUser: (email) =>
      db.prepare("SELECT email, role, salt, hash, created_at FROM users WHERE email = ?").get(email),
    putUser: (u) => {
      db.prepare("INSERT INTO users (email, role, salt, hash, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(u.email, u.role, u.salt, u.hash, u.created_at);
    },
    updateUserSecret: (email, salt, hash, role) => {
      db.prepare("UPDATE users SET salt = ?, hash = ?, role = ? WHERE email = ?")
        .run(salt, hash, role, email);
    },
    putSession: (s) => {
      db.prepare("INSERT INTO sessions (token_hash, email, expires_at) VALUES (?, ?, ?)")
        .run(s.token_hash, s.email, s.expires_at);
    },
    getSession: (tokenHash) =>
      db.prepare("SELECT token_hash, email, expires_at FROM sessions WHERE token_hash = ?").get(tokenHash),
    deleteSession: (tokenHash) => {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    },
    sweepSessions: (t) => db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(t).changes,
    putInvite: (i) => {
      db.prepare("INSERT INTO invites (token, email, role, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)")
        .run(i.token, i.email, i.role, i.expires_at);
    },
    getInvite: (token) =>
      db.prepare("SELECT token, email, role, expires_at, used_at FROM invites WHERE token = ?").get(token),
    // Atomic single-use claim: UPDATE only if still unused AND unexpired.
    useInvite: (token, t) =>
      db.prepare("UPDATE invites SET used_at = ? WHERE token = ? AND used_at IS NULL AND expires_at > ?")
        .run(t, token, t).changes === 1,
    sweepInvites: (t) => db.prepare("DELETE FROM invites WHERE expires_at <= ?").run(t).changes,
    rawBytes: () => readFileSync(path),
  };
}

function openJsonStore(dir) {
  // Same API, JSON file. Written atomically (tmp+rename) on every mutation.
  // Honest limits: single-process only; concurrent processes lose writes.
  const path = join(dir, "auth.json");
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    data = { users: {}, sessions: {}, invites: {} };
  }
  const flush = () => {
    const tmp = path + ".tmp";
    writeFileSync(tmp, JSON.stringify(data, null, 1));
    renameSync(tmp, path);
  };
  return {
    kind: "json",
    path,
    close: () => {},
    getUser: (email) => data.users[email],
    putUser: (u) => { data.users[u.email] = u; flush(); },
    updateUserSecret: (email, salt, hash, role) => {
      const u = data.users[email];
      if (u) { u.salt = salt; u.hash = hash; u.role = role; flush(); }
    },
    putSession: (s) => { data.sessions[s.token_hash] = s; flush(); },
    getSession: (h) => data.sessions[h],
    deleteSession: (h) => { delete data.sessions[h]; flush(); },
    sweepSessions: (t) => {
      let n = 0;
      for (const [h, s] of Object.entries(data.sessions)) if (s.expires_at <= t) { delete data.sessions[h]; n++; }
      if (n) flush();
      return n;
    },
    putInvite: (i) => { data.invites[i.token] = { ...i, used_at: null }; flush(); },
    getInvite: (token) => data.invites[token],
    useInvite: (token, t) => {
      const i = data.invites[token];
      if (!i || i.used_at !== null || i.expires_at <= t) return false;
      i.used_at = t; flush(); return true;
    },
    sweepInvites: (t) => {
      let n = 0;
      for (const [k, i] of Object.entries(data.invites)) if (i.expires_at <= t) { delete data.invites[k]; n++; }
      if (n) flush();
      return n;
    },
    rawBytes: () => readFileSync(path),
  };
}

function openStore(dir) {
  mkdirSync(dir, { recursive: true });
  try {
    return openSqliteStore(dir);
  } catch (err) {
    // Measured fallback: node:sqlite missing/thrown -> JSON store, same API.
    return { ...(openJsonStore(dir)), sqliteError: String(err?.message ?? err) };
  }
}

/* ------------------------------------------------------------------- cookie */

function signPayload(secret, payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function openSigned(secret, value) {
  const dot = value.lastIndexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const want = createHmac("sha256", secret).update(body).digest();
  let got;
  try { got = Buffer.from(sig, "base64url"); } catch { return null; }
  // Canonical-encoding check: trailing base64url bits are ignored on decode,
  // so a one-char flip in the last signature position can yield the same 32
  // bytes. Refusing non-canonical sig strings keeps "tampered = rejected"
  // true for every single-character mutation, not just the significant ones.
  if (got.length !== want.length || got.toString("base64url") !== sig) return null;
  if (!timingSafeEqual(got, want)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return null; }
  if (typeof payload?.p !== "string" || typeof payload?.e !== "number") return null;
  return payload;
}

/** Extract the cookie VALUE from a raw value, a Cookie header, or a Set-Cookie string. */
function cookieValueFrom(cookie) {
  if (typeof cookie !== "string") return null;
  const s = cookie.trim();
  if (!s) return null;
  // "name=v; Path=/; HttpOnly" (Set-Cookie) or "other=1; topos_auth=v; x" (Cookie header)
  const first = s.split(";")[0].trim();
  const eq = first.indexOf("=");
  if (eq > -1 && first.slice(0, eq).trim() === COOKIE_NAME) return first.slice(eq + 1).trim();
  for (const part of s.split(";")) {
    const kv = part.trim();
    const i = kv.indexOf("=");
    if (i > -1 && kv.slice(0, i).trim() === COOKIE_NAME) return kv.slice(i + 1).trim();
  }
  // bare signed value ("body.sig")
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s)) return s;
  return null;
}

/* --------------------------------------------------------------- createAuth */

/**
 * @param {object} opts
 * @param {string} opts.dir        directory for the store file (created if missing)
 * @param {string} opts.secret     >=16 chars; HMAC key for cookies. Per school.
 * @param {string[]} opts.roles    staff roles allowed, from the school manifest
 * @param {number} [opts.sessionTtlMs]
 * @param {number} [opts.rateMax]  attempts per window before tripping
 * @param {number} [opts.rateWindowMs]
 * @param {"auto"|"sqlite"|"json"} [opts.store] force a store (tests / debugging)
 */
export function createAuth(opts) {
  const { dir, secret, roles, sessionTtlMs = DEFAULT_SESSION_TTL_MS,
    rateMax = DEFAULT_RATE_MAX, rateWindowMs = DEFAULT_RATE_WINDOW_MS, store = "auto" } = opts ?? {};
  if (typeof dir !== "string" || !dir) throw new TypeError("createAuth: dir required");
  if (typeof secret !== "string" || secret.length < 16) throw new TypeError("createAuth: secret must be a string of >=16 chars");
  if (!Array.isArray(roles) || roles.length === 0 || !roles.every((r) => typeof r === "string" && r))
    throw new TypeError("createAuth: roles must be a non-empty string array (from the school manifest)");
  const allowedRoles = new Set(roles);

  const db = store === "json"
    ? (mkdirSync(dir, { recursive: true }), openJsonStore(dir))
    : store === "sqlite"
      ? openSqliteStore(dir)
      : openStore(dir);
  if (store === "sqlite" && db.kind !== "sqlite") throw new Error("createAuth: node:sqlite unavailable");

  const normEmail = (e) => String(e ?? "").trim().toLowerCase();
  const validEmail = (e) => EMAIL_RE.test(e);
  const ok = (x) => ({ ok: true, ...x });
  const no = (reason) => ({ ok: false, reason });

  /* ---- rate limiter: in-memory sliding window, PER INSTANCE, not a wall.
   * Honest scope: survives nothing (no persistence), shared by nothing (no
   * cross-process state). It exists to make online guessing expensive, and
   * that is all it claims to do. */
  const buckets = new Map();
  function rateLimiter(key) {
    const k = String(key);
    const t = now();
    const hits = (buckets.get(k) ?? []).filter((x) => t - x < rateWindowMs);
    hits.push(t);
    buckets.set(k, hits);
    const remaining = Math.max(0, rateMax - hits.length);
    return { ok: hits.length <= rateMax, remaining, windowMs: rateWindowMs, max: rateMax };
  }
  const resetRate = (key) => buckets.delete(String(key));

  /* ---- ensureUser: idempotent seeding (demo director). Never rewrites an
   * existing account's secret. */
  function ensureUser(email, password, role) {
    const e = normEmail(email);
    if (!validEmail(e)) return no("invalid-email");
    if (!allowedRoles.has(role)) return no("unknown-role");
    if (typeof password !== "string" || password.length < 8) return no("weak-password");
    const existing = db.getUser(e);
    if (existing) return ok({ email: e, role: existing.role, existed: true });
    const { salt, hash } = hashPassword(password);
    db.putUser({ email: e, role, salt, hash, created_at: now() });
    return ok({ email: e, role, created: true });
  }

  /* ---- login: one generic failure reason, timing-equal paths ---- */
  function login(email, password) {
    const e = normEmail(email);
    if (!validEmail(e)) return no("invalid-credentials"); // bad format is indistinguishable
    const rl = rateLimiter(`login:${e}`);
    if (!rl.ok) return no("rate-limited");
    const user = db.getUser(e);
    const good = user
      ? verifyPassword(String(password ?? ""), user.salt, user.hash)
      : (verifyPassword(String(password ?? ""), DUMMY.salt, DUMMY.hash), false);
    if (!user || !good) return no("invalid-credentials");
    if (!allowedRoles.has(user.role)) return no("invalid-credentials"); // role list comes from the school manifest

    const token = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
    const expiresAt = now() + sessionTtlMs;
    db.putSession({ token_hash: sha256hex(token), email: e, expires_at: expiresAt });
    db.sweepSessions(now()); // opportunistic janitor, cheap
    const signed = signPayload(secret, { p: token, e: expiresAt });
    return ok({ cookie: `${COOKIE_NAME}=${signed}; ${COOKIE_ATTRS}` });
  }

  /* ---- verify: signature -> expiry -> session row -> live role ---- */
  function verify(cookie) {
    const value = cookieValueFrom(cookie);
    if (!value) return null;
    const payload = openSigned(secret, value);
    if (!payload || payload.e <= now()) return null;
    const session = db.getSession(sha256hex(payload.p));
    if (!session || session.expires_at <= now()) return null;
    const user = db.getUser(session.email);
    if (!user) return null;
    return { email: user.email, role: user.role };
  }

  function logout(cookie) {
    const value = cookieValueFrom(cookie);
    if (value) {
      const payload = openSigned(secret, value);
      if (payload) db.deleteSession(sha256hex(payload.p));
    }
    // The server should always send this back on logout, signature or not:
    return `${COOKIE_NAME}=; ${COOKIE_ATTRS}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }

  /**
   * Accept anything (a bare signed value, a Cookie header, or a full
   * Set-Cookie string) and return the canonical complete `Set-Cookie`
   * header value for the browser. Idempotent on login()'s own output.
   * Returns null if no cookie value can be found. Convenience for
   * servers that separate "cookie value" from "response headers" — the
   * `cookie` from login() is already a full header value and needs nothing.
   */
  function cookieFor(input) {
    const v = cookieValueFrom(input);
    return v ? `${COOKIE_NAME}=${v}; ${COOKIE_ATTRS}` : null;
  }

  /* ---- invite: a capability token. The token IS the access; the row says
   * who it is for. URL is /invite#<token> so the fragment never reaches any
   * Referer header or server log. The redeem call takes the token from the
   * POST body, never from the URL path. */
  function invite(email, role) {
    const e = normEmail(email);
    if (!validEmail(e)) return no("invalid-email");
    if (!allowedRoles.has(role)) return no("unknown-role");
    const token = randomBytes(INVITE_TOKEN_BYTES).toString("hex"); // 32 lowercase hex
    const expiresAt = now() + INVITE_TTL_MS;
    db.putInvite({ token, email: e, role, expires_at: expiresAt });
    db.sweepInvites(now());
    return { token, url: `/invite#${token}`, email: e, role, expiresAt };
  }

  /* ---- redeemInvite: token exists, unused, unexpired, and names THIS email
   * (case-insensitive). One generic refusal otherwise: no enumeration of
   * which condition failed, and no signal about whether the token is real.
   * The role comes from the invite row, never from the caller. */
  function redeemInvite(token, email, password) {
    const t = String(token ?? "").trim().toLowerCase();
    const e = normEmail(email);
    const pw = String(password ?? "");
    const refuse = () => no("invalid-invite");
    if (!HEX32_RE.test(t) || !validEmail(e)) return refuse();
    if (pw.length < 8) return refuse();
    const row = db.getInvite(t);
    if (!row) return refuse();
    if (row.email !== e) return refuse();          // token must match invited email
    if (!db.useInvite(t, now())) return refuse();  // atomic: used OR expired OR raced
    // The invite commits this email+role; redeeming finalizes the account.
    // If a same-email account already exists (removed-then-reinvited), the
    // invite owns the credential reset — that is the capability's meaning.
    const { salt, hash } = hashPassword(pw);
    const existing = db.getUser(e);
    if (existing) db.updateUserSecret(e, salt, hash, row.role);
    else db.putUser({ email: e, role: row.role, salt, hash, created_at: now() });
    resetRate(`login:${e}`);
    return ok({ email: e, role: row.role });
  }

  return {
    ensureUser, login, verify, logout, invite, redeemInvite, rateLimiter, cookieFor,
    // introspection for ops/tests (read-only, no secrets):
    store: { kind: db.kind, path: db.path, sqliteError: db.sqliteError ?? null },
    rawBytes: () => db.rawBytes(),
    close: () => db.close(),
  };
}

export default createAuth;
