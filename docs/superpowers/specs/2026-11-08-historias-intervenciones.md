# Historias ligadas a intervenciones humanas (antes / después)

Fecha: 2026-11-08 · Estado: diseño + lista de candidatos (sin código de app)

## 1. Objetivo y principio de honestidad

Una **historia** muestra qué cambió en el territorio (verde, calor, agua, aire) alrededor de una **intervención humana** concreta, buena o mala, con una fuente verificable. Regla de producto: **la app muestra asociación temporal y espacial, no causalidad**, salvo que exista un grupo de control razonable, y aun así lo dice en la tarjeta.

Reglas de contenido:
- Ninguna historia sale sin al menos una fuente con URL abierta y fecha comprobada. Las fechas dudosas llevan `fechaConfianza: 'baja'` y se muestran con rango, no como día exacto.
- Los efectos citados por la prensa o la alcaldía (p. ej. "bajó 2 °C") se muestran como **afirmación de la fuente**, separados de lo que mide la app.
- Se avisa cuando la resolución del sensor no puede ver la intervención (ver §4, columna "adecuación").

## 2. Esquema de datos de una intervención

Archivo por intervención en `data/intervenciones/{id}.json`, más un `index.json` generado. Tipos TypeScript propuestos (en `lib/types.ts` o `lib/intervenciones.ts`):

```ts
export type TipoIntervencion = 'positiva' | 'negativa' | 'neutra' | 'mixta';
export type Confianza = 'alta' | 'media' | 'baja';
export type IndicadorId = string; // id del registro de indicadores (ver plan C)

export interface FuenteVerificable {
  titulo: string;
  url: string;
  publicador: string;            // organismo o medio
  tipo: 'oficial' | 'prensa' | 'academica' | 'ong' | 'otra';
  fechaPublicacion?: string;     // ISO
  fechaConsulta: string;         // ISO: cuándo se verificó que el enlace abre
  respalda: Array<'fecha' | 'ubicacion' | 'efecto'>;
}

export interface VentanaTemporal {
  inicio: string;                // ISO yyyy-mm
  fin: string;
}

export interface GrupoControl {
  tipo: 'buffer-anillo' | 'zona-vecina-similar' | 'sintetico' | 'ninguno';
  geometria?: GeoJSON.Polygon | GeoJSON.MultiPolygon; // si está dibujado
  zonaIds?: string[];            // si se usa zonas ya existentes
  criterio: string;              // por qué es comparable (misma ecorregión, mismo uso previo, pendiente similar)
  pretendenciaParalela: 'verificada' | 'no-verificada' | 'no-aplica';
}

export interface Intervencion {
  id: string;                    // kebab-case estable
  nombre: string;
  tipo: TipoIntervencion;
  resumen: string;               // ≤280 caracteres, en español
  zonaId?: string;               // ADM1/ADM2/ciudad
  geometria?: GeoJSON.Polygon | GeoJSON.MultiPolygon; // área de tratamiento
  inicio: string;                // ISO (yyyy-mm-dd o yyyy-mm)
  fin?: string;                  // fin de obra o de la política; ausente si continúa
  fechaConfianza: Confianza;
  fechaNota?: string;            // discrepancias entre fuentes
  fuentes: FuenteVerificable[];  // mínimo 1; 2 si el efecto es controvertido
  indicadores: Array<{
    id: IndicadorId;
    direccionEsperada: 'sube' | 'baja' | 'indefinida';
    adecuacionSensor: 'buena' | 'limitada' | 'mala'; // ¿el píxel puede verlo?
  }>;
  ventanaAntes: VentanaTemporal;   // p. ej. 3 años previos al inicio
  ventanaDespues: VentanaTemporal; // p. ej. desde fin + 1 año
  ventanaExcluida?: VentanaTemporal; // período de obra, se excluye del contraste
  estacionalidad: 'mismo-mes' | 'anual';  // compara mismos meses/estación
  control: GrupoControl;
  efectoAfirmadoPorFuente?: { texto: string; fuenteIdx: number }; // claim externo, no medido
  advertencias: string[];          // mostrar siempre en la tarjeta
  estado: 'borrador' | 'verificada' | 'publicada';
}
```

Notas de diseño:
- **Ventana excluida** (la obra misma) para no mezclar suelo desnudo de obra con el efecto final.
- **`adecuacionSensor`** evita historias engañosas: Landsat (30 m) no ve una calle de 15 m; Sentinel-5P NO₂ (~5,5×3,5 km) no ve una superisla de 3 manzanas.
- **`estado`**: solo `publicada` aparece en la UI. `verificada` exige que el enlace abra y que la fecha esté respaldada por una fuente.

