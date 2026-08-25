import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CONSERVATORY_CULTIVATION_ORIGIN,
  CULTIVATION_HANDOFF_STORAGE_PREFIX,
  PERMITTED_LOCATION_KINDS,
  PERMITTED_OBSERVATION_ORIGINS,
  PERMITTED_OBSERVATION_VARIABLES,
  buildCultivationHandoff,
  cultivationCalyxHref,
  readCultivationHandoff,
  seedCultivationHandoff,
} from "@/lib/conservatoryCultivationCalyx";

const TOKEN = "a1b2c3d4e5f6";

const READINGS = [
  { variable: "temperature_c", value: 21, origin: "measured", observed_at: "2026-08-20T06:30:00Z" },
  { variable: "relative_humidity_pct", value: 62, origin: "manual", observed_at: "2026-08-20T06:31:00Z" },
];

function handoff() {
  return buildCultivationHandoff({
    acceptedScientificName: "Phalaenopsis amabilis",
    locationKind: "greenhouse_bench",
    readings: READINGS,
  });
}

/** A storage double that behaves like sessionStorage, including its absence. */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

describe("building the cultivation handoff", () => {
  it("carries the taxon, the kind of place, and the readings with their provenance", () => {
    const built = handoff()!;
    expect(built.origin).toBe(CONSERVATORY_CULTIVATION_ORIGIN);
    expect(built.taxon).toBe("Phalaenopsis amabilis");
    expect(built.featured_taxon).toEqual({ rank: "genus", accepted_name: "Phalaenopsis" });
    expect(built.location).toEqual({ kind: "greenhouse_bench" });
    expect(built.observations).toEqual([
      { variable: "temperature_c", value: 21, unit: "°C", origin: "measured", observed_on: "2026-08-20" },
      { variable: "relative_humidity_pct", value: 62, unit: "%", origin: "manual", observed_on: "2026-08-20" },
    ]);
  });

  it("denies evidence status explicitly rather than by omission", () => {
    // A receiver cannot tell "not evidence" from "nobody said" when the flag is
    // merely absent, so all three denials are values, and they are `false`.
    const built = handoff()!;
    expect(built.taxon_is_evidence).toBe(false);
    expect(built.observations_are_evidence).toBe(false);
    expect(built.observations_are_occurrence_data).toBe(false);
    for (const key of ["taxon_is_evidence", "observations_are_evidence", "observations_are_occurrence_data"]) {
      expect(Object.keys(built)).toContain(key);
    }
  });

  it("reduces an observation instant to the day it fell on", () => {
    // A timestamped series of readings is a record of when somebody was in
    // their greenhouse. The day is enough to judge how old a number is.
    expect(handoff()!.observations[0].observed_on).toBe("2026-08-20");
    expect(JSON.stringify(handoff())).not.toContain("06:30");
  });

  it("fails closed rather than handing over a partial question", () => {
    expect(buildCultivationHandoff({ acceptedScientificName: null, locationKind: "shelf", readings: READINGS })).toBeNull();
    expect(buildCultivationHandoff({ acceptedScientificName: "Phalaenopsis", locationKind: "shelf", readings: READINGS })).toBeNull();
    expect(buildCultivationHandoff({ acceptedScientificName: "Phalaenopsis amabilis", locationKind: "the back room", readings: READINGS })).toBeNull();
    // No readings is not a cultivation question; it asks Calyx to assess
    // conditions nobody recorded.
    expect(buildCultivationHandoff({ acceptedScientificName: "Phalaenopsis amabilis", locationKind: "shelf", readings: [] })).toBeNull();
  });

  it("drops a reading that is not a number, rather than inventing one", () => {
    const built = buildCultivationHandoff({
      acceptedScientificName: "Phalaenopsis amabilis",
      locationKind: "shelf",
      readings: [
        { variable: "temperature_c", value: null, origin: "measured", observed_at: "2026-08-20T00:00:00Z" },
        { variable: "relative_humidity_pct", value: 62, origin: "manual", observed_at: "2026-08-20T00:00:00Z" },
      ],
    })!;
    expect(built.observations.map((row) => row.variable)).toEqual(["relative_humidity_pct"]);
  });

  it("refuses a variable, unit, origin, or place outside the permitted vocabulary", () => {
    const rejected = buildCultivationHandoff({
      acceptedScientificName: "Phalaenopsis amabilis",
      locationKind: "greenhouse",
      readings: [
        { variable: "soil_lead_ppm", value: 3, origin: "measured", observed_at: "2026-08-20T00:00:00Z" },
        { variable: "temperature_c", value: 21, origin: "guessed", observed_at: "2026-08-20T00:00:00Z" },
      ],
    });
    expect(rejected).toBeNull();
  });

  it("keeps one reading per variable, so a corrected value is not compared alongside the value it replaced", () => {
    const built = buildCultivationHandoff({
      acceptedScientificName: "Phalaenopsis amabilis",
      locationKind: "shelf",
      readings: [
        { variable: "temperature_c", value: 21, origin: "measured", observed_at: "2026-08-20T00:00:00Z" },
        { variable: "temperature_c", value: 31, origin: "measured", observed_at: "2026-08-19T00:00:00Z" },
      ],
    })!;
    expect(built.observations).toHaveLength(1);
    expect(built.observations[0].value).toBe(21);
  });
});

