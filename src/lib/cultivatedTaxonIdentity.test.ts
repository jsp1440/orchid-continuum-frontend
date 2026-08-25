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

describe("the shorthand a label actually carries", () => {
  // A grower states the genus once and lets the line inherit it. Refusing the
  // shorthand refuses the plant, and every one of these is AM1.
  const SIB_CROSS_FORMS = [
    "Phragmipedium kovachii 'Daniela' × 'Maria'",
    "Phrag. kovachii 'Daniela' x 'Maria'",
    "Phragmipedium kovachii ('Daniela' × 'Maria')",
    "Phrag. kovachii ('Daniela' x 'Maria')",
  ];

  for (const form of SIB_CROSS_FORMS) {
    it(`reads ${JSON.stringify(form)} as one species crossed with itself`, () => {
      const identity = resolveCultivatedIdentity(form)!;
      expect(identity.species).toBe("Phragmipedium kovachii");
      expect(identity.relationship).toBe("cross_within_species");
      // And still keeps the line exactly as the grower wrote it.
      expect(identity.cultivated).toBe(form);
    });
  }

  it("lets a bare epithet inherit the genus the line already named", () => {
    // `Phragmipedium besseae x kovachii` is how an interspecific cross is
    // normally written. The genus carries across; the species does not.
    const identity = resolveCultivatedIdentity("Phragmipedium besseae × kovachii")!;
    expect(identity.species).toBeNull();
    expect(identity.genus).toBe("Phragmipedium");
    expect(identity.reason).toMatch(
      /cross between Phragmipedium besseae and Phragmipedium kovachii/,
    );
  });

  it("still refuses a cross between two species written in shorthand", () => {
    // Inheriting the genus must not soften the rule that matters: nothing is
    // published about this plant either way.
    expect(resolveCultivatedIdentity("Phragmipedium besseae × kovachii")!.species).toBeNull();
  });
});

describe("a line that never names a genus", () => {
  const NO_GENUS = "kovachii 'Daniela' × kovachii 'Maria'";

  it("refuses rather than supplying a genus nobody wrote", () => {
    // An epithet on its own is not a species name, more than one genus can
    // carry the same epithet, and inventing one would be fabricating taxonomy
    // to make a lookup succeed.
    const identity = resolveCultivatedIdentity(NO_GENUS)!;
    expect(identity.species).toBeNull();
    expect(identity.genus).toBeNull();
  });

  it("says the genus is missing, not that the plant is not a species", () => {
    // The old message claimed "at least one parent of this cross is not a
    // species", which is both wrong and unactionable: kovachii is a species
    // epithet, and what the grower needs to hear is which word to add.
    const identity = resolveCultivatedIdentity(NO_GENUS)!;
    expect(identity.reason).toMatch(/No genus is written/);
    expect(identity.reason).toContain("kovachii");
    expect(identity.reason).toMatch(/Add the genus in front of it/);
    expect(identity.reason).not.toMatch(/is not a species/);
  });

  it("keeps the line the grower wrote, so nothing is lost by refusing it", () => {
    expect(resolveCultivatedIdentity(NO_GENUS)!.cultivated).toBe(NO_GENUS);
  });

  it("gives the same answer for a single parent written without a genus", () => {
    const identity = resolveCultivatedIdentity("kovachii 'Daniela'")!;
    expect(identity.species).toBeNull();
    expect(identity.reason).toMatch(/No genus is written/);
  });
});
