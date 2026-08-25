import { describe, expect, it } from "vitest";

import {
  buildPlantMeasurement,
  convertedMeasurement,
  describeMeasurement,
  measurementPhotographProvenance,
  partitionMeasurements,
} from "@/lib/plantMeasurementObservation";

/** The acceptance specimen's own reading: a ruler held beside the flower. */
const AM1_SPREAD = {
  trait: "natural_spread_horizontal",
  value: 5.6,
  unit: "in",
  method: "ruler_photograph",
  measuredOn: "2026-08-25",
  instrument: "12 in rule",
};

describe("the acceptance specimen's flower measurement", () => {
  it("stores what the grower actually read, in the unit they read it in", () => {
    // A ruler in inches is what was used. Storing a converted number as the
    // primary value loses that.
    const measurement = buildPlantMeasurement(AM1_SPREAD)!;
    expect(measurement.value).toBe(5.6);
    expect(measurement.unit).toBe("in");
    expect(measurement.trait).toBe("natural_spread_horizontal");
  });

  it("keeps how it was measured, which is most of what the number is worth", () => {
    const measurement = buildPlantMeasurement(AM1_SPREAD)!;
    expect(measurement.method).toBe("ruler_photograph");
    expect(measurement.instrument).toBe("12 in rule");
    expect(measurement.measured_on).toBe("2026-08-25");
  });

  it("is a collection observation, never a description of the species", () => {
    // One flower, one plant, one season. Not what the literature says about
    // Phragmipedium kovachii.
    expect(buildPlantMeasurement(AM1_SPREAD)!.is_scientific_evidence).toBe(false);
  });

  it("converts to 14.2 cm and not to 14.224", () => {
    // A ruler did not resolve tenths of a millimetre. Printing digits it could
    // not produce turns a careful reading into a false claim.
    const converted = convertedMeasurement({ value: 5.6, unit: "in" }, "cm")!;
    expect(converted.value).toBe(14.2);
    expect(converted.unit).toBe("cm");
    expect(converted.converted).toBe(true);
  });

  it("reads back with both numbers and its provenance", () => {
    expect(describeMeasurement(buildPlantMeasurement(AM1_SPREAD)!)).toBe(
      "Natural spread, horizontal: 5.6 in (14.2 cm converted), by ruler photograph, on 2026-08-25",
    );
  });
});

describe("conversion never invents precision", () => {
  it("rounds to one decimal place in either direction", () => {
    expect(convertedMeasurement({ value: 14.2, unit: "cm" }, "in")!.value).toBe(5.6);
    expect(convertedMeasurement({ value: 3, unit: "in" }, "cm")!.value).toBe(7.6);
    expect(convertedMeasurement({ value: 142, unit: "mm" }, "cm")!.value).toBe(14.2);
  });

  it("marks every converted value as converted", () => {
    expect(convertedMeasurement({ value: 5.6, unit: "in" }, "cm")!.converted).toBe(true);
  });

  it("returns nothing when there is no conversion to make", () => {
    // A measured value must never be relabelled as a converted one.
    expect(convertedMeasurement({ value: 14.2, unit: "cm" }, "cm")).toBeNull();
  });
});

describe("what it refuses to record", () => {
  it("refuses a trait outside the measurable list", () => {
    // A free-text trait cannot be compared with anything later, and "spread"
    // measured two ways is two numbers wearing one name.
    expect(buildPlantMeasurement({ ...AM1_SPREAD, trait: "overall_niceness" })).toBeNull();
  });

  it("refuses a value that is not a positive length", () => {
    for (const value of [0, -5.6, Number.NaN, 5000]) {
      expect(buildPlantMeasurement({ ...AM1_SPREAD, value })).toBeNull();
    }
  });

  it("refuses a measurement with no unit or no method", () => {
    // A number with no unit is something everybody will assume something about.
    expect(buildPlantMeasurement({ ...AM1_SPREAD, unit: "" })).toBeNull();
    expect(buildPlantMeasurement({ ...AM1_SPREAD, unit: "hands" })).toBeNull();
    expect(buildPlantMeasurement({ ...AM1_SPREAD, method: "" })).toBeNull();
    expect(buildPlantMeasurement({ ...AM1_SPREAD, method: "eyeballed" })).toBeNull();
  });

  it("refuses a measurement with no day", () => {
    expect(buildPlantMeasurement({ ...AM1_SPREAD, measuredOn: "" })).toBeNull();
    expect(buildPlantMeasurement({ ...AM1_SPREAD, measuredOn: "last summer" })).toBeNull();
  });

  it("accepts a value typed as a string, since a form field yields one", () => {
    expect(buildPlantMeasurement({ ...AM1_SPREAD, value: "5.6" })!.value).toBe(5.6);
  });
});

