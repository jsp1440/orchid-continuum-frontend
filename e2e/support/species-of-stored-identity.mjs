/**
 * Reduce a stored collection identity to the species requirements are about.
 *
 * Server-side half of the rule in src/lib/cultivatedTaxonIdentity.ts. The
 * server has the same problem the client does: a real record reads
 * `Phragmipedium kovachii 'Daniela' x Phragmipedium kovachii 'Maria'`, and
 * looking that string up finds nothing. Both parents being clones of one
 * species means the species is what is published; two different species means
 * nothing published describes the plant, and returning either parent's bounds
 * would be evidence about something else.
 *
 * It lives in its own module, rather than inside reference-backend.mjs, so
 * src/lib/cultivatedIdentityBackendParity.test.ts can hold the two
 * implementations against each other. They drifted once already: the client
 * learned the label shorthands growers actually write and this did not, which
 * would have left a shorthand-recorded plant resolving on screen and finding
 * no requirements on the server.
 *
 * This is the reference backend, not the deployed one. Issue #451 tracks the
 * same rule reaching the real service.
 */
/**
 * Mirrored from src/lib/cultivatedTaxonIdentity.ts. Keep the two in step; the
 * parity test above is what enforces it.
 */
const MAX_IDENTITY_CHARACTERS = 240;
const UNSAFE_PUNCTUATION = /[<>{}\\]/;
const GENUS = /^[A-Z][a-z-]+$/;
const SPECIES_EPITHET = /^[a-z][a-z-]+$/;
const HYBRID_SEPARATOR = /\s(?:\u00d7|x|X)\s/;
const CULTIVAR_EPITHET = /\s*(?:'[^']*'|\u2018[^\u2019]*\u2019|"[^"]*")\s*/g;
const GENUS_ABBREVIATIONS = Object.freeze({
  "phrag.": "Phragmipedium",
  phrag: "Phragmipedium",
  "paph.": "Paphiopedilum",
  paph: "Paphiopedilum",
  "phal.": "Phalaenopsis",
  phal: "Phalaenopsis",
  "catt.": "Cattleya",
  "c.": "Cattleya",
  "den.": "Dendrobium",
  "onc.": "Oncidium",
  "masd.": "Masdevallia",
  "bulb.": "Bulbophyllum",
});

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

/**
 * Split a line into the parents to compare, and the genus they inherit.
 *
 * A bracketed line is one of two different things:
 *
 *   Phragmipedium kovachii ('Daniela' x 'Maria')   a sibling cross
 *   Phrag. Ingrid Suarez (humboldtii x kovachii)   a grex, with its parentage
 *
 * In the first the bracket holds cultivars and each parent inherits the whole
 * prefix. In the second it holds species and the prefix is a grex name, so
 * only the genus carries — prepending the grex words made both sides collapse
 * to the prefix and resolved an interspecific cross to one of its parents.
 */
function partsOfCross(cultivated) {
  const split = (line) => line.split(HYBRID_SEPARATOR).map((part) => part.trim()).filter(Boolean);

  const bracketed = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(cultivated);
  if (!bracketed) return { parts: split(cultivated), seedGenus: null };

  const prefix = bracketed[1].trim();
  const inner = bracketed[2];
  if (!prefix || !HYBRID_SEPARATOR.test(inner)) return { parts: split(cultivated), seedGenus: null };

  const sides = split(inner);
  const everySideIsCultivarOnly = sides.every((side) => {
    CULTIVAR_EPITHET.lastIndex = 0;
    return side.replace(CULTIVAR_EPITHET, " ").trim() === "";
  });
  if (everySideIsCultivarOnly) {
    return { parts: sides.map((side) => `${prefix} ${side}`), seedGenus: null };
  }

  const genus = GENUS_ABBREVIATIONS[(prefix.split(/\s+/)[0] ?? "").toLowerCase()]
    ?? (prefix.split(/\s+/)[0] ?? "");
  return { parts: sides, seedGenus: GENUS.test(genus) ? genus : null };
}

/**
 * A later part inherits what an earlier part established: a bare cultivar
 * takes the whole species, a bare epithet takes the genus. A genus nobody
 * wrote is never supplied, because an epithet alone is not a species name.
 */
function speciesOfOnePart(part, context) {
  const words = part.replace(CULTIVAR_EPITHET, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return context.species;
  if (words.length === 1) {
    const only = words[0];
    if (!SPECIES_EPITHET.test(only)) return null;
    return context.genus ? `${context.genus} ${only}` : null;
  }
  const genus = GENUS_ABBREVIATIONS[words[0].toLowerCase()] ?? words[0];
  if (!GENUS.test(genus) || !SPECIES_EPITHET.test(words[1])) return null;
  return `${genus} ${words[1]}`;
}

export function speciesOfStoredIdentity(stored) {
  const cultivated = String(stored ?? "").replace(/\s+/g, " ").trim();
  if (
    !cultivated ||
    cultivated.length > MAX_IDENTITY_CHARACTERS ||
    hasControlCharacter(cultivated) ||
    UNSAFE_PUNCTUATION.test(cultivated)
  ) {
    return null;
  }

  const { parts, seedGenus } = partsOfCross(cultivated);

  const left = speciesOfOnePart(parts[0], { genus: seedGenus, species: null });
  if (parts.length === 1) return left;
  if (parts.length !== 2) return null;
  const right = speciesOfOnePart(parts[1], {
    genus: left ? left.split(" ")[0] : seedGenus,
    species: left,
  });
  // Two different species means nothing published describes the plant, and
  // returning either parent's bounds would be evidence about a different one.
  return left && right && left === right ? left : null;
}
