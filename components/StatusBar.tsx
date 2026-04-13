'use client';

interface StatusBarProps {
  lat: number;
  lng: number;
  zoom: number;
}

export default function StatusBar({ lat, lng, zoom }: StatusBarProps) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-50 flex items-center justify-between px-4"
      style={{
        height: '28px',
        background: 'rgba(3,8,4,0.96)',
        borderTop: '1px solid rgba(0,255,136,0.12)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: '14px',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
        }}
      >
        LAT: {lat.toFixed(4)} | LNG: {lng.toFixed(4)} | ZOOM: {zoom.toFixed(1)}
      </span>

      <span
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: '14px',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
        }}
      >
        DATA: 2024-08-10 · ASUNCION · PY
      </span>

      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: 'var(--neon-green)',
          letterSpacing: '0.04em',
        }}
      >
        ● LIVE
      </span>
    </div>
  );
}
