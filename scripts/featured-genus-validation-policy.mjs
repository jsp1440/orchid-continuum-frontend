const EXPECTED_MEDIA_ERROR = /^console: Failed to load resource: net::ERR_(BLOCKED_BY_RESPONSE\.NotSameOrigin|FAILED)$/;

export function isExpectedMediaConsoleError(error) {
  return typeof error === "string" && EXPECTED_MEDIA_ERROR.test(error);
}

const SNAPSHOT_PATH = "/rest/v1/daily_genus_snapshot";
const CANONICAL_SELECT = "genus,snapshot_date";
const SNAPSHOT_DATE = /^eq\.\d{4}-\d{2}-\d{2}$/;

export function isExpectedOptionalSnapshotFailure(response) {
  if (!response || response.status !== 400) return false;
  if (!["fetch", "xhr"].includes(response.resource_type)) return false;

  let url;
  try {
    url = new URL(String(response.url));
  } catch {
    return false;
  }

  if (url.pathname !== SNAPSHOT_PATH) return false;
  if (url.searchParams.get("select") !== CANONICAL_SELECT) return false;
  if (!SNAPSHOT_DATE.test(url.searchParams.get("snapshot_date") || "")) return false;

  const keys = [...url.searchParams.keys()];
  return keys.every((key) => key === "select" || key === "snapshot_date")
    && url.searchParams.getAll("select").length === 1
    && url.searchParams.getAll("snapshot_date").length === 1;
}

/**
 * The Featured Genus section is located by the stable id its heading carries
 * (`aria-labelledby` on the section in DailyGenusFeatureContinuum), never by
 * incidental copy. A text locator such as "Featured Genus" only matched this
 * section while the relationship cards happened to render the phrase "this
 * featured genus"; in any other evidence state it silently fell through to a
 * different section (the Atlas band) and the sentinel reported a render failure
 * for an element it was not looking at.
 */
export const FEATURED_GENUS_SECTION_SELECTOR = 'section[aria-labelledby="featured-genus-title"]';

/** The honest no-media states the Featured Genus section is allowed to show. */
export const FEATURED_GENUS_NO_MEDIA_PATTERN = /No approved Continuum photograph available|No verified Orchid Continuum photograph|This approved photograph could not be loaded\. No substitute image is shown\./i;
