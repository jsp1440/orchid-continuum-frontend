import React from 'react';
import { Clock } from 'lucide-react';

interface Props {
  min: number;
  max: number;
  yearFrom: number;
  yearTo: number;
  onChange: (yearFrom: number, yearTo: number) => void;
}

const AtlasTemporalSlider: React.FC<Props> = ({
  min,
  max,
  yearFrom,
  yearTo,
  onChange,
}) => {
  const range = max - min || 1;
  const fromPct = ((yearFrom - min) / range) * 100;
  const toPct = ((yearTo - min) / range) * 100;

  const handleFrom = (v: number) => {
    const clamped = Math.min(v, yearTo);
    onChange(clamped, yearTo);
  };
  const handleTo = (v: number) => {
    const clamped = Math.max(v, yearFrom);
    onChange(yearFrom, clamped);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#142a1f] px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-emerald-300/80">
          <Clock className="h-3.5 w-3.5" /> Temporal range
        </div>
        <div className="text-xs text-white/70 font-mono">
          {yearFrom} – {yearTo}
        </div>
      </div>

      <div className="relative h-10">
        {/* Track */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/10" />
        {/* Selected range */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-emerald-300/70"
          style={{ left: `${fromPct}%`, right: `${100 - toPct}%` }}
        />
        {/* Range inputs (stacked) */}
        <input
          type="range"
          min={min}
          max={max}
          value={yearFrom}
          onChange={e => handleFrom(Number(e.target.value))}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none atlas-range"
          aria-label="Year from"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={yearTo}
          onChange={e => handleTo(Number(e.target.value))}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none atlas-range"
          aria-label="Year to"
        />
      </div>

      <div className="flex justify-between mt-1 text-[10px] tracking-[0.2em] uppercase text-white/40">
        <span>{min}</span>
        <span>{max}</span>
      </div>

      <style>{`
        .atlas-range::-webkit-slider-thumb {
          pointer-events: auto;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: #ecfccb;
          border: 2px solid #34d399;
          cursor: pointer;
          box-shadow: 0 0 0 2px rgba(0,0,0,0.35);
        }
        .atlas-range::-moz-range-thumb {
          pointer-events: auto;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: #ecfccb;
          border: 2px solid #34d399;
          cursor: pointer;
        }
        .atlas-range::-webkit-slider-runnable-track { background: transparent; }
        .atlas-range::-moz-range-track { background: transparent; }
      `}</style>
    </div>
  );
};

export default AtlasTemporalSlider;
