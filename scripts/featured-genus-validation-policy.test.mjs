import { describe, expect, it } from "vitest";
import { isExpectedMediaConsoleError, isExpectedOptionalSnapshotFailure } from "./featured-genus-validation-policy.mjs";

const optionalSnapshotFailure = (overrides = {}) => ({
  status: 400,
  resource_type: "fetch",
  url: "https://example.supabase.co/rest/v1/daily_genus_snapshot?select=genus%2Csnapshot_date&snapshot_date=eq.2026-09-23",
  ...overrides,
});

describe("featured genus media validation policy", () => {
  it("recognizes only the exact blocked-media console errors", () => {
    expect(isExpectedMediaConsoleError("console: Failed to load resource: net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin")).toBe(true);
    expect(isExpectedMediaConsoleError("console: Failed to load resource: net::ERR_FAILED")).toBe(true);
    expect(isExpectedMediaConsoleError("console: Failed to load resource: the server responded with a status of 400 ()")).toBe(false);
    expect(isExpectedMediaConsoleError("console: unrelated browser failure")).toBe(false);
  });
});

describe("featured genus optional snapshot validation policy", () => {
  it("allows the documented optional snapshot fallback response", () => {
    expect(isExpectedOptionalSnapshotFailure(optionalSnapshotFailure())).toBe(true);
  });

  it("rejects a server failure", () => {
    expect(isExpectedOptionalSnapshotFailure(optionalSnapshotFailure({ status: 500 }))).toBe(false);
  });

  it("rejects a failure from another endpoint", () => {
    expect(isExpectedOptionalSnapshotFailure(optionalSnapshotFailure({
      url: "https://example.supabase.co/rest/v1/other?select=genus%2Csnapshot_date&snapshot_date=eq.2026-09-23",
    }))).toBe(false);
  });

  it("rejects a non-canonical projection", () => {
    expect(isExpectedOptionalSnapshotFailure(optionalSnapshotFailure({
      url: "https://example.supabase.co/rest/v1/daily_genus_snapshot?select=genus&snapshot_date=eq.2026-09-23",
    }))).toBe(false);
  });

  it("rejects an invalid snapshot date", () => {
    expect(isExpectedOptionalSnapshotFailure(optionalSnapshotFailure({
      url: "https://example.supabase.co/rest/v1/daily_genus_snapshot?select=genus%2Csnapshot_date&snapshot_date=eq.not-a-date",
    }))).toBe(false);
  });

  it("rejects non-fetch browser resources", () => {
    expect(isExpectedOptionalSnapshotFailure(optionalSnapshotFailure({
      resource_type: "document",
    }))).toBe(false);
  });

  it("rejects additional query parameters", () => {
    expect(isExpectedOptionalSnapshotFailure(optionalSnapshotFailure({
      url: "https://example.supabase.co/rest/v1/daily_genus_snapshot?select=genus%2Csnapshot_date&snapshot_date=eq.2026-09-23&limit=1",
    }))).toBe(false);
  });
});
