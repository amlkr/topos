/**
 * admissions-agent.mjs — el PRIMER AGENTE ESPECIALIZADO de Topos
 * (contrato: dashboard/MODULE-API.md).
 *
 * La idea del dueño: los agentes son la cobertura; las reglas de casa son
 * el foso. Este agente PROPONE, la persona DISPONE. Cero envíos.
 *
 * v0 determinista — reglas + voz del manifiesto; el borrador lo aprueba y
 * lo envía una persona, a mano, hoy. No llama a ninguna IA: lee el
 * almacén del CRM por fs (solo lectura), aplica las RULES de abajo y
 * redacta en español con la identidad del manifiesto de la escuela.
 * Nunca escribe en el CRM: cambiar un estado sigue siendo cosa de una
 * persona, en el tab del CRM.
 *
 * Honestidad de auditoría: los borradores «adoptado»/«descartado» son
 * registros PERMANENTES y no se reescriben jamás. Los «pendiente» sí se
 * regeneran en cada visita, y solo mientras no exista decisión humana
 * para ese lead.
 *
 * Propiedad: un solo archivo, importando únicamente ../module-kit.mjs y
 * stdlib (node:fs / node:path / node:url). Almacén propio:
 * jsonStore(slug, "admisiones-agent") → dashboard/.data/<slug>/admisiones-agent.json.
 * El CRM se lee de dashboard/.data/<slug>/crm.json y NUNCA se escribe.
 * Datos de demo: familias ficticias de Lotus Valley (docs/BOUNDARIES.md).
 * Sin JS de cliente: decisiones por POST con redirect 303.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonStore, esc, head, endHead, card, empty, todayISO } from "../module-kit.mjs";

export const meta = { key: "admisiones-agent", label: "Agente Admisiones", order: 70, roles: ["director", "admissions"] };

const HERE = dirname(fileURLToPath(import.meta.url)); // dashboard/modules
const DATA_DIR = join(HERE, "..", ".data");           // dashboard/.data

const DEFAULTS = { drafts: [] };

/* ------------------------------------------------------------------ *
 * RULES — el cerebro del agente, a la vista y en texto plano.         *
 * v0 es determinista: sin umbral escrito aquí no hay candidatura.     *
 *  · seguimientoDays : ≥ N días desde el último toque del lead        *
 *    (updatedAt) → borrador de «seguimiento»: la conversación se      *
 *    enfrió pero la familia sigue esperando respuesta.                *
 *  · recuperacionDays: ≥ N días → «recuperación» (por encima del umbral*
 *    de seguimiento): se asume que casi nos perdieron; el tono cambia *
 *    y se ofrece cerrar sin insistir.                                 *
 *  · terminalStatuses: estados sin salida. No se proponen mensajes a   *
 *    una familia matriculada (ya está dentro, su expediente vive en   *
 *    el pipeline) ni a una perdida (la decisión la tomaron ellas).     *
 *  · needsDocsKeyword: una nota de seguimiento del CRM que contenga    *
 *    este token (en minúsculas) marca «documentación pendiente»: suele *
 *    esconder un desajuste de edad/programa que nadie resolvió. Es la  *
 *    única candidatura que no depende de días.                        *
 * ------------------------------------------------------------------ */
export const RULES = Object.freeze({
  seguimientoDays: 5,
  recuperacionDays: 15,
  terminalStatuses: Object.freeze(["matriculado", "perdido"]),
  needsDocsKeyword: "needs-docs",
});

/* ------------------------------------------------------------------ *
 * Helpers puros — exportados para tests. Ninguno toca disco.          *
 * ------------------------------------------------------------------ */

/** Días UTC desde una fecha ISO (YYYY-MM-DD) hasta `today`. null si la
 *  fecha no es legible: el agente lo dice («sin fecha»), no lo inventa. */
