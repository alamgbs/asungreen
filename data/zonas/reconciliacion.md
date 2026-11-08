# Reconciliación de distritos

Generado por `scripts/zonas/reconciliar-distritos.mjs` (2026-11-08). **No es una validación oficial**: se compara
geoBoundaries (año representado 2012, fuente DGEEC) con una fuente secundaria (Wikipedia, "Anexo:Municipios de Paraguay").
La lista oficial vigente es de DGEEC/INE y **no se pudo consultar** desde este entorno.

- Distritos en geoBoundaries: **247** (incluye el distrito Asunción, duplicado del departamento Capital: `duplicaDe: PY-ASU`).
- Municipios listados por Wikipedia: **263** (su texto dice 263 = 262 + Distrito Capital).
- Artefactos en geoBoundaries: **2** polígonos de 0,2 km² (PY-7-san-juan-de-parana, PY-7-san-juan-delparana) con nombre repetido dentro de San Juan del Paraná; se marcan `omitirSeries: true`. Descontándolos, los distritos reales con geometría son 245, y 245 + 18 = 263, que coincide con los 263 de Wikipedia.
- La propia página de Wikipedia es inconsistente en Concepción (declara 13 municipios y lista 14); tratar esos pendientes con cautela.
- Equivalencias de nombre emparejadas a mano (abreviaturas/ortografía): ver `EQUIV` en el script.
- Sin geometría en geoBoundaries (**18**), marcados `estado: "pendiente"` en `zonas.json > pendientes`, **sin inventar límites**:

  - Amambay: Cerro Corá
  - Amambay: Karapaí
  - Boquerón: Boquerón
  - Canindeyú: Laurel
  - Canindeyú: Maracaná
  - Canindeyú: Puerto Adela
  - Canindeyú: Yby Pytá
  - Concepción (Paraguay): Arroyito
  - Concepción (Paraguay): Itacuá
  - Concepción (Paraguay): Paso Barreto
  - Concepción (Paraguay): Paso Horqueta
  - Concepción (Paraguay): San Alfredo
  - Itapúa: Bella Vista
  - Paraguarí: María Antonia
  - Presidente Hayes: Campo Aceval
  - Presidente Hayes: Nueva Asunción
  - San Pedro (Paraguay): San José del Rosario
  - San Pedro (Paraguay): San Vicente Pancholo

## Cómo cerrar la brecha
1. Obtener el listado y los límites vigentes de DGEEC/INE (o el servicio geo.stp.gov.py citado por geoBoundaries) y comprobar cada pendiente.
2. Si existe geometría fiable (OSM/HDX), añadirla como fuente adicional en `build-zonas.mjs` y registrar su licencia.
3. Los distritos pendientes **no tienen series**: el pipeline y la UI deben tratarlos como "sin datos", no como cero.
4. Los vecinos de un distrito nuevo (segregado de otro) pueden tener un área mayor que la actual: sus series de antes de la segregación siguen siendo válidas para el territorio de 2012.
