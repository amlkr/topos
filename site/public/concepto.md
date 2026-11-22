# Topos — la idea completa, de Spinoza a localhost

> Documento de conversación. Está escrito para ser leído y criticado por otra inteligencia
> (Claude, en este juego). No es marketing: es el pensamiento tal como se construyó,
> con sus reglas, sus mediciones y sus dudas. Si algo de esto te parece un error, dilo.

---

## 1. El origen: un laboratorio, no una empresa

Un director creativo de escuelas internacionales en Tailandia (Chiang Mai/Rayong) lleva años
construyendo a mano el software de sus clientes: webs, formularios de admisión, portales de
pagos por transferencia, paneles de receipts, portales de padres. Tres marcas, tres webs,
tres dashboards — **cada uno con un flujo de admisiones distinto** (campamentos, colegio
internacional, academia de fútbol).

La observación que lo cambió todo: *no estoy haciendo tres webs; estoy plegando tres veces
el mismo bulto con distinta forma*. Y la segunda observación, la que dolió y liberó a la vez:
**eso no es el cliente, es el método**. El cliente (Esara) es el laboratorio; el producto
(Topos) es lo que el laboratorio enseñó, re-derivado desde cero, sin una línea del código
ajeno. Frontera dura: *las lecciones cruzan, los artefactos no*.

## 2. La filosofía operativa (no decoración: arquitectura)

**Spinoza — el conatus.** Cada cosa persevera en su ser. Una escuela no es un negocio que
usa software: es un esfuerzo por persistir (matricular, enseñar, cobrar, contar sus historias).
El software que entendemos es el que *ayuda al conatus de la escuela*, no el que la convierte
en cliente de un SaaS. De aquí sale la regla de negocio más importante: **la plataforma
persiste sirviendo escuelas existentes, no anticipando funciones**. Ningún módulo se construye
"porque falta": se construye cuando una escuela real lo pide pagando.

**Deleuze — el pliegue.** No hay un molde "escuela" del que salen copias. Hay una sustancia
(compartida) que se pliega en formas (distintas). Lotus Valley (campamentos, 3 idiomas) y
Aurora Terrace (cursos, bilingüe, GDPR) son el mismo bulto plegado distinto. El motor no
"soporta casos de uso": **un solo contrato se pliega**. La metáfora es literal en el código:
el manifiesto es la línea de pliegue.

**Topología — el invariante bajo deformación continua.** La taza y el donut son el mismo
objeto. Una escuela de artes marciales y un colegio IB son el mismo objeto para Topos:
mismas primitivas, distinto plegado. De aquí la **Regla de Thom** del producto (nombre del
matemático de las catástrofes, no del alumno): *"si no cabe en el manifiesto, no es una
función — es una grieta"*. Si una escuela necesita algo que el contrato no puede expresar,
el contrato está mal, no la escuela. La respuesta nunca es un parche en el código de esa
escuela: es una extensión del vocabulario, igual para todas.

**Variedad (manifold) — el nombre del motor.** Localmente, cada escuela tiene sus propias
coordenadas (su funnel, sus colores, sus leyes de datos). Globalmente, comparten una
estructura. El motor se llama `manifold` porque eso es lo que implementa: atlas de cartas
locales sobre un espacio compartido.

**La regla de oro heredada del laboratorio:** el software como artefacto murió (los agentes
lo generan gratis). Lo que no muere: **el contrato** (el lugar donde las cosas encajan),
**la responsabilidad** (quien responde a las 3am por los datos de unos niños) y **el
contenido irreemplazable** (el currículo). Topos no es una empresa de software: es una
empresa de contratos + confianza + currículo que usa software desechable.

## 3. El concepto: una escuela es un ciclo

No una lista de módulos. Un círculo que se muerde la cola:

```
MERCADO → ADMISIONES → CAMPUS → ACADÉMICO → FINANZAS → FAMILIAS → (historias) → MERCADO
 atraer     convertir    operar    enseñar     cobrar     retener      contar
```