describe("what must never cross", () => {
  const PRIVATE = {
    id: "8f2c1e1a-0000-4000-8000-000000000000",
    accession_number: "OC-0001",
    display_name: "Nan's plant",
    notes: "Bought at the Santa Barbara show; keep away from the west window at 34.42, -119.70",
    qr_identifier: "ocq_5f1c2d",
    location_name: "Home greenhouse, 12 Any Street",
  };

  it("carries no plant identity, no free text, and no location name", () => {
    const built = buildCultivationHandoff({
      // The builder's input shape has no channel for any of this, which is the
      // point — but a future caller spreading a whole plant object in is the
      // realistic mistake, so the serialized result is searched for it.
      acceptedScientificName: "Phalaenopsis amabilis",
      locationKind: "greenhouse_bench",
      readings: [{ ...PRIVATE, variable: "temperature_c", value: 21, origin: "measured", observed_at: "2026-08-20T00:00:00Z" }],
    })!;
    const wire = JSON.stringify(built);
    for (const secret of Object.values(PRIVATE)) {
      expect(wire, `"${secret}" reached the handoff`).not.toContain(secret);
    }
    expect(wire).not.toMatch(/34\.42|-119\.70|latitude|longitude|locality/i);
  });

  it("puts nothing private in the address", () => {
    const href = cultivationCalyxHref("Phalaenopsis amabilis", TOKEN)!;
    // A URL is written to history, leaks through Referer, and gets pasted into
    // chat windows. Only the public taxon and the markers may be in it.
    expect(href).toBe(
      "/calyx?genus=Phalaenopsis&taxon=Phalaenopsis+amabilis&origin=conservatory-cultivation&context_is_evidence=false&cultivation=a1b2c3d4e5f6",
    );
    const params = new URL(href, "https://orchidcontinuum.org").searchParams;
    expect([...params.keys()].sort()).toEqual([
      "context_is_evidence", "cultivation", "genus", "origin", "taxon",
    ]);
    for (const secret of Object.values(PRIVATE)) expect(href).not.toContain(secret);
    // Not even the readings — a temperature in a URL is still the grower's data.
    expect(href).not.toMatch(/temperature|humidity|21|62/);
  });

  it("refuses to build an address from an unbounded taxon or a malformed token", () => {
    expect(cultivationCalyxHref("Phalaenopsis", TOKEN)).toBeNull();
    expect(cultivationCalyxHref("<script>", TOKEN)).toBeNull();
    expect(cultivationCalyxHref("Phalaenopsis amabilis", "../../etc")).toBeNull();
    expect(cultivationCalyxHref("Phalaenopsis amabilis", "short")).toBeNull();
  });
});

