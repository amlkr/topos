/**
 * journal.mjs — el diario de auditoría del panel Topos: toda escritura deja
 * su huella (quién, cuándo, qué módulo, qué acción).
 *
 * Almacenamiento: UN archivo JSONL de solo-append por escuela, en
 * dashboard/.data/<slug>/journal.jsonl — una línea JSON por evento, nunca
 * se reescribe el pasado.
 *
 * Límites, dichos en serio (esto es un diario, no un muro — docs/BOUNDARIES.md):
 *  - ESCRITOR ÚNICO: appendFileSync abre con O_APPEND y escribe una línea
 *    corta por evento. Con un solo proceso Node sobre sistema de ficheros
 *    local eso es de hecho atómico: un lector ve la línea entera o no la ve.
 *    DOS instancias del panel escribiendo sobre el mismo .data (o un FS de
 *    red) PUEDEN entrelazar líneas. El diario nació para vivir con UNA
 *    instancia por escuela; con dos, deja de merecer su nombre.
 *  - No es antiadulteración ni prueba legal: no hay hash encadenado, no hay
 *    réplica, `rm journal.jsonl` lo borra entero. Registra para que el
 *    equipo se recuerde a sí mismo, no para un juicio.
 *  - record() NUNCA lanza: un fallo del diario no puede tumbar el panel.
 *    Degrada a una línea en console.error y devuelve false.
 *  - read() salta líneas corruptas y las CUENTA (campo `corrupt` del
 *    resultado): pérdida visible, nunca silenciosa.
 *
 * Forma de la entrada (todo normalizado a cadena, cortada a un máximo):
 *   { ts: ISO-8601 (UTC), actor: email|'system'|'anonymous', role,
 *     module, action, ref, ip }
 *
 * Quién escribe: los ganchos de dashboard/server.mjs (login/logout, POST
 * /m/<clave> con éxito, /school/save plegado o rechazado). Un módulo que
 * quiera registrar por su cuenta importa record() y pasa su slug.
 */
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = join(HERE, ".data");

/** slug → directorio seguro; mismo espíritu de naming que data.mjs. */
function pathFor(slug) {
  const s = String(slug ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^\.+/, "") || "default";
  return join(DATA_ROOT, s, "journal.jsonl");
}

const str = (v, max) => String(v ?? "").trim().slice(0, max);

/** Normaliza sin juzgar: lo que no es cadena utilizable se vuelve cadena
 *  corta o el hueco honesto. Nunca lanza sobre entradas raras. */
function norm(entry) {
  const e = entry && typeof entry === "object" ? entry : {};
  const ts = str(e.ts, 40);
  return {
    ts: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(ts) ? ts : new Date().toISOString(),
    actor: str(e.actor, 120) || "anonymous",
    role: str(e.role, 40) || "unknown",
    module: str(e.module, 40),
    action: str(e.action, 60),
    ref: str(e.ref, 120),
    ip: str(e.ip, 60),
  };
}

/**
 * record({ slug, entry }) → true si la línea quedó en disco, false si no.
 * NUNCA lanza: el panel sigue en marcha aunque el diario falle.
 */
export function record({ slug, entry } = {}) {
  try {
    const path = pathFor(slug);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(norm(entry)) + "\n");
    return true;
  } catch (err) {
    try {
      console.error(`journal: entrada NO registrada (${err && err.message ? err.message : String(err)}) — el panel sigue`);
    } catch { /* sin consola, sin drama: la regla es no lanzar */ }
    return false;
  }
}

/**
 * read(slug, { limit = 50, module = "" }) →
 *   { entries, corrupt, total, hidden }
 * entries: las `limit` más nuevas PRIMERO (orden de archivo invertido),
 * filtradas por `module` si se pasa. `corrupt` cuenta líneas ilegibles de
 * TODO el archivo; `total` entradas sanas del archivo; `hidden` las sanas
 * que quedaron fuera de la ventana leída.
 * Nunca lanza: archivo ausente o disco roto devuelven ventana vacía.
 */
export function read(slug, { limit = 50, module = "" } = {}) {
  const out = { entries: [], corrupt: 0, total: 0, hidden: 0 };
  try {
    const path = pathFor(slug);
    if (!existsSync(path)) return out;
    const lines = readFileSync(path, "utf8").split("\n");
    const parsed = [];
    for (const line of lines) {
      if (!line.trim()) continue; // huecos de salto: no son corrupción
      try {
        const v = JSON.parse(line);
        if (v && typeof v === "object" && !Array.isArray(v)) parsed.push(v);
        else out.corrupt++; // JSON válido pero no-objeto: línea que no es entrada
      } catch {
        out.corrupt++; // línea truncada por la limitación de escritor único, etc.
      }
    }
    out.total = parsed.length;
    const pool = module ? parsed.filter((e) => e.module === String(module)) : parsed;
    const n = Math.max(1, Math.min(Number(limit) || 50, 1000));
    out.entries = pool.slice(-n).reverse();
    out.hidden = Math.max(0, pool.length - out.entries.length);
    return out;
  } catch (err) {
    try {
      console.error(`journal: lectura falló (${err && err.message ? err.message : String(err)}) — ventana vacía honesta`);
    } catch { /* nada más que hacer */ }
    return out;
  }
}

/** La ruta del archivo, sólo por introspección (tests, panel). */
export function pathOf(slug) {
  return pathFor(slug);
}
