import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadPaperBotanicaPackage,
  fetchPaperBotanicaCollection,
  fetchPaperBotanicaProfile,
  PAPERBOTANICA_REVIEW_STATE,
} from "./api";
import { parsePaperBotanicaGlb } from "./glb";

const mockedFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockedFetch);

const species = {
  species_id: "calypso-bulbosa",
  scientific_name: "Calypso bulbosa",
  accepted_name: "Calypso bulbosa",
  common_name: "Fairy Slipper",
  story_name: "Fairy Slipper",
  readiness: "READY FOR RECONSTRUCTION",
  publication_state: PAPERBOTANICA_REVIEW_STATE,
  organ_count: 11,
  organ_evidence_classes: ["HYPOTHETICAL"],
  missing_evidence_views: ["side"],
  links: {
    canonical_species_resolve: "/api/platform/federation/resolve-species?name=Calypso%20bulbosa",
    paperbotanica_evidence: "/api/paperbotanica/species/calypso-bulbosa/evidence",
    paperbotanica_model: "/api/paperbotanica/species/calypso-bulbosa/model.glb",
    paperbotanica_package: "/api/paperbotanica/species/calypso-bulbosa/package",
  },
};

beforeEach(() => mockedFetch.mockReset());

describe("PaperBotanica API trust boundary", () => {
  it("accepts the versioned collection and required review state", async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({
      schema_version: "paperbotanica-collection-api/v1",
      algorithm_version: "paperbotanica-construction/v1",
      species_count: 1,
      species: [species],
    }), { status: 200 }));
    const result = await fetchPaperBotanicaCollection();
    expect(result.species[0].species_id).toBe("calypso-bulbosa");
  });

  it("fails closed when scientific review state is absent", async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({
      schema_version: "paperbotanica-collection-api/v1",
      species_count: 1,
      species: [{ ...species, publication_state: "APPROVED FOR PUBLICATION" }],
    }), { status: 200 }));
    await expect(fetchPaperBotanicaCollection()).rejects.toThrow("botanical-review state");
  });

  it("loads evidence from the backend profile rather than local fixtures", async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({ ...species, sources: [{}], organs: [{}] }), { status: 200 }));
    const profile = await fetchPaperBotanicaProfile("calypso-bulbosa");
    expect(profile.sources).toHaveLength(1);
  });

  it("refuses a package without its construction digest", async () => {
    mockedFetch.mockResolvedValue(new Response("zip", {
      status: 200,
      headers: { "X-PaperBotanica-Publication-State": PAPERBOTANICA_REVIEW_STATE },
    }));
    await expect(downloadPaperBotanicaPackage(species)).rejects.toThrow("construction digest");
  });
});

describe("PaperBotanica GLB reader", () => {
  it("reads the backend's organ-selectable triangle primitives", () => {
    const document = {
      asset: { version: "2.0" },
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1] } }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 1, componentType: 5125, count: 3, type: "SCALAR" },
      ],
      bufferViews: [{ byteOffset: 0, byteLength: 36 }, { byteOffset: 36, byteLength: 12 }],
      buffers: [{ byteLength: 48 }],
    };
    const json = new TextEncoder().encode(JSON.stringify(document));
    const jsonPadded = new Uint8Array(Math.ceil(json.length / 4) * 4);
    jsonPadded.fill(0x20);
    jsonPadded.set(json);
    const buffer = new ArrayBuffer(12 + 8 + jsonPadded.length + 8 + 48);
    const view = new DataView(buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, buffer.byteLength, true);
    view.setUint32(12, jsonPadded.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(buffer, 20, jsonPadded.length).set(jsonPadded);
    const binaryHeader = 20 + jsonPadded.length;
    view.setUint32(binaryHeader, 48, true);
    view.setUint32(binaryHeader + 4, 0x004e4942, true);
    const binaryStart = binaryHeader + 8;
    [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => view.setFloat32(binaryStart + index * 4, value, true));
    [0, 1, 2].forEach((value, index) => view.setUint32(binaryStart + 36 + index * 4, value, true));
    const model = parsePaperBotanicaGlb(buffer);
    expect(model.vertices).toHaveLength(9);
    expect(Array.from(model.primitives[0].indices)).toEqual([0, 1, 2]);
    expect(model.primitives[0].color).toEqual([0.2, 0.4, 0.6, 1]);
  });
});
