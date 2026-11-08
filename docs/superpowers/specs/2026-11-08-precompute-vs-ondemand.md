# Precalcular vs. calcular bajo demanda (Earth Engine)

Fecha: 2026-11-08 · Estado: investigación / propuesta (no hay código de app cambiado)

## Convención de este documento

Cada cifra lleva una etiqueta:

- **[MEDIDO]**: obtenido en esta investigación con un script reproducible en `/tmp/asu-bench/`.
- **[DOC]**: dato citado de documentación o de una fuente web (con enlace al final).
- **[ESTIMADO]**: cálculo propio con supuestos explícitos. No es un hecho. Hay que medirlo antes de decidir con él.

**Límite importante: no había credenciales de Earth Engine** (no existe `service-account.json` ni `GEE_SA_JSON` en esta máquina), así que **ninguna latencia ni costo de EECU de GEE fue medido**. Todo lo de GEE es [ESTIMADO] o [DOC]. El script `/tmp/asu-bench/gee_bench.mjs` está listo para medirlo (ver §7); pasa `node --check`, pero no se ejecutó.

## 1. Situación actual

`app/api/gee-map/route.ts` hace, por **cada cambio** de capa, años, estaciones o AOI:

1. Un token OAuth2 con JWT firmado, hacia `oauth2.googleapis.com`. Se firma y se pide en cada request; no hay caché.
2. Si hay AOI, un `value:compute` con `Image.reduceRegion` (percentiles p5/p95, `scale: 1000`) sobre una mediana estacional de Sentinel-2 (NDVI) o Landsat 8+9 (LST). Es una llamada síncrona de varios segundos.
3. Un `POST /maps` que devuelve el `mapid`. Es barato por sí solo; **el cómputo real ocurre después, tile por tile**, cuando MapLibre pide `/tiles/{z}/{x}/{y}`.
4. Devuelve al navegador el `token` de acceso (scope `earthengine`) junto al `tileBaseUrl`. Eso es un riesgo de seguridad: cualquiera que abra las DevTools se lleva un bearer válido por ~1 h para toda la cuenta de servicio. Un diseño precalculado lo elimina para el caso común.

Caché actual: solo en memoria del cliente (`geeResultCache`), por sesión. No hay caché compartida entre usuarios.

## 2. Datos que SÍ se midieron

### 2.1 Límites administrativos (geoBoundaries, Paraguay) [MEDIDO]

Consultado vía `https://www.geoboundaries.org/api/current/gbOpen/PRY/{ADM1,ADM2}/` y descargado desde los enlaces del release.

| Capa | Unidades | Año de representación | Fuente declarada | Licencia | GeoJSON completo | gzip -9 | GeoJSON simplificado | gzip -9 | Vértices (completo / simpl.) |
|---|---|---|---|---|---|---|---|---|---|
| ADM1 | 18 (17 deptos + Capital) | 2012 | DGEEC | CC BY 4.0 | 12,4 MB | 4,4 MB | 0,85 MB | 0,32 MB | 271.567 / 18.585 |
| ADM2 | **247** | 2012 | DGEEC | CC BY 4.0 | 45,6 MB | 15,9 MB | 2,66 MB | 0,99 MB | 994.664 / 56.953 |

Consecuencias:

- geoBoundaries ADM2 trae **247 distritos, no ~260**. El vintage es 2012; Paraguay creó distritos desde entonces. Hay que cotejar contra DGEEC/INE antes de prometer "~260" en la UI. Esto es un hueco de datos real.
- El GeoJSON completo de ADM2 (45 MB) **no sirve para enviar a GEE como `geoJsonGeometry` inline** (el cuerpo del request de `value:compute` crece con cada vértice). Para el pipeline hay dos caminos: subir los límites como `FeatureCollection` asset de GEE (recomendado, una sola vez), o usar la versión simplificada (57k vértices) solo para pruebas.
- Para el mapa del cliente basta la versión simplificada: ~1 MB gzip para ADM2.

### 2.2 Tamaño de las series precalculadas [MEDIDO, con datos sintéticos]

Script: `/tmp/asu-bench/series_size.py`. Se usaron valores aleatorios gaussianos a 3 decimales. El ruido es peor que una serie real suave, así que el tamaño comprimido es una **cota superior** razonable. Aviso: una primera corrida repetía el mismo diccionario en todas las zonas y dio un gzip falsamente diminuto (14 KB); se corrigió y lo que sigue es la corrida con datos distintos por zona.

