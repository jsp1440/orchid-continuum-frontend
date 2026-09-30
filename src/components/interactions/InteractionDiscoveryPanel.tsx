import { useEffect, useState } from "react";
import {
  fetchInteractionDiscovery,
  studyReferenceUrl,
  restrictToExactSpecies,
  type DiscoveredInteraction,
  type InteractionCategory,
  type InteractionCategoryFilter,
  type InteractionDiscoveryResult,
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
 *
 * When the backend reports that no durable interaction index is configured
 * (`index_state: "memory_unprovisioned"`), an empty result is shown as that --
 * never as the plain empty state -- with the backend's `index_note` verbatim.
 * An index state this page does not recognise is shown as unknown, never as
 * durable. An older backend that omits the field keeps the plain behaviour.
 */

export const UNPROVISIONED_EMPTY_HEADLINE =
  "No durable interaction index is configured — an empty result here is not evidence that no interactions are known.";
export const UNPROVISIONED_RECORDS_HEADLINE =
  "No durable interaction index is configured — these candidates were served from a non-durable index and may not be complete.";
export const INDEX_STATE_UNKNOWN_NOTE =
  "Index state unknown: the backend reported an index state this page does not recognise, so this result is not confirmed to come from a durable index.";

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
  const studyUrl = studyReferenceUrl(record.study_external_id);
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
        <span
          className="ml-2 rounded-full border border-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-900"
          data-testid="interaction-discovery-review-label"
        >
          Review-bound · not evidence
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

function BackendIndexNote({ result }: { result: InteractionDiscoveryResult }) {
  return result.index_note ? (
    <div className="mt-1" data-testid="interaction-discovery-index-note">
      {result.index_note}
    </div>
  ) : null;
}

/** Index-availability notice for a readable result; nothing for durable or unreported. */
function IndexStateNotice({ result }: { result: InteractionDiscoveryResult }) {
  if (result.index_state === "memory_unprovisioned") {
    return (
      <div
        role="status"
        data-testid="interaction-discovery-index-unprovisioned"
        className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <div className="font-semibold">{UNPROVISIONED_RECORDS_HEADLINE}</div>
        <BackendIndexNote result={result} />
      </div>
    );
  }
  if (result.index_state === "unrecognized") {
    return (
      <div
        role="status"
        data-testid="interaction-discovery-index-unknown"
        className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700"
      >
        {INDEX_STATE_UNKNOWN_NOTE}
        <BackendIndexNote result={result} />
      </div>
    );
  }
  return null;
}

/**
 * Nothing readable binds to the exact species, but the result was truncated or
 * carried unreadable records: never the "none" copy.
 */
function IncompleteNotice({ result, species }: { result: InteractionDiscoveryResult; species: string }) {
  return (
    <div
      role="status"
      data-testid="interaction-discovery-incomplete"
      className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <div className="font-semibold">
        No candidate bound to {species} was found in the part of the result that could be checked, but the result is
        incomplete.
      </div>
      {result.truncated ? (
        <div className="mt-1" data-testid="interaction-discovery-incomplete-truncated">
          Only the first {result.count} of {result.total_matched} broader matches were checked; exact-species candidates
          may exist.
        </div>
      ) : null}
      {result.unreadable_count > 0 ? (
        <div className="mt-1" data-testid="interaction-discovery-incomplete-unreadable">
          {result.unreadable_count} record{result.unreadable_count === 1 ? "" : "s"} could not be read; exact-species
          candidates may be among {result.unreadable_count === 1 ? "it" : "them"}.
        </div>
      ) : null}
      <div className="mt-1">This is not evidence that no interactions are known for {species}.</div>
      <BackendIndexNote result={result} />
    </div>
  );
}

/** Records withheld from this view, stated rather than silently dropped. */
function ExclusionNotes({ result, species }: { result: InteractionDiscoveryResult; species: string }) {
  const other = result.other_taxon_excluded_count ?? 0;
  const locality = result.place_withheld_count ?? 0;
  if (other === 0 && locality === 0) return null;
  return (
    <div className="mt-2 space-y-1 text-xs text-slate-600">
      {other > 0 ? (
        <p data-testid="interaction-discovery-other-taxon-excluded">
          {other} matched candidate{other === 1 ? "" : "s"} carried a different, broader, or possibly synonymous name
          than {species} (for example an infraspecific or hybrid name) and {other === 1 ? "is" : "are"} not shown here.
          A possible synonym is not resolved on this page.
        </p>
      ) : null}
      {locality > 0 ? (
        <p data-testid="interaction-discovery-locality-withheld">
          Fields in {locality} record{locality === 1 ? "" : "s"} were withheld because they carried, or could not be
          screened for, locality; this page never shows locality.
        </p>
      ) : null}
    </div>
  );
}

export function InteractionDiscoveryView({
  species,
  discovery,
  headingLevel = 2,
}: {
  species: string;
  discovery: InteractionDiscoveryState | null;
  /** 3 when the panel sits inside a section that already has its own h2. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const GroupHeading = headingLevel === 3 ? "h4" : "h3";
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
  } else if (discovery.state === "incomplete") {
    body = (
      <div className="space-y-3">
        <IncompleteNotice result={discovery.result} species={species} />
        <ExclusionNotes result={discovery.result} species={species} />
      </div>
    );
  } else if (discovery.state === "unprovisioned") {
    body = (
      <div
        role="status"
        data-testid="interaction-discovery-unprovisioned"
        className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <div className="font-semibold">{UNPROVISIONED_EMPTY_HEADLINE}</div>
        <BackendIndexNote result={discovery.result} />
        <ExclusionNotes result={discovery.result} species={species} />
      </div>
    );
  } else if (discovery.state === "empty") {
    body = (
      <div className="space-y-3">
        <IndexStateNotice result={discovery.result} />
        <div
          data-testid="interaction-discovery-empty"
          className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600"
        >
          The discovery index holds no candidate interactions matching {species}. Absence here reflects what has been
          ingested so far, not an ecological finding.
        </div>
        <ExclusionNotes result={discovery.result} species={species} />
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
        <IndexStateNotice result={result} />
        <p className="text-sm text-slate-600" data-testid="interaction-discovery-summary">
          {result.other_taxon_excluded_count === undefined ? (
            <>
              Showing {result.records.length} of {result.total_matched} matched candidate
              {result.total_matched === 1 ? "" : "s"}.
              {result.truncated ? " More candidates exist than this panel requested." : ""}
            </>
          ) : (
            <>
              Showing {result.records.length} candidate{result.records.length === 1 ? "" : "s"} bound to {species}, from{" "}
              {result.count} broader name match{result.count === 1 ? "" : "es"} returned.
              {result.truncated
                ? ` Only the first ${result.count} of ${result.total_matched} broader matches were checked; more exact-species candidates may exist.`
                : ""}
            </>
          )}
          {result.unreadable_count > 0
            ? ` ${result.unreadable_count} record${result.unreadable_count === 1 ? "" : "s"} could not be read and ${
                result.unreadable_count === 1 ? "is" : "are"
              } not shown.`
            : ""}
        </p>
        <ExclusionNotes result={result} species={species} />
        {GROUP_ORDER.filter((key) => groups.has(key)).map((key) => (
          <section key={key} data-testid={`interaction-discovery-group-${key}`}>
            <GroupHeading className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-800">
              {GROUP_LABEL[key]} ({groups.get(key)!.length})
            </GroupHeading>
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

  const note =
    discovery && (discovery.state !== "unavailable" && discovery.state !== "malformed")
      ? discovery.result.note
      : null;

  return (
    <section
      className="rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-sm"
      aria-label="Interaction discovery"
      data-testid="interaction-discovery-panel"
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">
        Review-bound candidates · GloBI
      </div>
      <Heading className="mb-2 text-2xl font-semibold text-slate-900">Interaction discovery</Heading>
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

export default function InteractionDiscoveryPanel({
  species,
  category = "all",
  exactSpeciesOnly = false,
  headingLevel = 2,
}: {
  species: string;
  /** Sent as `category=`; defaults to every category. */
  category?: InteractionCategoryFilter;
  /** Show only records in which one side is exactly `species` (the backend matches substrings). */
  exactSpeciesOnly?: boolean;
  headingLevel?: 2 | 3;
}) {
  const [discovery, setDiscovery] = useState<InteractionDiscoveryState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDiscovery(null);
    fetchInteractionDiscovery(species, { category, signal: controller.signal })
      .then((state) => {
        if (!controller.signal.aborted) setDiscovery(exactSpeciesOnly ? restrictToExactSpecies(state, species) : state);
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
  }, [species, category, exactSpeciesOnly]);

  return <InteractionDiscoveryView species={species} discovery={discovery} headingLevel={headingLevel} />;
}