export function daysSince(iso, today = todayISO()) {
  const a = Date.parse(String(iso ?? "") + "T00:00:00Z");
  const b = Date.parse(String(today) + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

const isTerminal = (status) => RULES.terminalStatuses.includes(String(status ?? "").toLowerCase());

/** Clasifica UN lead con sus followups ya filtrados. Pura.
 *  Devuelve el candidate {leadId,kind,days,needsDocs,...} o null.
 *  Prioridad de kinds: recuperación > seguimiento > documentación. */
export function classifyLead(lead, leadFollowups = [], today = todayISO()) {
  if (!lead || !lead.id) return null;
  if (isTerminal(lead.status)) return null; // sin propuesta para estados terminales
  const days = daysSince(lead.updatedAt ?? lead.day, today);
  const needsDocs = (Array.isArray(leadFollowups) ? leadFollowups : [])
    .some((f) => String(f?.text ?? "").toLowerCase().includes(RULES.needsDocsKeyword));
  let kind = null;
  if (days !== null && days >= RULES.recuperacionDays) kind = "recuperación";
  else if (days !== null && days >= RULES.seguimientoDays) kind = "seguimiento";
  else if (needsDocs) kind = "documentación";
  if (!kind) return null;
  return {
    leadId: String(lead.id),
    kind,
    days,
    needsDocs,
    family: String(lead.family ?? "").trim() || "la familia",
    source: String(lead.source ?? "").trim() || "web",
    status: String(lead.status ?? ""),
  };
}

function followupsFor(followups, leadId) {
  if (!Array.isArray(followups)) return [];
  return followups.filter((f) => f && String(f.leadId) === String(leadId));
}

/** CANDIDATURES: recorre los leads del CRM y devuelve los que hoy merecen
 *  un borrador, con la prioridad del más vencido primero. Pura: recibe el
 *  objeto crm ya leído ({leads, followups}) y el manifiesto. */
export function computeCandidates(crmData, manifest, today = todayISO()) {
  void manifest; // los candidatos son reglas sobre el CRM; la voz entra al redactar
  const leads = Array.isArray(crmData?.leads) ? crmData.leads : [];
  const followups = Array.isArray(crmData?.followups) ? crmData.followups : [];
  const out = [];
  for (const lead of leads) {
    const c = classifyLead(lead, followupsFor(followups, lead?.id), today);
    if (c) out.push(c);
  }
  return out.sort((a, b) => (Number(b.days ?? -1) - Number(a.days ?? -1)) || a.leadId.localeCompare(b.leadId));
}

/* ------------------------------------------------------------------ *
 * Redacción en la voz de la escuela. Español, cálido, concreto.       *
 * Regla 1 de la casa: prohibido prometer plazas, pagos, confirmaciones *
 * o plazos que el sistema no ha hecho. Solo habla de lo que hay en el  *
 * manifiesto (programas reales) y de los datos del propio lead.        *
 * ------------------------------------------------------------------ */

function firstProgram(manifest) {
  const list = Array.isArray(manifest?.programs) ? manifest.programs : [];
  const p = list.find((x) => x && String(x.name ?? "").trim());
  if (!p) return null;
  const bits = [];
  if (p.ages) bits.push(`edades ${String(p.ages)}`);
  if (p.place) bits.push(String(p.place));
  return { name: String(p.name).trim(), detail: bits.length ? ` (${bits.join(", ")})` : "" };
}

const SOURCE_PHRASE = { web: "la web", referido: "una recomendación", llamada: "vuestra llamada", visita: "vuestra visita", otro: "vuestra consulta" };
const sourcePhrase = (s) => SOURCE_PHRASE[String(s).toLowerCase()] ?? `vuestra consulta (${s})`;

/** Construye {subject, body} para un candidate. Pura. El cuerpo es texto
 *  plano listo para que una persona lo revise, lo cambie y lo envíe. */
export function buildDraft(candidate, manifest) {
  const c = candidate;
  const name = String(manifest?.identity?.name ?? "").trim() || "la escuela";
  const tagline = String(manifest?.identity?.tagline ?? "").trim();
  const pg = firstProgram(manifest);
  const about = pg ? `«${pg.name}»${pg.detail}` : "nuestros programas";
  const waited = c.days === null ? "más tiempo del que sabemos medir (el lead no tiene fecha legible)"
    : c.days <= 0 ? "apenas un día"
    : `${c.days} ${c.days === 1 ? "día" : "días"}`;
  const from = sourcePhrase(c.source);

  let subject;
  let opener;
  if (c.kind === "recuperación") {
    subject = `¿Seguimos valorando ${about}? — ${name}`;
    opener =
      `Sabemos que elegir escuela es una decisión de familia y que a veces la vida va más rápido que el correo: ` +
      `han pasado ${waited} desde ${from} sin que hablemos. Si ${about} sigue teniendo sentido para vosotros, ` +
      `responded a este mensaje y retomamos la conversación donde la dejasteis. Y si al final habéis tomado otro ` +
      `camino, decídnoslo también: os agradecemos la confianza y no volvemos a insistir.`;
  } else if (c.kind === "documentación") {
    subject = `Un dato pendiente para la familia ${c.family} — ${name}`;
    opener =
      `Gracias por la conversación hasta ahora. Revisando vuestra ficha vemos que, para seguir con ${about}, ` +
      `nos falta documentación o una edad que aún no tenemos a la vista. Si ya lo enviasteis por otro canal, ` +
      `decidnos cuándo y a dónde y lo buscamos en un momento; si no, contadnos qué tenéis y lo cuadramos juntos, ` +
      `sin agobios y sin plazos inventados.`;
  } else {
    subject = `Familia ${c.family}: retomamos ${about} — ${name}`;
    opener =
      `Han pasado ${waited} desde ${from} y no queremos que se nos apague la conversación. Seguimos con las ` +
      `mismas ganas de recibiros: si os quedan dudas de horarios, edades o del día a día de ${about}, ` +
      `responded a este mensaje y las vemos con calma. Solo contamos lo que la escuela tiene publicado hoy; ` +
      `lo demás se acuerda en persona.`;
  }

  const lines = [
    `Hola, familia ${c.family}:`,
    ``,
    opener,
    ``,
    `Cuando queráis, aquí estamos.`,
    ``,
    `— Equipo de admisiones · ${name}`,
  ];
  if (tagline) lines.push(`   ${tagline}`);
  return { subject, body: lines.join("\n") };
}

/* ------------------------------------------------------------------ *
 * El corazón del agente: crm + manifiesto → candidatos + borradores.  *
 * Pura (nada de fs, nada de estado) — la comparten render() y tests.  *
 * ------------------------------------------------------------------ */
export function compute(crmData, manifest, today = todayISO()) {
  const candidates = computeCandidates(crmData, manifest, today);
  const drafts = candidates.map((c) => {
    const { subject, body } = buildDraft(c, manifest);
    return { leadId: c.leadId, kind: c.kind, days: c.days, needsDocs: c.needsDocs, family: c.family, subject, body };
  });
  return { candidates, drafts };
}

/** Fusiona los borradores recién computados con el almacén propio.
 *  Regla de oro: un lead con decisión humana (adoptado/descartado) queda
 *  FUERA de la regeneración para siempre — su registro se conserva tal
 *  cual y nunca se sobreescribe. Sin decisión, el pendiente se regenera
 *  en cada visita con id estable `<leadId>--<kind>`. Pura: `now` entra
 *  por parámetro. Devuelve la lista nueva de borradores del almacén. */
export function mergeDrafts(existingDrafts, computedDrafts, now = new Date().toISOString()) {
  const list = (Array.isArray(existingDrafts) ? existingDrafts : []).filter((d) => d && d.leadId);
  const decidedLeadIds = new Set(list.filter((d) => d.adopted && d.adopted !== "pendiente").map((d) => String(d.leadId)));
  const permanent = list.filter((d) => decidedLeadIds.has(String(d.leadId)));
  const fresh = (Array.isArray(computedDrafts) ? computedDrafts : [])
    .filter((x) => x && x.leadId && !decidedLeadIds.has(String(x.leadId)))
    .map((x) => ({
      id: `${x.leadId}--${x.kind}`,
      leadId: x.leadId,
      kind: x.kind,
      subject: x.subject,
      body: x.body,
      days: x.days ?? null,
      needsDocs: Boolean(x.needsDocs),
      family: x.family ?? "",
      generatedAt: now,
      adopted: "pendiente",
      decidedBy: "",
      decidedAt: "",
    }));
  return [...permanent, ...fresh];
}

/* ------------------------------------------------------------------ *
 * Lectura directa del CRM por fs (de SOLO LECTURA, nunca se escribe). *
 * Si el archivo no está o está a medias de una escritura, degradamos   *
 * con una línea honesta — el módulo no revienta.                       *
 * ------------------------------------------------------------------ */
export function crmPathFor(slug) {
  return join(DATA_DIR, String(slug || "default"), "crm.json");
}

export function readCrm(slug) {
  const path = crmPathFor(slug);
  const bad = (msg) => ({ data: { leads: [], followups: [] }, note: msg, path });
  if (!existsSync(path)) return bad(`No hay archivo de CRM todavía en esta escuela (${path}). Sin leads no hay candidaturas: abre el tab del CRM para sembrar la demo o da de alta la primera familia.`);
  let raw;
  try { raw = readFileSync(path, "utf8"); }
  catch (e) { return bad(`El CRM no se pudo leer (${String(e && e.code || e)}). Esta visita no propone nada; inténtalo de nuevo en un momento.`); }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return bad("El CRM no se pudo interpretar (¿escritura a medias?). El agente no propone nada sobre datos a medias; recarga en un momento."); }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.leads))
    return bad("El CRM no tiene la forma esperada ({leads:[], followups:[]}). Nada que proponer hasta que el tab del CRM escriba de nuevo.");
  if (!Array.isArray(parsed.followups)) parsed.followups = [];
  return { data: parsed, note: null, path };
}