Supuestos: 280 zonas (18 ADM1 + 247 ADM2 + 15 ciudades), 8 indicadores, 130 meses (2016-01 a 2026-10).

| Formato | Por zona | Las 280 zonas |
|---|---|---|
| JSON compacto | 6,2 KB (1,9 KB gzip) | **1,74 MB** (**0,45 MB gzip**) |
| int16 binario (valor×1000) | 2,1 KB (1,5 KB gzip) | 0,58 MB sin comprimir |
| Landsat mensual 1984+ (504 meses), 4 indicadores, JSON | 11,9 KB (3,5 KB gzip) | 3,3 MB sin comprimir |

Lectura: **toda la base de series de todo Paraguay cabe en ~0,5 MB gzip (2016+) o ~1,5 MB gzip (Landsat 1984+)**. No hace falta Parquet ni base de datos; un JSON por zona (≈2–4 KB gzip) más un `index.json` es suficiente y se sirve como archivo estático con CDN. Parquet solo pagaría si pasamos de ~50 indicadores o de resolución semanal.

## 3. Cuota y límites de GEE no comercial [DOC]

- Desde el despliegue de abril de 2026 los proyectos no comerciales tienen cuota mensual de cómputo por **tier**: **Community 150 EECU-horas/mes** (540.000 EECU-segundos), **Contributor 1.000 EECU-horas/mes**. Partner requiere solicitud (una fuente secundaria menciona 100.000 EECU-h; **no verificado en la página oficial en inglés**).
- Al agotar la cuota no se corta: pasa a **modo restringido** con menor throughput. La cuota se reinicia el día 1 de cada mes a medianoche hora del Pacífico.
- Concurrencia por defecto: **40 requests concurrentes por proyecto**; excederla da `HTTP 429`. No encontré si el tier la cambia.
- Crear varios proyectos para esquivar cuotas está prohibido ("quota farming"). Hay que reverificar el estado no comercial cada año.
- Los EECU-horas no son tiempo de pared: un job de 10 EECU-h puede durar pocos minutos (documentación de GEE).
- Ojo con el uso comercial: si AsuGreen se monetiza o se usa para un cliente comercial, el tier no comercial deja de aplicar. Esto condiciona todo el análisis.

Referencia de perfilado [DOC]: un `reduceRegions` de ejemplo (ecorregiones × clima mensual PRISM) reporta ~0,8–1,2 EECU-s. Es otra carga y no sirve más que como orden de magnitud de "un reduce pequeño".

## 4. Estimaciones de latencia y costo (todo [ESTIMADO])

### 4.1 Llamada en vivo actual

Supuestos: mediana estacional de S2 sobre un departamento; sin caché caliente de GEE.

| Paso | Latencia estimada | Nota |
|---|---|---|
| OAuth JWT | 0,2–0,6 s | Cacheable ~55 min por instancia; hoy se repite |
| `value:compute` p5/p95, `scale 1000` | 3–15 s | Es el paso más lento y bloquea el `POST /maps` |
| `POST /maps` | 0,5–2 s | |
| Tiles al abrir el mapa (≈15–25 por viewport) | 1–10 s cada uno, la primera vez | Cada tile cuenta contra cuota y contra el límite de 40 concurrentes |
| **Primer pintado total** | **~6–30 s** | |

Costo de cuota por interacción: **~10–100 EECU-s** (muy incierto; depende de cuántas escenas entran en el filtro). Con 540.000 EECU-s/mes (Community) eso son **~5.000–50.000 interacciones/mes** para todos los usuarios juntos. Cada pan/zoom a una zona nueva paga tiles nuevos.

Cuello de botella más probable: **la concurrencia (40), no la cuota**. Un solo usuario que abre el mapa dispara ~20 tiles simultáneos; **dos o tres usuarios en paralelo ya pueden provocar 429**. Esta es una hipótesis a confirmar con el script de §7.

### 4.2 Batch `reduceRegions` para todas las zonas

Carga: 280 zonas × 130 meses × 4 indicadores = **145.600 valores**, equivalente a 520 imágenes-mes (130 meses × 4 indicadores) reducidas sobre 280 geometrías.

