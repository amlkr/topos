# Topos

*Each school, its own place.*

**Topos is a fold, not a mold.**
Every school is a manifold: locally its own coordinates, globally one substance.
The manifest is the contract; the code never breaks a topology, it bends with it.
What is invariant is shared freely (AGPL); what is operated is what pays.
You are not a tenant. You are a co-author.

## Repo map

- `spec/manifest.schema.json` — the contract (v0). This file *is* the product.
- `schools/*.yaml` — one manifest per school. `lotus.yaml` is the fictional founding example — the lab (Esara) taught the topology; the product ships with no lab data.
- `manifold/` — the engine CLI: validate, render, serve. (AGPL.)

## Quickstart

```
npm install
node manifold/cli.mjs validate schools/lotus.yaml   # the contract holds?
node manifold/cli.mjs serve schools/lotus.yaml      # http://localhost:4173
```

## The rule of Thom

If it cannot be expressed in the manifest, it is not a feature — it is a tear.