/* ------------------------------------------------------------------ *
 * UI (GET /m/admisiones-agent)                                        *
 * ------------------------------------------------------------------ */

const KIND_TONE = { "seguimiento": "orange", "recuperación": "coral", "documentación": "plum" };
const chip = (text, tone) => `<span class="chip chip--${tone ?? "none"}">${esc(text)}</span>`;

function draftCard(d) {
  const dayLabel = d.days === null || d.days === undefined
    ? "sin fecha"
    : Number(d.days) <= 0
      ? "tocado hoy"
      : `espera ${d.days} ${Number(d.days) === 1 ? "día" : "días"}`;
  const decided = Boolean(d.adopted && d.adopted !== "pendiente");
  const actionBlock = decided
    ? `<p class="note" style="margin:10px 0 0">Decisión humana: <strong>${esc(d.adopted)}</strong> — ${esc(d.decidedBy || "sin actor")} · ${esc(d.decidedAt || "sin fecha")}. Registro permanente: este borrador ya no se regenera.</p>`
    : `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
        <form method="post" action="/m/${meta.key}" style="margin:0">
          <input type="hidden" name="action" value="decide">
          <input type="hidden" name="draftId" value="${esc(d.id)}">
          <input type="hidden" name="decision" value="adoptado">
          <button class="btn" type="submit">Adoptar borrador</button>
        </form>
        <form method="post" action="/m/${meta.key}" style="margin:0">
          <input type="hidden" name="action" value="decide">
          <input type="hidden" name="draftId" value="${esc(d.id)}">
          <input type="hidden" name="decision" value="descartado">
          <button class="btn btn--ghost" type="submit">Descartar</button>
        </form>
      </div>
      <p class="note" style="margin:8px 0 0">Adoptar NO envía nada: guarda tu decisión en el almacén del agente. El mensaje lo copias y lo mandas tú, desde tu correo de siempre.</p>`;
  return card(`
    <p style="margin:0 0 6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${chip(d.kind, KIND_TONE[d.kind] ?? "navy")}
      ${chip(dayLabel, "none")}
      ${d.needsDocs ? chip("documento pendiente", "sky") : ""}
      ${decided ? chip(d.adopted === "adoptado" ? "adoptado" : "descartado", d.adopted === "adoptado" ? "green" : "none") : ""}
    </p>
    <h3 style="margin:0 0 4px">${esc(d.family || "familia sin nombre")}</h3>
    <p class="note" style="margin:0 0 8px">lead ${esc(d.leadId)} · borrador generado el ${esc(String(d.generatedAt).slice(0, 10))} · ${decided ? "decidido" : "esperando a una persona"}</p>
    <p style="margin:0 0 6px"><strong>Asunto:</strong> ${esc(d.subject)}</p>
    <pre style="margin:0;white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85rem;line-height:1.5;background:rgba(0,20,51,.04);border:1px solid rgba(0,20,51,.08);border-radius:12px;padding:12px 14px">${esc(d.body)}</pre>${actionBlock}
  `);
}