- Camino recomendado: una `FeatureCollection` de zonas como asset, una imagen compuesta por mes e indicador, `reduceRegions` con `Reducer.mean()` + `count()`, escala 100 m para ADM2/ADM1 (30 m solo para ciudades), y `Export.table.toCloudStorage` o `toDrive` (batch), no `getInfo`.
- Costo por imagen-mes a nivel país: **supuesto 20–200 EECU-s** (rango amplio a propósito; Paraguay son ~40,7 M píxeles a 100 m y ~300 escenas S2 por mes). Total: 520 × (20–200) = **~10.400–104.000 EECU-s = 3–29 EECU-horas**. Entra en Community (150 h) incluso con un factor de error de 5×, **con una sola corrida inicial**.
- Tiempo de pared: tareas batch de 1–5 min cada una, con concurrencia de batch limitada (valor no hallado). Estimación: **1–4 h** para el backfill 2016–hoy; **~2–5 min por mes** en el cron mensual. Landsat 1984+ anual: unas 40 imágenes × 3 indicadores, mucho menos.
- Backfill extra por Landsat mensual 1984–2015: +384 meses × 2 indicadores ≈ +768 imágenes-mes; ~1,5× el costo anterior. Es opcional (el valor de 1984+ está en series **anuales**).

### 4.3 Hosting de rasters anuales de Paraguay [ESTIMADO]

Paraguay: 406.752 km². Píxeles por capa: 30 m ≈ 452 M; 100 m ≈ 40,7 M; 250 m ≈ 6,5 M.

| Formato | Resolución | Tamaño por capa-año (estimado) | Comentario |
|---|---|---|---|
| COG int16, deflate+predictor | 100 m | 30–60 MB | Mantiene el valor numérico (necesario para consulta y diferencias) |
| COG int16 | 30 m | 350–550 MB | Solo si se justifica (Landsat nativo); pesado para el cliente |
| PMTiles raster (PNG RGBA, z0–z11, ≈76 m/px en z11) | ≈2.000 tiles × 40–100 KB | 80–200 MB | Solo visual: **pierde el valor**; para pintar, no para analizar |

Escenarios de volumen: 10 años (2016–2025) × 4 indicadores = 40 capas-año → **PMTiles 3–8 GB**; COG 100 m **1,2–2,4 GB**. Landsat anual 1984–2025 × 3 indicadores a 100 m = 126 capas → **~4–8 GB**.

Costo de hosting [DOC precios]:

- **Cloudflare R2**: $0,015/GB-mes; egress gratis; 10 GB-mes, 1 M ops clase A y 10 M ops clase B gratis al mes. Para ≤10 GB: **$0/mes**. Soporta HTTP Range, que es lo que PMTiles/COG necesitan.
- **Vercel Blob**: $0,023/GB-mes (1 GB incluido en Hobby, 5 GB en Pro); operaciones simples $0,40/M, avanzadas $5/M; la transferencia figura como incluida en el "Flat Rate CDN" (1 TB) en la página nueva, pero otras fuentes dicen $0,05/GB. **Hay fuentes en conflicto; verificar en la página vigente.** Para 8 GB en Pro: ~$0,07–0,18/mes de almacenamiento. **No verifiqué que Blob sirva Range requests de forma fiable** para PMTiles; R2 sí.
- Conclusión: el hosting de rasters **no es el factor de costo**; ambos son centavos al mes. El factor real es el **tiempo de ingeniería** del pipeline (GEE → GeoTIFF → PMTiles) y la verificación de Range en el host.

Nota de método: GEE no exporta PMTiles. El camino es `Export.image.toCloudStorage` (COG) → `gdal_translate`/`rio-cogeo` → `pmtiles convert`. En esta máquina no hay `gdal` ni `pmtiles` instalados, por eso los tamaños de raster son estimaciones y no mediciones.

## 5. Modelo híbrido propuesto

### 5.1 Tres niveles

**Nivel 0, siempre precalculado (cron, sin usuario).**
- Series de zona: ADM0, 18 ADM1, 247 ADM2 y 15 ciudades. Mensual 2016–hoy (S2 NDVI, Landsat LST, y los demás indicadores que lo permitan) y **anual 1984–hoy** (Landsat). Archivo JSON por zona + `index.json` + `manifest.json`.
- Rasters anuales a 100 m (COG para análisis + PMTiles para pintar) de NDVI máximo/medio de verano, LST de verano y la capa que sea hito (p. ej. cobertura/deforestación). Año actual se reconstruye mensualmente.
- Estadísticos de leyenda (p5/p95) por zona y capa: ya están en la serie, así que la leyenda dinámica de AOI deja de necesitar `value:compute`.
- Resultado: el 90–95% de los clics (ver zona, ver su serie, comparar dos zonas, animar años) **no toca GEE**.