Cada área tiene sus humanos, sus datos y (pronto) su agente. **El CRM vive en Admisiones,
no en Finanzas** (un lead es una familia que aún no existe para la escuela; finanzas solo
conoce a quien ya pagó). Esta estructura ES el dashboard, ES el catálogo de agentes, ES el
catálogo de precios y ES el argumento de venta: cualquier directora se reconoce en el ciclo
en cinco segundos.

## 4. El contrato: el manifiesto como constitución

Una escuela completa cabe en ~40 líneas de YAML:

```yaml
apiVersion: topos/v0
kind: School
identity:   { name, locales: [en, th, zh], tagline, colors }
topology:   { entity: activity | course | camp, groupsBy: term }   # ← qué es "un programa" aquí
admissions: { funnel: [consulta, visita, matriculado], forms: [...] }  # ← el flujo como DATO
programs:   [{ code, price: {amount, published}, door, ages }]
operations: { primitives: [persons, enrolments, payments, communication, content],
              features: { crm: true, marketing: false, ... } }     # ← el menú que se paga
```

- **5 primitivas son `const`**: persons, enrolments, payments, communication, content. Son la
  sustancia. Todo lo demás es vocabulario plegable.
- **El contrato muerde antes de tocar disco**: precios inventados, códigos duplicados, buzones
  falsos, funnels que terminan en "perdido" (el último estado debe ser una verdad de pago) →
  422 con la lista exacta y el almacén intacto. 66 tests lo prueban.
- **`features` es la factura**: las pestañas y las rutas 403 nacen del manifiesto. Upgrade =
  una línea en el YAML.

## 5. Los agentes: la frutilla, con veneno controlado

La tesis: un agente sin contrato es un chatbot; **un agente sobre un contrato explicable es
un empleado**. El circuito que ya funciona esta noche:

```
agente PROPONE (borrador con la voz del manifiesto)
  → contrato VALIDA (muerde antes de guardar)
    → humano APRUEBA (el botón de enviar es siempre una persona)
      → diario FIRMA (quién, cuándo, qué — JSONL inmutable por escuela)
```

Catálogo (solo el primero existe de verdad; el resto es plan): Admisiones (seguimientos a
leads trabados, v0 determinista, 17/17 tests) · Finanzas (coteja, avisa, **nunca marca
"pagado"**) · Equipo · Currículo · Plegador (escanea la web vieja de una escuela y propone su
manifiesto — el que elimina al experto de la puesta en marcha).

Reglas duras heredadas del laboratorio (las "reglas de casa", que son ingeniería de honestidad,
no estilo):
1. **Nada en pantalla que el sistema no haya hecho** — prohibido "pago recibido", "plaza
   reservada", "email enviado" sin envío real medido.
2. Un estado honesto vale más que un estado bonito (cuatro estados, no "gracias").
3. **Medir antes de afirmar, y retractarse en voz alta** (el exit code de un pipe no prueba nada).
4. No publicar un email sin buzón probado (DKIM y MX son dos cosas distintas).
5. Los relojes los mueve la base de datos (triggers), no el application code.
6. Cada marca replica el patrón, no el aspecto.
7. No tocar lo que otro agente está escribiendo (zonas deslindadas — así se construyó esto:
   5 agentes en paralelo, un archivo por módulo, cero conflictos).
8. La caja que edita no compila lo pesado (builds remotos o en otra máquina).
9. Quién autoriza: el dueño. Y la evidencia no la negocia nadie.

## 6. Arquitectura e infraestructura real (esta noche)

- **Runtime**: Node 22 puro, ESM, cero dependencias (solo `yaml`). `node:sqlite` para sesiones
  (medido: sin flag en 22.23.2). JSON/JSONL para datos de demo. Todo localhost.
- **Auth**: scrypt N=2^15, sesiones HMAC firmadas, **invitaciones como tokens de capacidad**
  (32 hex, un solo uso, el token ES la capacidad — patrón del laboratorio, re-derivado).