## 3. Cómo se calcula el contraste (y qué no se puede afirmar)

Estimador por defecto: **diferencia en diferencias** entre la zona tratada y el control, en la misma estación, restando la media de la ventana "antes".

```
efecto ≈ (media_trat[después] − media_trat[antes]) − (media_ctrl[después] − media_ctrl[antes])
```

Reglas:
1. **Control obligatorio**: si `control.tipo === 'ninguno'`, la tarjeta dice "cambio observado, sin grupo de control: no se puede atribuir a la intervención" y no calcula efecto neto.
2. **Pre-tendencias**: ajustar una recta a los últimos 3 años del "antes" de tratado y control; si las pendientes difieren más de un umbral (p. ej. > 0,01 NDVI/año), marcar `pretendenciaParalela: 'no-verificada'` y mostrar advertencia.
3. **Incertidumbre**: bootstrap sobre los meses de cada ventana; mostrar intervalo, no un solo número.
4. **Controles posibles** (en orden de preferencia): zona vecina similar con la misma cobertura previa; anillo buffer a 1–3 km excluyendo la zona tratada (ojo con derrames: el efecto de un parque se extiende a su entorno); control sintético ponderando varias zonas.
5. **Confusores a listar siempre**: sequía/El Niño-La Niña (Paraguay tiene años secos y húmedos fuertes), cambio de sensor (Landsat 5/7/8/9), ciclo agrícola (soja/maíz) y crecimiento natural de arbolado joven (los árboles plantados tardan años en cubrir el píxel).
6. **Nunca** usar la frase "gracias a" o "causó" en el texto generado. Usar "coincide con", "después de".

## 4. UX

### 4.1 Cortina antes/después sincronizada con gráfico temporal

```
┌──────────────────────────────────────────────┬───────────────────┐
│   ◄── ANTES (2009)   ┃   DESPUÉS (2015) ──►  │  Tarjeta          │
│   [raster/satélite]  ┃   [raster/satélite]   │  Nombre + tipo    │
│                      ┃ ← arrastrar cortina   │  Fecha (confianza)│
│                      ┃                       │  Efecto (fuente)  │
├──────────────────────┴───────────────────────┤  Advertencias     │
│  NDVI ─────┐ ░░░░ obra ░░░░ ┌──────  ▲ control│  Fuentes [URL]    │
│       zona │                │ tratada          │  [Ver zona]       │
│  2005     antes    |inicio   fin|   después    │                   │
└──────────────────────────────────────────────┴───────────────────┘
```

- **Cortina**: dos mapas MapLibre apilados (o un `clip-path` sobre un segundo canvas) con la misma cámara; un divisor arrastrable. Capa izquierda = mediana del período "antes"; derecha = período "después". Con estilos de capa idénticos (misma paleta y mismo min/max) para que la comparación sea justa. Atajo de teclado ←/→ y soporte táctil.
- **Sincronía con el gráfico**: el gráfico temporal (zona tratada y control) tiene la ventana antes/después sombreada y la obra en gris. Arrastrar el borde de la ventana en el gráfico cambia el período de la cortina; arrastrar la cortina no cambia fechas pero resalta el punto del gráfico.
- **Estados**: cargando, sin datos suficientes (< 60% de meses válidos en una ventana), sensor inadecuado (aviso, no ocultar).
- **Tarjeta de fuente** (visible siempre, no en un tooltip): título, publicador, fecha, tipo (oficial/prensa/académica), botón "Abrir fuente" con `rel="noopener noreferrer"`, y la insignia de confianza de la fecha. Si el efecto afirmado viene de la fuente, va etiquetado "Según [publicador]: …" y separado de "Lo que muestran los datos".
- **Accesibilidad y móvil**: la cortina es operable con teclado (rol `slider`); en móvil se apila arriba/abajo con un control deslizante horizontal.
- **Entrada a la historia**: lista de historias en el panel; modo "recorrido" que enmarca el mapa en la geometría y activa la capa del indicador principal.
- Español en toda la UI; fechas como "mar 2022".

## 5. Candidatos reales

Criterio de selección: tienen **fecha y fuente que pude abrir o ver listada en una búsqueda hecha el 2026-11-08**. Aun así **ninguna URL fue abierta y leída por completo por mí**: las confirmé como resultados de búsqueda con el título y el contenido citado. Antes de pasar una historia a `verificada`, un humano debe abrir el enlace. Los efectos de las columnas son lo que se **espera** que cambie, no resultados medidos.