**Nivel 1, calculado al primer pedido y cacheado.**
- Composites estacionales a medida (el UX actual: años × estaciones × AOI) que no estén en el nivel 0.
- Qué se cachea: los **estadísticos** (p5/p95) con clave `hash(capa, años, estaciones, zonaId, pipelineVersion)` en KV/Blob, TTL 30 d (el período en curso: 24 h). El `mapid` de GEE **no** se cachea a largo plazo (expira; no verifiqué el TTL exacto, tratarlo como horas) ni se comparte.
- Deduplicación: si dos usuarios piden lo mismo a la vez, un solo `value:compute` (promesa en vuelo por clave).
- Mejora inmediata y barata: cachear el token OAuth ~50 min en memoria de la función.

**Nivel 2, en vivo (GEE).**
- Comparativas arbitrarias entre rangos de fechas distintos, rangos personalizados, polígonos dibujados por el usuario, zonas nuevas aún no cargadas, y exploración "qué pasa si".
- Con protecciones: tope de concurrencia (semáforo de ≤12 de las 40), límite por IP/sesión, backoff ante 429, y **degradación elegante**: si GEE devuelve 429 o la cuota se agota, mostrar el dato precalculado más cercano con un aviso "valor aproximado (precalculado)".
- El token ya **no** debe viajar al navegador: servir los tiles por un proxy `/api/gee-tiles/...` (cacheado en CDN con `Cache-Control` agresivo, porque un tile de un composite pasado no cambia).

### 5.2 Diagrama

```
                         ┌────────────── cron mensual (día 8) + backfill único ──────────────┐
                         │  GEE batch: reduceRegions(zonas) → Export a Cloud Storage / Drive │
                         │  GEE batch: Export.image (COG 100 m, anual)                       │
                         └───────────────┬───────────────────────────────┬───────────────────┘
                                         ▼                               ▼
                         series/{zona}.json + manifest        rasters/{capa}/{año}.pmtiles + .tif
                         (R2 o /public vía Blob + CDN)        (R2, Range requests)
                                         │                               │
 Usuario ──► UI (panel de zona, comparar, slider) ──────────────────────┘   NIVEL 0  (≈0 GEE)
        │
        ├─ ¿rango/estación estándar ya precalculado? ── sí ──► sirve archivo estático
        │
        ├─ no → NIVEL 1: ¿estadístico en KV (clave+versión)? ── sí ──► devuelve
        │                         └ no → semáforo → GEE value:compute → guarda KV (TTL)
        │
        └─ comparativa arbitraria / polígono libre / rango custom
                                  └► NIVEL 2: GEE en vivo (semáforo, límite por IP,
                                     429 → fallback a precalculado con aviso)
```

### 5.3 Reglas de invalidación

| Artefacto | Se regenera cuando | Detalle |
|---|---|---|
| Serie mensual de zona | Cada mes, día 8 | Mes M-1; **siempre re-ejecutar también M-2** (datos tardíos y reprocesos) |
| Raster anual (año en curso) | Mensual | Los años cerrados se congelan; un año se da por final ≥30 d después del 31-dic |
| Series y rasters históricos | Cambio de `pipelineVersion` | Cualquier cambio de fórmula, máscara de nubes o escala: incrementa la versión y reconstruye todo; el cliente nunca mezcla versiones (el `manifest.json` fija la versión vigente) |
| Límites de zona | Cambio de versión de geoBoundaries/DGEEC | Recalcula **todas** las series de las zonas afectadas |
| Reprocesos de colección (p. ej. cambio de línea base de Sentinel-2) | Detección trimestral | Recalcular 3 zonas centinela y comparar con el almacenado; si la diferencia relativa supera un umbral (p. ej. 2%), reconstruir todo |
| Cache nivel 1 (estadísticos) | TTL 30 d; 24 h si el rango incluye el período en curso | Clave incluye `pipelineVersion` |
| Tiles en CDN (composite pasado) | No cambian | `immutable`, salvo cambio de `pipelineVersion` |