- **Portal de familias**: `/familias?t=token` — sin app, sin contraseña, sin cookies; una
  familia solo ve la suya; rechazo genérico anti-enumeración (bytes idénticos).
- **Registry de módulos**: un módulo = un archivo (`modules/<key>.mjs` con meta/render/handle);
  el nav y el gating (roles × features) salen del manifiesto. Así crece el producto sin
  peleas de merge.
- **Journal**: cada POST deja quién/cuándo/qué; los refusals por rol NO se registran
  (verificado por ausencia); las mordidas del contrato SÍ.
- **Diseño**: pasó por tres pieles — dark dev-tool → clay escolar → **minimal de operaciones**
  (el ciclo vital como sidebar, briefing de seis líneas, jerarquía por espacio, un acento).
  Contrastes WCAG calculados, reduced-motion en todo, targets 44px. La lección: el diseño es
  la epistemología hecha interfaz — si el panel miente, la escuela se cree mentiras.
- **Landing**: https://vienna-knowledge-identification-recycling.trycloudflare.com
  **Panel**: https://cfr-managed-sustainable-requirement.trycloudflare.com (director@lotus.example / topos-demo)
- **Frontera**: sin Supabase, sin Vercel, sin una línea del cliente. AGPL-3.0 para motor y spec
  (el invariante es de todos); lo operado (dominio, correo, respaldos, packs) es lo que paga.

## 7. El negocio: one-person business → red de partners

- Matemática: hosted $300/mes/escuela plano (nunca por alumno). 10 escuelas = sueldo solo;
  30 = negocio; 100 = empresa. Tailandia sola tiene ~400 escuelas internacionales; el mundo,
  ~30.000. El mercado no es el software: son las nóminas administrativas que Topos + agentes
  reemplazan (vender FTE-math, no features).
- Escalar sin empleados: **partners locales** (consultores educativos por país) operan la
  confianza; el provisioner de un comando opera la técnica; el registro de topologías (manifiestos
  validados por país/régimen) es el catálogo. Reparto 60/40. El foso no es el código (AGPL lo
  regala): es el registro + el currículo + el rastro auditable + tres escuelas reales operadas.
- Paquetes = encendido de features: **Puerta** (web+admisiones, $0 self-host) · **Oficina**
  (+CRM+finanzas+equipo+diario, hosted) · **Campus** (+currículo+packs). Los learning packs
  (semanas/materiales/objetivos como datos) son la capa creativa: margen de autor, no de servidor.

## 8. Lo que NO sé / dudas honestas (para que las mordáis)

1. **La filosofía como carga**: ¿convento Spinoza en una landing o es el diferenciador real
   frente a CRMs aburridos? ¿Cómo se cuenta sin sonar a startup que finge profundidad?
2. **Un solo fundador con agentes**: ¿el techo real son ~30-50 escuelas operadas a mano con
   ayuda de agentes, o el provisioner+partners de verdad lo multiplica? ¿Qué se rompe primero?
3. **AGPL para escuelas**: ¿convence a un comité escolar o asusta? ¿El "eres co-autor, no
   inquilino" vende o confunde?
4. **Agentes**: ¿dónde crean valor de verdad y dónde son teatro? (Hoy: el de admisiones es
   determinista y lo dice — ¿eso da confianza o mata el relato?)
5. **El ciclo como IA**: ¿es la mejor taxonomía o hay una división más natural (por roles
   humanos: la secretaria, el coordinador, el director)? ¿Un panel por persona o un panel
   por área?
6. **Datos como negocio**: el análisis (qué formulario pierde familias, cohortes) "tiene mucho
   dinero" — ¿es add-on, es el producto real, o es una trampa de complejidad para antes de hora?

---

*Escrito una noche de noviembre de 2026 entre dos inteligencias y un director de escuelas
que quería "central de administración de muchos ecosistemas que se pliegan uno tras otro".
Lo que sigue es la conversación con Claude: pídele que critique, que pliegue, que muerda.*