export function render(ctx) {
  const { data: crm, note, path: crmPath } = readCrm(ctx.slug);

  // el almacén propio guarda propuestas + el histórico de decisiones.
  const db = jsonStore(ctx.slug, meta.key, DEFAULTS);
  let current = db.load();
  if (!current || typeof current !== "object" || Array.isArray(current)) current = structuredClone(DEFAULTS);
  if (!Array.isArray(current.drafts)) current.drafts = [];
  const drafts = mergeDrafts(current.drafts, compute(crm, ctx.manifest).drafts);
  if (JSON.stringify(drafts) !== JSON.stringify(current.drafts)) db.save({ drafts });

  const pend = drafts.filter((d) => !d.adopted || d.adopted === "pendiente")
    .sort((a, b) => (Number(b.days ?? -1) - Number(a.days ?? -1)) || String(a.leadId).localeCompare(String(b.leadId)));
  const decided = drafts.filter((d) => d.adopted && d.adopted !== "pendiente")
    .sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt)));

  const rulesLines = [
    `Candidato = lead del CRM cuyo estado NO es terminal (${RULES.terminalStatuses.join(" / ")}).`,
    `≥ ${RULES.seguimientoDays} días desde el último toque (updatedAt, o day si no hay) → borrador de «seguimiento».`,
    `≥ ${RULES.recuperacionDays} días sin tocar → borrador de «recuperación» (pasa por encima del de seguimiento).`,
    `Nota de seguimiento que contenga la palabra clave «${RULES.needsDocsKeyword}» → borrador de «documentación pendiente» (única candidatura sin días; suele ser un desajuste de edad/programa sin resolver).`,
    `Sin fecha legible en el lead → nunca se posterga en silencio: se muestra «sin fecha» si cruza un umbral por documento, y nada si no.`,
    `Un borrador adoptado o descartado es un registro PERMANENTE: no se regenera ni se reescribe nunca, lleve lo que lleve el lead después.`,
    `Cero LLM, cero envíos, cero escritura en el CRM: plantillas deterministas con los datos del lead y la voz del manifiesto.`,
  ].map((r) => `<li>${esc(r)}</li>`).join("");

  const emptyBlock = empty("Hoy sin trabajo: ningún lead cruza los umbrales del agente, o los que los cruzaban ya tienen una decisión humana registrada. Eso es una buena tarde, no un error.");

  const schoolName = String(ctx.manifest?.identity?.name ?? ctx.slug ?? "la escuela");

  return `${head({
    kicker: "agente · admisiones",
    title: "Agente de Admisiones",
    sub: "v0 determinista — reglas + voz del manifiesto; el borrador lo aprueba y lo envía una persona, a mano, hoy.",
  })}
    <p class="clay callout"><strong>El agente lee y propone; dispone la persona.</strong> Este módulo NO marca el CRM ni cambia estados de leads:
      eso se hace a mano, en el tab del CRM, por quien decide. Y cero envíos: de aquí no sale un solo mensaje hacia una familia.</p>
    ${note ? `<p class="clay callout callout--warn">${esc(note)}</p>` : ""}

    <h2 style="margin:18px 0 4px">Borradores esperando a una persona${pend.length ? ` (${pend.length})` : ""}</h2>
    <p class="note" style="margin:0 0 12px">Ordenados por días en espera — lo más vencido primero, para que se vea antes lo que duele.</p>
    ${pend.length ? pend.map(draftCard).join("") : emptyBlock}

    ${decided.length ? `
    <h2 style="margin:22px 0 4px">Decisiones humanas (${decided.length}) — registro permanente</h2>
    <p class="note" style="margin:0 0 12px">Qué propuso el agente y qué hizo cada persona con ello. Esto no se borra ni se regenera desde este módulo.</p>
    ${decided.map(draftCard).join("")}` : ""}

    <h2 style="margin:22px 0 4px">Cómo decide este agente (v0)</h2>
    ${card(`<p class="note" style="margin:0 0 8px">Sin magia y sin lista negra: estas son TODAS las reglas, y las verás aplicadas arriba tal cual.</p>
      <ul style="margin:0;padding-left:1.2rem;font-size:.92rem;line-height:1.6">${rulesLines}</ul>`)}
    <p class="note" style="margin:14px 0 0">Voz tomada del manifiesto de <strong>${esc(schoolName)}</strong> (identity.name, tagline y el primer programa con sus edades). Datos leídos, solo-lectura, de <code>${esc(crmPath)}</code>. Almacén propio del agente: <code>dashboard/.data/${esc(ctx.slug || "default")}/${esc(meta.key)}.json</code>.</p>
  ${endHead}`;
}

