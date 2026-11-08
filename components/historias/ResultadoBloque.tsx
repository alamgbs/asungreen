import type { CalculoIndicador } from '@/lib/intervenciones-server';
import Cortina from './Cortina';
import type { Intervencion } from '@/lib/intervenciones';

const ADEC: Record<string, string> = { buena: 'adecuación buena', limitada: 'adecuación limitada', mala: 'el sensor no resuelve la intervención' };
const n = (x: number, d = 3) => x.toLocaleString('es-PY', { maximumFractionDigits: d, minimumFractionDigits: 2 });
const signo = (x: number, d = 3) => `${x > 0 ? '+' : ''}${n(x, d)}`;

/** Un indicador: gráfico con cortina + números honestos, o la razón por la que no hay números. */
export default function ResultadoBloque({ h, c }: { h: Intervencion; c: CalculoIndicador }) {
  const r = c.resultado;
  return (
    <article style={{ border: '1px solid var(--bg-border)', background: 'var(--bg-surface)', padding: '14px 16px', display: 'grid', gap: 12 }}>
      <header>
        <h3 style={{ margin: 0, fontSize: 17, color: 'var(--text-bright)' }}>{c.nombre}</h3>
        <p style={{ margin: '2px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>{ADEC[c.adecuacionSensor]} · se espera: {h.indicadores.find((i) => i.id === c.id)?.direccionEsperada ?? 'indefinida'}</p>
        {h.indicadores.find((i) => i.id === c.id)?.nota && <p style={{ margin: '6px 0 0', fontSize: 14 }}>{h.indicadores.find((i) => i.id === c.id)?.nota}</p>}
      </header>

      {c.grafico ? (
        <Cortina
          nombre={c.nombre}
          unidad={c.unidad}
          tratada={c.grafico.tratada}
          control={c.grafico.control}
          antes={h.ventanaAntes}
          despues={h.ventanaDespues}
          excluida={h.ventanaExcluida}
          descripcion={`Serie anual de ${c.nombre} en la zona tratada${c.grafico.control ? ' y en el grupo de control' : ''}, con las ventanas antes, excluida y después marcadas.`}
        />
      ) : null}

      {r ? (
        <div style={{ fontSize: 15, lineHeight: 1.55 }}>
          <p style={{ margin: 0 }}>
            En la zona tratada, la media pasa de <strong>{n(r.tratada.mediaAntes)}</strong> ({r.nAntes} años) a <strong>{n(r.tratada.mediaDespues)}</strong> ({r.nDespues} años):
            diferencia <strong>{signo(r.tratada.diferencia)}</strong>{r.tratada.ic95 ? ` (IC 95 %: ${signo(r.tratada.ic95[0])} a ${signo(r.tratada.ic95[1])})` : ''}.
          </p>
          {r.control && r.did !== null && (
            <p style={{ margin: '6px 0 0' }}>
              En el control el cambio es {signo(r.control.diferencia)}. La diferencia entre ambos cambios es <strong>{signo(r.did)}</strong>
              {r.didIc95 ? ` (IC 95 %: ${signo(r.didIc95[0])} a ${signo(r.didIc95[1])})` : ''}
              {r.indistinguibleDeCero ? ', y no se distingue de cero. ' : '. '}
              Este número <em>coincide con</em> el período posterior a la intervención; no demuestra que la intervención lo produjera.
            </p>
          )}
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: 'var(--neon-yellow)' }}>
            {r.advertencias.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      ) : (
        <p role="status" style={{ margin: 0, padding: '10px 12px', border: '1px dashed var(--text-muted)', fontSize: 15 }}>
          <strong>Sin cálculo (null).</strong> {c.motivo}
        </p>
      )}
    </article>
  );
}
