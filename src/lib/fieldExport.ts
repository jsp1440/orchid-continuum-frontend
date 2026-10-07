/**
 * Lance Field Kit v0.1 — export pathway.
 *
 * The governed backend upload path does not exist yet, so the safe
 * synchronization route is an explicit export: one self-contained JSON bundle
 * per observation, carrying the full draft record plus every original media
 * file embedded as base64. The bundle is what Lance (or Jeff) hands to the
 * backend later; importing it restores the observation without re-typing.
 *
 * Scientific integrity rules enforced here:
 *  - coordinates appear in the export exactly as stored — the locality
 *    protection coarsening for public records already happened at creation
 *  - media are embedded unmodified (original bytes, original filename)
 *  - a tentative taxonLabel is exported as `tentativeTaxon`, never as an
 *    accepted identification
 */

import type { FieldDraft, FieldMediaDescriptor } from "@/lib/fieldDrafts";
import type { StoredFieldMedia } from "@/lib/fieldMediaStore";

export const FIELD_EXPORT_FORMAT = "orchid-continuum.field-observation";
export const FIELD_EXPORT_VERSION = 1;

export type ExportedMedia = {
  id: string;
  name: string;
  type: string;
  size: number;
  capturedAt: string | null;
  /** Original file bytes, base64-encoded. Never re-encoded. */
  dataBase64: string;
};

export type FieldObservationBundle = {
  format: typeof FIELD_EXPORT_FORMAT;
  formatVersion: typeof FIELD_EXPORT_VERSION;
  exportedAt: string;
  observation: {
    id: string;
    createdAt: string;
    updatedAt: string;
    note: string;
    tentativeTaxon: string | null;
    identificationStatus: "unidentified" | "tentative";
    localityVisibility: FieldDraft["localityVisibility"];
    coordinates: FieldDraft["coordinates"];
    ecology: FieldDraft["ecology"];
    relationships: FieldDraft["relationships"];
    observerName: string | null;
    provenance: string | null;
    syncStatus: FieldDraft["syncStatus"];
  };
  media: ExportedMedia[];
};

const BASE64_CHUNK = 0x8000;

export function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
    }
    return btoa(binary);
  });
}

export function base64ToBlob(dataBase64: string, type: string): Blob {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type });
}

export async function buildObservationBundle(
  draft: FieldDraft,
  mediaRecords: readonly StoredFieldMedia[],
  exportedAt: string,
): Promise<FieldObservationBundle> {
  const byId = new Map(mediaRecords.map((record) => [record.id, record]));
  const missing = draft.media.filter((descriptor) => !byId.has(descriptor.id));
  if (missing.length > 0) {
    throw new Error(
      `Cannot export: ${missing.length} media file(s) are missing from offline storage.`,
    );
  }

  return Promise.all(
    draft.media.map(async (descriptor: FieldMediaDescriptor) => {
      const record = byId.get(descriptor.id)!;
      return {
        id: descriptor.id,
        name: descriptor.name,
        type: descriptor.type,
        size: descriptor.size,
        capturedAt: descriptor.capturedAt,
        dataBase64: await blobToBase64(record.blob),
      } satisfies ExportedMedia;
    }),
  ).then((media) => ({
    format: FIELD_EXPORT_FORMAT,
    formatVersion: FIELD_EXPORT_VERSION,
    exportedAt,
    observation: {
      id: draft.id,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      note: draft.note,
      tentativeTaxon: draft.taxonLabel,
      identificationStatus: draft.taxonLabel ? "tentative" : "unidentified",
      localityVisibility: draft.localityVisibility,
      coordinates: draft.coordinates,
      ecology: draft.ecology,
      relationships: draft.relationships,
      observerName: draft.observerName,
      provenance: draft.provenance,
      syncStatus: draft.syncStatus,
    },
    media,
  }));
}

export function serializeObservationBundle(bundle: FieldObservationBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function observationExportFilename(draft: FieldDraft): string {
  const date = draft.createdAt.slice(0, 10).replace(/[^0-9-]/g, "") || "undated";
  return `field-observation-${date}-${draft.id.slice(0, 8)}.json`;
}

/** A media-free manifest across drafts — the lightweight index Jeff can
 *  review before moving full bundles. */
export function buildDraftsManifest(drafts: readonly FieldDraft[], exportedAt: string) {
  return {
    format: "orchid-continuum.field-observation-index",
    formatVersion: FIELD_EXPORT_VERSION,
    exportedAt,
    count: drafts.length,
    observations: drafts.map((draft) => ({
      id: draft.id,
      createdAt: draft.createdAt,
      identificationStatus: draft.taxonLabel ? "tentative" : "unidentified",
      tentativeTaxon: draft.taxonLabel,
      localityVisibility: draft.localityVisibility,
      hasCoordinates: draft.coordinates !== null,
      mediaCount: draft.media.length,
      syncStatus: draft.syncStatus,
    })),
  };
}
