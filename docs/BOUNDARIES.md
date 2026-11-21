# Boundaries — non-negotiable (owner, 2026-11-21)

**Topos is the owner's own product. Esara is a client.**

1. **No client code or data enters this repo.** Nothing may be read from,
   imported from, or copied from `/home/amlkr/Documents/esaraworkspace/a4k`
   (or any Esara project: `fc`, `crm`, `esara-fc-landing`, …). The lessons
   Esara taught are real — the *artifacts* stay there. Patterns that exist
   in the client's code (capability tokens, honest states) must be
   re-derived from this document or the public web, never read from the
   client's files.
2. **Localhost is the runtime.** Node + local storage (node:sqlite or JSON
   files under `dashboard/.data/`). **No Supabase, no Vercel, no Esara
   infrastructure** for anything in this repo. Cloudflare quick tunnels are
   acceptable as *temporary local demos* (they proxy, they do not host) and
   must be labelled as such wherever they are shown.
3. **All demo data is fictional.** Lotus Valley International School and
   Aurora Terrace Academy do not exist. No real family, no real email, no
   real amount from any client may appear here.
4. **When Topos eventually hosts real schools**, each school is a tenant
   with its own instance and its own data — and the first real tenant signs
   its own agreement. Being born at a client is not being the client.

If an agent is asked to "look at how a4k does X", the correct answer is:
*the pattern is described here; the client's code stays closed.*