## 6. Recomendación

**Adoptar el híbrido, empezando por el nivel 0 de series de zona**, porque es lo que desbloquea la mayor parte de la visión del producto (panel por zona, comparar, warming stripes, historias antes/después) con el menor riesgo:

1. Series JSON por zona (0,5–1,5 MB gzip en total) servidas estáticas. Costo de hosting: cero.
2. Backfill único 2016–hoy en una sola ventana (≈3–29 EECU-h estimadas, cabe en Community).
3. Rasters anuales a 100 m en COG + PMTiles en R2 en una segunda etapa (los números de §4.3 son estimaciones; validar con una capa piloto antes de generar las 40).
4. Mantener el flujo en vivo actual como nivel 2, con semáforo, caché de token y fallback.
5. Dejar de enviar el token OAuth al navegador en cuanto exista el proxy de tiles.

Primero medir, luego decidir cifras: ejecutar `gee_bench.mjs` (§7) con credenciales y reemplazar las filas [ESTIMADO] de §4.1 y §4.2 por mediciones. Si el costo medido por imagen-mes cae fuera de 20–200 EECU-s, rehacer la cuenta de §4.2 antes de lanzar el backfill.

### Criterios para cambiar de opinión

- **Ir más hacia "todo en vivo"** si: la medición muestra < 3 s por pedido y < 5 EECU-s por interacción, el uso real es < 500 sesiones/mes, y el equipo prefiere no operar un pipeline.
- **Ir más hacia "todo precalculado"** si: aparecen 429 con 2–3 usuarios simultáneos, el consumo supera ~60% de la cuota mensual, o el proyecto pasa a uso comercial (la cuota no comercial deja de aplicar y el costo por EECU pasa a ser dinero real).
- **Subir de tier / pedir Contributor (1.000 EECU-h)** si el backfill medido supera ~80 EECU-h o se quiere resolución semanal.
- **Pasar series a Parquet o DuckDB-WASM** si los indicadores superan ~50 o se agrega resolución semanal/diaria (> ~20 MB gzip en total).
- **Descartar PMTiles raster** si las pruebas muestran que MapLibre con tiles de GEE proxy cacheados en CDN rinde igual (menos pipeline que mantener).

## 7. Cómo medir lo que falta

```bash
# con una cuenta de servicio de GEE:
GEE_SA_JSON="$(cat service-account.json)" node /tmp/asu-bench/gee_bench.mjs /tmp/asu-bench/adm2_simp.geojson 10
```

Mide la latencia de pared de (a) un `reduceRegion` de 1 zona y (b) 10 zonas en una sola expresión, sobre la mediana NDVI de S2 de marzo 2024 a 100 m. Para EECU-segundos reales usar `ee.profilePrinting()` en la API JS de Earth Engine sobre un `reduceRegions` real y multiplicar por 520 imágenes-mes. También conviene probar 20 tiles en paralelo para confirmar el umbral de 429.

Archivos de la medición: `/tmp/asu-bench/series_size.py` (series), `adm{1,2}_{full,simp}.geojson` (límites descargados), `gee_bench.mjs` (latencia GEE, sin ejecutar).

## Fuentes

- [Earth Engine, niveles no comerciales](https://developers.google.com/earth-engine/guides/noncommercial_tiers)
- [Earth Engine, uso y límites de concurrencia](https://developers.google.com/earth-engine/usage)
- [Understanding and Monitoring Earth Engine Quota (Spatial Thoughts)](https://spatialthoughts.com/2026/02/09/gee-quota-monitoring/)
- [Profile Earth Engine computation (geetools)](https://geetools.readthedocs.io/en/stable/usage/profile.html)
- [Cloudflare R2, precios](https://developers.cloudflare.com/r2/platform/pricing/)
- [Vercel Blob, uso y precios](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- [PMTiles, Protomaps](https://docs.protomaps.com/pmtiles/)
- [geoBoundaries API, Paraguay ADM1/ADM2](https://www.geoboundaries.org/api/current/gbOpen/PRY/ADM2/)
- Next.js 16 local: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` (los Route Handlers no se cachean por defecto; los `GET` pueden optar por caché con `dynamic = 'force-static'`) y `.../02-route-segment-config/maxDuration.md` (relevante para el límite de duración de las funciones que esperan a GEE).
