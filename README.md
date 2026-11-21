# Topos

*Each school, its own place.*

**Topos is a fold, not a mold.**
Every school is a manifold: locally its own coordinates, globally one substance.
The manifest is the contract; the code never breaks a topology, it bends with it.
What is invariant is shared freely (AGPL); what is operated is what pays.
You are not a tenant. You are a co-author.

## Repo map

- `spec/manifest.schema.json` — the contract (v0). This file *is* the product.
- `docs/manifest-spec.md` — the contract in human language, written from the schema.
- `schools/*.yaml` — one manifest per school. `lotus.yaml` and `aurora.yaml` are fictional founding examples — the lab (Esara) taught the topology; the product ships with no lab data.
- `manifold/core.mjs` — the organs: validate, contract, render. Frozen interfaces.
- `manifold/cli.mjs` — `validate`, `render`, `serve`, `new` (scaffold).
- `manifold/studio.mjs` — Topos Studio: the SaaS surface. Lists schools, previews live, edits YAML in memory (drafts never touch disk).
- `tests/` — the contract bites: fixtures that MUST fail, and they do.

## Quickstart

```
npm install
node manifold/cli.mjs validate schools/lotus.yaml   # the contract holds?
node manifold/cli.mjs new schools/aurora.yaml       # scaffold a whole school → build/aurora/
node manifold/studio.mjs                            # the platform home → http://localhost:8080
node --test tests/                                  # watch the contract refuse lies
```

## The rule of Thom

If it cannot be expressed in the manifest, it is not a feature — it is a tear.
