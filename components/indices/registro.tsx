'use client';

import { registrarSeccion } from '@/components/zona/secciones';
import SeccionIndices from './SeccionIndices';

registrarSeccion({
  id: 'indices-compuestos',
  titulo: 'Índices compuestos',
  orden: 50,
  Componente: ({ ctx }) => <SeccionIndices zonaId={ctx.zona.id} />,
});
