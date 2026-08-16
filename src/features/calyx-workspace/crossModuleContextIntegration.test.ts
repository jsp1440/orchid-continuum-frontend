import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readCalyxSessionContext,
  recordCalyxSurfaceContext,
  clearCalyxSessionContext,
} from "./sessionContext";
import {
  emitWorkspaceOutput,
  subscribeWorkspaceOutputs,
  clearWorkspaceOutputsBySource,
  type WorkspaceOutput,
} from "./workspaceOutputBus";
import { resolveMatrixCharacterLexicon } from "@/lib/matrixLexicon";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

describe("Cross-Module Canonical Context Continuity: Taxon -> Atlas -> Graph -> Lexicon -> Matrix -> Calyx", () => {
  let eventTarget: EventTarget;

  beforeEach(() => {
    eventTarget = new EventTarget();
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        sessionStorage: storage,
        addEventListener: (type: string, listener: EventListener) => eventTarget.addEventListener(type, listener),
        removeEventListener: (type: string, listener: EventListener) => eventTarget.removeEventListener(type, listener),
        dispatchEvent: (event: Event) => eventTarget.dispatchEvent(event),
      },
    });
    clearCalyxSessionContext();
  });

  afterEach(() => {
    clearCalyxSessionContext();
    Reflect.deleteProperty(globalThis, 'window');
  });

  it("preserves unbroken context across the complete 6-module Continuum navigation trail", async () => {
    // 1. User starts at Species Dossier for Cattleya trianae
    const step1 = recordCalyxSurfaceContext({
      surface: "species_dossier",
      module: "taxonomy",
      object_type: "taxon",
      object_id: "taxon:orchid:cattleya_trianae",
      label: "Cattleya trianae",
      path: "/species/cattleya-trianae",
      metadata: { genus: "Cattleya", species: "trianae", conservation: "EN" },
    });

    expect(step1.current?.object_id).toBe("taxon:orchid:cattleya_trianae");
    expect(step1.trail).toHaveLength(1);

    // 2. User navigates to Atlas viewing Colombian distribution
    const step2 = recordCalyxSurfaceContext({
      surface: "atlas",
      module: "geospatial",
      object_type: "taxon",
      object_id: "taxon:orchid:cattleya_trianae",
      label: "Cattleya trianae (Atlas)",
      path: "/atlas/cattleya-trianae",
      metadata: { lat: 4.5709, lon: -74.2973, country: "CO", occurrenceCount: 142 },
    });

    expect(step2.trail).toHaveLength(2);
    expect(step2.trail[0].surface).toBe("species_dossier");
    expect(step2.trail[1].surface).toBe("atlas");

    // 3. User navigates to Intelligence Graph / Relationship Explorer
    const step3 = recordCalyxSurfaceContext({
      surface: "relationship_explorer",
      module: "knowledge_graph",
      object_type: "taxon",
      object_id: "taxon:orchid:cattleya_trianae",
      label: "Cattleya trianae - Pollinators & Ecology",
      path: "/relationship-explorer/cattleya-trianae",
      metadata: { activePredicate: "has_pollinator", targetTaxon: "Eulaema meriana" },
    });

    expect(step3.trail).toHaveLength(3);
    expect(step3.trail[2].module).toBe("knowledge_graph");

    // 4. Matrix & Lexicon character state resolution
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/matrix-identification/registry/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            characters: [
              {
                character: "char:labellum_color",
                label: "Labellum color pattern",
                concept_id: "concept:magenta_lip",
              },
            ],
          }),
        };
      }
      if (url.includes("/api/lexicon/concepts/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            entry: {
              id: "concept:magenta_lip",
              term: "Magenta Labellum",
              definition: "Intense magenta coloration on the distal portion of the orchid labellum.",
              category: "morphology",
              concept_id: "concept:magenta_lip",
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => null };
    });
    vi.stubGlobal("fetch", mockFetch);

    const receivedOutputs: WorkspaceOutput[] = [];
    const unsubscribe = subscribeWorkspaceOutputs((output) => {
      receivedOutputs.push(output);
    });

    const resolution = await resolveMatrixCharacterLexicon("reg-01", "v1.0", "char:labellum_color");
    expect(resolution.status).toBe("mapped");
    if (resolution.status === "mapped") {
      expect(resolution.concept.term).toBe("Magenta Labellum");

      // 5. Emit output into Calyx Workspace Output Bus
      emitWorkspaceOutput({
        id: "out:lexicon:001",
        kind: "text",
        title: resolution.concept.term,
        subtitle: "Morphology Concept",
        created_at: new Date().toISOString(),
        provenance: {
          source_module: "lexicon",
          source_id: resolution.concept.concept_id ?? undefined,
          evidence_status: "derived",
          generated: false,
        },
        payload: {
          body: resolution.concept.definition,
        },
      });
    }

    // 6. User enters Calyx Adaptive Workspace: full session trail is verified
    expect(receivedOutputs).toHaveLength(1);
    expect(receivedOutputs[0].title).toBe("Magenta Labellum");
    expect(receivedOutputs[0].provenance.source_module).toBe("lexicon");

    const finalSessionContext = readCalyxSessionContext();
    expect(finalSessionContext.current?.object_id).toBe("taxon:orchid:cattleya_trianae");
    expect(finalSessionContext.trail.map((s) => s.surface)).toEqual([
      "species_dossier",
      "atlas",
      "relationship_explorer",
    ]);

    unsubscribe();
  });
});
