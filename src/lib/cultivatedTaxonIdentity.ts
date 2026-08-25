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
 *
 * Labels are not written out in full. A grower states the genus once and lets
 * the rest of the line inherit it, which is what the standard notations mean:
 *
 *   Phragmipedium kovachii 'Daniela' × 'Maria'
 *   Phragmipedium kovachii ('Daniela' × 'Maria')
 *   Phragmipedium besseae × kovachii
 *
 * Each is read here the way a grower means it, because refusing the shorthand
 * refuses the plant. What is never supplied is a genus nobody wrote: an
 * epithet on its own is not a species name, more than one genus can carry the
 * same epithet, and inventing one would be fabricating taxonomy to make a
 * lookup succeed. That case says the genus is missing, which is something the
 * grower can act on, rather than claiming their plant is not a species.
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

/** What an earlier part of the line established, for a later part to inherit. */
type ParentContext = { genus: string | null; species: string | null };

/**
 * Reduce one side of a cross to `Genus species`.
 *
 * `context` carries what the line has already said. A side written as just a
 * cultivar inherits the whole species; a side written as a bare epithet
 * inherits the genus. Neither invents anything the line did not contain.
 *
 * `missingGenus` distinguishes the two ways this returns nothing: a bare
 * epithet with no genus anywhere is a fixable omission, while a grex is not.
 */
function speciesOfOneParent(
  part: string,
  context: ParentContext,
): { species: string | null; missingGenus?: string } {
  const withoutCultivar = part.replace(CULTIVAR_EPITHET, ' ').trim();
  const words = withoutCultivar.split(/\s+/).filter(Boolean);

  // Written as a cultivar alone: `… × 'Maria'`. The species is the one the
  // line already named, which is exactly what that notation means.
  if (words.length === 0) return { species: context.species };

  if (words.length === 1) {
    const only = words[0];
    // A bare epithet: `… × kovachii`. The genus is inherited when the line has
    // one, and is otherwise the thing that is missing.
    if (SPECIES_EPITHET.test(only)) {
      if (context.genus) return { species: `${context.genus} ${only}` };
      return { species: null, missingGenus: only };
    }
    // A genus on its own, or a capitalised grex word. Neither is a species.
    return { species: null };
  }

  const genus = expandGenus(words[0]);
  if (!GENUS.test(genus)) return { species: null };

  const epithet = words[1];
  // `Phragmipedium Memoria Dick Clements` is a grex, not a species. Its epithet
  // is capitalised, and no cultivation literature is published about it.
  if (!SPECIES_EPITHET.test(epithet)) return { species: null };

  // Anything after the species epithet that is not a cultivar has already been
  // stripped; a trailing authority or variety is not a different species, but
  // it is also not something this resolver is willing to interpret.
  return { species: `${genus} ${epithet}` };
}

/**
 * Rewrite `Genus species ('A' × 'B')` into two full parents.
 *
 * The bracketed form is how a sibling cross is normally written, and splitting
 * it on the hybrid sign without expanding it first leaves two fragments that
 * are not parents of anything.
 */
function expandParentheticalCross(cultivated: string): string {
  const bracketed = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(cultivated);
  if (!bracketed) return cultivated;
  const [, prefix, inner] = bracketed;
  if (!prefix.trim() || !HYBRID_SEPARATOR.test(inner)) return cultivated;
  return inner
    .split(HYBRID_SEPARATOR)
    .map((side) => `${prefix.trim()} ${side.trim()}`)
    .join(' × ');
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

  const parts = expandParentheticalCross(cultivated)
    .split(HYBRID_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);

  /** The genus is missing rather than the plant being unidentifiable. */
  const genusMissing = (epithet: string): CultivatedIdentity => ({
    cultivated,
    species: null,
    genus: null,
    relationship: 'none',
    reason: `No genus is written, so "${epithet}" cannot be matched to a species — more than one genus can carry the same epithet. Add the genus in front of it.`,
  });

  if (parts.length === 1) {
    const first = speciesOfOneParent(parts[0], { genus: null, species: null });
    if (first.missingGenus) return genusMissing(first.missingGenus);
    const species = first.species;
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

  // The first parent establishes what the second may inherit. A line that
  // never names a genus establishes nothing, and says so.
  const first = speciesOfOneParent(parts[0], { genus: null, species: null });
  if (first.missingGenus) return genusMissing(first.missingGenus);
  const left = first.species;
  const second = speciesOfOneParent(parts[1], {
    genus: left ? left.split(' ')[0] : null,
    species: left,
  });
  if (second.missingGenus) return genusMissing(second.missingGenus);
  const right = second.species;

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
