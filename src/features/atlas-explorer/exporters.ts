/**
 * Atlas Explorer — exports of what is on screen.
 *
 * Exports contain only the locality-safe records already in view, with the
 * same generalisation fields the map shows, plus dataset attribution. They
 * never reach back to the store for precise coordinates.
 */

import type { ExplorerOccurrence, ProviderId } from './occurrenceProvider';

const COLUMNS: (keyof ExplorerOccurrence)[] = [
  'occurrenceID',
  'sourceRecordId',
  'taxonID',
  'scientificName',
  'genus',
  'decimalLatitude',
  'decimalLongitude',
  'coordinateUncertaintyInMeters',
  'generalised',
  'generalisationCellDeg',
  'generalisationReason',
  'countryCode',
  'year',
  'month',
  'basisOfRecord',
  'datasetName',
  'institutionCode',
  'license',
  'rightsHolder',
  'references',
  'iucnCategory',
  'assessment',
  'provider',
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Neutralise spreadsheet formula injection and quote anything structural.
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface ExportContext {
  provider: ProviderId;
  generatedAt: Date;
  bbox: string;
  filters: string;
}

export function toCsv(records: readonly ExplorerOccurrence[], ctx: ExportContext): string {
  const header = [
    `# Orchid Continuum Atlas export — ${ctx.generatedAt.toISOString()}`,
    `# Provider: ${ctx.provider}; view bbox: ${ctx.bbox}; filters: ${ctx.filters || 'none'}`,
    '# Coordinates are the public locality-safe projection. Generalised records show grid-cell centres, not collection sites.',
    '# Cite each originating dataset under its own licence (datasetName, license, rightsHolder).',
  ];
  const rows = records.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','));
  return [...header, COLUMNS.join(','), ...rows].join('\n') + '\n';
}

export function toGeoJson(records: readonly ExplorerOccurrence[], ctx: ExportContext): string {
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      metadata: {
        generator: 'Orchid Continuum Atlas Explorer',
        generatedAt: ctx.generatedAt.toISOString(),
        provider: ctx.provider,
        bbox: ctx.bbox,
        filters: ctx.filters,
        localityPolicy: 'oc-atlas-locality-policy-v1 (public)',
        statement:
          'Coordinates are the public locality-safe projection. Generalised records are grid-cell centres.',
      },
      features: records.map((r) => ({
        type: 'Feature',
        id: r.occurrenceID,
        geometry: { type: 'Point', coordinates: [r.decimalLongitude, r.decimalLatitude] },
        properties: Object.fromEntries(
          COLUMNS.filter((c) => c !== 'decimalLatitude' && c !== 'decimalLongitude').map((c) => [c, r[c]]),
        ),
      })),
    },
    null,
    2,
  );
}

export function exportFilename(kind: 'csv' | 'geojson' | 'png', at: Date): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `orchid-atlas-${stamp}.${kind}`;
}

export function downloadBlob(content: Blob | string, filename: string, type: string): void {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
