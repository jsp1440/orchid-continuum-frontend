/**
 * researchStationNavigation — bounded context handoffs out of the Research Station.
 *
 * A user moving Species/Genus → Research Station → Atlas → Calyx → Matrix →
 * Lexicon and back must not lose the scientific subject. These builders carry
 * exactly the identity needed to keep the investigation intact:
 *
 *   • canonical taxon identity
 *   • project / research-question identity
 *   • conversation identity
 *
 * and nothing else. In particular they must never carry locality, coordinates
 * or occurrence detail: sensitive-locality protection is enforced server-side
 * and by `atlasLocalitySafety`, and a query string is the one place that
 * protection would silently be bypassed. `assertNoLocalityLeak` fails closed
 * rather than emitting such a link.
 */

export const RESEARCH_STATION_ORIGIN = "research-station";

/** Query keys that would carry locality out of a protected context. */
const LOCALITY_KEYS = [
  "lat",
  "latitude",
  "lon",
  "lng",
  "longitude",
  "coord",
  "coordinates",
  "locality",
  "location",
  "site",
  "place",
  "grid",
  "gps",
  "elevation_m",
];

export function assertNoLocalityLeak(params: Record<string, string>): void {
  for (const key of Object.keys(params)) {
    const normalized = key.trim().toLowerCase();
    if (LOCALITY_KEYS.includes(normalized)) {
      throw new Error(
        `Research Station navigation must not carry locality context (${key}).`,
      );
    }
  }
}

function requiredTaxon(taxon: string): string {
  const value = String(taxon ?? "").trim();
  if (!value) throw new Error("A canonical taxon identity is required for navigation");
  return value;
}

/**
 * Research Workspace currently supplies a canonical `taxon_id` but no rank.
 * Do not silently coerce that generic identity into Atlas's genus filter.
 *
 * We only classify the two unambiguous name shapes the mounted Atlas already
 * understands. Everything else remains generic context rather than becoming a
 * false rank assertion.
 */
function atlasTaxonParams(taxon: string): Record<string, string> {
  const value = requiredTaxon(taxon);
  if (/^[A-Z][A-Za-z-]+$/.test(value)) return { genera: value };
  if (/^[A-Z][A-Za-z-]+\s+[a-z][A-Za-z-]+$/.test(value)) return { species: value };
  return { taxon: value };
}

function query(params: Record<string, string | null | undefined>): string {
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const resolved = String(value ?? "").trim();
    if (resolved) entries[key] = resolved;
  }
  assertNoLocalityLeak(entries);
  const search = new URLSearchParams(entries).toString();
  return search ? `?${search}` : "";
}

export type ResearchStationContext = {
  /** Canonical taxon under investigation. */
  taxon: string;
  /** The research project this investigation belongs to. */
  projectId?: string | null;
  /** The Calyx conversation carrying the investigation, when one exists. */
  conversationId?: string | null;
};

/** Into the Atlas, filtered only when the subject's name shape establishes rank. */
export function researchStationAtlasHref(context: ResearchStationContext): string {
  return `/atlas${query({
    ...atlasTaxonParams(context.taxon),
    project: context.projectId,
    origin: RESEARCH_STATION_ORIGIN,
  })}`;
}

/**
 * Into Calyx, on the same investigation.
 *
 * When a conversation already exists it is carried so the thread — and the
 * server-side context a follow-up depends on — continues rather than restarting.
 */
export function researchStationCalyxHref(context: ResearchStationContext): string {
  return `/calyx${query({
    genus: requiredTaxon(context.taxon),
    project: context.projectId,
    conversation: context.conversationId,
    origin: RESEARCH_STATION_ORIGIN,
  })}`;
}

/** Into the relationship view for the investigation's taxon. */
export function researchStationRelationshipsHref(context: ResearchStationContext): string {
  return `/relationship-explorer/${encodeURIComponent(requiredTaxon(context.taxon))}${query({
    project: context.projectId,
    origin: RESEARCH_STATION_ORIGIN,
  })}`;
}

/** Into Matrix identification, carrying the taxon and project identity. */
export function researchStationMatrixHref(context: ResearchStationContext): string {
  return `/orchid-identification${query({
    taxon: requiredTaxon(context.taxon),
    project: context.projectId,
    origin: RESEARCH_STATION_ORIGIN,
  })}`;
}

/** Into the Lexicon, for the terminology used in this investigation. */
export function researchStationLexiconHref(context: ResearchStationContext): string {
  return `/lexicon${query({
    q: requiredTaxon(context.taxon),
    project: context.projectId,
    origin: RESEARCH_STATION_ORIGIN,
  })}`;
}

/** Back into the station from any module, preserving the project. */
export function researchStationHref(projectId: string): string {
  const value = String(projectId ?? "").trim();
  if (!value) return "/research";
  return `/research${query({ project: value })}`;
}

/** The taxon dossier the investigation's subject came from. */
export function researchStationSpeciesHref(context: ResearchStationContext): string {
  return `/species/${encodeURIComponent(requiredTaxon(context.taxon))}${query({
    project: context.projectId,
    origin: RESEARCH_STATION_ORIGIN,
  })}`;
}
