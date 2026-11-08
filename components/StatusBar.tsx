'use client';

interface StatusBarProps {
  lat: number;
  lng: number;
  zoom: number;
}

const TXT: React.CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: '16px',
  color: 'var(--text-muted)',
  letterSpacing: '0.04em',
};

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
      <span style={TXT}>
        LAT: {lat.toFixed(4)} | LNG: {lng.toFixed(4)} | ZOOM: {zoom.toFixed(1)}
      </span>

      <span className="statusbar-extra" style={TXT}>
        ASUNCION · PY
      </span>

      <span className="statusbar-extra" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--neon-green)', letterSpacing: '0.04em' }}>
        ● GEE
      </span>
    </div>
  );
}
