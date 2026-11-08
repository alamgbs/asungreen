# Zonas (límites reales)

Reemplazan a los rectángulos de `lib/aois.ts`. Fecha de los datos: 2026-11-08.

## Qué hay

| Nivel | Cantidad | Fuente de la geometría |
|---|---|---|
| `pais` (`PY`) | 1 | geoBoundaries gbOpen PRY ADM0 |
| `departamento` (`PY-11`, `PY-ASU`, …) | 18 (17 departamentos + Capital) | geoBoundaries PRY ADM1 |
| `distrito` (`PY-11-luque`, …) | 247 (245 reales + 2 artefactos, ver abajo) | geoBoundaries PRY ADM2 |
| `ciudad` (`ciudad-madrid`, …) | 11 | OpenStreetMap (Nominatim) |
| pendientes | 18 distritos sin geometría | — (`zonas.json > pendientes`) |

Total en `zonas.json`: 277 zonas con geometría.

**geoBoundaries (Paraguay):** licencia CC BY 4.0, fuente declarada DGEEC, año representado **2012**. Es la fuente que indica el plan (tarea 1.1) y trae los 247 distritos con licencia explícita; no comparé otros conjuntos. No incorpora distritos posteriores a 2012 (ver `data/zonas/reconciliacion.md`).

**Ciudades de otros países → OpenStreetMap, no geoBoundaries ADM2.** La granularidad de ADM2 cambia por país (comunas en Argentina, provincias en España, regiones en Italia, condados en EE. UU.), así que no da el límite municipal. OSM (relación administrativa de tipo `city`) sí, y es coherente entre las 11 ciudades. Licencia ODbL: atribución "© OpenStreetMap contributors". El archivo crudo guarda el id de la relación OSM y la fecha de consulta. Notas:
- *Panamá* es el **distrito** completo (relación `county`, 2 096 km²), porque OSM no tiene polígono de la ciudad; incluye zonas rurales.
- *Ciudad de México* es el polígono de ciudad de OSM (615 km²), no la entidad federativa completa.
- *Nueva York* = polígono de la ciudad (cinco condados).
- *París* = ciudad/departamento 75.

**Ciudades de referencia de Paraguay no se duplican:** Asunción es `PY-ASU` (departamento Capital; el distrito `PY-ASU-asuncion` queda con `duplicaDe: "PY-ASU"`), Depto. Central es `PY-11`, Encarnación y Ciudad del Este son sus distritos. Los ids antiguos de `lib/aois.ts` (`asuncion`, `central-py`, `encarnacion`, `cde`, `madrid`, …) están en `aliases` y siguen funcionando en la URL, en `/reportes` y en `/api/gee-map`.

## Contrato (`data/zonas/zonas.json`)

Cada zona: `id`, `nivel`, `nombre`, `padre`, `bbox` `[oeste,sur,este,norte]`, `centroide {lat,lng}` (siempre dentro de la zona), `area_km2` (esférica, sobre la geometría completa), `pais`, `hemisferio`, y opcionales `aliases`, `ciudadReferencia`, `duplicaDe`, `omitirSeries`, `etiquetaCorta`, `zoom`, `nota`, `fuenteGeometria`, `licenciaGeometria`.

**El pipeline debe saltar** zonas con `duplicaDe` u `omitirSeries`, y tratar los `pendientes` como "sin datos". Tipos y búsqueda: `lib/zonas.ts`.

Comprobaciones hechas por el script: los 247 distritos tienen padre (voto de puntos interiores; ninguno cruza), no hay ids repetidos ni homónimos, y el área suma lo mismo en país, departamentos y distritos (400 622 km²; no se contrastó con una cifra oficial). **No** se validó topología fina (huecos/superposiciones entre vecinos) más allá de eso.

### Artefactos en geoBoundaries
Dos polígonos de 0,2 km² (`PY-7-san-juan-de-parana`, `PY-7-san-juan-delparana`) dentro de San Juan del Paraná: marcados `omitirSeries`.

## Simplificación y peso

`mapshaper` (Visvalingam, `keep-shapes`, precisión 0,0001°) sobre cada nivel por separado, conservando bordes compartidos. Resultado en `public/zonas/` (sin comprimir): país 0,71 MB, departamentos 1,03 MB, distritos 1,02 MB, ciudades 0,04 MB; todos < 1,5 MB. Son para dibujar: el error de borde es del orden de cientos de metros en los distritos. Para estadísticas del pipeline usar los límites completos (`data/zonas/raw/`, no versionados) subidos como asset de GEE.

`lib/aois.ts` mantiene las 15 AOI históricas con su forma original (`Aoi`), derivadas de estas zonas con una simplificación mayor (`data/zonas/aoi-geometrias.json`, ~90 KB) porque van en línea a Earth Engine. `lib/zonasServer.ts` (solo servidor) resuelve **cualquier** id de zona para `/api/gee-map` (`aoiId`) leyendo `public/zonas/*.geojson`.

## Mapa y URL

- Zoom < 8: departamentos clicables; zoom ≥ 8: distritos (los departamentos quedan como contorno). Ciudades extranjeras: punto magenta a zoom mundial y polígono al acercarse.
- Hover resalta y muestra nombre; clic selecciona, dibuja el contorno cian y encuadra.
- Selector en el Sidebar: buscador tilde-insensible (`nemby` → Ñemby; patrón combobox con teclado), filtro por nivel y accesos a las ciudades de referencia.
- URL: `?zona=PY-11-luque` (junto con `layers, years, seasons, hour, lat, lng, z`). `?aoi=` se **sigue leyendo** (enlaces viejos y `/reportes`) pero ya no se escribe. Ambas aceptan ids de zona o ids antiguos.

## Regenerar

```bash
node scripts/zonas/fetch-boundaries.mjs        # geoBoundaries PRY ADM0/1/2 → data/zonas/raw/ (idempotente)
node scripts/zonas/fetch-osm-cities.mjs        # 11 ciudades de OSM → data/zonas/raw/osm-*.json
node scripts/zonas/build-zonas.mjs             # zonas.json, public/zonas/*.geojson, aoi-geometrias.json
node scripts/zonas/reconciliar-distritos.mjs   # pendientes + reconciliacion.{json,md}  (correr DESPUÉS del build)
```
`build-zonas.mjs` usa `npx --yes mapshaper` (o la variable `MAPSHAPER` con la ruta del binario); mapshaper **no** es dependencia del proyecto. `data/zonas/raw/` está en `.gitignore`.

## Limitaciones conocidas
- Faltan 18 distritos (ver `data/zonas/reconciliacion.md`); su territorio aparece dentro del distrito vecino de 2012.
- Los límites de 2012 pueden diferir de los vigentes.
- Nombres: geoBoundaries trae algunos sin tildes o abreviados (p. ej. "Sgto. Jose Felix Lopez"); la búsqueda ignora tildes pero la etiqueta se muestra tal cual.
- Wikipedia (usada solo para detectar faltantes) es fuente secundaria y es inconsistente en Concepción.
