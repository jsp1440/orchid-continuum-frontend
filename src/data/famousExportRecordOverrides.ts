import type { LexiconEntry } from './types';

/**
 * Exact term-level values recovered from the complete Famous AI Illustrated
 * Orchid Lexicon source export supplied on 2026-08-11. These are read-only draft
 * migration values. They enrich only the fallback copy; canonical ACTIVE +
 * APPROVED Concept Registry records remain authoritative and the adapter strips
 * migration scientific/review state from matching canonical concepts.
 */
export const famousExportRecordOverrides: Record<string, Partial<LexiconEntry>> = {
  "non-resupination": {
    "preferred_term": "Non-resupination",
    "category": "Floral Morphology",
    "quick_definition": "The condition in which an orchid flower does not undergo the usual reorientation, so that the labellum is not presented in the lowermost position at anthesis.",
    "expanded_definition": "Non-resupinate flowers occur in several unrelated orchid groups. Because the presented orientation depends on the orientation of the inflorescence as well as of the flower, the state should be scored from material seen in life or from images with documented orientation.",
    "synonyms": ["non-resupinate condition"],
    "related_terminology": ["Resupination", "Labellum / Lip", "Column / Gynostemium"],
    "contrasting_terms": ["Resupination"],
    "identification_cautions": ["Confirm inflorescence orientation before scoring the character.", "A single frontal photograph is often insufficient."],
    "certainty_summary": "active_research_area"
  },
  "labellum": {"preferred_term":"Labellum / Lip","category":"Floral Morphology","quick_definition":"The modified median petal of an orchid flower, usually differing markedly from the two lateral petals in shape, colour or texture.","synonyms":["lip"],"related_terminology":["Resupination","Column / Gynostemium","Spur","Callus"]},
  "column": {"preferred_term":"Column / Gynostemium","category":"Floral Morphology","quick_definition":"The structure at the centre of an orchid flower formed by the union of stamen and pistil tissue, bearing the anther and the stigmatic surface.","synonyms":["gynostemium"],"related_terminology":["Anther Cap","Rostellum","Stigma","Pollinium / Pollinia"]},
  "pollinium": {"preferred_term":"Pollinium / Pollinia","category":"Reproductive Biology","quick_definition":"A coherent mass of pollen grains that is transported as a unit; most orchids present their pollen as two or more pollinia rather than as free grains.","related_terminology":["Rostellum","Anther Cap","Column / Gynostemium"]},
  "rostellum": {"preferred_term":"Rostellum","category":"Floral Morphology","quick_definition":"A sterile structure derived from part of the stigma that lies between the anther and the receptive stigmatic surface and is associated with pollinium transfer.","related_terminology":["Column / Gynostemium","Pollinium / Pollinia","Stigma"]},
  "anther-cap": {"preferred_term":"Anther Cap","category":"Floral Morphology","quick_definition":"The cap-like covering over the anther at the apex of the column, which is typically dislodged when pollinia are removed.","related_terminology":["Column / Gynostemium","Pollinium / Pollinia"]},
  "stigma": {"preferred_term":"Stigma","category":"Floral Morphology","quick_definition":"The receptive surface on which pollen is deposited; in orchids it is usually a cavity or depression on the front of the column.","related_terminology":["Column / Gynostemium","Rostellum"]},
  "spur": {"preferred_term":"Spur","category":"Floral Morphology","quick_definition":"A hollow, tubular or sac-like projection, most often from the labellum, which in many orchids is associated with the presentation or storage of nectar.","related_terminology":["Labellum / Lip","Pollination Biology"]},
  "dorsal-sepal": {"preferred_term":"Dorsal Sepal","category":"Floral Morphology","quick_definition":"The median sepal of an orchid flower, generally presented uppermost in a resupinate flower.","related_terminology":["Lateral Sepals","Resupination"]},
  "lateral-sepals": {"preferred_term":"Lateral Sepals","category":"Floral Morphology","quick_definition":"The two sepals flanking the median (dorsal) sepal; in some groups they are fused or extended into distinctive structures.","related_terminology":["Dorsal Sepal","Resupination"]},
  "petals": {"preferred_term":"Petals","category":"Floral Morphology","quick_definition":"The inner perianth segments; in orchids the median petal is modified as the labellum, leaving two lateral petals.","related_terminology":["Labellum / Lip","Dorsal Sepal"]},
  "velamen": {"preferred_term":"Velamen","category":"Anatomy","quick_definition":"The multilayered outer covering of dead cells on many orchid roots, associated with water uptake and protection of the underlying tissue.","related_terminology":["Epiphyte","Rhizome"]},
  "pseudobulb": {"preferred_term":"Pseudobulb","category":"Vegetative Morphology","quick_definition":"A thickened, above-ground stem segment found in many sympodial orchids, associated with water and nutrient storage.","related_terminology":["Sympodial","Rhizome"]},
  "rhizome": {"preferred_term":"Rhizome","category":"Vegetative Morphology","quick_definition":"A horizontal stem, at or below the substrate surface, from which shoots and roots arise.","related_terminology":["Pseudobulb","Sympodial"]},
  "epiphyte": {"preferred_term":"Epiphyte","category":"Ecology","quick_definition":"A plant that grows upon another plant, typically on bark or branches, without drawing water or nutrients from the host tissue.","related_terminology":["Lithophyte","Terrestrial","Velamen"]},
  "lithophyte": {"preferred_term":"Lithophyte","category":"Ecology","quick_definition":"A plant that grows on rock surfaces or in rock crevices.","related_terminology":["Epiphyte","Terrestrial"]},
  "terrestrial": {"preferred_term":"Terrestrial","category":"Ecology","quick_definition":"Growing in soil or in accumulated organic material on the ground, rather than on other plants or on rock.","related_terminology":["Epiphyte","Lithophyte"]},
  "monopodial": {"preferred_term":"Monopodial","category":"Vegetative Morphology","quick_definition":"A growth pattern in which a single shoot continues to extend from an apical growing point, adding leaves successively.","related_terminology":["Sympodial"],"contrasting_terms":["Sympodial"]},
  "sympodial": {"preferred_term":"Sympodial","category":"Vegetative Morphology","quick_definition":"A growth pattern in which successive shoots arise from a rhizome, each shoot completing its growth before the next develops.","related_terminology":["Monopodial","Rhizome","Pseudobulb"],"contrasting_terms":["Monopodial"]},
  "form": {"preferred_term":"Form","category":"Floral Morphology","quick_definition":"In orchid judging and description, the overall shape and arrangement of the floral segments.","related_terminology":["Symmetry","Substance","Texture"]},
  "symmetry": {"preferred_term":"Symmetry","category":"Floral Morphology","quick_definition":"The correspondence of parts about an axis or plane; orchid flowers are characteristically bilaterally symmetrical (zygomorphic).","related_terminology":["Form"]},
  "texture": {"preferred_term":"Texture","category":"Floral Morphology","quick_definition":"The surface quality of a floral segment, described in terms such as matte, glossy, waxy or crystalline.","related_terminology":["Substance","Form"]},
  "substance": {"preferred_term":"Substance","category":"Floral Morphology","quick_definition":"The apparent thickness, firmness and durability of floral tissue.","related_terminology":["Texture","Form"]},
  "anthesis": {"preferred_term":"Anthesis","category":"Development","quick_definition":"The period during which a flower is open and functional.","related_terminology":["Resupination"]},
  "inflorescence": {"preferred_term":"Inflorescence","category":"Vegetative Morphology","quick_definition":"The flower-bearing portion of a plant, including its axis, bracts and arrangement of flowers.","related_terminology":["Resupination","Dorsal Sepal"]},
  "zygomorphic": {"preferred_term":"Zygomorphic","category":"Floral Morphology","quick_definition":"Describing a flower divisible into mirror halves along a single plane only; bilaterally symmetrical.","related_terminology":["Symmetry"]},
  "gravitropism": {"preferred_term":"Gravitropism","category":"Physiology","quick_definition":"A directional growth response of a plant organ to gravity.","related_terminology":["Resupination"],"certainty_summary":"active_research_area"},
  "auxin": {"preferred_term":"Auxin","category":"Physiology","quick_definition":"A class of plant growth regulator involved in cell elongation and in directional growth responses.","related_terminology":["Gravitropism","Resupination"],"certainty_summary":"active_research_area"},
  "mycorrhiza": {"preferred_term":"Mycorrhiza","category":"Mycorrhizal Biology","quick_definition":"A symbiotic association between a plant root and a fungus; orchid seed germination in nature is typically dependent on such an association.","related_terminology":["Protocorm"]},
  "protocorm": {"preferred_term":"Protocorm","category":"Development","quick_definition":"The small, tuber-like structure formed by a germinating orchid seed before the first leaf and root develop.","related_terminology":["Mycorrhiza"]},
  "holotype": {"preferred_term":"Holotype","category":"Nomenclature","quick_definition":"The single specimen designated by an author as the nomenclatural type of a new name.","related_terminology":["Basionym"]},
  "basionym": {"preferred_term":"Basionym","category":"Nomenclature","quick_definition":"The previously published name on which a new combination or new status is based.","related_terminology":["Holotype"]},
  "grex": {"preferred_term":"Grex","category":"Nomenclature","quick_definition":"A category used in orchid horticulture for all progeny of a particular cross between two named parents."},
  "sensu-lato": {"preferred_term":"Sensu lato","category":"Botanical Latin","quick_definition":"Latin, \"in the broad sense\"; indicates a name applied in a broadly circumscribed sense.","related_terminology":["Sensu stricto"]},
  "sensu-stricto": {"preferred_term":"Sensu stricto","category":"Botanical Latin","quick_definition":"Latin, \"in the strict sense\"; indicates a name applied in a narrowly circumscribed sense.","related_terminology":["Sensu lato"]},
  "in-situ": {"preferred_term":"In situ","category":"Conservation Terminology","quick_definition":"Latin, \"in place\"; conservation of populations within their natural habitat.","related_terminology":["Ex situ"]},
  "ex-situ": {"preferred_term":"Ex situ","category":"Conservation Terminology","quick_definition":"Conservation of plants or genetic material outside the natural habitat, such as in cultivation or seed banks.","related_terminology":["In situ"]},
  "pollinator-syndrome": {"preferred_term":"Pollination syndrome","category":"Pollination Biology","quick_definition":"A recurring suite of floral traits associated with a particular class of pollinator.","related_terminology":["Spur","Resupination"],"certainty_summary":"competing_hypotheses"},
  "deceptive-pollination": {"preferred_term":"Deceptive pollination","category":"Pollination Biology","quick_definition":"Pollination achieved without a food reward, for example by mimicry of a mate, a rival, a food source or a brood site.","certainty_summary":"supported_interpretation"},
  "keiki": {"preferred_term":"Keiki","category":"Orchid Culture","quick_definition":"A vegetative offset produced on an inflorescence or stem, which can be separated to form a new plant."},
  "bark-mix": {"preferred_term":"Bark mix","category":"Orchid Culture","quick_definition":"A coarse, free-draining potting medium based on graded bark, widely used for epiphytic orchids in cultivation.","related_terminology":["Epiphyte"]},
  "cam-photosynthesis": {"preferred_term":"CAM photosynthesis","category":"Physiology","quick_definition":"Crassulacean acid metabolism: a photosynthetic pathway in which carbon dioxide is taken up at night, reducing daytime water loss; reported in many epiphytic orchids.","related_terminology":["Epiphyte"]},
  "character-state": {"preferred_term":"Character state","category":"Taxonomy","quick_definition":"One of the alternative conditions that a defined morphological or other character may take in a comparative analysis.","related_terminology":["Resupination","Non-resupination"]},
  "convergent-evolution": {"preferred_term":"Convergent evolution","category":"Evolution","quick_definition":"The independent origin of similar traits in lineages that do not share those traits through common ancestry.","related_terminology":["Resupination"]}
} as Record<string, Partial<LexiconEntry>>;
