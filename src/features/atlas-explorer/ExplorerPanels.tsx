import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ExternalLink, Info, Lock, MapPin } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  LAYER_CATALOG,
  MODULE_CAPABILITIES,
  isDrawable,
  moduleLinksFor,
  type CatalogLayer,
  type DrawableLayerId,
  type ModuleCapability,
} from './contracts';
import { PALETTE, type ColorMode } from './palette';
import { attributionOf, type ExplorerFilters, type ExplorerOccurrence } from './occurrenceProvider';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_COPY: Record<string, string> = {
  planned: 'Planned',
  blocked: 'Blocked',
};

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{children}</h3>;
}

export function LayerPanel({
  active,
  onToggle,
}: {
  active: ReadonlySet<DrawableLayerId>;
  onToggle(id: DrawableLayerId, on: boolean): void;
}) {
  const drawable = LAYER_CATALOG.layers.filter(isDrawable);
  const unavailable = LAYER_CATALOG.layers.filter((l) => !isDrawable(l));
  return (
    <div className="space-y-5">
      <section aria-labelledby="atlas-layers-operational">
        <SectionTitle>
          <span id="atlas-layers-operational">Available layers</span>
        </SectionTitle>
        <ul className="space-y-1.5">
          {drawable.map((layer) => (
            <li key={layer.layer_id} className="rounded-lg border border-slate-200 bg-white p-2.5">
              <div className="flex items-start justify-between gap-3">
                <label htmlFor={`layer-${layer.layer_id}`} className="min-w-0 cursor-pointer">
                  <span className="block text-sm font-medium text-slate-900">{layer.title}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-slate-600">{layer.derivation}</span>
                </label>
                <Switch
                  id={`layer-${layer.layer_id}`}
                  checked={active.has(layer.layer_id)}
                  onCheckedChange={(on) => onToggle(layer.layer_id, on)}
                  aria-describedby={`layer-${layer.layer_id}-caveat`}
                />
              </div>
              {layer.caveats?.length ? (
                <p id={`layer-${layer.layer_id}-caveat`} className="mt-1.5 flex gap-1.5 text-[11px] leading-snug text-amber-800">
                  <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
                  {layer.caveats[0]}
                </p>
              ) : null}
              {layer.status === 'operational_external' && layer.license ? (
                <p className="mt-1 text-[11px] text-slate-500">External open service · {layer.source}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="atlas-layers-unavailable">
        <SectionTitle>
          <span id="atlas-layers-unavailable">Not yet available</span>
        </SectionTitle>
        <p className="mb-2 text-xs text-slate-600">
          These layers are scientifically supported but are not drawn until their data is acquired, licensed and approved.
          Nothing is approximated in their place.
        </p>
        <ul className="space-y-1">
          {unavailable.map((layer: CatalogLayer) => (
            <li key={layer.layer_id} className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-700">{layer.title}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    layer.status === 'blocked' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {layer.status === 'blocked' ? <Lock className="h-2.5 w-2.5" aria-hidden /> : null}
                  {STATUS_COPY[layer.status] ?? layer.status}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-600">{layer.blocker}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function TimePanel({
  filters,
  onChange,
  records,
  recordsAvailable,
}: {
  filters: ExplorerFilters;
  onChange(next: Partial<ExplorerFilters>): void;
  records: readonly ExplorerOccurrence[];
  recordsAvailable: boolean;
}) {
  const byDecade = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of records) if (r.year !== null) counts.set(Math.floor(r.year / 10) * 10, (counts.get(Math.floor(r.year / 10) * 10) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([decade, count]) => ({ decade: `${decade}s`, count }));
  }, [records]);
  const undated = records.filter((r) => r.year === null).length;
  const byMonth = useMemo(
    () => MONTHS.map((m, i) => ({ month: m, count: records.filter((r) => r.month === i + 1).length })),
    [records],
  );
  const monthsKnown = byMonth.some((m) => m.count > 0);
  const presets: { label: string; from: number | null; to: number | null }[] = [
    { label: 'All years', from: null, to: null },
    { label: 'Before 1950', from: null, to: 1949 },
    { label: '1950–1999', from: 1950, to: 1999 },
    { label: '2000 onward', from: 2000, to: null },
  ];
  const yearInput = (key: 'yearFrom' | 'yearTo', label: string) => (
    <label className="flex-1 text-xs text-slate-600">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={1600}
        max={2100}
        value={filters[key] ?? ''}
        placeholder="any"
        onChange={(e) => {
          const v = e.target.value.trim();
          const n = Number(v);
          onChange({ [key]: v === '' || !Number.isFinite(n) ? null : Math.round(n) } as Partial<ExplorerFilters>);
        }}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
      />
    </label>
  );

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Record date</SectionTitle>
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Date presets">
          {presets.map((p) => {
            const on = filters.yearFrom === p.from && filters.yearTo === p.to;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ yearFrom: p.from, yearTo: p.to })}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-teal-600'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          {yearInput('yearFrom', 'From year')}
          {yearInput('yearTo', 'To year')}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-600">
          A date filter excludes undated records. Historical presence does not establish that a population persists today.
        </p>
      </section>

      <section>
        <SectionTitle>Records by decade (in view)</SectionTitle>
        {!recordsAvailable ? (
          <p className="text-xs text-slate-600">Zoom in to load individual records for the timeline.</p>
        ) : byDecade.length ? (
          <div className="h-32" aria-label="Bar chart of records per decade in the current view">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDecade} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <XAxis dataKey="decade" tick={{ fontSize: 10, fill: '#475569' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#475569' }} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(15,118,110,0.08)' }} />
                <Bar dataKey="count" name="Records" fill="#0f766e" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-slate-600">No dated records in view.</p>
        )}
        {recordsAvailable && undated ? <p className="mt-1 text-[11px] text-slate-500">{undated.toLocaleString()} undated records not shown in the chart.</p> : null}
      </section>

      <section>
        <SectionTitle>Record seasonality</SectionTitle>
        <div className="grid grid-cols-6 gap-1" role="group" aria-label="Filter by month of record">
          {MONTHS.map((m, i) => {
            const month = i + 1;
            const on = filters.months.includes(month);
            const count = byMonth[i].count;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange({ months: on ? filters.months.filter((x) => x !== month) : [...filters.months, month].sort((a, b) => a - b) })
                }
                className={`rounded-md border px-1 py-1 text-[11px] ${
                  on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-teal-600'
                }`}
                title={monthsKnown ? `${count} records in view` : undefined}
              >
                {m}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-600">
          Month of collection or observation. It is not flowering phenology unless a source states the plant was in flower.
          {!monthsKnown && recordsAvailable ? ' The current source does not state record months, so a month filter will match nothing.' : ''}
        </p>
      </section>
    </div>
  );
}

const REASON_COPY: Record<string, string> = {
  'iucn-threatened': 'Generalised: threatened taxon',
  'conservation-status': 'Generalised: threatened taxon',
  'coordinate-uncertainty': 'Shown as an area: stated uncertainty',
  'unresolved-assessment': 'Generalised: assessment unresolved',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1 text-xs">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-900">{value}</dd>
    </div>
  );
}

export function RecordCard({ record, onClose }: { record: ExplorerOccurrence; onClose(): void }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3" aria-labelledby="atlas-record-title">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Occurrence record</p>
          <h3 id="atlas-record-title" className="text-base font-semibold italic text-slate-900">
            {record.scientificName}
          </h3>
        </div>
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
          Close
        </button>
      </div>
      {record.generalised ? (
        <p className="mt-2 flex gap-1.5 rounded-md bg-amber-50 p-2 text-xs leading-snug text-amber-900">
          <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">{REASON_COPY[record.generalisationReason] ?? 'Generalised'}.</strong>{' '}
            {record.generalisationNotice}
          </span>
        </p>
      ) : null}
      <dl className="mt-2 divide-y divide-slate-100">
        <Field label="Position shown" value={`${record.decimalLatitude.toFixed(record.generalised ? 2 : 4)}, ${record.decimalLongitude.toFixed(record.generalised ? 2 : 4)}`} />
        <Field label="Uncertainty" value={record.coordinateUncertaintyInMeters !== null ? `${Math.round(record.coordinateUncertaintyInMeters).toLocaleString()} m (stated)` : 'Not stated by source'} />
        <Field label="Country" value={record.countryCode} />
        <Field label="Date" value={record.year ? `${record.year}${record.month ? `-${String(record.month).padStart(2, '0')}` : ''}` : 'Undated'} />
        <Field label="Locality" value={record.locality ?? (record.generalised ? 'Withheld' : null)} />
        <Field label="Basis of record" value={record.basisOfRecord} />
        <Field label="Assessment" value={record.assessment === 'unresolved' ? 'Unresolved (not a safety claim)' : record.iucnCategory ? `IUCN ${record.iucnCategory}` : record.assessment.replace('-', ' ')} />
        <Field label="Dataset" value={record.datasetName ?? 'Unattributed source'} />
        <Field label="Institution" value={record.institutionCode} />
        <Field label="Licence" value={record.license ?? 'Not stated'} />
        <Field label="Rights holder" value={record.rightsHolder} />
        <Field label="Source record" value={record.sourceRecordId ?? (record.generalised ? 'Withheld' : null)} />
        <Field label="Taxon ID" value={record.taxonID ?? 'Not reconciled'} />
        <Field label="Served by" value={record.provider === 'calyx-viewport' ? 'Calyx Atlas service' : 'Canonical occurrence store'} />
      </dl>
    </article>
  );
}

function availabilityBadge(cap: { declaredStatus: string; availability?: ModuleCapability['availability'] }) {
  const live = cap.availability;
  if (live?.probed) {
    const ok = live.state === 'available' || live.state === 'configured';
    return (
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
        {ok ? 'Live' : live.state.replace(/_/g, ' ')}
      </span>
    );
  }
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{cap.declaredStatus.replace(/_/g, ' ').toLowerCase()}</span>;
}

export function SubjectPanel({
  filters,
  records,
  recordsAvailable,
  capabilities,
  capabilitiesLive,
}: {
  filters: ExplorerFilters;
  records: readonly ExplorerOccurrence[];
  recordsAvailable: boolean;
  capabilities: ModuleCapability[];
  capabilitiesLive: boolean;
}) {
  const subjectGenus = filters.genus ?? (filters.scientificName ? filters.scientificName.split(' ')[0] : null);
  const links = moduleLinksFor({ genus: subjectGenus, scientificName: filters.scientificName }, capabilities);
  const topTaxa = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of records) counts.set(r.scientificName, (counts.get(r.scientificName) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [records]);
  const attribution = useMemo(() => attributionOf(records).slice(0, 6), [records]);
  const generalised = records.filter((r) => r.generalised).length;
  const workflows = MODULE_CAPABILITIES.workflows;

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>{filters.scientificName ? 'Selected taxon' : subjectGenus ? 'Selected genus' : 'Current view'}</SectionTitle>
        <p className="text-lg font-semibold italic text-slate-900">{filters.scientificName ?? subjectGenus ?? 'All orchid records'}</p>
        {filters.taxonId ? <p className="text-[11px] text-slate-500">Canonical taxon ID {filters.taxonId}</p> : null}
        {recordsAvailable ? (
          <p className="mt-1 text-xs text-slate-600">
            {records.length.toLocaleString()} records in view
            {generalised ? ` · ${generalised.toLocaleString()} generalised for locality protection` : ''}
          </p>
        ) : null}
      </section>

      {recordsAvailable && topTaxa.length > 1 ? (
        <section>
          <SectionTitle>Most-recorded taxa in view</SectionTitle>
          <ol className="space-y-1">
            {topTaxa.map(([name, count]) => (
              <li key={name} className="flex items-center justify-between text-xs">
                <span className="italic text-slate-800">{name}</span>
                <span className="tabular-nums text-slate-500">{count.toLocaleString()}</span>
              </li>
            ))}
          </ol>
          <p className="mt-1.5 text-[11px] text-slate-500">Counts reflect documentation effort, not abundance.</p>
        </section>
      ) : null}

      <section>
        <SectionTitle>Continue in the Continuum</SectionTitle>
        {links.length ? (
          <ul className="space-y-1">
            {links.map((link) => (
              <li key={link.capabilityId}>
                <Link
                  to={link.href}
                  className="group flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 hover:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <span className="flex items-center gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5 text-teal-700" aria-hidden />
                    {link.title}
                  </span>
                  {availabilityBadge(link)}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-600">Search for a genus or species to open its linked records.</p>
        )}
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          Links carry only the canonical name as navigation context, never coordinates or record identifiers.{' '}
          {capabilitiesLive ? 'Availability reported by the Calyx capability registry.' : 'Availability is as declared in the bundled contract; it has not been live-checked.'}
        </p>
      </section>

      {subjectGenus ? (
        <section>
          <SectionTitle>Guided workflows</SectionTitle>
          <ul className="space-y-2">
            {workflows.map((wf) => (
              <li key={wf.workflow_id} className="rounded-md bg-slate-50 p-2">
                <p className="text-xs font-medium text-slate-800">{wf.title}</p>
                <ol className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
                  {wf.steps.map((step, i) => {
                    const cap = capabilities.find((c) => c.capability_id === step);
                    const link = links.find((l) => l.capabilityId === step);
                    return (
                      <li key={step} className="flex items-center gap-1">
                        {i > 0 ? <span aria-hidden>→</span> : null}
                        {link ? (
                          <Link to={link.href} className="text-teal-800 underline-offset-2 hover:underline">
                            {cap?.title ?? step}
                          </Link>
                        ) : (
                          <span>{cap?.title ?? step}</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {recordsAvailable && attribution.length ? (
        <section>
          <SectionTitle>Sources in view</SectionTitle>
          <ul className="space-y-1 text-xs">
            {attribution.map((a) => (
              <li key={a.dataset} className="flex justify-between gap-2">
                <span className="text-slate-800">{a.dataset}</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {a.count.toLocaleString()} · {a.licenses.length ? a.licenses.join(', ') : 'licence not stated'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function Legend({ colorMode, mode, activeLayers }: { colorMode: ColorMode; mode: 'points' | 'clusters'; activeLayers: ReadonlySet<DrawableLayerId> }) {
  const swatch = (color: string, label: string, ring = false) => (
    <li key={label} className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={ring ? { border: `2px solid ${color}`, background: `${color}66` } : { background: color }}
        aria-hidden
      />
      {label}
    </li>
  );
  let items: React.ReactNode[] = [];
  if (mode === 'clusters') {
    items = [swatch(PALETTE.cluster, 'Cluster of records (count shown); click to zoom')];
  } else if (colorMode === 'record-age') {
    items = [
      swatch(PALETTE.age['pre-1950'], 'Before 1950'),
      swatch(PALETTE.age['1950-1999'], '1950–1999'),
      swatch(PALETTE.age['2000-plus'], '2000 onward'),
      swatch(PALETTE.age.undated, 'Undated'),
    ];
  } else if (colorMode === 'conservation-assessment') {
    items = [
      swatch(PALETTE.assessment.threatened, 'Assessed threatened'),
      swatch(PALETTE.assessment['not-threatened'], 'Assessed not threatened'),
      swatch(PALETTE.assessment.unresolved, 'Assessment unresolved'),
    ];
  } else {
    items = [swatch(PALETTE.point, 'Record at stated position'), swatch(PALETTE.generalised, 'Generalised to grid-cell centre', true)];
  }
  return (
    <div className="pointer-events-auto rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[11px] text-slate-700 shadow-sm backdrop-blur">
      <p className="mb-1 font-semibold text-slate-900">Legend</p>
      <ul className="space-y-0.5">{items}</ul>
      {activeLayers.has('observed-richness') ? <p className="mt-1 text-slate-600">Grid: distinct taxa per cell (observed, lower bound)</p> : null}
      {!activeLayers.has('observed-richness') && activeLayers.has('sampling-gaps') ? <p className="mt-1 text-slate-600">Grid: records per cell; blank cells are unsampled</p> : null}
      {activeLayers.has('occurrence-density') ? <p className="mt-1 text-slate-600">Heat: record density (effort-biased)</p> : null}
    </div>
  );
}

export function SourceNotice({ kind, children }: { kind: 'info' | 'warning'; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={`pointer-events-auto flex max-w-md gap-2 rounded-lg border px-3 py-2 text-xs leading-snug shadow-sm ${
        kind === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-slate-200 bg-white/95 text-slate-700'
      }`}
    >
      {kind === 'warning' ? <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> : <MapPin className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />}
      <div>{children}</div>
    </div>
  );
}

export function RecordList({
  records,
  selectedId,
  onSelect,
  limit = 40,
}: {
  records: readonly ExplorerOccurrence[];
  selectedId: string | null;
  onSelect(id: string): void;
  limit?: number;
}) {
  if (!records.length) return null;
  const shown = records.slice(0, limit);
  return (
    <section aria-labelledby="atlas-records-in-view">
      <SectionTitle>
        <span id="atlas-records-in-view">Records in view</span>
      </SectionTitle>
      <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-slate-200 bg-white p-1" data-testid="atlas-record-list">
        {shown.map((r) => (
          <li key={r.occurrenceID}>
            <button
              type="button"
              aria-pressed={selectedId === r.occurrenceID}
              onClick={() => onSelect(r.occurrenceID)}
              className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600 ${
                selectedId === r.occurrenceID ? 'bg-teal-50' : ''
              }`}
            >
              <span className="min-w-0 truncate italic text-slate-800">{r.scientificName}</span>
              <span className="flex shrink-0 items-center gap-1 text-slate-500">
                {r.generalised ? <Lock className="h-3 w-3" aria-label="generalised" /> : null}
                {r.year ?? 'undated'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {records.length > shown.length ? (
        <p className="mt-1 text-[11px] text-slate-500">
          Showing {shown.length} of {records.length.toLocaleString()}. Zoom in or filter to narrow the list.
        </p>
      ) : null}
    </section>
  );
}
