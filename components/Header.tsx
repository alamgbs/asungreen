'use client';

import { Leaf, Satellite, Globe2 } from 'lucide-react';

export default function Header() {
  return (
    <header
      className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 glass"
      style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg pulse-glow"
          style={{
            background: 'linear-gradient(135deg, #10b981, #14b8a6)',
            boxShadow: '0 0 12px rgba(16,185,129,0.5)',
          }}
        >
          <Leaf size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-[#f0fdf4] leading-none">
            Asun<span style={{ color: '#10b981' }}>Green</span>
          </h1>
          <p className="text-[10px] text-[#6b7280] leading-none mt-0.5 tracking-widest uppercase">
            Análisis Ambiental · Paraguay
          </p>
        </div>
      </div>

      {/* Center badges */}
      <div className="hidden md:flex items-center gap-4">
        <StatusBadge icon={<Globe2 size={12} />} label="Dpto. Central" />
        <StatusBadge icon={<Satellite size={12} />} label="NASA MODIS · GEE" />
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: '#10b981', boxShadow: '0 0 6px #10b981' }}
          />
          <span className="text-xs text-[#a7f3d0]">En vivo</span>
        </div>
      </div>

      {/* Right info */}
      <div className="flex items-center gap-3 text-xs text-[#6b7280]">
        <span>−25.2867°S</span>
        <span className="text-[#10b981]">·</span>
        <span>−57.5759°O</span>
      </div>
    </header>
  );
}

function StatusBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
      style={{
        background: 'rgba(16,185,129,0.08)',
        border: '1px solid rgba(16,185,129,0.2)',
        color: '#a7f3d0',
      }}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}
