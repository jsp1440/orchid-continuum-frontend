import React from 'react';
import { Link } from 'react-router-dom';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import { canonicalSlug } from '@/lib/orchidContinuum';
import { coverage, displayName, resolveOccurrenceEvidence, type FieldEvidence } from './evidence';
import { resolveLocation } from './sensitivity';
import { EVIDENCE, type AtlasAccessLevel, type EvidenceState } from './types';

/**
 * ATLAS-NEXT — the selected record.
 *
 * The prototype's species card showed a location, an elevation, a date and a
 * collector, and simply omitted any field the record lacked — so a record
 * holding four facts and a record holding twelve looked equally complete, and
 * for the eighty invented "hotspot" points it showed a country and nothing
 * else under a species name that was never a species.
 *
 * Here every field is listed whether or not it is populated, each one carries
 * the state of the evidence behind it, and the card states its own coverage.
 * A gap is shown as a gap because a gap is a research question.
 */

interface Props {
  point: AtlasOccurrencePoint;
  access: AtlasAccessLevel;
  onClose: () => void;
}

const Chip: React.FC<{ state: EvidenceState; compact?: boolean }> = ({ state, compact }) => {
  const d = EVIDENCE[state];
  return (
    <span
      title={d.meaning}
      className={`inline-flex shrink-0 items-center rounded-[3px] font-mono uppercase tracking-[0.1em] ${
        compact ? 'px-1.5 py-[1px] text-[9px]' : 'px-2 py-[3px] text-[10px]'
      }`}
      style={{ color: d.tone, background: `${d.tone}1f`, border: `1px solid ${d.tone}55` }}
    >
      {d.label}
    </span>
  );
};

const Field: React.FC<{
  label: string;
  evidence: FieldEvidence<unknown>;
  suffix?: string;
  suppressed?: string;
}> = ({ label, evidence, suffix, suppressed }) => {
  const silent = evidence.state === 'unknown' || evidence.state === 'unavailable';
  return (
    <div className="border-t border-white/[0.06] py-2.5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">{label}</dt>
        <Chip state={suppressed ? 'unavailable' : evidence.state} compact />
      </div>
      <dd className={`mt-1 text-[13.5px] leading-[1.5] ${silent || suppressed ? 'text-white/40' : 'text-white/90'}`}>
        {suppressed
          ? suppressed
          : silent
            ? 'Not recorded for this occurrence.'
            : `${String(evidence.value)}${suffix ?? ''}`}
      </dd>
      {!suppressed && evidence.attribution && (
        <p className="mt-1 text-[11px] leading-[1.5] text-white/45">{evidence.attribution}</p>
      )}
    </div>
  );
};

const OccurrenceCard: React.FC<Props> = ({ point, access, onClose }) => {
  const ev = resolveOccurrenceEvidence(point);
  const cov = coverage(ev);
  const loc = resolveLocation(point, access);
  const name = displayName(point);
  const slug = point.canonicalName ? canonicalSlug(point.canonicalName) : null;

  return (
    <aside
      className="pointer-events-auto flex h-full w-full flex-col overflow-hidden border-l border-white/10 bg-[#080d10]/95 backdrop-blur-xl"
      aria-label={`Occurrence record for ${name}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#7fc49a]">
            One occurrence record
          </p>
          <h2
            className="mt-1.5 truncate text-[22px] italic leading-tight text-[#f0ede4]"
            style={{ fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif' }}
          >
            {name}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close record"
          className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7fc49a]"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
        {/* Media. Shown only when the record carries an approved image; there is
            no placeholder photograph, because a photograph of another plant is
            a claim about this one. */}
        {ev.media.state === 'observed' ? (
          <figure className="-mx-5 mb-4 border-b border-white/[0.07]">
            <img
              src={String(ev.media.value)}
              alt={`${name} — image supplied with the source record`}
              className="h-44 w-full object-cover"
              loading="lazy"
            />
            <figcaption className="px-5 pt-2 text-[11px] leading-[1.5] text-white/45">
              Image supplied with the source record. Licence and photographer are not carried on the
              occurrence row; open the species page for full attribution before reuse.
            </figcaption>
          </figure>
        ) : (
          <p className="mb-4 mt-4 rounded border border-dashed border-white/12 px-3 py-2.5 text-[12px] leading-[1.5] text-white/40">
            No approved image is linked to this occurrence.
          </p>
        )}

        {loc.policy.notice && (
          <div
            className="mb-4 rounded border px-3 py-2.5"
            style={{ borderColor: '#d8b24c55', background: '#d8b24c14' }}
          >
            <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#d8b24c]">
              Location protected
            </p>
            <p className="mt-1 text-[12.5px] leading-[1.55] text-white/75">{loc.policy.notice}</p>
          </div>
        )}

        <dl>
          <Field label="Country" evidence={ev.country} />
          <Field label="Region" evidence={ev.region} />
          <Field
            label="Locality"
            evidence={ev.locality}
            suppressed={
              !loc.policy.localityTextAllowed && ev.locality.state === 'observed'
                ? 'Withheld — the precise site of a threatened species is not published.'
                : undefined
            }
          />
          <Field label="Year recorded" evidence={ev.year} />
          <Field label="Elevation" evidence={ev.elevation} suffix=" m" />
          <Field label="Habitat" evidence={ev.habitat} />
          <Field label="Biome" evidence={ev.biome} />
          <Field label="Conservation assessment" evidence={ev.conservation} />
          <Field label="Pollinator evidence" evidence={ev.pollinator} />
          <Field label="Mycorrhizal evidence" evidence={ev.mycorrhizal} />
          <Field label="Record verification" evidence={ev.recordVerification} />
          <Field label="Provenance" evidence={ev.provenance} />
        </dl>

        <div className="mt-5 rounded border border-white/[0.09] bg-white/[0.02] px-3 py-3">
          <p className="text-[12px] leading-[1.6] text-white/60">
            <span className="text-white/85">
              {cov.recorded} of {cov.total}
            </span>{' '}
            fields are populated for this occurrence. The remaining{' '}
            {cov.total - cov.recorded} are not recorded — that is a gap in what has been
            collected, not a finding about the orchid.
          </p>
        </div>

        {slug && (
          <Link
            to={`/species/${slug}`}
            className="mt-5 inline-flex min-h-[48px] items-center rounded-full border border-[#7fc49a]/35 px-5 text-[13px] text-[#e8e6df] transition-colors hover:border-[#7fc49a]/70 hover:bg-[#7fc49a]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7fc49a]"
          >
            Open the species record →
          </Link>
        )}
      </div>
    </aside>
  );
};

export default OccurrenceCard;
