'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { LayerType } from '@/lib/types';
import { LAYER_INFO, SIM_BADGE } from '@/lib/layerInfo';

const ORDER: { id: LayerType; color: string }[] = [
  { id: 'ndvi',     color: 'var(--neon-green)'  },
  { id: 'soilTemp', color: 'var(--neon-orange)' },
  { id: 'traffic',  color: 'var(--neon-cyan)'   },
];

const TXT: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: 1.5 };

export default function MethodologyModal({ onClose }: { onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !cardRef.current) return;
      const items = cardRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={cardRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="method-title">
        <div className="flex items-start justify-between gap-3" style={{ marginBottom: '12px' }}>
          <h2
            id="method-title"
            style={{ margin: 0, fontFamily: 'var(--font-pixel)', fontSize: '11px', lineHeight: 1.6, color: 'var(--neon-green)', textShadow: 'var(--glow-green)' }}
          >
            &gt; COMO_SE_CALCULA
          </h2>
          <button ref={closeRef} type="button" className="pill-btn" onClick={onClose} aria-label="Cerrar">
            <X size={16} aria-hidden />
          </button>
        </div>

        <p style={{ ...TXT, color: 'var(--text-primary)', marginBottom: '14px' }}>
          Los valores son compuestos (mediana) de imágenes satelitales para las estaciones y años elegidos.
          Son indicadores orientativos, no mediciones oficiales.
        </p>

        {ORDER.map(({ id, color }) => {
          const info = LAYER_INFO[id];
          return (
            <section key={id} style={{ borderLeft: `3px solid ${color}`, paddingLeft: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: '0 0 6px', ...TXT, fontSize: '14px', fontWeight: 700, color }}>
                {info.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {info.subtitle}</span>
              </h3>
              {id === 'traffic' && <p style={{ margin: '0 0 6px' }}><span className="sim-badge">{SIM_BADGE}</span></p>}
              <dl style={{ ...TXT, margin: 0, color: 'var(--text-primary)' }}>
                <dt style={{ color: 'var(--text-muted)' }}>Fuente</dt>
                <dd style={{ margin: '0 0 4px' }}>{info.source}</dd>
                <dt style={{ color: 'var(--text-muted)' }}>Resolución</dt>
                <dd style={{ margin: '0 0 4px' }}>{info.resolution}</dd>
                <dt style={{ color: 'var(--text-muted)' }}>Cómo se calcula</dt>
                <dd style={{ margin: '0 0 4px' }}>{info.how}</dd>
                <dt style={{ color: 'var(--text-muted)' }}>Limitaciones</dt>
                <dd style={{ margin: 0 }}>
                  <ul style={{ margin: 0, paddingLeft: '18px' }}>
                    {info.limits.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                </dd>
              </dl>
            </section>
          );
        })}

        <section style={{ borderLeft: '3px solid var(--sim-color)', paddingLeft: '12px' }}>
          <h3 style={{ margin: '0 0 6px', ...TXT, fontSize: '14px', fontWeight: 700, color: 'var(--sim-color)' }}>
            Zonas (AOI)
          </h3>
          <p style={{ ...TXT, margin: 0, color: 'var(--text-primary)' }}>
            Las zonas actuales son aproximaciones rectangulares de los territorios, no los límites administrativos
            oficiales. Las estadísticas por zona incluyen áreas fuera del municipio o departamento real.
          </p>
        </section>
      </div>
    </div>
  );
}
