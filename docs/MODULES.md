# MODULES.md — el mapa ordenado de Topos

> Un módulo = un archivo en `dashboard/modules/` que cumple
> `MODULE-API.md`. El registro los descubre solos; el nav y los roles
> salen de su `meta`. Así el producto crece sin pelearse.

## Estado (2026-11-21, fase TALLYHOUSE + agentes)

| Orden | Módulo | Estado | Roles | Qué es real hoy |
|---|---|---|---|---|
| 0-9 | Core (Hoy, Pipeline, Money, People, Stories, School) | **vivo** | todos/staff | las cinco primitivas sembradas, manifiesto editable con contrato que muerde |
| 10 | **crm** | VIVO — estados leídos del funnel del manifiesto | director, admissions | leads con estados y seguimiento, filtro, seed demo ficticio |
| 20 | **finance** | VIVO | director, finance | libro de gastos propio + lo cobrado/pendiente LEÍDO del core (nunca duplicado) |
| 30 | **comms** | VIVO | todo el staff | anuncios fijados + tareas por rol |
| 40 | **curriculum** | VIVO | director, coach | packs como datos + `spec/pack.schema.json` estricto + pack sembrado |
| 50 | **marketing** | **stub honesto** (integrador) | director | la cola del core en vivo + la lista de lo que falta; sin botón "publicar" porque no hay conector |
| 80 | **familias** | VIVO (público /familias) | público /familias + helper staff | portal por token de capacidad, solo SU familia, rechazo genérico |
| 70 | **admisiones-agent** | VIVO v0 | director, admissions | el primer agente: reglas deterministas + voz del manifiesto; bandeja «esperando a una persona»; decisiones permanentes con actor |
| 85 | **journal** | VIVO | director | JSONL quién/cuándo/qué; solo éxitos; refusales por rol NO se escriben; fold-refused sí |
| — | **funnel como dato** | VIVO | — | admissions.funnel en el schema; contrato muerde terminales deshonestos; 66/66 tests |
| — | **features gating** | VIVO | — | tabs Y URLs se apagan por operations.features (marketing: false en Lotus → 403 honesto) |
| 90 | example | vivo (test del contrato) | todos | la prueba de que el registry funciona |

## El orden no es cosmético

1. **Piloto primero**: ningún módulo se da por bueno hasta que una
   escuela real lo use. La lista de espera de features la dictan las
   escuelas, no este documento.
2. **Cada número depende del anterior**: finanzas lee del core;
   marketing necesitará currículo (historias) y blog (cola); el portal
   de padres multiplica el valor de CRM+finanzas.
3. **Regla de Thom sobre el producto**: lo que no cabe en un módulo
   con `meta/render/handle` y su JSON store, no es una feature — es un
   pretexto para refactorizar el registry.

## Reglas de frontera (docs/BOUNDARIES.md, no negociables)

- Datos ficticios únicamente (Lotus Valley, Aurora Terrace).
- Cero lectura/escritura del repo del cliente (Esara/a4k).
- Localhost + JSON/sqlite local. Sin Supabase. Sin Vercel.
- Todo string dinámico pasa por `esc()`; toda escritura, por el
  contrato antes de tocar disco.
