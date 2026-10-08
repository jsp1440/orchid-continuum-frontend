import { type FieldObservation } from "./fieldJournal";

export type FieldJournalExportMode = "metadata" | "private_backup";

/** A device-local working copy, never a public locality projection or media backup. */
export function fieldJournalMetadataExport(
  observations: readonly FieldObservation[],
  exportedAt: string,
  mode: FieldJournalExportMode = "metadata",
) {
  if (mode !== "metadata" && mode !== "private_backup") {
    throw new Error("Choose a valid Field Journal export mode.");
  }
  const includePrivateLocation = mode === "private_backup";
  return {
    schema: "field-journal-metadata-export/v1",
    exportedAt,
    mode,
    disclosure: "private_working_copy",
    includesMediaBytes: false,
    includesPrivateCaptureLocation: includePrivateLocation,
    notice: "Observer notes and filenames may contain sensitive information. This is not a public-safe export or a backup of original photos/videos.",
    observations: observations.map((observation) => ({
      id: observation.id,
      serverId: observation.serverId,
      createdAt: observation.createdAt,
      updatedAt: observation.updatedAt,
      observedAt: observation.observedAt,
      deviceCapturedAt: observation.deviceCapturedAt,
      note: observation.note,
      taxonLabel: observation.taxonLabel,
      identificationStatus: observation.identificationStatus,
      certainty: observation.certainty,
      localityVisibility: observation.localityVisibility,
      habitat: observation.habitat,
      substrate: observation.substrate,
      ecologicalNotes: observation.ecologicalNotes,
      associatedOrganisms: [...observation.associatedOrganisms],
      pollinatorObservations: observation.pollinatorObservations,
      mycorrhizalObservations: observation.mycorrhizalObservations,
      phenology: observation.phenology,
      syncStatus: observation.syncStatus,
      syncedAt: observation.syncedAt,
      ...(includePrivateLocation ? { privateLocation: observation.privateLocation ? { ...observation.privateLocation } : null } : {}),
      media: observation.media.map((media) => ({
        id: media.id,
        name: media.name,
        size: media.size,
        type: media.type,
        kind: media.kind,
        capturedAt: media.capturedAt,
        sha256: media.sha256,
        serverMediaId: media.serverMediaId,
        uploadedAt: media.uploadedAt,
      })),
    })),
  };
}
