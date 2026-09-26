import { useEffect, useState } from "react";
import {
  fetchInteractionDiscovery,
  type DiscoveredInteraction,
  type InteractionCategory,
  type InteractionDiscoveryState,
} from "@/lib/interactionDiscovery";

/**
 * Candidate ecological interactions for one species, read from the Calyx
 * backend's `GET /api/interactions/discovery`.
 *
 * Every row is shown as the backend reports it: source taxon, raw interaction
 * type, target taxon (GloBI direction is not re-derived), with its provider,
 * dataset version, study citation and verification state. Nothing here is
 * presented as a verified relationship, and no locality is rendered -- the
 * client allow-lists record fields, and none of them is a place.
 */

type GroupKey = "pollinator" | "mycorrhizal" | "pollinator+mycorrhizal" | "other";

const GROUP_ORDER: GroupKey[] = ["pollinator", "mycorrhizal", "pollinator+mycorrhizal", "other"];

const GROUP_LABEL: Record<GroupKey, string> = {
  pollinator: "Pollinator candidates",
  mycorrhizal: "Mycorrhizal / fungal candidates",
  "pollinator+mycorrhizal": "Pollinator and mycorrhizal candidates",
  other: "Other interaction types",
};

function groupKeyOf(categories: InteractionCategory[]): GroupKey {
  const p = categories.includes("pollinator");
  const m = categories.includes("mycorrhizal");
  if (p && m) return "pollinator+mycorrhizal";
  if (p) return "pollinator";
  if (m) return "mycorrhizal";
  return "other";
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function recordKey(record: DiscoveredInteraction, index: number) {
  return [
    record.source_taxon_id ?? record.source_taxon_name,
    record.interaction_type,
    record.target_taxon_id ?? record.target_taxon_name,
    record.study_external_id ?? record.study_citation ?? "",
    index,
  ].join("|");
}

function ProvenanceRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  );
}

function InteractionRow({ record }: { record: DiscoveredInteraction }) {
  const studyUrl = safeHttpUrl(record.study_external_id);
  return (
    <li className="rounded-2xl bg-slate-50 p-4 text-sm" data-testid="interaction-discovery-record">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-semibold italic text-slate-900">{record.source_taxon_name}</span>
        <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs text-emerald-800">
          {record.interaction_type}
        </span>
        <span className="font-semibold italic text-slate-900">{record.target_taxon_name}</span>
      </div>
      <div className="mt-2">
        <span
          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900"
          data-testid="interaction-discovery-verification"
        >
          {record.verification_state} candidate
        </span>
      </div>
      <dl className="mt-3 space-y-1 text-xs">
        <ProvenanceRow label="Study" value={record.study_citation ?? "No study citation supplied by source"} />
        {record.study_source_citation ? (
          <ProvenanceRow label="Dataset citation" value={record.study_source_citation} />
        ) : null}
        {record.study_external_id ? (
          <ProvenanceRow
            label="Study reference"
            value={
              studyUrl ? (
                <a className="text-emerald-700 underline" href={studyUrl} target="_blank" rel="noopener noreferrer">
                  {record.study_external_id}
                </a>
              ) : (
                record.study_external_id
              )
            }
          />
        ) : null}
        <ProvenanceRow label="Provider" value={record.provider ?? "Provider not reported"} />
        <ProvenanceRow
          label="Dataset"
          value={[record.dataset_version, record.provider_stability].filter(Boolean).join(" · ") || "Not reported"}
        />
        {record.source_taxon_id || record.target_taxon_id ? (
          <ProvenanceRow
            label="Taxon ids"
            value={`${record.source_taxon_id ?? "—"} → ${record.target_taxon_id ?? "—"}`}
          />
        ) : null}
      </dl>
    </li>
  );
}

export function InteractionDiscoveryView({
  species,
  discovery,
}: {
  species: string;
  discovery: InteractionDiscoveryState | null;
}) {
  let body: React.ReactNode;
  if (!discovery) {
    body = <p className="text-slate-600">Looking up interaction candidates…</p>;
  } else if (discovery.state === "unavailable" || discovery.state === "malformed") {
    body = (
      <div
        role="status"
        data-testid={`interaction-discovery-${discovery.state}`}
        className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <div className="font-semibold">
          {discovery.state === "unavailable"
            ? "Interaction discovery is unavailable right now."
            : "Interaction discovery returned a response that could not be read."}
        </div>
        <div className="mt-1">{discovery.reason}</div>
        <div className="mt-1">This is not evidence that no interactions are known for {species}.</div>
      </div>
    );
  } else if (discovery.state === "empty") {
    body = (
      <div
        data-testid="interaction-discovery-empty"
        className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600"
      >
        The discovery index holds no candidate interactions matching {species}. Absence here reflects what has been
        ingested so far, not an ecological finding.
      </div>
    );
  } else {
    const { result } = discovery;
    const groups = new Map<GroupKey, DiscoveredInteraction[]>();
    for (const record of result.records) {
      const key = groupKeyOf(record.categories);
      groups.set(key, [...(groups.get(key) ?? []), record]);
    }
    body = (
      <div className="space-y-5" data-testid="interaction-discovery-ok">
        <p className="text-sm text-slate-600">
          Showing {result.records.length} of {result.total_matched} matched candidate
          {result.total_matched === 1 ? "" : "s"}.
          {result.truncated ? " More candidates exist than this panel requested." : ""}
          {result.unreadable_count > 0
            ? ` ${result.unreadable_count} record${result.unreadable_count === 1 ? "" : "s"} could not be read and ${
                result.unreadable_count === 1 ? "is" : "are"
              } not shown.`
            : ""}
        </p>
        {GROUP_ORDER.filter((key) => groups.has(key)).map((key) => (
          <section key={key} data-testid={`interaction-discovery-group-${key}`}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-800">
              {GROUP_LABEL[key]} ({groups.get(key)!.length})
            </h3>
            <ul className="space-y-3">
              {groups.get(key)!.map((record, index) => (
                <InteractionRow key={recordKey(record, index)} record={record} />
              ))}
            </ul>
          </section>
        ))}
        <p className="text-xs text-slate-500">
          Grouping uses the backend&apos;s keyword heuristic over the raw interaction type; the raw type is always
          shown. Either side of a record may be the orchid.
        </p>
      </div>
    );
  }

  const note = discovery && (discovery.state === "ok" || discovery.state === "empty") ? discovery.result.note : null;

  return (
    <section
      className="rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-sm"
      aria-label="Interaction discovery"
      data-testid="interaction-discovery-panel"
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">
        Review-bound candidates · GloBI
      </div>
      <h2 className="mb-2 text-2xl font-semibold text-slate-900">Interaction discovery</h2>
      <p className="mb-4 text-sm text-slate-600">
        Unverified candidate interactions from the Continuum&apos;s discovery index. None of these is a verified
        Knowledge Graph relationship.
      </p>
      {body}
      {note ? (
        <p className="mt-4 text-xs text-slate-500" data-testid="interaction-discovery-note">
          {note}
        </p>
      ) : null}
    </section>
  );
}

export default function InteractionDiscoveryPanel({ species }: { species: string }) {
  const [discovery, setDiscovery] = useState<InteractionDiscoveryState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDiscovery(null);
    fetchInteractionDiscovery(species, { signal: controller.signal })
      .then((state) => {
        if (!controller.signal.aborted) setDiscovery(state);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDiscovery({
            state: "unavailable",
            reason: "The interaction discovery service could not be reached.",
            httpStatus: null,
          });
        }
      });
    return () => controller.abort();
  }, [species]);

  return <InteractionDiscoveryView species={species} discovery={discovery} />;
}
