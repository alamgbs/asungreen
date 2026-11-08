# Reportes mensuales

Los reportes están basados en git: cada uno es una carpeta en `content/reports/` con su `meta.json` y su PDF. No hay base de datos ni CMS. La página `/reportes` es estática y se regenera en cada deploy.

## Flujo mensual

1. Ten el PDF del mes listo (p. ej. `~/Descargas/informe-diciembre.pdf`).
2. Corre el script de alta (interactivo, o con flags):

   ```bash
   node scripts/new-report.mjs
   # o:
   node scripts/new-report.mjs --pdf ~/Descargas/informe-diciembre.pdf \
     --title "Informe de diciembre 2026" --summary "Resumen corto." \
     --date 2026-12-01 --zones asuncion,central-py --indicators ndvi,soilTemp \
     --tags mensual,verano --author "Tu nombre"
   ```

   Crea `content/reports/2026-12-informe-de-diciembre-2026/` (con `meta.json` y `reporte.pdf`) y copia el PDF a `public/reports/<slug>.pdf`.
3. Revisa con `npm run dev` → `/reportes`.
4. Commit y push:

   ```bash
   git add content/reports public/reports
   git commit -m "reporte: diciembre 2026"
   git push
   ```

## meta.json

| Campo | Descripción |
|---|---|
| `title`, `summary`, `author` | Texto obligatorio |
| `date` | `YYYY-MM-DD` |
| `zones` | ids de `lib/aois.ts` (`asuncion`, `central-py`, …) |
| `indicators` | `soilTemp`, `traffic`, `ndvi` |
| `tags` | Lista libre |
| `example` | `true` solo para reportes ficticios (muestra aviso) |

El build falla con un mensaje claro si un `meta.json` es inválido o falta el PDF.

## "Ver en el mapa"

El botón enlaza a `/?aoi=<primera zona>&layers=<indicadores separados por coma>`.

## Reporte de ejemplo

`content/reports/2026-11-ejemplo-ficticio` es ficticio (`"example": true`). Bórralo cuando haya reportes reales (junto con `public/reports/2026-11-ejemplo-ficticio.pdf`). El PDF mínimo se genera con `node scripts/make-example-pdf.mjs <salida.pdf> "línea 1" "línea 2"`.