Leyenda: Confianza fecha/fuente: A = varias fuentes coinciden; M = una fuente, o discrepancias menores; B = fecha incierta o fuentes en conflicto. Adecuación = si Landsat 30 m / Sentinel-2 10 m / Sentinel-5P pueden ver el cambio.

### 5.1 Paraguay

| # | Intervención (tipo) | Fecha | Ubicación aprox. | Indicador esperado | Conf. | Fuente (URL) | Notas / adecuación |
|---|---|---|---|---|---|---|---|
| 1 | **Ley de Deforestación Cero, Región Oriental** (positiva) | Aprobada 13-dic-2004 (WRM); rige en la práctica desde 2005; prórroga 10 años en 2020 | Región Oriental completa; **control natural: Chaco, que no estaba cubierto por la ley** | NDVI/cobertura boscosa: la pérdida de bosque debe caer en el Este respecto del Chaco | M (el número de la ley varía entre fuentes: 2524, 6256, 6676; no verificado en SILpy) | https://wrm.org.uy/print/pdf/node/12807/es · https://www.abc.com.py/nacionales/2020/12/03/senado-aprobo-vigencia-de-ley-de-desforestacion-cero-por-10-anos-mas/ | Mejor candidato para diferencias en diferencias a escala regional. Caveat: la fiscalización fue desigual (ver nota de impunidad en ABC/La Nación). Landsat 1984+ la cubre bien |
| 2 | **Deforestación en el Chaco paraguayo** (negativa) | Proceso continuo; el medio cita "más de 200 mil ha deforestadas solo en 2016" | Alto Paraguay, Boquerón, Presidente Hayes | NDVI baja, aparece suelo desnudo/pastura; LST sube | M (cifra de 2016 de un solo medio) | https://www.ecoticias.com/eco-america/175687_solo-en-2016-fueron-deforestadas-mas-de-200-mil-hectareas-en-el-chaco-paraguayo | No es un evento único: construir polígonos de eventos con Hansen/MapBiomas, no con esta nota. Adecuación buena (Landsat/S2) |
| 3 | **Ruta Bioceánica, tramo Loma Plata–Carmelo Peralta** (neutra/mixta) | Inaugurado 25-feb-2022; otros tramos y puente en obra (avance 76–80% según reportes de fechas no confirmadas) | Chaco, corredor Carmelo Peralta–Loma Plata–Mariscal Estigarribia | Cambio de uso cerca del eje (buffer 5–10 km), NDVI y suelo desnudo | A (fecha) / B (avance del puente) | https://www.lanacion.com.py/politica/2022/02/25/abdo-inaugura-primer-tramo-de-la-ruta-bioceanica/ · https://www.infraestructurapublica.cl/paraguay-ruta-bioceanica-inaugura-un-nuevo-tramo-y-completa-159-kilometros/ | Efecto de borde de ruta tarda años; ventana "después" corta aún |
| 4 | **Costanera Sur de Asunción** (mixta: parque lineal + relleno de humedal) | Refulado desde ~2017 (nota IP 22-sep-2017); relleno de la laguna Yrupé reportado en may-2022; inauguración jul-2024 | Bañado Sur / Tacumbú, Asunción | Pérdida de agua/humedal (NDWI), cambio en NDVI y LST, nueva superficie construida | M (inauguración con varios medios; inicio del refulado sin precisar mes) | https://www.ip.gov.py/ip/2017/09/22/avanzan-las-obras-de-relleno-en-la-costanera-sur/ · https://www.abc.com.py/nacionales/2022/05/21/rellenan-la-laguna-yrupe-como-parte-de-la-costanera-sur-advierten-sobre-danos/ · https://www.abc.com.py/economia/2024/07/21/colorida-inauguracion-de-costanera-sur-que-costara-us-171-millones/ | Historia con matices: tiene componente social (reubicación de familias) que no medimos. Mostrar fuente social, no inventar números de afectados |
| 5 | **Costanera Norte / Costanera II de Asunción** (neutra) | Primera etapa iniciada en 2010 según declaración del MOPC; segunda etapa en licitación/obra | Franja ribereña Asunción | NDVI/LST locales | B (solo una mención del MOPC en una nota; las notas de 2026 que encontré no se pudieron datar bien) | https://www.abc.com.py/nacionales/2020/06/17/inauguran-otra-conexion-de-costanera-ii/ | **Marcar como no verificada**; usar solo como candidata para investigar |
| 6 | **Represa de Yacyretá, llenado a cota 83** (neutra/negativa) | Alcanzó cota 83 msnm en feb-2011 tras ascenso gradual desde 2006 (una fuente dice 13-feb-2011, otra publica el 9-feb-2011: **discrepancia**) | Embalse del Paraná, eje Encarnación/Ayolas | Superficie de agua (+), NDVI de costa inundada (−) | M | https://misionesonline.net/2011/02/09/historico-yacyreta-llego-a-cota-83-llenando-la-presa-en-su-nivel-definitivo/ · https://www.infobae.com/2011/02/20/562324-la-argentina-y-paraguay-inauguran-yacyreta/ | Mejor ventana "antes" 2005; usar índice de agua |
| 7 | **Costanera de Encarnación y playa San José** (mixta) | Inauguración oficial 2011 (según trabajo académico) | Encarnación, Itapúa | Cambio de uso costero, superficie urbana, NDVI | M (un trabajo académico) | https://uffs.edu.br/campi/cerro-largo/repositorio-ccl/anais-viii-simposio-iberoamericano-de-cooperacao-para-o-desenvolvimento-e-a-integracao-regional/el-proceso-de-ocupacion-del-nuevo-circuito-comercial-de-encarnacion/@@download/file | Confunde dos hechos: llenado de Yacyretá (#6) y la costanera. Aislar con buffers |
| 8 | **Parque Guasu Metropolitano** (positiva) | Abierto 21-sep-2012 (confirmado por nota de aniversario 2024); declarado reserva ecológica por ley 6941/2022 según un medio | Asunción / Luque, ~125 ha | NDVI sube y LST baja dentro del polígono | A (fecha de apertura) / M (ley) | https://www.lanacion.com.py/pais/2024/09/20/conmemoran-el-12-aniversario-del-parque-guasu-metropolitano/ | Ojo: algunas páginas con fecha 2026 anuncian un "primer tramo" el 21 de septiembre; no pude aclarar si es un evento nuevo. No usar esas notas |
| 9 | **Llenado del embalse de Itaipú** (negativa para vegetación / neutra) | Cierre de compuertas 13-oct-1982; llenado entre 13 y 27-oct-1982 | Alto Paraná, frontera con Brasil | Superficie de agua (+), NDVI ribereño (−) | A (fecha) | https://en.wikipedia.org/wiki/Itaipu_Dam · https://www.ultimahora.com/hace-25-anos-se-cometio-el-mayor-crimen-ecologico-sudamerica-n69199 | **Casi sin datos de "antes"**: Landsat 4/5 TM comienza en 1982–84 y la cobertura útil en Paraguay es escasa. Valor sobre todo histórico/ilustrativo; marcar adecuación 'limitada' |

