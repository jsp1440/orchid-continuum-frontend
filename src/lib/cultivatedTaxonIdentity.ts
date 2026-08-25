/**
 * Telling what a grower has from what science knows about it.
 *
 * A collection record and a scientific record are not the same claim. The
 * acceptance specimen for this work is a real plant labelled
 *
 *   Phragmipedium kovachii 'Daniela' × Phragmipedium kovachii 'Maria'
 *
 * and both halves of that matter. The full string is what the grower has —
 * two named clones of one species, crossed — and reducing the stored record to
 * "Phragmipedium kovachii" would throw away the parentage they paid for and
 * keep records on. But no literature describes 'Daniela' × 'Maria'; what
 * literature describes is the species. So outward links to cultivation
 * requirements, Atlas and taxon knowledge must ask about
 * Phragmipedium kovachii while the collection keeps the whole name.
 *
 * The rule that matters scientifically is the one about crosses between
 * different species. `Phragmipedium besseae × Phragmipedium kovachii` has no
 * single species' requirements, and picking either parent's would be inventing
 * evidence for a plant nothing has been published about. Those resolve to no
 * species-level identity at all, which callers must treat as "cannot look this
 * up" rather than as a reason to guess.
 */

const MAX_IDENTITY_CHARACTERS = 240;
const UNSAFE_PUNCTUATION = /[<>{}\\]/;

/** Genus, or genus + species epithet. */
const GENUS = /^[A-Z][a-z-]+$/;
const SPECIES_EPITHET = /^[a-z][a-z-]+$/;

/** The multiplication sign, and the lowercase x growers type instead. */
const HYBRID_SEPARATOR = /\s(?:×|x|X)\s/;

/** A cultivar epithet: 'Daniela', "Maria", or the AM/HCC style suffix. */
const CULTIVAR_EPITHET = /\s*(?:'[^']*'|‘[^’]*’|"[^"]*")\s*/g;

/** Abbreviations growers write on labels. */
const GENUS_ABBREVIATIONS: Readonly<Record<string, string>> = Object.freeze({
  'phrag.': 'Phragmipedium',
  phrag: 'Phragmipedium',
  'paph.': 'Paphiopedilum',
  paph: 'Paphiopedilum',
  'phal.': 'Phalaenopsis',
  phal: 'Phalaenopsis',
  'catt.': 'Cattleya',
  'c.': 'Cattleya',
  'den.': 'Dendrobium',
  'onc.': 'Oncidium',
  'masd.': 'Masdevallia',
  'bulb.': 'Bulbophyllum',
});

export type CultivatedIdentity = {
  /** Exactly what the grower recorded, normalised only for whitespace. */
  cultivated: string;
  /**
   * The species this plant may be asked about, or null when nothing may be.
   *
   * Null for a cross between different species, for a grex, and for a
   * genus-only record. Null means "no species-level lookup is defensible",
   * never "look up something close".
   */
  species: string | null;
  genus: string | null;
  /**
   * How the species was arrived at, so a reader is never left guessing whether
   * a requirement was published about their plant or about its parent.
   */
  relationship: 'species' | 'cultivar_of_species' | 'cross_within_species' | 'none';
  /** Why there is no species, in words, when there is none. */
  reason?: string;
};

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function expandGenus(word: string): string {
  return GENUS_ABBREVIATIONS[word.toLowerCase()] ?? word;
}

/**
 * Reduce one side of a cross to `Genus species`, or null when that side is not
 * a species — a grex epithet is capitalised where a species epithet is not, and
 * that difference is the whole signal.
 */
function speciesOfOneParent(part: string): string | null {
  const withoutCultivar = part.replace(CULTIVAR_EPITHET, ' ').trim();
  const words = withoutCultivar.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  const genus = expandGenus(words[0]);
  if (!GENUS.test(genus)) return null;

  const epithet = words[1];
  // `Phragmipedium Memoria Dick Clements` is a grex, not a species. Its epithet
  // is capitalised, and no cultivation literature is published about it.
  if (!SPECIES_EPITHET.test(epithet)) return null;

  // Anything after the species epithet that is not a cultivar has already been
  // stripped; a trailing authority or variety is not a different species, but
  // it is also not something this resolver is willing to interpret.
  return `${genus} ${epithet}`;
}

/**
 * Resolve a stored collection identity into what may be asked about it.
 *
 * The stored string is returned untouched apart from whitespace. Nothing here
 * ever rewrites what the grower recorded.
 */
export function resolveCultivatedIdentity(
  stored: string | null | undefined,
): CultivatedIdentity | null {
  const cultivated = (stored ?? '').replace(/\s+/g, ' ').trim();
  if (
    !cultivated ||
    cultivated.length > MAX_IDENTITY_CHARACTERS ||
    hasControlCharacter(cultivated) ||
    UNSAFE_PUNCTUATION.test(cultivated)
  ) {
    return null;
  }

  const parts = cultivated.split(HYBRID_SEPARATOR).map((part) => part.trim()).filter(Boolean);

  if (parts.length === 1) {
    const species = speciesOfOneParent(parts[0]);
    if (!species) {
      return {
        cultivated,
        species: null,
        genus: null,
        relationship: 'none',
        reason:
          'This is a genus or a grex rather than a species, and cultivation evidence is published about species.',
      };
    }
    const carriedCultivar = CULTIVAR_EPITHET.test(cultivated);
    CULTIVAR_EPITHET.lastIndex = 0;
    return {
      cultivated,
      species,
      genus: species.split(' ')[0],
      relationship: carriedCultivar ? 'cultivar_of_species' : 'species',
    };
  }

  if (parts.length !== 2) {
    return {
      cultivated,
      species: null,
      genus: null,
      relationship: 'none',
      reason: 'A cross of more than two parents has no single species to look up.',
    };
  }

  const [left, right] = parts.map(speciesOfOneParent);
  if (!left || !right) {
    return {
      cultivated,
      species: null,
      genus: null,
      relationship: 'none',
      reason:
        'At least one parent of this cross is not a species, so no published species requirement covers it.',
    };
  }

  if (left !== right) {
    // The rule that matters. Nothing has been published about this plant, and
    // either parent's requirements would be evidence about a different plant.
    return {
      cultivated,
      species: null,
      genus: left.split(' ')[0] === right.split(' ')[0] ? left.split(' ')[0] : null,
      relationship: 'none',
      reason: `This is a cross between ${left} and ${right}. No single species' requirements describe it, and using either parent's would be evidence about a different plant.`,
    };
  }

  // Both parents are the same species — two named clones of it crossed. The
  // species' requirements are the nearest published thing, and the caller is
  // told that is what this is.
  return {
    cultivated,
    species: left,
    genus: left.split(' ')[0],
    relationship: 'cross_within_species',
  };
}
