# Historias: verificación (2026-11-08)

Datos en `data/intervenciones/*.json`; esquema y estadística en `lib/intervenciones.ts`; lectura en `lib/intervenciones-server.ts`; pruebas: `node --test data/intervenciones/intervenciones.test.mjs`.

| Historia | Estado | Qué se confirmó abriendo la fuente | Qué falta |
|---|---|---|---|
| ley-deforestacion-cero-2004 | verificada | BACN: promulgación 13-12-2004, Región Oriental; Ley 6676 promulgada 11-12-2020 | Los departamentos del Chaco (PY-15/16/19) ya tienen series de clima (ERA5) pero aún no `ndvi-modis`: contraste en null (revisado 2026-11-08) |
| parque-guasu-metropolitano-2012 | verificada | La Nación: 21-09-2012, 125 ha, Campo Grande de Asunción | Polígono con fuente; sin contraste (escala) |
| costanera-sur-asuncion | verificada | La Nación 14-08-2021 (inicio refulado 62 ha); ABC 21-07-2024 (inauguración 20-07-2024) | Fuente del MOPC; ventana "después" demasiado corta |
| bishan-ang-mo-kio-2012 | verificada | Discurso oficial PMO, 17-03-2012 | Zona y series para Singapur |
| madrid-rio | borrador | Wikipedia es: 2011, 121 ha | diario.madrid.es dio 403; fechas de obra |
| cheonggyecheon-seul | borrador | Wikipedia en: 2003–2005, apertura sep-2005 | Fuente municipal; hay una fuente con 2004 |
| medellin-corredores-verdes | borrador | Alcaldía y PNUMA: cuatrienio 2016–2019; declaraciones de ~2 °C | Fechas por corredor; método de medición |
| superillas-barcelona | borrador | Web oficial: iniciativas en Poblenou, Horta, Sant Antoni | Fechas; el PDF de ASPB no se pudo leer |

## Medible con nuestras series
Solo hay series por departamento (ERA5 0,25°, MODIS NDVI/LST, desde 2000). Por eso los indicadores de intervenciones pequeñas figuran con adecuación `mala` y **no se calcula contraste**. Solo la Ley 2524 calcula diferencia-en-diferencias (NDVI anual, Oriente vs Chaco), y queda en null hasta que el pipeline genere `ndvi-modis` para los departamentos del Chaco. Las ciudades de referencia ya tienen series de clima ERA5 (celda de ~25 km), que no resuelven intervenciones urbanas; Seúl, Medellín y Singapur no son zonas de la app.

## Notas
- La búsqueda de OpenStreetMap para "Parque Guasu Metropolitano" devolvió el Parque Ñu Guasú (otro parque): no se usó.
- La Cortina es sobre la serie anual, no sobre imágenes de satélite (requiere tiles de Earth Engine por año; pendiente).
- El mapa solo tiene capas desde 2013 (`PRIMER_ANIO_MAPA`).
- Las series de prueba del test son sintéticas.
