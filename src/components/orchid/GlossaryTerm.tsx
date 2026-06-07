import React, { useState } from 'react';

/**
 * GlossaryTerm
 * ------------
 * Inline scientific term with a soft underline + on-hover/focus tooltip
 * containing a plain-language definition. Lets technical pages stay
 * rigorous while remaining accessible to non-specialist readers.
 *
 * Design notes:
 *  - Subtle dotted underline in emerald avoids visual noise on dense pages.
 *  - Tooltip uses `aria-describedby` semantics for screen readers.
 *  - Designed to be wrapped around 1–3 word phrases inline in prose.
 */
export interface GlossaryTermProps {
  term: string;
  definition: React.ReactNode;
  /** Optional citation / "read more" link for institutional credibility. */
  reference?: { label: string; url: string };
  children?: React.ReactNode;
}

const GlossaryTerm: React.FC<GlossaryTermProps> = ({
  term,
  definition,
  reference,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const id = `glossary-${term.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        className="border-b border-dotted border-emerald-300/60 text-emerald-100 hover:text-emerald-200 transition-colors cursor-help"
        onClick={() => setOpen(o => !o)}
      >
        {children || term}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-72 max-w-[80vw] rounded-lg border border-emerald-300/30 bg-[#0a1812]/95 backdrop-blur-md shadow-2xl p-3 text-left"
        >
          <span className="block text-[10px] tracking-[0.2em] uppercase text-emerald-300/80 mb-1">
            {term}
          </span>
          <span className="block text-xs text-white/80 leading-relaxed font-normal">
            {definition}
          </span>
          {reference && (
            <a
              href={reference.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[10px] tracking-[0.15em] uppercase text-emerald-200/90 hover:text-emerald-100"
            >
              {reference.label} →
            </a>
          )}
        </span>
      )}
    </span>
  );
};

export default GlossaryTerm;
