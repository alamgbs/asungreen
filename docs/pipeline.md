# Pipeline de series por zona

Estado: 2026-11-08 · Versión del pipeline: `2026.11.0` (`scripts/pipeline/lib/version.mjs`)

Produce `data/series/{zonaId}.json` + `data/series/manifest.json`. Hay dos pipelines que escriben **el mismo formato**:

| | Carpeta | Credenciales | Indicadores | Estado |
|---|---|---|---|---|
| **A. Abierto** | `scripts/pipeline/open/` | ninguna | `temp-aire`, `temp-max-aire`, `precipitacion`, `dias-35c`, `anomalia-temp-aire` (Open-Meteo/ERA5); `ndvi-modis`, `lst-modis` (MODIS vía ORNL) | **Ejecutado**, datos reales en `data/series` |
| **B. GEE** | `scripts/pipeline/gee/` | `GEE_SA_JSON` | `ndvi` (Sentinel-2 + Cloud Score+), `lst` (Landsat 8/9, máscara `QA_PIXEL`) | Escrito completo, **nunca ejecutado** (no hay credenciales donde se escribió) |

## Ejecutar

```bash
node scripts/pipeline/open/run.mjs                      # todo, reanudable
node scripts/pipeline/open/run.mjs --solo=clima --prioridad-max=1   # solo país + departamentos
node scripts/pipeline/open/run.mjs --solo=modis --prioridad-modis-max=3   # MODIS también en distritos (lento)
node scripts/pipeline/open/run.mjs --forzar             # ignora lo ya calculado
node scripts/pipeline/verificar.mjs                     # forma, rangos, checksum
GEE_SA_JSON="$(cat service-account.json)" node scripts/pipeline/gee/gee_bench.mjs   # Tarea 1.0
GEE_SA_JSON=... node scripts/pipeline/gee/run.mjs --max-meses=3 --prioridad-max=1   # prueba corta
```

`--prioridad-max`: 0 país, 1 departamentos, 2 ciudades, 3 distritos. Las zonas salen de `data/zonas/zonas.json`
(si no existe se cae a `lib/aois.ts` con un aviso). El clima usa el centroide de cada zona; las zonas que caen
en la misma celda ERA5 de 0,25° (179 celdas para 277 zonas) comparten una única descarga.

## Formato

```jsonc
{ "zona": "PY-11", "version": "2026.11.0", "actualizado": "2026-11-08",
  "indicadores": {
    "temp-aire": {
      "mensual": { "inicio": "1991-01", "v": [26.1, null, …], "n": [31, 28, …] },  // n = días (ERA5) o compuestos (MODIS) o obs/píxel (GEE)
      "anual":   { "inicio": 1991,      "v": [23.4, …],        "n": [365, …] }
    } } }
```

- Cada indicador tiene **su propio `inicio`** (el plan mostraba uno común; así no se rellena con nulos y se pueden sumar fuentes con otras fechas).
- `null` = sin dato (explícito, nunca 0). Mes de ERA5 con <90 % de sus días → `null` (el mes en curso siempre cae aquí; `n` conserva cuántos días hubo).
- Anual derivado del mensual: ERA5 exige 12 meses; GEE exige ≥9 (nubosidad). Años incompletos → `null`.
- Procedencia (fuente, licencia, unidad, nota) está en `manifest.indicadores[id]`, no se repite por zona. El manifest también trae `p5/p95` global, rangos, `pendientes`, `completo` y un `checksum` SHA-256.

## Cómo se sirve (Tarea 1.8)

`lib/series.ts` expone `getSerie(zonaId, indicador)`, `getZonaSerie`, `getManifest` y utilidades puras (`puntos`, `percentil`, `rangoSerie`).
Se sirven **como archivos estáticos** `/series/{zona}.json`: `npm run series:sync` copia `data/series` → `public/series`
(corre solo en `predev` y `prebuild`; `public/series` está en `.gitignore`). Motivo: en Vercel `public/` sale del CDN comprimido,
sin invocar funciones, y los `GET` de Route Handlers no se cachean por defecto en Next 16. La URL lleva `?v=<pipelineVersion>`
y `getSerie` falla con `SerieVersionError` si el archivo no coincide con el manifest.
`rangoSerie()` da el p5/p95 de la propia serie para la leyenda de AOI sin `value:compute`.

## Reglas de invalidación

| Qué | Cuándo se recalcula |
|---|---|
| Mes M-1 y **M-2** | Siempre en cada corrida (datos tardíos, reprocesos). ERA5 tiene ~5 días de retraso: «último mes completo» = el anterior al mes de *hoy − 7 días*. |
| Meses anteriores | Nunca, salvo cambio de versión o `--forzar`. |
| Cambio de fórmula, máscara, escala, fuente o nombre de indicador | Subir `PIPELINE_VERSION`. `leerZona()` descarta cualquier archivo de otra versión y se reconstruye todo; `data/series/.estado.json` (GEE) se reinicia solo. |
| Límites de zona nuevos | Eliminar las series de las zonas afectadas y correr de nuevo (centroides/geometrías cambian el resultado). |
| Reprocesos de colecciones (p. ej. nueva línea base Sentinel-2) | Trimestral: correr `gee/run.mjs --forzar --desde=… --hasta=…` en 3 zonas centinela y comparar; si la diferencia relativa > 2 % → subir versión y reconstruir. **Aún no automatizado** (ver pendientes). |
| Línea base de anomalías | 1991–2020 (`lib/catalogo.mjs`). Cambiarla = subir versión. |

