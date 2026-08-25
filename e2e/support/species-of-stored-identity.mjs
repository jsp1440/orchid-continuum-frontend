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

/** `Genus species ('A' x 'B')` is how a sibling cross is normally written. */
function expandParentheticalCross(cultivated) {
  const bracketed = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(cultivated);
  if (!bracketed) return cultivated;
  const [, prefix, inner] = bracketed;
  if (!prefix.trim() || !HYBRID_SEPARATOR.test(inner)) return cultivated;
  return inner
    .split(HYBRID_SEPARATOR)
    .map((side) => `${prefix.trim()} ${side.trim()}`)
    .join(" \u00d7 ");
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

  const parts = expandParentheticalCross(cultivated)
    .split(HYBRID_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);

  const left = speciesOfOnePart(parts[0], { genus: null, species: null });
  if (parts.length === 1) return left;
  if (parts.length !== 2) return null;
  const right = speciesOfOnePart(parts[1], {
    genus: left ? left.split(" ")[0] : null,
    species: left,
  });
  // Two different species means nothing published describes the plant, and
  // returning either parent's bounds would be evidence about a different one.
  return left && right && left === right ? left : null;
}