### 5.2 Referentes mundiales

| # | Intervención (tipo) | Fecha | Ubicación aprox. | Indicador esperado | Conf. | Fuente (URL) | Notas / adecuación |
|---|---|---|---|---|---|---|---|
| 10 | **Corredores Verdes de Medellín** (positiva) | Primeros corredores en el cuatrienio 2016–2019 (la fecha por corredor no la verifiqué) | Medellín, Colombia | LST baja, NDVI sube en ejes viales | M (fecha), efecto controvertido | https://www.medellin.gov.co/es/sala-de-prensa/noticias/con-mas-corredores-verdes-medellin-enfrenta-el-calentamiento-global-y-baja-su-temperatura/ · https://www.unep.org/es/noticias-y-reportajes/reportajes/medellin-se-refresca-con-intervenciones-urbanas-basadas-en-la | La Alcaldía dice "hasta 2 °C" (aire, en algunos puntos); otras notas dicen 3 °C o 4,5 °C sin método claro. Corredores angostos: **adecuación limitada** con Landsat; usar Sentinel-2 para NDVI |
| 11 | **Madrid Río (soterramiento M-30 + parque)** (positiva) | Soterramiento 2003–2007; parque inaugurado en 2011 (abril, día no verificado) | Río Manzanares, Madrid | NDVI y LST en la ribera | M | https://diario.madrid.es/blog/2025/02/04/madrid-rio-una-metamorfosis-verde/ | Corredor lineal ~6 km, ancho decenas de metros: adecuación media con S2 |
| 12 | **Restauración del Cheonggyecheon** (positiva) | Obras 2003–2005; hay fuentes que dicen sept-2004 y otras 2005 | Seúl | LST baja cerca del arroyo | M-B (fecha del cierre difiere) | https://pure.uos.ac.kr/en/publications/changes-of-the-micro-climate-and-building-cooling-load-due-to-the/ | Estudios observacionales reportan ~0,4 °C de descenso medio cerca de la superficie, con cautela por el clima; una cifra de 3,6 °C no la pude rastrear a su origen. Arroyo estrecho: **adecuación mala** a 30 m. Útil sobre todo como caso de **cómo no sobre-afirmar** |
| 13 | **Superillas de Barcelona (Poblenou, Sant Antoni)** (positiva) | Poblenou: 5-sep-2016 (una fuente); Sant Antoni: 2018 | Barcelona | NO₂ ↓ (informe oficial: −25% NO₂ y −17% PM10 en Sant Antoni, 2021) | M | https://www.aspb.cat/wp-content/uploads/2021/02/ASPB_salut-carrers-avaluacio-superilles-infografia.pdf · https://naciodigital.cat/societat/la-superilla-del-poblenou-culmina-la-prova-pilot-i-sinicien-els-usos-definitius.html | **Sentinel-5P (~5,5×3,5 km) no resuelve una superisla**: adecuación mala con satélite; usar solo como ejemplo con datos de sensores en tierra. Buscar el estudio original antes de citar números |
| 14 | **Plan Árboles de París (170.000 árboles 2020–2026)** (positiva) | Anuncio 21-oct-2020 (The Local); objetivo hasta 2026 | París | NDVI, LST urbana | M (la cifra puede ser bruta, no neta: un medio dice ~156.000 adicionales) | https://www.thelocal.fr/20201022/paris-to-plant-170000-new-trees-and-turn-key-spots-into-urban-gardens | Árboles jóvenes tardan en cubrir píxeles; efecto en ventana corta. No encontré un documento oficial de la ciudad con la fecha de adopción |
| 15 | **Bishan–Ang Mo Kio Park / ABC Waters** (positiva) | Apertura oficial 17-mar-2012 | Singapur | Cambio de verde y agua en el parque (renaturalización del canal) | A (acta del PMO) | https://www.pmo.gov.sg/Newsroom/speech-prime-minister-lee-hsien-loong-opening-bishan-park-abc-waters-17-mar-2012 | Superficie de parque amplia (la extensión en ha no la verifiqué): adecuación probablemente buena. Cuidado con nubes en trópico: mensual con huecos |
| 16 | **Gardens by the Bay** (positiva/mixta) | Bay South abierto 29-jun-2012 (una fuente oficial dice 28-jun) | Marina Bay, Singapur | NDVI, cambio de superficie en terreno ganado al mar | A | https://en.wikipedia.org/wiki/Gardens_by_the_Bay | Tierra ganada al mar: separar cambio de cobertura anterior |

