// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CultivationEvaluationFrame from "@/components/calyx/CultivationEvaluationFrame";
import type { CultivationHandoff } from "@/lib/conservatoryCultivationCalyx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const context: CultivationHandoff = {
  origin: "conservatory-cultivation",
  // A plain species: what the grower recorded and what is looked up are the
  // same string here, which is the simplest of the three relationships.
  cultivated_identity: "Phalaenopsis amabilis",
  taxon: "Phalaenopsis amabilis",
  taxon_relationship: "species",
  featured_taxon: { rank: "genus", accepted_name: "Phalaenopsis" },
  taxon_is_evidence: false,
  location: { kind: "greenhouse_bench" },
  observations: [
    {
      variable: "temperature_c",
      value: 21,
      unit: "°C",
      origin: "measured",
      observed_on: "2026-08-24",
    },
    {
      variable: "relative_humidity_pct",
      value: 62,
      unit: "%",
      origin: "manual",
      observed_on: "2026-08-24",
    },
  ],
  alternatives: [],
  observations_are_evidence: false,
  observations_are_occurrence_data: false,
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("CultivationEvaluationFrame", () => {
  it("visibly separates observations, requirements, inference, and missing data", () => {
    act(() => root.render(<CultivationEvaluationFrame context={context} />));

    expect(container.querySelector('[data-testid="cultivation-observed-conditions"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cultivation-evidence-requirements"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cultivation-recommendation-inference"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cultivation-unknown-missing"]')).not.toBeNull();

    expect(container.textContent).toContain("temperature c 21°C");
    expect(container.textContent).toContain("relative humidity pct 62%");
    expect(container.textContent).toContain("Phalaenopsis amabilis");
  });

  it("does not promote the grower's readings into scientific or occurrence evidence", () => {
    act(() => root.render(<CultivationEvaluationFrame context={context} />));

    expect(container.textContent).toContain("not scientific evidence or occurrence data");
    expect(container.textContent).toContain("An unsupported range stays unknown");
    expect(container.textContent).toContain("It is not itself scientific evidence");
    expect(container.textContent).toContain("Missing information must never be treated as proof");
  });
});
