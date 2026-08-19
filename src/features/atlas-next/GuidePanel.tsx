import React from 'react';
import type { Investigation, InvestigationStep, StepId } from './investigation';

/**
 * ATLAS-NEXT — the guide surface.
 *
 * Deterministic and context-driven, not conversational. Every sentence it shows
 * was computed from the records in view by `investigation.ts`; this component
 * only lays them out. That ordering matters: when live Calyx is connected it
 * writes the prose from the same AtlasContext, and nothing here has to change.
 *
 * The shape is a question, what the map did, what can be observed, where that
 * came from, and what to ask next — never "step 3 of 5".
 */

interface Props {
  investigation: Investigation;
  step: InvestigationStep;
  onChoose: (to: StepId | 'exit' | 'research') => void;
  onClose: () => void;
}

const GuidePanel: React.FC<Props> = ({ investigation, step, onChoose, onClose }) => (
  <aside
    className="pointer-events-auto w-full overflow-hidden rounded-xl border border-[#b98ce0]/25 bg-black/80 backdrop-blur-xl"
    aria-label="Guided investigation"
  >
    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9a3ea]">
          Guided investigation
        </p>
        <p className="mt-1 truncate text-[12.5px] text-white/70">{investigation.subject}</p>
      </div>
      <button
        onClick={onClose}
        aria-label="Close the guide"
        className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b98ce0]"
      >
        ✕
      </button>
    </div>

    <div className="max-h-[46dvh] overflow-y-auto overscroll-contain px-4 py-4">
      <h3
        className="text-[17px] leading-[1.25] text-[#f0ede4]"
        style={{ fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif' }}
      >
        {step.question}
      </h3>

      {step.observation.map((line, i) => (
        <p key={i} className="mt-3 text-[13.5px] leading-[1.6] text-[#ddd8cc]">
          {line}
        </p>
      ))}

      {step.evidence.length > 0 && (
        <div className="mt-4 border-l border-[#b98ce0]/30 pl-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
            Where this comes from
          </p>
          {step.evidence.map((line, i) => (
            <p key={i} className="mt-1.5 text-[11.5px] leading-[1.55] text-white/50">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>

    <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
      {step.choices.map((c) => (
        <button
          key={c.to}
          onClick={() => onChoose(c.to)}
          className="min-h-[44px] rounded-full border border-[#b98ce0]/35 px-4 text-[12.5px] text-[#e8e6df] transition-colors hover:border-[#b98ce0]/70 hover:bg-[#b98ce0]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b98ce0]"
        >
          {c.label}
        </button>
      ))}
    </div>
  </aside>
);

export default GuidePanel;