describe("collecting the handoff on arrival", () => {
  const search = `?genus=Phalaenopsis&taxon=Phalaenopsis+amabilis&origin=${CONSERVATORY_CULTIVATION_ORIGIN}&context_is_evidence=false&cultivation=${TOKEN}`;

  function seeded() {
    const storage = memoryStorage();
    expect(seedCultivationHandoff(storage, TOKEN, handoff()!)).toBe(true);
    return storage;
  }

  it("returns the validated handoff and consumes it", () => {
    const storage = seeded();
    expect(readCultivationHandoff(search, storage)).toEqual(handoff());
    // Single use: a private observation set left in storage waits for whatever
    // can read it next.
    expect(storage.map.size).toBe(0);
    expect(readCultivationHandoff(search, storage)).toBeNull();
  });

  it("consumes the entry even when it does not validate", () => {
    const storage = memoryStorage({ [`${CULTIVATION_HANDOFF_STORAGE_PREFIX}${TOKEN}`]: "{ not json" });
    expect(readCultivationHandoff(search, storage)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it("fails closed when the arrival does not declare non-evidence", () => {
    const storage = seeded();
    const missing = search.replace("&context_is_evidence=false", "");
    const contradicted = search.replace("context_is_evidence=false", "context_is_evidence=true");
    expect(readCultivationHandoff(missing, storage)).toBeNull();
    expect(readCultivationHandoff(contradicted, storage)).toBeNull();
  });

  it("fails closed when the address and the payload disagree about the subject", () => {
    // Session storage is writable by any script on the origin, so what comes
    // back is untrusted. If the two disagree there is no way to tell which was
    // tampered with.
    const storage = seeded();
    const swapped = search.replace("Phalaenopsis+amabilis", "Dracula+vampira");
    expect(readCultivationHandoff(swapped, storage)).toBeNull();
  });

  it("re-validates the payload rather than trusting what it wrote", () => {
    const tampered = { ...handoff()!, observations_are_evidence: true, location: { kind: "a friend's flat" } };
    const storage = memoryStorage({
      [`${CULTIVATION_HANDOFF_STORAGE_PREFIX}${TOKEN}`]: JSON.stringify(tampered),
    });
    expect(readCultivationHandoff(search, storage)).toBeNull();
  });

  it("never returns a payload whose denials were flipped", () => {
    const storage = memoryStorage({
      [`${CULTIVATION_HANDOFF_STORAGE_PREFIX}${TOKEN}`]: JSON.stringify({
        ...handoff()!,
        observations_are_occurrence_data: true,
        taxon_is_evidence: true,
      }),
    });
    const read = readCultivationHandoff(search, storage);
    // Rebuilt from the validated parts, so the denials are this module's, not
    // whatever was in storage.
    expect(read!.observations_are_occurrence_data).toBe(false);
    expect(read!.taxon_is_evidence).toBe(false);
    expect(read!.observations_are_evidence).toBe(false);
  });

  it("returns nothing when storage refuses to answer", () => {
    // A private window, or a browser with site data blocked.
    const throwing = {
      getItem: () => { throw new Error("blocked"); },
      removeItem: () => {},
    };
    expect(readCultivationHandoff(search, throwing)).toBeNull();
    expect(seedCultivationHandoff({ setItem: () => { throw new Error("blocked"); } }, TOKEN, handoff()!)).toBe(false);
  });
});

describe("the permitted vocabulary matches what the Conservatory offers", () => {
  const page = readFileSync(new URL("../pages/MyConservatory.tsx", import.meta.url), "utf8");

  it("permits exactly the environmental variables the reading form offers", () => {
    // A variable the form can record but this contract drops is a reading a
    // grower entered and Calyx silently never saw.
    const offered = [...page.matchAll(/\{ value: "([a-z_0-9]+)", label: "[^"]+", unit:/g)].map((m) => m[1]);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.sort()).toEqual(Object.keys(PERMITTED_OBSERVATION_VARIABLES).sort());
  });

  it("permits exactly the location kinds the location form offers", () => {
    const kinds = page.slice(page.indexOf("const LOCATION_KINDS"));
    const offered = [...kinds.slice(0, kinds.indexOf("];")).matchAll(/\{ value: "([a-z_]+)"/g)].map((m) => m[1]);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.sort()).toEqual([...PERMITTED_LOCATION_KINDS].sort());
  });

  it("permits exactly the reading origins the vocabulary names", () => {
    const labels = page.slice(page.indexOf("const ORIGIN_LABEL"));
    const offered = [...labels.slice(0, labels.indexOf("};")).matchAll(/^\s{2}([a-z]+):/gm)].map((m) => m[1]);
    expect(offered.sort()).toEqual([...PERMITTED_OBSERVATION_ORIGINS].sort());
  });
});
