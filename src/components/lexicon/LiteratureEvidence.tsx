import React from 'react';
import type { LiteratureRecord } from '@/data/types';
import { citationIdentifierParts } from '@/lib/calyxCitationSource';

/** Preserve the supplied source; never infer a publication's review status. */
function sourceHref(value: string | undefined): string | null {
  if (!value || Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href : null;
  } catch {
    return null;
  }
}

export const LiteratureEvidence: React.FC<{ records: LiteratureRecord[] }> = ({ records }) => (
  <ul className="space-y-3">
    {records.map((record) => {
      const doi = citationIdentifierParts({ title: record.title ?? '', doi: record.doi })[0];
      const source = sourceHref(record.url);
      return (
        <li key={record.id} className="rounded-sm border border-stone-200 p-4">
          <p className="font-medium text-stone-900">{record.title ?? 'Untitled literature record'}</p>
          {record.authors?.length || record.year || record.journal ? (
            <p className="mt-1 text-sm text-stone-600">
              {[record.authors?.join(', '), record.year, record.journal].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          {record.summary ? <p className="mt-2 text-sm leading-relaxed text-stone-600">{record.summary}</p> : null}
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {doi ? doi.url ? (
              <a href={doi.url} target="_blank" rel="noopener noreferrer" className="text-[#6B3FA0] underline underline-offset-2">{doi.label}</a>
            ) : <span>{doi.label} (link unavailable)</span> : null}
            {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="text-[#6B3FA0] underline underline-offset-2">Open source</a> : null}
            {!doi?.url && !source ? <span className="text-stone-500">Source link unavailable</span> : null}
          </div>
          <dl className="mt-3 space-y-1 text-xs text-stone-600">
            <div><dt className="inline font-semibold">Review state: </dt><dd className="inline">{record.provenance?.validation_status ?? 'Not supplied'}</dd></div>
            {record.evidence_type ? <div><dt className="inline font-semibold">Evidence type: </dt><dd className="inline">{record.evidence_type}</dd></div> : null}
            {record.provenance?.source ? <div><dt className="inline font-semibold">Source: </dt><dd className="inline">{record.provenance.source}</dd></div> : null}
            {record.provenance?.citation ? <div><dt className="inline font-semibold">Citation: </dt><dd className="inline">{record.provenance.citation}</dd></div> : null}
            {record.provenance?.license ? <div><dt className="inline font-semibold">License: </dt><dd className="inline">{record.provenance.license}</dd></div> : null}
          </dl>
        </li>
      );
    })}
  </ul>
);
