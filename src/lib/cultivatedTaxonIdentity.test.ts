import { describe, expect, it } from "vitest";

import { resolveCultivatedIdentity } from "@/lib/cultivatedTaxonIdentity";

/** The acceptance specimen: a real plant, on a real label, in a real collection. */
const AM1 = "Phragmipedium kovachii 'Daniela' × Phragmipedium kovachii 'Maria'";

describe("the acceptance specimen AM1", () => {
  it("keeps the whole cultivated name the grower recorded", () => {
    // Reducing this to "Phragmipedium kovachii" would throw away the parentage
    // they chose the plant for and keep records on.
    expect(resolveCultivatedIdentity(AM1)!.cultivated).toBe(AM1);
  });

  it("resolves the species that may actually be looked up", () => {
    // Both parents are clones of one species, so the species is what published
    // cultivation evidence is about.
    const identity = resolveCultivatedIdentity(AM1)!;
    expect(identity.species).toBe("Phragmipedium kovachii");
    expect(identity.genus).toBe("Phragmipedium");
  });

  it("says the species was reached through a cross, not stated outright", () => {
    // A reader must never be left guessing whether a requirement was published
    // about their plant or about its parent species.
    expect(resolveCultivatedIdentity(AM1)!.relationship).toBe("cross_within_species");
  });

  it("accepts the abbreviations a grower writes on a label", () => {
    const written = "Phrag. kovachii 'Daniela' x Phrag. kovachii 'Maria'";
    const identity = resolveCultivatedIdentity(written)!;
    expect(identity.species).toBe("Phragmipedium kovachii");
    expect(identity.relationship).toBe("cross_within_species");
    expect(identity.cultivated).toBe(written);
  });
});

describe("a cross between two different species", () => {
  const INTERSPECIFIC = "Phragmipedium besseae × Phragmipedium kovachii";

  it("resolves to no species at all", () => {
    // The rule that matters scientifically. Nothing is published about this
    // plant, and either parent's requirements would be evidence about a
    // different plant.
    const identity = resolveCultivatedIdentity(INTERSPECIFIC)!;
    expect(identity.species).toBeNull();
    expect(identity.relationship).toBe("none");
    expect(identity.reason).toMatch(/cross between Phragmipedium besseae and Phragmipedium kovachii/);
    expect(identity.reason).toMatch(/evidence about a different plant/);
  });

  it("does not quietly pick the first parent", () => {
    const identity = resolveCultivatedIdentity(INTERSPECIFIC)!;
    expect(identity.species).not.toBe("Phragmipedium besseae");
    expect(identity.species).not.toBe("Phragmipedium kovachii");
  });

  it("still keeps the whole name and the genus when both parents share one", () => {
    const identity = resolveCultivatedIdentity(INTERSPECIFIC)!;
    expect(identity.cultivated).toBe(INTERSPECIFIC);
    expect(identity.genus).toBe("Phragmipedium");
  });

  it("reports no genus for an intergeneric cross", () => {
    const identity = resolveCultivatedIdentity("Phragmipedium besseae × Paphiopedilum rothschildianum")!;
    expect(identity.species).toBeNull();
    expect(identity.genus).toBeNull();
  });
});

describe("plainer records", () => {
  it("resolves a species to itself", () => {
    const identity = resolveCultivatedIdentity("Phragmipedium kovachii")!;
    expect(identity.species).toBe("Phragmipedium kovachii");
    expect(identity.relationship).toBe("species");
  });

  it("resolves a named clone to its species, and says so", () => {
    const identity = resolveCultivatedIdentity("Phragmipedium kovachii 'Daniela'")!;
    expect(identity.species).toBe("Phragmipedium kovachii");
    expect(identity.relationship).toBe("cultivar_of_species");
    expect(identity.cultivated).toBe("Phragmipedium kovachii 'Daniela'");
  });

  it("refuses a grex, whose capitalised epithet is the whole signal", () => {
    // Nothing is published about a grex the way it is about a species.
    const identity = resolveCultivatedIdentity("Phragmipedium Memoria Dick Clements")!;
    expect(identity.species).toBeNull();
    expect(identity.reason).toMatch(/genus or a grex/);
  });

  it("refuses a genus on its own", () => {
    expect(resolveCultivatedIdentity("Phragmipedium")!.species).toBeNull();
  });

  it("refuses a cross of three parents rather than choosing among them", () => {
    const three = "Phragmipedium kovachii × Phragmipedium besseae × Phragmipedium schlimii";
    const identity = resolveCultivatedIdentity(three)!;
    expect(identity.species).toBeNull();
    expect(identity.reason).toMatch(/more than two parents/);
  });
});

describe("what it will not accept at all", () => {
  it("rejects empty, oversized, and unsafe records", () => {
    expect(resolveCultivatedIdentity("")).toBeNull();
    expect(resolveCultivatedIdentity(null)).toBeNull();
    expect(resolveCultivatedIdentity(undefined)).toBeNull();
    expect(resolveCultivatedIdentity(`Phragmipedium ${"x".repeat(300)}`)).toBeNull();
    expect(resolveCultivatedIdentity("Phragmipedium <script>")).toBeNull();
  });

  it("normalises only whitespace, never the name itself", () => {
    const identity = resolveCultivatedIdentity("  Phragmipedium   kovachii  'Daniela'  ")!;
    expect(identity.cultivated).toBe("Phragmipedium kovachii 'Daniela'");
    expect(identity.species).toBe("Phragmipedium kovachii");
  });
});
