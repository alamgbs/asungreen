#!/usr/bin/env node
// Pipeline abierto (SIN credenciales): Open-Meteo/ERA5 + MODIS (ORNL) → data/series/{zona}.json + manifest.json
//
// Uso: node scripts/pipeline/open/run.mjs [--solo=clima|modis] [--prioridad-max=3] [--max-zonas=N]
//        [--max-espera-hora-min=N] [--forzar] [--sin-manifest]
// Es IDEMPOTENTE y REANUDABLE: solo pide lo que falta o está desactualizado.
//   · zona/indicador ausente        → backfill completo (ERA5 desde 1991; MODIS desde 2000-02)
//   · último mes < último completo  → incremental: re-pide M-2 en adelante (regla de invalidación)
//   · versión de pipeline distinta  → leerZona() la descarta y se reconstruye entera
// Si Open-Meteo agota la cuota gratuita, se detiene con orden y lo deja en manifest.pendientes.
import {
  leerZona, nuevaZona, escribirZona, validarZona, construirManifest, mensualAMapa, mapaAMensual,
  anualDesdeMensual, mesIdx, mesStr, parseMes, redondear,
} from '../lib/series-io.mjs';
import { cargarZonas } from '../lib/zonas.mjs';
import { CATALOGO, BASE } from '../lib/catalogo.mjs';
import { celda, claveCelda, descargarDiario, mensualDesdeDiario, CuotaError } from './openmeteo.mjs';
import { PRODUCTOS, descargarZona } from './modis.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const PRIORIDAD_MAX = Number(args['prioridad-max'] ?? 3);   // 0 país, 1 deptos, 2 ciudades, 3 distritos
const PRIORIDAD_MODIS = Number(args['prioridad-modis-max'] ?? 2); // MODIS: ~190 pedidos/zona; distritos solo a pedido
const MAX_ZONAS = Number(args['max-zonas'] ?? Infinity);
const MAX_ESPERA = Number(args['max-espera-hora-min'] ?? 0);
const solo = args.solo ?? 'todo';

const ahora = new Date();
const refer = new Date(ahora.getTime() - 7 * 864e5); // ERA5 tiene ~5 días de retraso
const ULTIMO_COMPLETO = mesIdx(refer.getUTCFullYear(), refer.getUTCMonth() + 1) - 1;
const isoDia = (i) => `${mesStr(i)}-01`;
const finERA5 = refer.toISOString().slice(0, 10);

const { zonas: todas, origen } = cargarZonas();
const zonas = todas.filter((z) => z.prioridad <= PRIORIDAD_MAX).slice(0, MAX_ZONAS);
console.log(`[pipeline] zonas: ${zonas.length}/${todas.length} (origen: ${origen}); último mes completo: ${mesStr(ULTIMO_COMPLETO)}`);

const pendientes = {};

/** Último mes con valor no nulo de un indicador mensual, o -1. */
function ultimoMes(z, id) {
  const m = z?.indicadores[id]?.mensual;
  if (!m) return -1;
  let k = m.v.length - 1; while (k >= 0 && m.v[k] == null) k--;
  return k < 0 ? -1 : parseMes(m.inicio) + k;
}
/** Desde cuándo pedir: null = al día; si no, mes de inicio (índice). */
function desdeNecesario(z, ids, inicioFull) {
  if (args.forzar) return inicioFull;
  const ult = Math.min(...ids.map((id) => ultimoMes(z, id)));
  if (ult < 0) return inicioFull;
  if (ult >= ULTIMO_COMPLETO) return null;
  return Math.max(inicioFull, ult - 2); // M-1 y M-2 siempre se re-piden (datos tardíos/reprocesos)
}

/** Fusiona mapas nuevos sobre lo almacenado (los nuevos pisan) y deriva anual. */
function fusionar(z, id, nuevo) {
  const ind = (z.indicadores[id] ??= {});
  const m = mensualAMapa(ind.mensual);
  for (const [i, e] of nuevo) m.set(i, e);
  ind.mensual = mapaAMensual(m);
}
function derivarAnual(z, id) {
  const c = CATALOGO[id];
  const ind = z.indicadores[id];
  ind.anual = anualDesdeMensual(ind.mensual, { agregacion: c.agregacion, decimales: c.decimales });
}
function derivarAnomalia(z) {
  const t = z.indicadores['temp-aire']?.mensual;
  if (!t) return;
  const i0 = parseMes(t.inicio);
  const porMes = Array.from({ length: 12 }, () => []);
  t.v.forEach((v, k) => { const i = i0 + k; const y = Math.floor(i / 12); if (v != null && y >= BASE.desde && y <= BASE.hasta) porMes[i % 12].push(v); });
  const clim = porMes.map((a) => (a.length >= 25 ? a.reduce((p, c) => p + c, 0) / a.length : null)); // ≥25 de 30 años
  const v = t.v.map((x, k) => (x == null || clim[(i0 + k) % 12] == null ? null : redondear(x - clim[(i0 + k) % 12], 2)));
  z.indicadores['anomalia-temp-aire'] = { mensual: { inicio: t.inicio, v, n: t.n } };
  // Anual: media anual − media de las medias anuales 1991–2020 (misma base)
  derivarAnual(z, 'temp-aire');
  const a = z.indicadores['temp-aire'].anual;
  if (a) {
    const base = a.v.filter((x, k) => x != null && a.inicio + k >= BASE.desde && a.inicio + k <= BASE.hasta);
    const mb = base.length >= 25 ? base.reduce((p, c) => p + c, 0) / base.length : null;
    z.indicadores['anomalia-temp-aire'].anual = { inicio: a.inicio, v: a.v.map((x) => (x == null || mb == null ? null : redondear(x - mb, 2))), n: a.n };
  }
}

