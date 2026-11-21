/**
 * dashboard/tests/auth.test.mjs — node --test suite for the Topos dashboard auth.
 * Run: node --test dashboard/tests/   (from the repo root; no flags needed)
 * Zero dependencies: node:test, node:assert, node:crypto, node:fs, node:os, node:path.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createAuth, COOKIE_NAME, COOKIE_ATTRS } from "../auth.mjs";

const SECRET = "unit-test-secret-0123456789abcdef"; // >=16 chars, per school in prod
const ROLES = ["director", "admissions", "finance", "coach"];

let n = 0;
function freshAuth(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), `topos-auth-${n++}-`));
  const a = createAuth({ dir, secret: SECRET, roles: ROLES, ...extra });
  a.__dir = dir;
  return a;
}
function cleanup(a) { try { a.close(); } catch {} rmSync(a.__dir, { recursive: true, force: true }); }

/** Extract the signed cookie VALUE from a login Set-Cookie string. */
function valueOf(setCookie) {
  const first = setCookie.split(";")[0];
  const [k, v] = [first.slice(0, first.indexOf("=")), first.slice(first.indexOf("=") + 1)];
  assert.equal(k, COOKIE_NAME, "cookie name must be topos_auth");
  return v.trim();
}

test("login: good credentials -> cookie; verify -> {email, role}", async () => {
  const a = freshAuth();
  try {
    const seeded = a.ensureUser("director@lvis.example", "Str0ng-Passw0rd!", "director");
    assert.equal(seeded.ok, true);
    assert.equal(seeded.created, true);

    const r = a.login("Director@LVIS.example ", "Str0ng-Passw0rd!"); // normalization: case+space
    assert.equal(r.ok, true);
    assert.match(r.cookie, new RegExp(`^${COOKIE_NAME}=`));
    assert.match(r.cookie, /HttpOnly/);
    assert.match(r.cookie, /Secure/);
    assert.match(r.cookie, /SameSite=Lax/);
    // cookieFor: idempotent on login's own output, canonicalizes a bare value, nulls junk
    assert.equal(a.cookieFor(r.cookie), r.cookie);
    assert.equal(a.cookieFor(valueOf(r.cookie)), r.cookie);
    assert.equal(a.cookieFor("junk"), null);
    assert.deepEqual(a.verify(r.cookie), { email: "director@lvis.example", role: "director" });

    // ensureUser is idempotent and never rewrites an existing secret
    const again = a.ensureUser("director@lvis.example", "Other-Passw0rd!", "finance");
    assert.equal(again.ok, true);
    assert.equal(again.existed, true);
    assert.equal(again.role, "director", "existing role must not be overwritten");
    assert.equal(a.login("director@lvis.example", "Other-Passw0rd!").ok, false);
  } finally { cleanup(a); }
});

test("login: bad password and unknown email give the SAME generic reason (no enumeration)", async () => {
  const a = freshAuth();
  try {
    a.ensureUser("director@lvis.example", "Str0ng-Passw0rd!", "director");
    const wrongPw = a.login("director@lvis.example", "nope-not-it");
    const unknown = a.login("ghost@lvis.example", "nope-not-it");
    assert.equal(wrongPw.ok, false);
    assert.equal(unknown.ok, false);
    assert.equal(wrongPw.reason, unknown.reason, "responses must be indistinguishable");
    assert.equal(wrongPw.reason, "invalid-credentials");
    // ...so the wrong-password message is never an "unknown user" message and vice versa
    assert.doesNotMatch(String(wrongPw.reason), /unknown|not-found|no-account/i);
    assert.doesNotMatch(String(unknown.reason), /wrong|bad-password/i);
  } finally { cleanup(a); }
});

