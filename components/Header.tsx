'use client';

import { useEffect, useState } from 'react';

const BADGES = [
  { label: 'SYS:NOMINAL', color: 'var(--neon-green)',   glow: 'var(--glow-green)'   },
  { label: 'GEE·S2/L8',   color: 'var(--neon-cyan)',    glow: 'var(--glow-cyan)'    },
  { label: 'GEE·READY',   color: 'var(--neon-purple)',  glow: 'var(--glow-purple)'  },
];

export default function Header() {
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setCursorOn((v) => !v), 530);
    return () => clearInterval(t);
  }, []);

  return (
    <header
      className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-5 scan-lines"
      style={{
        height: '48px',
        background: 'rgba(3,8,4,0.96)',
        borderBottom: '1px solid rgba(0,255,136,0.25)',
        boxShadow: '0 0 24px rgba(0,255,136,0.08)',
      }}
    >
      {/* ── Prompt ─────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--text-muted)',
          }}
        >
          &gt;
        </span>
        <span
          style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: '8px',
            color: 'var(--neon-green)',
            textShadow: 'var(--glow-green)',
            letterSpacing: '0.04em',
          }}
        >
          ASUNGREEN_v0.1
        </span>
        <span
          style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: '9px',
            color: 'var(--neon-green)',
            textShadow: 'var(--glow-green)',
            opacity: cursorOn ? 1 : 0,
            transition: 'opacity 0.05s',
          }}
        >
          █
        </span>
      </div>

      {/* ── Status badges ──────────────────────────── */}
      <div className="hidden md:flex items-center gap-2.5">
        {BADGES.map(({ label, color, glow }) => (
          <span
            key={label}
            style={{
              fontFamily: 'var(--font-pixel)',
              fontSize: '6px',
              color,
              padding: '4px 8px',
              border: `1px solid ${color}`,
              borderRadius: '1px',
              background: `${color}0f`,
              boxShadow: `0 0 6px ${color}55`,
              letterSpacing: '0.04em',
              textShadow: glow,
            }}
          >
            [{label}]
          </span>
        ))}
      </div>

      {/* ── Coordinates ────────────────────────────── */}
      <div
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: '15px',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
        }}
      >
        LAT:-25.2867 · LNG:-57.5759 · ASU·PY
      </div>
    </header>
  );
}