describe("later flowerings add, and never overwrite", () => {
  const entries = [
    { id: "m1", supersedes_id: null },
    { id: "m2", supersedes_id: null },
    { id: "m3", supersedes_id: "m1" },
  ];

  it("keeps a corrected measurement in the record", () => {
    // Somebody measured, then measured again. That they did is part of what
    // the collection knows.
    const { standing, superseded } = partitionMeasurements(entries);
    expect(standing.map((entry) => entry.id)).toEqual(["m2", "m3"]);
    expect(superseded.map((entry) => entry.id)).toEqual(["m1"]);
  });

  it("does not treat a second flowering's measurement as replacing the first", () => {
    // Last season's spread is not made wrong by this season's.
    const { standing } = partitionMeasurements([
      { id: "spring", supersedes_id: null },
      { id: "autumn", supersedes_id: null },
    ]);
    expect(standing).toHaveLength(2);
  });

  it("ties a measurement to the flowering it belongs to when one is known", () => {
    const measurement = buildPlantMeasurement({ ...AM1_SPREAD, floweringEventId: "event-7" })!;
    expect(measurement.flowering_event_id).toBe("event-7");
  });

  it("ties a measurement to the photograph the ruler is in", () => {
    const measurement = buildPlantMeasurement({ ...AM1_SPREAD, photographId: "photo-3" })!;
    expect(measurement.photograph_id).toBe("photo-3");
  });
});

describe("a reading off a photograph says which photograph", () => {
  /**
   * `ruler_photograph` outranks `estimated` for one reason: the photograph can
   * be looked at again. These assertions are about whether the record actually
   * supports that claim, not about how it reads.
   */
  it("names the photograph when the reading was taken off one", () => {
    const measurement = buildPlantMeasurement({ ...AM1_SPREAD, photographId: "photo-3" })!;
    expect(measurementPhotographProvenance(measurement)).toEqual({
      state: "identified",
      photographId: "photo-3",
    });
  });

  it("says so, rather than staying silent, when no photograph is named", () => {
    // The reading is kept — growers measure before they upload — but it must
    // not pass as re-checkable when nothing can be re-checked.
    const measurement = buildPlantMeasurement(AM1_SPREAD)!;
    const provenance = measurementPhotographProvenance(measurement);
    expect(provenance.state).toBe("unidentified");
    expect(provenance.state === "unidentified" && provenance.note).toMatch(/cannot be checked/i);
  });

  it("asks nothing of a reading taken with a ruler in hand", () => {
    const measurement = buildPlantMeasurement({ ...AM1_SPREAD, method: "ruler_direct" })!;
    expect(measurementPhotographProvenance(measurement)).toEqual({ state: "not_from_photograph" });
  });

  it("reports a named photograph on any method, since the naming is the claim", () => {
    // A calipers reading with the plant photographed beside them is still
    // evidence of what was in front of the person; the method is a separate
    // fact from whether a photograph exists.
    const measurement = buildPlantMeasurement({
      ...AM1_SPREAD,
      method: "calipers",
      photographId: "photo-9",
    })!;
    expect(measurementPhotographProvenance(measurement).state).toBe("identified");
  });

  it("does not let a photograph reference smuggle in free text", () => {
    // photograph_id is bounded like every other stored string; an id that
    // failed those bounds must read as unnamed, not as a name.
    const measurement = buildPlantMeasurement({ ...AM1_SPREAD, photographId: "<script>" })!;
    expect(measurement.photograph_id).toBeNull();
    expect(measurementPhotographProvenance(measurement).state).toBe("unidentified");
  });
});
