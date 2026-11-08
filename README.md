# AsunGreen

Plataforma web de monitoreo ambiental para Asunción y el Departamento Central (Paraguay). Muestra sobre un mapa interactivo indicadores derivados de imágenes satelitales para ayudar a ver dónde hay más calor superficial y menos vegetación.

> Los indicadores son orientativos, no mediciones oficiales. Las zonas (AOI) actuales son aproximaciones rectangulares, no límites administrativos.

## Capas

| Capa | id interno | Fuente | Resolución | Notas |
|---|---|---|---|---|
| Vegetación (NDVI) | `ndvi` | Sentinel-2 SR Harmonized + Cloud Score+ (Google Earth Engine) | 10 m, desde 2017 | Mediana por estación y año |
| Temp. superficial (LST) | `soilTemp` | Landsat 8/9 Collection 2 Level-2, banda `ST_B10` (GEE) | 30 m, desde 2013 | Es temperatura de la superficie (incluye techos y asfalto), no del aire |
| Tráfico | `traffic` | **Simulación** sobre vías de OpenStreetMap | — | **No son datos reales.** Apagada por defecto |

El botón **¿Cómo se calcula?** de la app muestra fuente, resolución y limitaciones de cada capa.

## Enlaces compartibles

El estado del mapa se guarda en la URL (sin recargar la página):

| Parámetro | Ejemplo | Significado |
|---|---|---|
| `aoi` | `asuncion` | Zona (ids de `lib/aois.ts`) |
| `layers` | `ndvi,soilTemp` | Capas activas |
| `years` | `2024,2025` | Años |
| `seasons` | `summer,autumn` | Estaciones (`spring`, `summer`, `autumn`, `winter`) |
| `hour` | `17` | Hora de la simulación de tráfico (0–23) |
| `lat`, `lng`, `z` | `-25.2867`, `-57.5759`, `12` | Vista del mapa |

Ejemplo: `/?aoi=asuncion&layers=ndvi&years=2025&seasons=summer`

## Correr localmente

Requisitos: Node.js 20+ y una cuenta de servicio de Google Earth Engine con acceso a la API.

```bash
npm install
```

Credenciales de GEE (una de las dos opciones):

- Variable de entorno `GEE_SA_JSON` con el JSON completo de la cuenta de servicio (por ejemplo en `.env.local`), o
- Archivo `service-account.json` en la raíz del proyecto (está en `.gitignore`; nunca lo subas al repositorio).

```bash
npm run dev      # http://localhost:3000
npm run lint
npx tsc --noEmit
npm run build && npm start
```

Los tokens de GEE se generan en el servidor (`/api/gee-map`) y los tiles pasan por un proxy (`/api/gee-tiles`); el navegador nunca ve las credenciales.

## Estructura

```
app/
  page.tsx            Página principal (lee el estado inicial de la query string)
  layout.tsx          Layout y fuentes
  globals.css         Tokens de diseño, layout responsive (sidebar / bottom sheet)
  api/gee-map/        Crea el mapa de GEE (NDVI / LST) y devuelve min/max
  api/gee-tiles/      Proxy de tiles con autenticación del lado del servidor
  api/_lib/           Utilidades de GEE solo para servidor
  reportes/           Reportes mensuales (ver docs/reportes.md)
components/
  MapClient.tsx       Estado de la app y sincronización con la URL
  MapView.tsx         MapLibre + deck.gl (capas raster y partículas de tráfico)
  Sidebar.tsx         Zona, capas, periodo, hora (bottom sheet en móvil)
  Legend.tsx          Leyendas por capa
  MethodologyModal.tsx  "¿Cómo se calcula?"
  Header.tsx, StatusBar.tsx
lib/
  aois.ts             Catálogo de zonas
  urlState.ts         Parseo y serialización del estado en la URL
  layerInfo.ts        Textos de cada capa (UI y modal)
  trafficSim.ts       Simulación de tráfico (datos ficticios)
  geeApi.ts           Cliente de /api/gee-map
  mapStyle.ts         Tema neón del mapa base
public/data/          Red vial de OSM (GeoJSON)
scripts/              Utilidades (vías OSM, reportes)
docs/                 Documentación adicional
```

## Deploy en Vercel

1. Importa el repositorio en Vercel (framework Next.js, sin configuración extra).
2. En **Settings → Environment Variables** crea `GEE_SA_JSON` con el contenido del JSON de la cuenta de servicio.
3. Haz deploy (`git push` a la rama conectada, o `vercel --prod`).

Los reportes se publican con commit + deploy; ver [docs/reportes.md](docs/reportes.md).
