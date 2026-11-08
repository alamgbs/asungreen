# Capas sociales (Fase 3): estado y verificación de fuentes

Estado: 2026-11-08 · Capas abiertas **ejecutadas con datos reales** (población, OSM, acceso 800 m, RWI, incendios). Capas de GEE escritas, **no ejecutadas** (requieren credencial). Definiciones para integrar en `lib/indicadores.ts`: `data/series/indicadores-nuevos.json` (`node scripts/pipeline/gen-indicadores-nuevos.mjs`).

## Fuentes verificadas con fetch real (sin credenciales)

| Capa | Fuente | Acceso verificado | Licencia |
|---|---|---|---|
| 3.1 Población | WorldPop 2020. Paraguay: 100 m «constrained» (`.../Global_2000_2020_Constrained/2020/BSGM/PRY/pry_ppp_2020_constrained.tif`, 8 MB). Ciudades extranjeras: 1 km «Aggregated» | Descarga directa OK. El servidor **ignora Range** (responde el archivo entero). Los 100 m de EE. UU. pesan 494 MB, por eso 1 km | CC BY 4.0 |
| 3.2 RWI Meta | HDX, `Paraguay_relative_wealth_index.csv` (405 KB). También AR, BR, MX; no cubre ES/FR/DE/IT/US | Descarga directa OK | **CC BY-NC 4.0** (solo uso no comercial). Corte único 2021, relativo dentro de cada país: no comparable entre países |
| 3.3 OSM | Overpass API | Funciona con User-Agent propio; sin UA devuelve 406 | ODbL 1.0 (atribución obligatoria) |
| 3.5 Incendios | CSV anuales de FIRMS `.../data/country/viirs-snpp/{año}/viirs-snpp_{año}_Paraguay.csv` | Sin clave: 2012–2025 OK (VIIRS S-NPP 375 m). El 2026 da 404 y la API en tiempo casi real exige `MAP_KEY` | NASA, uso libre con cita |
| 3.4 NO₂, 3.6 Hansen, 3.7 JRC | Google Earth Engine | **Requieren credencial**; escritos en `gee/capas.mjs`, sin ejecutar | — |

## Ejecutado (datos reales en `data/series`)

| Script | Indicadores | Chequeo de plausibilidad |
|---|---|---|
| `open/sociales.mjs` | `poblacion`, `densidad-poblacion`, `areas-verdes-osm-ha/-pct`, `verde-osm-m2-hab`, `centros-salud-osm`, `escuelas-osm`, `paradas-transporte-osm`, `pob-800m-{verde,salud,escuela,transporte}` (solo PY) | Población PY 7,47 M; Asunción 570 mil hab; Buenos Aires 3,04 M |
| `open/rwi.mjs` | `rwi` (2021, solo PY): 255 de 266 zonas con valor, el resto `null` | — |
| `open/firms.mjs` | `incendios-viirs`, `incendios-frp-viirs` mensual 2012–2025, solo PY | — |

Límites: ciudades extranjeras con población a 1 km (Berlín da 3,23 M con el polígono usado, vs. cifras oficiales mayores: el polígono OSM/píxeles de 1 km pesan); sin `pob-800m-*`; sin RWI en ES/FR/DE/IT/US; Overpass puede fallar (504): una ciudad que falla queda sin indicadores OSM, nunca con ceros inventados. Los centros del píxel decide la zona: en bordes hay error de ≤ 1 píxel.

## Escrito, no ejecutable aquí (requiere credencial GEE)

`scripts/pipeline/gee/capas.mjs`: NO₂ Sentinel-5P (`no2-s5p`, µmol/m², 2018-07 →), pérdida forestal Hansen (`perdida-forestal-hansen`, % de cobertura 2000 ≥30 % perdida por año, 2001–2024) y agua superficial JRC (`agua-superficial-jrc`, % mensual, solo hasta 2022-01). IDs verificados en el catálogo STAC. Falta correr `gee_bench.mjs` y una prueba corta antes del backfill, y agregar sus entradas a `catalogo.mjs`.

## Pendiente

1. **Isla de calor urbana (3.8)**: no implementada. Con MODIS (1 km) sería una aproximación gruesa y exige excluir agua; con GEE/Landsat (30 m) es viable. Verde por habitante basado en NDVI tampoco (solo la versión OSM).
2. MODIS de ciudades extranjeras: falla con HTTP 400 (la lista de fechas del tile de Paraguay no vale para otros tiles); queda en `manifest.pendientes`. Arreglo: pedir `/dates` por zona.
3. FIRMS año en curso (requiere `FIRMS_MAP_KEY`) y Hansen/JRC/NO₂ en el workflow cuando exista `GEE_SA_JSON`.
4. Integrar `indicadores-nuevos.json` en `lib/indicadores.ts` (lo hace el master); `rwi` es **solo uso no comercial**.
5. Tras terminar `open/run.mjs` en curso, correr `node scripts/pipeline/manifest.mjs` (la versión en memoria de ese proceso reescribe el manifest sin ignorar archivos auxiliares).