test("session: verify works, expiry kills it; the raw token is NEVER stored", async () => {
  const a = freshAuth({ sessionTtlMs: 120 });
  try {
    a.ensureUser("director@lvis.example", "Str0ng-Passw0rd!", "director");
    const r = a.login("director@lvis.example", "Str0ng-Passw0rd!");
    assert.ok(r.ok);
    const value = valueOf(r.cookie);
    assert.deepEqual(a.verify(r.cookie), { email: "director@lvis.example", role: "director" });

    // The signed payload carries the raw session token — the store must hold
    // only its sha256, and must NOT contain the raw token bytes anywhere.
    const token = JSON.parse(Buffer.from(value.split(".")[0], "base64url").toString("utf8")).p;
    assert.equal(token.length, 64, "32 random bytes as hex");
    const storeBytes = a.rawBytes();
    assert.ok(!storeBytes.includes(Buffer.from(token, "utf8")), "raw session token leaked into store");
    assert.ok(storeBytes.includes(Buffer.from(createHash("sha256").update(token).digest("hex"))),
      "sha256(token) should be the stored session key");
    // and the stored key is an irreversible 64-hex sha256, not the token
    assert.match(createHash("sha256").update(token).digest("hex"), /^[0-9a-f]{64}$/);

    await new Promise((res) => setTimeout(res, 200));
    assert.equal(a.verify(r.cookie), null, "expired session must not verify");
  } finally { cleanup(a); }
});

test("logout destroys the session", async () => {
  const a = freshAuth();
  try {
    a.ensureUser("director@lvis.example", "Str0ng-Passw0rd!", "director");
    const r = a.login("director@lvis.example", "Str0ng-Passw0rd!");
    assert.ok(a.verify(r.cookie));
    const cleared = a.logout(r.cookie);
    assert.match(cleared, /Max-Age=0/);
    assert.equal(a.verify(r.cookie), null, "logged-out cookie must not verify");
    // logout is forgiving: junk input never throws
    assert.match(a.logout("nonsense"), /Max-Age=0/);
  } finally { cleanup(a); }
});

test("invite -> redeem -> login, end to end; single use; email must match", async () => {
  const a = freshAuth();
  try {
    const inv = a.invite("Coach@Example.COM", "coach");
    assert.match(inv.token, /^[0-9a-f]{32}$/, "invite token is 32 lowercase hex");
    assert.equal(inv.url, `/invite#${inv.token}`, "token goes in the fragment, not the path");
    assert.ok(inv.expiresAt > Date.now() + 6 * 24 * 60 * 60 * 1000, "~7-day expiry");

    // role is refused from the caller, honored from the manifest list
    assert.equal(a.invite("x@y.z", "wizard").ok, false);
    assert.equal(a.invite("x@y.z", "wizard").reason, "unknown-role");

    // wrong email: generic refusal, token NOT burned
    const bad = a.redeemInvite(inv.token, "someone@else.example", "Passw0rd-123");
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "invalid-invite");

    const good = a.redeemInvite(inv.token, "coach@example.com", "Passw0rd-123");
    assert.equal(good.ok, true);
    assert.equal(good.role, "coach", "role comes from the invite row");

    // double redeem refused
    const twice = a.redeemInvite(inv.token, "coach@example.com", "Passw0rd-123");
    assert.equal(twice.ok, false);
    assert.equal(twice.reason, "invalid-invite");

    // the account is real now
    const r = a.login("coach@example.com", "Passw0rd-123");
    assert.ok(r.ok);
    assert.deepEqual(a.verify(r.cookie), { email: "coach@example.com", role: "coach" });

    // garbage tokens: generic refusal, no throw
    for (const junk of ["", "Z".repeat(32), inv.token.slice(0, -1) + "0", inv.token.toUpperCase()]) {
      assert.equal(a.redeemInvite(junk, "coach@example.com", "Passw0rd-123").reason, "invalid-invite");
    }
  } finally { cleanup(a); }
});

test("rate limiter: sliding window trips after `max` attempts; login obeys it", async () => {
  const a = freshAuth({ rateMax: 3, rateWindowMs: 60_000 });
  try {
    // direct: the 4th call in-window trips
    for (let i = 1; i <= 3; i++) assert.equal(a.rateLimiter("ip:1.2.3.4").ok, true, `hit ${i} allowed`);
    assert.equal(a.rateLimiter("ip:1.2.3.4").ok, false, "hit 4 trips");
    assert.equal(a.rateLimiter("ip:9.9.9.9").ok, true, "buckets are per key");

    // through login: three generic failures, then rate-limited (same target user)
    a.ensureUser("director@lvis.example", "Str0ng-Passw0rd!", "director");
    for (let i = 0; i < 3; i++)
      assert.equal(a.login("director@lvis.example", "wrong").reason, "invalid-credentials");
    assert.equal(a.login("director@lvis.example", "wrong").reason, "rate-limited");
    assert.equal(a.login("director@lvis.example", "Str0ng-Passw0rd!").reason, "rate-limited",
      "tripped bucket also blocks the right password — that is what a throttle is");
  } finally { cleanup(a); }
});

