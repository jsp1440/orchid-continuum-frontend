const SNAPSHOT_PATH = "/rest/v1/daily_genus_snapshot";
const CANONICAL_SELECT = "genus,snapshot_date";
const SNAPSHOT_DATE = /^eq\\.\\d{4}-\\d{2}-\\d{2}$/;

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
