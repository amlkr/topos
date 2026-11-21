/**
 * module-kit.mjs — the shared organs for Topos dashboard modules.
 * (Integrator's zone. Modules import this; nothing here imports a module.)
 *
 * Contract: dashboard/MODULE-API.md. Zero dependencies beyond node stdlib
 * and `yaml`. Storage: one JSON file per module under
 * dashboard/.data/<school-slug>/<module>.json — atomic tmp+rename writes,
 * same discipline as data.mjs.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function money(amount, currency = "THB") {
  const sym = currency === "THB" ? "฿" : currency + " ";
  return `${sym}${Number(amount).toLocaleString("en-US")}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** One JSON store per module per school. load() never throws on a missing
 *  file — it returns the default you pass; save() is atomic. */
export function jsonStore(slug, moduleName, def = { items: [] }) {
  const dir = join(HERE, ".data", String(slug || "default"));
  const path = join(dir, `${moduleName}.json`);
  return {
    path,
    load() {
      if (!existsSync(path)) return structuredClone(def);
      try { return JSON.parse(readFileSync(path, "utf8")); }
      catch { return structuredClone(def); } // corrupt file = honest empty, never a crash
    },
    save(data) {
      mkdirSync(dir, { recursive: true });
      const tmp = path + ".tmp";
      writeFileSync(tmp, JSON.stringify(data, null, 2));
      renameSync(tmp, path);
      return data;
    },
  };
}

/** POST bodies arrive as URLSearchParams (the dashboard has no client JS). */
export function params(bodyBuffer) {
  return new URLSearchParams(bodyBuffer.toString("utf8"));
}

export const id = () => Math.random().toString(36).slice(2, 8).toUpperCase();

/** Clay body parts — modules compose these; the shell belongs to views.mjs. */
export function head({ kicker, title, sub }) {
  return `<section class="section"><p class="kicker">${esc(kicker)}</p><h1 class="page-title">${esc(title)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}`;
}
export const endHead = "</section>";

export function card(html, cls = "") {
  return `<article class="clay card ${cls}">${html}</article>`;
}

/** Standard empty state — honest, never zero-filled with fiction. */
export function empty(text) {
  return `<p class="clay callout">${esc(text)}</p>`;
}

/** Minimal field helpers for the no-JS forms. */
export function field(name, label, value = "", type = "text") {
  return `<label for="${esc(name)}">${esc(label)}</label><input id="${esc(name)}" name="${esc(name)}" type="${type}" value="${esc(value)}" autocomplete="off">`;
}
export function select(name, label, options, selected) {
  return `<label for="${esc(name)}">${esc(label)}</label><select id="${esc(name)}" name="${esc(name)}">${options.map((o) => `<option value="${esc(o)}"${o === selected ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
}
export function submit(label) {
  return `<button class="btn" type="submit">${esc(label)}</button>`;
}
