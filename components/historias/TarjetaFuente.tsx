import type { Intervencion } from '@/lib/intervenciones';

const TIPO_FUENTE: Record<string, string> = { oficial: 'Oficial', prensa: 'Prensa', academica: 'Académica', ong: 'ONG', otra: 'Otra / secundaria' };
const RESPALDA: Record<string, string> = { fecha: 'fecha', ubicacion: 'ubicación', efecto: 'efecto' };

export const ESTADO_UI: Record<Intervencion['estado'], { texto: string; color: string }> = {
  borrador: { texto: 'BORRADOR · sin verificar del todo', color: 'var(--neon-yellow)' },
  verificada: { texto: 'VERIFICADA · fecha y fuente confirmadas', color: 'var(--neon-green)' },
  publicada: { texto: 'PUBLICADA', color: 'var(--neon-green)' },
};

const caja: React.CSSProperties = { border: '1px solid var(--bg-border)', background: 'var(--bg-surface)', padding: '14px 16px', fontSize: 15, lineHeight: 1.55 };
const h2: React.CSSProperties = { margin: '0 0 8px', fontSize: 15, color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', letterSpacing: '0.03em' };

/** Tarjeta de fuentes + advertencias. Las advertencias van siempre visibles, nunca en un tooltip. */
export default function TarjetaFuente({ h }: { h: Intervencion }) {
  return (
    <section aria-label="Fuentes y advertencias" style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...caja, borderColor: 'var(--neon-yellow)' }} role="note">
        <h2 style={{ ...h2, color: 'var(--neon-yellow)' }}>ADVERTENCIAS</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {h.advertencias.map((a, i) => <li key={i} style={{ margin: '4px 0' }}>{a}</li>)}
        </ul>
      </div>

      <div style={caja}>
        <h2 style={h2}>FUENTES</h2>
        <p style={{ margin: '0 0 10px', color: 'var(--text-muted)' }}>
          Fecha de la intervención: <strong style={{ color: 'var(--text-bright)' }}>{h.inicio}{h.fin ? ` → ${h.fin}` : ''}</strong> · confianza en la fecha: <strong style={{ color: 'var(--text-bright)' }}>{h.fechaConfianza}</strong>
        </p>
        {h.fechaNota && <p style={{ margin: '0 0 10px' }}>{h.fechaNota}</p>}
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 12 }}>
          {h.fuentes.map((f, i) => (
            <li key={f.url}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--neon-cyan)', wordBreak: 'break-word' }}>
                {f.titulo}
              </a>
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                {f.publicador} · {TIPO_FUENTE[f.tipo]}{f.fechaPublicacion ? ` · publicada ${f.fechaPublicacion}` : ''} · consultada {f.fechaConsulta} · respalda: {f.respalda.map((r) => RESPALDA[r]).join(', ')}
              </div>
              {f.extracto && <blockquote style={{ margin: '6px 0 0', padding: '4px 0 4px 12px', borderLeft: '3px solid var(--bg-border)' }}>{f.extracto}</blockquote>}
              <span hidden>{i}</span>
            </li>
          ))}
        </ol>
      </div>

      {h.efectoAfirmadoPorFuente && (
        <div style={caja}>
          <h2 style={h2}>LO QUE AFIRMA LA FUENTE (no lo mide AsunGreen)</h2>
          <p style={{ margin: 0 }}>{h.efectoAfirmadoPorFuente.texto}</p>
        </div>
      )}

      <div style={caja}>
        <h2 style={h2}>CÓMO SE VERIFICÓ</h2>
        <p style={{ margin: '0 0 6px', color: 'var(--text-muted)' }}>Revisión del {h.verificacion.verificadoEl}</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {h.verificacion.notas.map((n, i) => <li key={i} style={{ margin: '4px 0' }}>{n}</li>)}
        </ul>
      </div>
    </section>
  );
}