### 5.3 Buscados y no verificados (no incluir sin más trabajo)

- **Parque Ñu Guasu (Luque):** no encontré la fecha de inauguración.
- **Madrid, Seúl, Barcelona, París:** faltan las fuentes primarias de la ciudad para los efectos; las URL de arriba respaldan la fecha, no el efecto medido.
- **Bañado Sur: viviendas y reubicación:** hay notas del MOPC (1.500 viviendas anunciadas, abr-2024) pero no una fecha de entrega confirmada; no incluida.
- **Jurong Lake Gardens (Singapur):** no encontré año de apertura.
- **Forestaciones/parques municipales menores de Paraguay y obras viales del Gran Asunción:** quedan por investigar con fuentes del MOPC y municipalidades; no tengo candidato con fecha verificada.

## 6. Selección para el primer lote (recomendación)

Empezar con 4 historias donde el sensor sí ve el cambio y hay control razonable:

1. **#1 Ley de Deforestación Cero (Este vs. Chaco):** la más defendible metodológicamente y la más propia de Paraguay.
2. **#8 Parque Guasu Metropolitano:** fecha firme, polígono claro, control = parcelas vecinas urbanizadas.
3. **#4 Costanera Sur:** historia local conocida, con la parte "mixta" tratada con honestidad.
4. **#15 Bishan–Ang Mo Kio:** referente mundial con fecha oficial y área suficiente.

Dejar #10 (Medellín) y #12 (Cheonggyecheon) como historias de "lectura crítica": se muestra la afirmación y por qué un píxel de 30 m no puede confirmarla.