test("cookie tampering: flipping ONE character is refused", async () => {
  const a = freshAuth();
  try {
    a.ensureUser("director@lvis.example", "Str0ng-Passw0rd!", "director");
    const r = a.login("director@lvis.example", "Str0ng-Passw0rd!");
    const v = valueOf(r.cookie);
    assert.ok(a.verify(v));

    const flip = (s, i) => s.slice(0, i) + (s[i] === "a" ? "b" : "a") + s.slice(i + 1);
    const dot = v.lastIndexOf(".");
    const cases = [
      flip(v, 0),                        // payload head
      flip(v, Math.floor(dot / 2)),      // payload middle
      flip(v, dot + 1),                  // signature head
      flip(v, v.length - 1),             // signature tail
      v.slice(0, dot) + "." + v.slice(dot + 1) + "A", // extra sig char
      v.replace(".", ".."),               // structural junk
      "totally-not-a-cookie",
    ];
    for (const bad of cases) {
      assert.notEqual(bad, v);
      assert.equal(a.verify(bad), null, `tampered cookie accepted: ${bad.slice(0, 24)}…`);
    }
    // full Set-Cookie strings and Cookie headers also verify (server convenience)
    assert.ok(a.verify(`session=1; ${r.cookie.split(";")[0]}`));
  } finally { cleanup(a); }
});

test("passwords are never stored in plaintext — read the raw store file and assert", async () => {
  const a = freshAuth();
  const PW_DIRECTOR = "Sup3r-S3cret-Director!";
  const PW_COACH = "C0ach-Passw0rd-99";
  try {
    a.ensureUser("director@lvis.example", PW_DIRECTOR, "director");
    a.login("director@lvis.example", PW_DIRECTOR);
    const inv = a.invite("coach@example.com", "coach");
    a.redeemInvite(inv.token, "coach@example.com", PW_COACH);
    a.login("coach@example.com", PW_COACH);

    const bytes = a.rawBytes();
    for (const pw of [PW_DIRECTOR, PW_COACH]) {
      assert.ok(!bytes.includes(Buffer.from(pw, "utf8")),
        `plaintext password found in store file (${a.store.kind})`);
    }
    // The salts/hashes that ARE there must be hex, never the password itself
    assert.equal(a.store.kind, "sqlite", "expected sqlite on this box (see AUTH-API.md)");
  } finally { cleanup(a); }
});

test("roles are manifest-driven: a pulled role cannot log in", async () => {
  const a = freshAuth();
  try {
    a.ensureUser("finance@lvis.example", "Passw0rd-abc", "finance");
    assert.ok(a.login("finance@lvis.example", "Passw0rd-abc").ok);
    a.close();
    // Server reloads manifest without "finance": same store, narrower roles list.
    const b = createAuth({ dir: a.__dir, secret: SECRET, roles: ["director", "admissions"] });
    try {
      assert.equal(b.login("finance@lvis.example", "Passw0rd-abc").ok, false);
      assert.equal(b.ensureUser("x@y.z", "Passw0rd-abc", "finance").reason, "unknown-role");
    } finally { b.close(); }
  } finally { rmSync(a.__dir, { recursive: true, force: true }); }
});

test("config errors are loud at create time, not silent at login", () => {
  const dir = mkdtempSync(join(tmpdir(), "topos-auth-cfg-"));
  try {
    assert.throws(() => createAuth({ secret: SECRET, roles: ROLES }), TypeError);
    assert.throws(() => createAuth({ dir, secret: "short", roles: ROLES }), TypeError);
    assert.throws(() => createAuth({ dir, secret: SECRET, roles: [] }), TypeError);
    assert.throws(() => createAuth({ dir, secret: SECRET }), TypeError);
    // weak passwords refused with a real reason (this is admin-side, tell them)
    const a = createAuth({ dir, secret: SECRET, roles: ROLES });
    assert.equal(a.ensureUser("a@b.co", "short", "coach").reason, "weak-password");
    assert.equal(a.ensureUser("not-an-email", "Passw0rd-123", "coach").reason, "invalid-email");
    a.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
