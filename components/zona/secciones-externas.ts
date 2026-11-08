/**
 * Punto de enganche para secciones de otros módulos: una línea `import './mi-seccion';` por módulo.
 * Cada módulo se auto-registra con `registrarSeccion` (ver ./secciones.ts). Este archivo no tiene lógica.
 */
import '@/components/indices/registro';

import '@/components/indices/registro'; // Índices compuestos (agente indices)

export {};