// ── Clima (Open-Meteo) ────────────────────────────────────────────────
const IDS_CLIMA = ['temp-aire', 'temp-max-aire', 'precipitacion', 'dias-35c'];
async function faseClima() {
  const cache = new Map(); // celda+desde → mensual (zonas vecinas comparten celda de 0,25°)
  let llamadas = 0, hechas = 0, frescas = 0;
  let cuotaAgotada = null;
  for (const zona of zonas) {
    const z = leerZona(zona.id) ?? nuevaZona(zona.id);
    const desde = desdeNecesario(z, IDS_CLIMA, mesIdx(1991, 1));
    if (desde == null) { frescas++; continue; }
    if (cuotaAgotada) { pendientes[`${zona.id}/clima`] = `cuota Open-Meteo (${cuotaAgotada})`; continue; }
    const c = celda(zona.lat, zona.lon);
    const k = `${claveCelda(c)}@${desde}`;
    try {
      if (!cache.has(k)) {
        llamadas++;
        cache.set(k, mensualDesdeDiario(await descargarDiario(c, isoDia(desde), finERA5, { maxEsperaHoraMin: MAX_ESPERA })));
      }
    } catch (e) {
      if (e instanceof CuotaError) { cuotaAgotada = e.tipo; pendientes[`${zona.id}/clima`] = `cuota Open-Meteo (${e.tipo})`; console.warn(`  [clima] ${e.message}`); continue; }
      pendientes[`${zona.id}/clima`] = `error: ${e.message.slice(0, 120)}`; console.warn(`  [clima] ${zona.id}: ${e.message}`); continue;
    }
    const m = cache.get(k);
    const z2 = leerZona(zona.id) ?? nuevaZona(zona.id); // relee: la fase MODIS puede haber escrito en el medio
    for (const id of IDS_CLIMA) { fusionar(z2, id, m[id]); derivarAnual(z2, id); }
    derivarAnomalia(z2);
    const errs = validarZona(z2);
    if (errs.length) throw new Error(errs.join('; '));
    escribirZona(z2);
    hechas++;
    if (hechas % 10 === 0) console.log(`  [clima] ${hechas} zonas (llamadas API: ${llamadas})`);
  }
  console.log(`[clima] listo: ${hechas} actualizadas, ${frescas} ya al día, llamadas API ${llamadas}${cuotaAgotada ? `, DETENIDO por cuota (${cuotaAgotada})` : ''}`);
}

// ── MODIS (ORNL) ──────────────────────────────────────────────────────
async function faseModis() {
  const lista = zonas.filter((z) => z.prioridad <= PRIORIDAD_MODIS);
  let hechas = 0;
  for (const zona of lista) {
    for (const [id, def] of Object.entries(PRODUCTOS)) {
      const z = leerZona(zona.id) ?? nuevaZona(zona.id);
      const desde = desdeNecesario(z, [id], mesIdx(2000, 2));
      if (desde == null) continue;
      try {
        const m = await descargarZona(def, zona.lat, zona.lon, isoDia(desde));
        const z2 = leerZona(zona.id) ?? nuevaZona(zona.id);
        fusionar(z2, id, m); derivarAnual(z2, id);
        escribirZona(z2);
        hechas++;
      } catch (e) {
        pendientes[`${zona.id}/${id}`] = `error: ${e.message.slice(0, 120)}`;
        console.warn(`  [modis] ${zona.id}/${id}: ${e.message}`);
      }
    }
    console.log(`  [modis] ${zona.id} ok`);
  }
  console.log(`[modis] listo: ${hechas} series zona×producto`);
}

const fases = [];
if (solo === 'todo' || solo === 'clima') fases.push(faseClima());
if (solo === 'todo' || solo === 'modis') fases.push(faseModis());
await Promise.all(fases);

if (!args['sin-manifest']) {
  const m = construirManifest({ zonasEsperadas: todas.filter((z) => z.prioridad <= PRIORIDAD_MAX).map((z) => z.id), origenZonas: origen, pendientes });
  console.log(`[manifest] ${m.nZonas} zonas, completo=${m.completo}, pendientes=${Object.keys(m.pendientes).length}`);
}
