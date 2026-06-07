import React, { useState } from 'react';
import { GraduationCap, X } from 'lucide-react';

/**
 * EducationalOverlay
 * ------------------
 * A composable "learning layer" that any module can opt into. When the
 * viewer toggles "Learning mode" on, contextual scientific commentary is
 * revealed alongside the data — turning every page into a teachable surface
 * for students, teachers, and curious explorers without altering the
 * researcher view.
 *
 * Usage:
 *   <EducationalOverlay
 *     title="What this map shows"
 *     body={<>The Atlas plots <em>documented sightings</em> against
 *           climate envelopes…</>}
 *   />
 */
export interface EducationalOverlayProps {
  title: string;
  body: React.ReactNode;
  /** When true, the panel starts open (e.g. on /education routes). */
  defaultOpen?: boolean;
  /** Compact variant for inline use inside cards. */
  compact?: boolean;
}

const EducationalOverlay: React.FC<EducationalOverlayProps> = ({
  title,
  body,
  defaultOpen = false,
  compact = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          'inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/5 hover:bg-emerald-300/10 transition-colors text-emerald-200 ' +
          (compact
            ? 'px-2.5 py-1 text-[10px] tracking-[0.18em]'
            : 'px-3 py-1.5 text-[11px] tracking-[0.2em]') +
          ' uppercase'
        }
      >
        <GraduationCap className="h-3.5 w-3.5" />
        Learning mode
      </button>
    );
  }

  return (
    <div className="relative rounded-xl border border-emerald-300/30 bg-emerald-300/[0.04] p-4 md:p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-emerald-300" />
          <span className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/90">
            Learning layer
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close learning layer"
          className="text-white/50 hover:text-emerald-200 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="font-serif text-lg md:text-xl text-white mb-2 leading-snug">
        {title}
      </div>
      <div className="text-sm text-white/75 leading-relaxed font-light">
        {body}
      </div>
    </div>
  );
};

export default EducationalOverlay;