/* ------------------------------------------------------------------ *
 * Escrituras (POST /m/admisiones-agent) — UNA sola: decidir.          *
 * ------------------------------------------------------------------ */

export function handle(ctx, form) {
  // defensa en profundidad: el server ya filtra roles, pero el agente también mira.
  if (meta.roles.length && !meta.roles.includes(ctx.session?.role)) {
    return { status: 403, html: `<p class="clay callout callout--warn">Tu rol no puede decidir sobre los borradores del agente.</p>` };
  }

  const back = { redirect: "/m/" + meta.key };
  const fail = (msg) => ({
    status: 422,
    html: `<section class="section"><p class="clay callout callout--warn">${esc(msg)}</p>
      <p><a class="btn" href="${esc("/m/" + meta.key)}">Volver a los borradores</a></p></section>`,
  });

  const action = String(form.get("action") ?? "");
  if (action !== "decide") return fail("Acción no reconocida en el agente; nada se cambió. La única escritura que admite es decidir un borrador («decide»).");

  const decision = String(form.get("decision") ?? "");
  if (decision !== "adoptado" && decision !== "descartado")
    return fail(`La decisión debe ser «adoptado» o «descartado»; llegó «${decision || "(vacío)"}». Nada se cambió.`);

  const draftId = String(form.get("draftId") ?? "").trim();
  if (!draftId) return fail("Falta el identificador del borrador; nada se cambió.");

  const db = jsonStore(ctx.slug, meta.key, DEFAULTS);
  const data = db.load();
  if (!data || !Array.isArray(data.drafts)) data.drafts = [];
  const draft = data.drafts.find((d) => d && String(d.id) === draftId);
  if (!draft) return fail("Ese borrador no está en el almacén (¿se regeneró la página desde entonces?). Recarga y decide sobre el borrador actual.");
  if (draft.adopted && draft.adopted !== "pendiente")
    return fail(`Este borrador ya lo decidió ${draft.decidedBy || "alguien"} el ${draft.decidedAt || "—"} como «${draft.adopted}». Los registros permanentes no se reescriben: esa es la honestidad de este agente.`);

  draft.adopted = decision;
  draft.decidedBy = String(ctx.session?.email ?? "—");
  draft.decidedAt = new Date().toISOString();
  db.save(data);
  return back;
}