**Reconstrucción total:** subir `PIPELINE_VERSION`, `rm data/series/*.json data/series/.estado.json`, correr `open/run.mjs` (varios días por la cuota gratuita; ver abajo) y `gee/run.mjs` (tras `gee_bench.mjs`), `node scripts/pipeline/verificar.mjs`, abrir PR.

## Cuotas y límites verificados (2026-11-08)

- **Open-Meteo archive** (gratis, uso **no comercial**): 600 llamadas/min, 5000/h, 10 000/día (cabecera `X-RateLimit-*`). Una petición cuesta `variables × días / 140`: 3 variables × 1991–hoy ≈ **274**. ⇒ ~2 celdas/min, ~18/h, ~36/día. El backfill de las 179 celdas únicas lleva ~5 días de cuota; por eso el pipeline es reanudable y el workflow corre a diario hasta completar. Las corridas incrementales (M-2 en adelante) cuestan ~1.
- **ORNL MODIS**: máximo **10 fechas por pedido** (MOD13Q1: 614 compuestos desde 2000-02-18; MOD11A2: 1224). ≈190 pedidos por zona y producto; concurrencia 4. Por eso MODIS solo corre para país, departamentos y ciudades (`--prioridad-modis-max=2`).
- **GEE**: sin medir (Tarea 1.0 pendiente). Cuota no comercial: Community 150 EECU-h/mes, 40 concurrentes (el cliente limita a 12).

## Limitaciones de los datos (léanse antes de interpretar)

- ERA5 es un **reanálisis a 25 km**, no estaciones: los distritos vecinos comparten celda. Sirve para tendencia regional, no para comparar barrios.
- `ndvi-modis` / `lst-modis` son **una muestra alrededor del centroide** (≈2×2 km NDVI, 3×3 km LST), no el promedio de la zona. Sensor distinto a Sentinel-2/Landsat: se guardan con otro id para **no mezclarlos** con `ndvi`/`lst`. El mes de un compuesto es el de su fecha de inicio. MODIS no entrega banda de calidad en este pipeline: LST descarta rellenos (nubes); NDVI confía en el algoritmo de compuesto.
- `dias-35c` usa `≥ 35 °C` de la máxima diaria ERA5 (como `lib/indicadores.ts`), que subestima extremos urbanos.

## Cómo agregar un indicador

1. **Registro de la app:** agregar la fila en `lib/indicadores.ts` (id, unidad, fuente, rango fijo, licencia, limitaciones). Los ids `temp-max-aire`, `anomalia-temp-aire`, `ndvi-modis` y `lst-modis` ya producen datos pero **todavía no están en ese registro**.
2. **Catálogo del pipeline:** agregar el id a `scripts/pipeline/lib/catalogo.mjs` (unidad, `agregacion: media|suma`, decimales, fuente, licencia, nota). El manifest toma de ahí la procedencia.
3. **Cómputo:**
   - Fuente abierta: nueva función en `scripts/pipeline/open/` que devuelva `Map(idxMes → {v, n})` y llamarla desde `run.mjs` (usar `fusionar` + `derivarAnual`).
   - GEE: nueva rama en `scripts/pipeline/gee/composites.mjs` (máscara por píxel + banda de conteo) y, si usa otro rango de fechas, `INICIO`.
4. **Rangos físicos** en `scripts/pipeline/verificar.mjs` (`RANGOS`).
5. Subir `PIPELINE_VERSION` solo si cambia el cálculo de indicadores *existentes*. Un indicador nuevo se agrega sin reconstruir lo demás.
6. Correr `open/run.mjs` → `verificar.mjs` → `npm run series:sync`.

## GEE: lo que falta antes de confiar en él

- Nunca se ejecutó. `composites.mjs` replica `buildComposite` de `app/api/gee-map/route.ts` (que valida la máscara con una sonda y cae a filtro por escena); el pipeline **no tiene ese fallback a propósito** y falla en voz alta.
- Se usa geometría inline (`public/zonas/*.geojson`) en lotes de 10 por `value:compute`. El camino del plan (asset `FeatureCollection` + `Image.reduceRegions` + `Export.table`) queda como mejora si `gee_bench.mjs` muestra que el inline es lento o caro.
- No hay serie larga Landsat 1984–2012 (Landsat 5/7 `ST_B6` / `SR_B4`/`SR_B3`): requiere armonizar sensores y marcarlos; pendiente.
- Rasters anuales (Tarea 1.10) no implementados: necesitan GEE `Export.image` + `gdal`/`pmtiles` (no instalados) y un bucket R2.
- Verificación trimestral de zonas centinela (Tarea 1.7): no automatizada.

## Workflow

`.github/workflows/pipeline.yml`: cron día 8 de cada mes + cron diario que **solo continúa un backfill incompleto** (sale sin hacer nada si `manifest.completo` y no es día 8) + `workflow_dispatch`. Corre (A) siempre y (B) solo si existe el secreto `GEE_SA_JSON`. Verifica, hace commit en la rama `pipeline/series` y abre/actualiza un PR (nunca push a `main`). Requiere activar *Allow GitHub Actions to create and approve pull requests*. Las IPs compartidas de los runners pueden agotar antes la cuota gratuita de Open-Meteo: el pipeline se detiene ordenadamente y deja `pendientes` en el manifest.
