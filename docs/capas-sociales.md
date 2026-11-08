# Capas sociales (Fase 3): estado y verificación de fuentes

Estado: 2026-11-08 · **Parcial**: los scripts están escritos; solo se verificó el acceso a las fuentes. Nada de esto se ejecutó todavía, y `data/series/indicadores-nuevos.json` NO existe aún.

## Fuentes verificadas con fetch real (sin credenciales)

| Capa | Fuente | Acceso verificado | Licencia |
|---|---|---|---|
| 3.1 Población | WorldPop 2020. Paraguay: 100 m «constrained» (`.../Global_2000_2020_Constrained/2020/BSGM/PRY/pry_ppp_2020_constrained.tif`, 8 MB). Ciudades extranjeras: 1 km «Aggregated» | Descarga directa OK. El servidor **ignora Range** (responde el archivo entero). Los 100 m de EE. UU. pesan 494 MB, por eso 1 km | CC BY 4.0 |
| 3.2 RWI Meta | HDX, `Paraguay_relative_wealth_index.csv` (405 KB). También AR, BR, MX; no cubre ES/FR/DE/IT/US | Descarga directa OK | **CC BY-NC 4.0** (solo uso no comercial). Corte único 2021, relativo dentro de cada país: no comparable entre países |
| 3.3 OSM | Overpass API | Funciona con User-Agent propio; sin UA devuelve 406 | ODbL 1.0 (atribución obligatoria) |
| 3.5 Incendios | CSV anuales de FIRMS `.../data/country/viirs-snpp/{año}/viirs-snpp_{año}_Paraguay.csv` | Sin clave: 2012–2025 OK (VIIRS S-NPP 375 m). El 2026 da 404 y la API en tiempo casi real exige `MAP_KEY` | NASA, uso libre con cita |
| 3.4 NO₂, 3.6 Hansen, 3.7 JRC | Google Earth Engine | **Requieren credencial**; no escritos todavía | — |

## Escrito pero sin ejecutar

- `scripts/pipeline/open/sociales.mjs` (usa `overpass.mjs`, `worldpop.mjs`, `lib/geo.mjs`). Produce `poblacion`, `densidad-poblacion`, `areas-verdes-osm-ha`, `areas-verdes-osm-pct`, `verde-osm-m2-hab`, `centros-salud-osm`, `escuelas-osm`, `paradas-transporte-osm` y, solo para Paraguay, `pob-800m-{verde,salud,escuela,transporte}`.
- El acceso «15 min a pie» se aproxima con **800 m en línea recta** desde el centro del píxel de población hasta el borde del área verde o el punto de servicio más cercano. No usa red vial.
- Las ciudades extranjeras no tienen `pob-800m-*`: los píxeles de 1 km son demasiado gruesos para un umbral de 800 m.
- Las áreas verdes de OSM no se unen entre sí: las superpuestas se cuentan dos veces. Una cifra de 0 paradas o centros en zonas rurales puede significar «sin mapear».

## Pendiente

1. Correr `node scripts/pipeline/open/sociales.mjs`. Antes de confiar en los datos, comprobar que el total de población de `PY` sea plausible.
2. Escribir los scripts de FIRMS (conteo mensual y suma de FRP por zona, confianza ≠ baja, `type = 0`) y de RWI.
3. Escribir las capas de GEE (NO₂ Sentinel-5P, Hansen, JRC agua) y verificar los IDs de dataset en el catálogo antes de fijarlos.
4. Isla de calor urbana: solo se puede aproximar con MODIS (píxeles de 1 km). Requiere excluir agua y tiene límite de resolución. No implementado.
5. Agregar los nuevos ids a `scripts/pipeline/lib/catalogo.mjs` y a los rangos de `verificar.mjs`, generar `data/series/indicadores-nuevos.json` para que el master los integre en `lib/indicadores.ts`, y reconstruir el manifest.
6. Subir `PIPELINE_VERSION` solo si cambia el cálculo de indicadores existentes. Los indicadores nuevos no lo exigen.

## Notas técnicas

- `lib/series-io.mjs` ahora ignora `indicadores-*.json` y `meta-*.json` al construir el manifest y al verificar.
- Dependencia nueva: `geotiff` (devDependency) para leer los GeoTIFF de WorldPop.
- La caché de descargas está en `scripts/pipeline/.cache/` (ignorada por git).
