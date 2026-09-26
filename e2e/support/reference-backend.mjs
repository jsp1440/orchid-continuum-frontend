/**
 * A local reference backend for the Conservatory browser journey.
 *
 * WHAT THIS IS: a stand-in that answers the endpoints `src/pages/MyConservatory.tsx`
 * calls, in the shapes its TypeScript contract declares, plus the small slice of
 * the identity API that `@supabase/supabase-js` uses to sign a browser in. It
 * exists so the signed-in journey can be driven in a real browser.
 *
 * WHAT THIS IS NOT: evidence about the deployed backend. It proves the frontend
 * journey works against a backend that honours the contract. It proves nothing
 * about whether the deployed service honours it. Do not cite a passing run here
 * as deployed-backend evidence.
 *
 * State lives in this process, not the browser, so signing out and back in — or
 * reloading — reads the same records back, which is the point of the
 * persistence step in the journey.
 */
import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { speciesOfStoredIdentity } from "./species-of-stored-identity.mjs";

const store = {
  users: new Map(),      // email -> { id, email, password }
  tokens: new Map(),     // access_token -> userId
  data: new Map(),       // userId -> collection
};

function collectionFor(userId) {
  if (!store.data.has(userId)) {
    store.data.set(userId, {
      plants: [], locations: [], placements: [], events: [], measurements: [], evaluations: [],
      readings: [], photographs: [], locationHistory: [], accessionSeq: 0,
    });
  }
  return store.data.get(userId);
}

/* ---------------------------------------------------------------- taxa ---- */

/**
 * A deliberately tiny cultivation-requirement table.
 *
 * Only one taxon is known, so the journey can exercise both branches that
 * matter: a taxon with evidence produces real verdicts, and a taxon without
 * produces `unassessable` rather than a quiet pass.
 */
const REQUIREMENTS = {
  // Fixture bounds, not published evidence. This server is a test double, and
  // nothing here should ever be cited as what the literature says about a
  // species. The numbers exist so the comparison has two sides.
  "phragmipedium kovachii": {
    temperature_c: { min: [{ value: 13, evidence_strength: "moderate" }], max: [{ value: 24, evidence_strength: "moderate" }] },
    relative_humidity_pct: { min: [{ value: 60, evidence_strength: "moderate" }], max: [{ value: 85, evidence_strength: "moderate" }] },
  },
  "phalaenopsis amabilis": {
    temperature_c: { min: [{ value: 16, evidence_strength: "strong" }], max: [{ value: 24, evidence_strength: "strong" }] },
    relative_humidity_pct: { min: [{ value: 50, evidence_strength: "moderate" }], max: [{ value: 85, evidence_strength: "moderate" }] },
  },
};

const DOSSIER_FIXTURE_TAXON_ID = "taxon:world-plants:phalaenopsis-amabilis";
const DOSSIER_FIXTURE_NAME = "Phalaenopsis amabilis";

function unavailableDossierSection(reason) {
  return {
    state: "unavailable",
    summary: null,
    items: [],
    receipts: [],
    unavailable_reason: reason,
  };
}

function dossierFixture() {
  const unavailable = () => unavailableDossierSection(
    "The provider-free browser fixture supplies identity continuity only; scientific evidence is unavailable.",
  );
  return {
    contract_version: "oc-species-dossier-v1",
    generated_at: "2026-01-01T00:00:00.000Z",
    identity: {
      taxon_id: DOSSIER_FIXTURE_TAXON_ID,
      display_name: DOSSIER_FIXTURE_NAME,
      full_scientific_name: DOSSIER_FIXTURE_NAME,
      accepted_name: DOSSIER_FIXTURE_NAME,
      authorship: null,
      rank: "species",
      genus: "Phalaenopsis",
      specific_epithet: "amabilis",
      taxonomic_status: "fixture_identity_only",
      synonyms: [],
    },
    nomenclature: unavailable(),
    protologue: unavailable(),
    type_material: unavailable(),
    historical_media: unavailable(),
    living_media: unavailable(),
    morphology: unavailable(),
    distribution: unavailable(),
    ecology: unavailable(),
    phenology: unavailable(),
    pollinators: unavailable(),
    mycorrhizae: unavailable(),
    conservation: unavailable(),
    literature: unavailable(),
    cultivation: unavailable(),
    knowledge_graph: unavailable(),
    calyx_narrative: unavailable(),
    research_gaps: unavailable(),
    atlas: {
      contract_version: "oc-species-atlas-v1",
      taxon_id: DOSSIER_FIXTURE_TAXON_ID,
      generated_at: "2026-01-01T00:00:00.000Z",
      layers: [],
      unavailable_layers: ["all"],
      provenance: [],
    },
    related_species: [],
    matrix_url: "/orchid-identification?untrusted=discarded#discarded",
    partner_references: [],
    provenance: [],
  };
}

async function publicSpeciesRoute(req, res, url) {
  const path = url.pathname;
  let match = /^\/api\/species\/([^/]+)$/.exec(path);
  if (match && req.method === "GET") {
    return json(res, 200, {
      taxonomy_id: decodeURIComponent(match[1]),
      canonical_name: DOSSIER_FIXTURE_NAME,
      scientific_name: DOSSIER_FIXTURE_NAME,
      genus: "Phalaenopsis",
      species: "amabilis",
      family: "Orchidaceae",
      conservation_status: null,
      region: null,
      habitat: null,
      description: "Provider-free identity-continuity fixture; no scientific description supplied.",
    });
  }
  match = /^\/api\/mycorrhizal\/([^/]+)$/.exec(path);
  if (match && req.method === "GET") return json(res, 404, { detail: "Fixture evidence unavailable." });

  match = /^\/api\/platform\/species\/([^/]+)\/dossier$/.exec(path);
  if (match && req.method === "GET") return json(res, 200, dossierFixture());

  if (path === "/api/platform/federation/resolve-species" && req.method === "GET") {
    return json(res, 200, {
      status: "unresolved",
      incoming_name: null,
      matched_name: null,
      match_state: "none",
      taxon_id: null,
      canonical_dossier_url: null,
      candidates: [],
      partner_slug: null,
      reciprocal_source_url: null,
      explanation: "No federation source is configured in the provider-free fixture.",
    });
  }
  return fail(res, 404, "no_such_endpoint", `The reference backend does not answer ${req.method} ${path}.`);
}

function requirementsFor(taxon) {
  const direct = REQUIREMENTS[(taxon || "").trim().toLowerCase()];
  if (direct) return direct;
  const species = speciesOfStoredIdentity(taxon);
  return species ? REQUIREMENTS[species.toLowerCase()] || null : null;
}

/* ------------------------------------------------------------- helpers ---- */

const json = (res, status, body, extra = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...cors(), ...extra });
  res.end(payload);
};

const fail = (res, status, code, message) =>
  json(res, status, { detail: { code, message } });

/**
 * `*` is not usable here: the Conservatory client sends `credentials:
 * "include"`, and a browser refuses a credentialed response whose
 * Allow-Origin is a wildcard. The request's own origin is echoed instead.
 */
function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || requestOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    // Echo whatever the preflight asked for. supabase-js adds headers
    // (accept-profile, x-retry-count, …) that vary by version, and a fixed
    // list silently blocks the request instead of failing loudly.
    "Access-Control-Allow-Headers": requestHeaders || "authorization, apikey, content-type, prefer",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "content-length, content-type",
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function bearer(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return store.tokens.get(token) || null;
}

/* ---------------------------------------------------------- identity ------ */

function issueSession(user) {
  const access_token = `at_${randomUUID()}`;
  const refresh_token = `rt_${randomUUID()}`;
  store.tokens.set(access_token, user.id);
  store.tokens.set(refresh_token, user.id);
  return {
    access_token,
    refresh_token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: publicUser(user),
  };
}

function publicUser(user) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: new Date(0).toISOString(),
    phone: "",
    confirmed_at: new Date(0).toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: new Date(0).toISOString(),
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  };
}

async function identityRoute(req, res, url) {
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  const body = req.method === "POST" ? safeJson(await readBody(req)) : {};

  if (path === "/signup") {
    const email = String(body.email || "").toLowerCase();
    if (store.users.has(email)) return json(res, 400, { error: "user_already_exists", msg: "User already registered" });
    const user = { id: randomUUID(), email, password: String(body.password || "") };
    store.users.set(email, user);
    return json(res, 200, issueSession(user));
  }

  if (path === "/token") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "refresh_token") {
      const userId = store.tokens.get(String(body.refresh_token || ""));
      const user = [...store.users.values()].find((candidate) => candidate.id === userId);
      if (!user) return json(res, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
      return json(res, 200, issueSession(user));
    }
    const email = String(body.email || "").toLowerCase();
    const user = store.users.get(email);
    if (!user || user.password !== String(body.password || "")) {
      return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
    }
    return json(res, 200, issueSession(user));
  }

  if (path === "/user") {
    const userId = bearer(req);
    const user = [...store.users.values()].find((candidate) => candidate.id === userId);
    if (!user) return json(res, 401, { message: "invalid claim: missing sub claim" });
    return json(res, 200, publicUser(user));
  }

  if (path === "/logout") {
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) store.tokens.delete(header.slice(7));
    res.writeHead(204, cors());
    return res.end();
  }

  if (path === "/settings") {
    return json(res, 200, { external: {}, disable_signup: false, mailer_autoconfirm: true });
  }

  return json(res, 404, { message: `no identity route ${path}` });
}

function safeJson(buffer) {
  try { return JSON.parse(buffer.toString("utf8") || "{}"); } catch { return {}; }
}

/* -------------------------------------------------------------- EXIF ------ */

/**
 * Remove every APPn marker from a JPEG, which is where EXIF — and therefore
 * where the photograph was taken — lives.
 *
 * A file we cannot parse as a JPEG is refused rather than stored, because
 * storing it would mean publishing a grower's location on the strength of
 * having not looked.
 */
function stripJpegMetadata(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const out = [buffer.subarray(0, 2)];
  let takenAt = null;
  let index = 2;
  while (index < buffer.length) {
    if (buffer[index] !== 0xff) return null;
    const marker = buffer[index + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { index += 2; continue; }
    if (marker === 0xda) { out.push(buffer.subarray(index)); break; }
    const length = buffer.readUInt16BE(index + 2);
    const segment = buffer.subarray(index, index + 2 + length);
    if (marker >= 0xe0 && marker <= 0xef) {
      const text = segment.toString("latin1");
      const stamp = /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text);
      if (stamp) takenAt = `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`;
    } else {
      out.push(segment);
    }
    index += 2 + length;
  }
  return { bytes: Buffer.concat(out), takenAt };
}

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) return null;
  const boundary = `--${match[1] || match[2]}`;
  const parts = [];
  let cursor = buffer.indexOf(boundary);
  while (cursor !== -1) {
    const start = cursor + boundary.length;
    if (buffer.subarray(start, start + 2).toString() === "--") break;
    const headerEnd = buffer.indexOf("\r\n\r\n", start);
    if (headerEnd === -1) break;
    const headers = buffer.subarray(start, headerEnd).toString("latin1");
    const next = buffer.indexOf(boundary, headerEnd);
    if (next === -1) break;
    const content = buffer.subarray(headerEnd + 4, next - 2);
    const name = /name="([^"]+)"/.exec(headers)?.[1];
    const filename = /filename="([^"]*)"/.exec(headers)?.[1];
    const type = /Content-Type:\s*([^\r\n]+)/i.exec(headers)?.[1];
    if (name) parts.push({ name, filename, type, content });
    cursor = next;
  }
  return parts;
}

/* --------------------------------------------------------- assessment ----- */

function currentLocationOf(collection, plantId) {
  const placements = collection.placements
    .filter((placement) => placement.plant_id === plantId && !placement.corrected_by_id);
  return placements.length ? placements[placements.length - 1] : null;
}

function standingReadings(collection, locationId) {
  return collection.readings.filter(
    (reading) => reading.location_id === locationId && !reading.superseded_by_id,
  );
}

function ageInDays(instant) {
  if (!instant) return null;
  const then = Date.parse(instant);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/** Compare one location's standing readings against one taxon's requirements. */
function assess(collection, locationId, taxon) {
  const bounds = requirementsFor(taxon);
  const readings = locationId ? standingReadings(collection, locationId) : [];
  const variables = new Set([...Object.keys(bounds || {}), ...readings.map((r) => r.variable)]);
  const assessments = [];
  for (const variable of variables) {
    const reading = readings.find((candidate) => candidate.variable === variable);
    const bound = bounds?.[variable];
    const condition = reading
      ? { value: reading.value, unit: reading.unit, origin: reading.origin }
      : undefined;
    const condition_age_days = reading ? ageInDays(reading.observed_at) : null;
    if (!bound || !reading || reading.value === null) {
      assessments.push({
        variable,
        outcome: "unassessable",
        reason: !bound
          ? "The Continuum holds no bound for this variable and this taxon."
          : "Nothing has been recorded for this variable where this plant is.",
        condition,
        condition_age_days,
      });
      continue;
    }
    const breached = [];
    for (const entry of bound.min || []) if (reading.value < entry.value) breached.push({ bound: "min", limit: entry.value });
    for (const entry of bound.max || []) if (reading.value > entry.value) breached.push({ bound: "max", limit: entry.value });
    assessments.push({
      variable,
      outcome: breached.length ? "outside" : "within",
      breached: breached.length ? breached : undefined,
      condition,
      bounds: bound,
      condition_age_days,
    });
  }
  const counts = assessments.reduce((total, entry) => {
    total[entry.outcome] = (total[entry.outcome] || 0) + 1;
    return total;
  }, {});
  const withVerdict = assessments.filter((entry) => entry.outcome === "within" || entry.outcome === "outside");
  const ages = withVerdict.map((entry) => entry.condition_age_days).filter((age) => typeof age === "number");
  return {
    assessments,
    counts,
    anything_assessed: withVerdict.length > 0,
    oldest_verdict_condition_age_days: ages.length ? Math.max(...ages) : null,
  };
}

/* ------------------------------------------------------- conservatory ----- */

async function conservatoryRoute(req, res, url) {
  const userId = bearer(req);
  if (!userId) return fail(res, 401, "not_authenticated", "This collection is private. Sign in to read it.");
  const collection = collectionFor(userId);
  const path = url.pathname;
  const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : Buffer.alloc(0);
  const asJson = () => safeJson(body);
  const now = () => new Date().toISOString();

  if (path === "/api/conservatory/readiness") {
    return json(res, 200, {
      ready_for_collection_entry: true,
      storage_path: "reference-backend://in-process",
      checked_at: now(),
      instruction: "Persistence and restart survival were verified for this reference backend.",
      gates: [
        { name: "persistent_storage", passed: true, evidence: "Records are held by the reference backend for the life of the process." },
        { name: "restart_survival", passed: true, evidence: "Records survive a browser reload and a sign-out/sign-in cycle." },
        { name: "private_to_owner", passed: true, evidence: "Every read is scoped to the bearer's user id." },
      ],
    });
  }

  /* --- plants --- */
  if (path === "/api/conservatory/plants" && req.method === "GET") {
    return json(res, 200, { plants: collection.plants });
  }
  if (path === "/api/conservatory/plants" && req.method === "POST") {
    const input = asJson();
    const name = String(input.display_name || "").trim();
    if (name.length < 2) return fail(res, 422, "display_name_too_short", "A plant needs a name of at least two characters.");
    collection.accessionSeq += 1;
    const plant = {
      id: randomUUID(),
      accession_number: `OC-${String(collection.accessionSeq).padStart(4, "0")}`,
      display_name: name,
      accepted_scientific_name: input.accepted_scientific_name || null,
      location: input.location || null,
      notes: input.notes || null,
      qr_identifier: `ocq_${createHash("sha256").update(randomUUID()).digest("hex").slice(0, 24)}`,
      created_at: now(),
      updated_at: now(),
    };
    collection.plants.push(plant);
    return json(res, 201, plant);
  }

  let match = /^\/api\/conservatory\/plants\/([^/]+)$/.exec(path);
  if (match) {
    const plant = collection.plants.find((candidate) => candidate.id === decodeURIComponent(match[1]));
    if (!plant) return fail(res, 404, "plant_not_found", "This collection has no such plant.");
    if (req.method === "PATCH") {
      const input = asJson();
      if (typeof input.display_name === "string") plant.display_name = input.display_name.trim();
      if ("accepted_scientific_name" in input) plant.accepted_scientific_name = input.accepted_scientific_name || null;
      if ("notes" in input) plant.notes = input.notes || null;
      plant.updated_at = now();
    }
    return json(res, 200, plant);
  }

  match = /^\/api\/conservatory\/plants\/([^/]+)\/qr\.svg$/.exec(path);
  if (match) {
    const plant = collection.plants.find((candidate) => candidate.id === decodeURIComponent(match[1]));
    if (!plant) return fail(res, 404, "plant_not_found", "This collection has no such plant.");
    // Not a scannable code — a placeholder carrying the identity, so the label
    // layout and the image request are exercised without pulling in an encoder.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${plant.accession_number}"><rect width="64" height="64" fill="#fff"/><rect x="4" y="4" width="18" height="18" fill="#000"/><rect x="42" y="4" width="18" height="18" fill="#000"/><rect x="4" y="42" width="18" height="18" fill="#000"/><text x="32" y="38" font-size="5" text-anchor="middle">${plant.qr_identifier}</text></svg>`;
    res.writeHead(200, { "Content-Type": "image/svg+xml", ...cors() });
    return res.end(svg);
  }

  match = /^\/api\/conservatory\/resolve\/(.+)$/.exec(path);
  if (match) {
    const identifier = decodeURIComponent(match[1]);
    const plant = collection.plants.find((candidate) => candidate.qr_identifier === identifier);
    // Matched exactly or not at all: a near miss would attach one plant's
    // history to another.
    if (!plant) return fail(res, 404, "tag_not_matched", "This tag does not match a plant in this collection.");
    return json(res, 200, plant);
  }

  /* --- events --- */
  match = /^\/api\/conservatory\/plants\/([^/]+)\/events$/.exec(path);
  if (match) {
    const plantId = decodeURIComponent(match[1]);
    if (req.method === "POST") {
      const input = asJson();
      if (!input.kind) return fail(res, 422, "kind_required", "An event needs a kind.");
      if (Date.parse(input.occurred_at) > Date.now()) {
        return fail(res, 422, "occurred_in_future", "An event cannot be recorded as having happened in the future.");
      }
      const event = {
        id: randomUUID(),
        plant_id: plantId,
        kind: String(input.kind),
        occurred_at: input.occurred_at,
        recorded_at: now(),
        recorder_kind: "owner",
        note: input.note ?? null,
        supersedes_id: input.supersedes_id ?? null,
        superseded_by_id: null,
      };
      if (event.supersedes_id) {
        const superseded = collection.events.find((candidate) => candidate.id === event.supersedes_id);
        if (!superseded) return fail(res, 404, "supersedes_not_found", "The event being corrected is not in this ledger.");
        superseded.superseded_by_id = event.id;
      }
      collection.events.push(event);
      return json(res, 201, event);
    }
    const mine = collection.events.filter((event) => event.plant_id === plantId);
    return json(res, 200, {
      plant_id: plantId,
      standing: mine.filter((event) => !event.superseded_by_id),
      corrected: mine.filter((event) => event.superseded_by_id),
      event_count: mine.length,
      is_scientific_evidence: false,
    });
  }

  /* --- evaluation history --- */
  match = /^\/api\/conservatory\/plants\/([^/]+)\/evaluations$/.exec(path);
  if (match) {
    const plantId = decodeURIComponent(match[1]);
    if (req.method === "POST") {
      const input = asJson();
      const entry = {
        id: randomUUID(),
        plant_id: plantId,
        recorded_at: now(),
        // What was asked, and about what.
        cultivated_identity: input.cultivated_identity ?? null,
        species_consulted: input.species_consulted ?? null,
        taxon_relationship: input.taxon_relationship ?? null,
        location_kind: input.location_kind ?? null,
        observations: Array.isArray(input.observations) ? input.observations : [],
        alternatives_considered: Number(input.alternatives_considered) || 0,
        // Places that had a letter but no readings behind them. Kept so the
        // history can say a bench went uncompared, rather than leaving the
        // grower to read that silence as a verdict about it.
        alternatives_unassessable: Number(input.alternatives_unassessable) || 0,
        // Nothing in this repository retains what Calyx answered, so every
        // record says so rather than letting the question stand in for an
        // answer. The write-back that would set this to "retained", and the
        // conversation identity it would carry, are tracked on issue #451;
        // inventing either here would be claiming a capability that has not
        // been shown to work.
        answer_state: "not_retained",
        answer_conversation_id: null,
        // Recording that an assessment happened does not make its inputs
        // evidence, and does not make the assessment a finding.
        is_scientific_evidence: false,
        observations_are_evidence: false,
      };
      collection.evaluations.push(entry);
      return json(res, 201, entry);
    }
    // Append-only. An assessment is a dated act, and a later one does not
    // correct an earlier one — conditions changed, the reading did not.
    return json(res, 200, {
      plant_id: plantId,
      evaluations: collection.evaluations.filter((row) => row.plant_id === plantId),
      is_scientific_evidence: false,
    });
  }

  /* --- measurements --- */
  match = /^\/api\/conservatory\/plants\/([^/]+)\/measurements$/.exec(path);
  if (match) {
    const plantId = decodeURIComponent(match[1]);
    if (req.method === "POST") {
      const input = asJson();
      if (!input.trait || !input.unit || !input.method) {
        return fail(res, 422, "measurement_incomplete", "A measurement needs a trait, a unit and a method.");
      }
      const value = Number(input.value);
      if (!Number.isFinite(value) || value <= 0) {
        return fail(res, 422, "measurement_value_invalid", "A measurement needs a positive length.");
      }
      const measurement = {
        id: randomUUID(),
        plant_id: plantId,
        trait: String(input.trait),
        value,
        unit: String(input.unit),
        method: String(input.method),
        measured_on: String(input.measured_on || "").slice(0, 10),
        flowering_event_id: input.flowering_event_id ?? null,
        photograph_id: input.photograph_id ?? null,
        instrument: input.instrument ?? null,
        note: input.note ?? null,
        supersedes_id: input.supersedes_id ?? null,
        recorded_at: now(),
        // A grower's reading of their own plant, never a species description.
        is_scientific_evidence: false,
      };
      if (measurement.supersedes_id) {
        const corrected = collection.measurements.find((row) => row.id === measurement.supersedes_id);
        if (!corrected) return fail(res, 404, "supersedes_not_found", "The measurement being corrected is not in this record.");
      }
      // A photograph is provenance only if it is a photograph of this plant.
      // Accepting any id would let a reading cite another plant's photograph
      // and read as checkable when checking it would show something else.
      if (measurement.photograph_id) {
        const shown = collection.photographs.find(
          (row) => row.id === measurement.photograph_id && row.plant_id === plantId,
        );
        if (!shown) {
          return fail(res, 422, "photograph_not_of_this_plant",
            "A measurement can only cite a photograph of the plant it measures.");
        }
      }
      collection.measurements.push(measurement);
      return json(res, 201, measurement);
    }
    // Append-only: a later flowering adds an entry, and a correction leaves the
    // entry it corrected in place.
    const mine = collection.measurements.filter((row) => row.plant_id === plantId);
    const replaced = new Set(mine.map((row) => row.supersedes_id).filter(Boolean));
    return json(res, 200, {
      plant_id: plantId,
      standing: mine.filter((row) => !replaced.has(row.id)),
      superseded: mine.filter((row) => replaced.has(row.id)),
      is_scientific_evidence: false,
    });
  }

  /* --- photographs --- */
  match = /^\/api\/conservatory\/plants\/([^/]+)\/photographs$/.exec(path);
  if (match) {
    const plantId = decodeURIComponent(match[1]);
    if (req.method === "POST") {
      const parts = parseMultipart(body, req.headers["content-type"]);
      const file = parts?.find((part) => part.name === "file");
      if (!file) return fail(res, 422, "file_required", "No photograph was uploaded.");
      const stripped = stripJpegMetadata(file.content);
      if (!stripped) {
        return fail(res, 422, "exif_not_strippable",
          "The photograph could not be read well enough to remove its location, so it was refused rather than stored.");
      }
      const photograph = {
        id: randomUUID(),
        plant_id: plantId,
        content_type: file.type || "image/jpeg",
        byte_size: stripped.bytes.length,
        taken_at: stripped.takenAt,
        recorded_at: now(),
        caption: parts.find((part) => part.name === "caption")?.content.toString("utf8") || null,
        exif_stripped: true,
        _bytes: stripped.bytes,
      };
      collection.photographs.push(photograph);
      const { _bytes, ...visible } = photograph;
      return json(res, 201, visible);
    }
    return json(res, 200, {
      photographs: collection.photographs
        .filter((photograph) => photograph.plant_id === plantId)
        .map(({ _bytes, ...visible }) => visible),
    });
  }

  match = /^\/api\/conservatory\/photographs\/([^/]+)$/.exec(path);
  if (match) {
    const photograph = collection.photographs.find((candidate) => candidate.id === decodeURIComponent(match[1]));
    if (!photograph) return fail(res, 404, "photograph_not_found", "No such photograph in this collection.");
    res.writeHead(200, { "Content-Type": photograph.content_type, ...cors() });
    return res.end(photograph._bytes);
  }

  /* --- placement --- */
  match = /^\/api\/conservatory\/plants\/([^/]+)\/placement$/.exec(path);
  if (match) {
    const plantId = decodeURIComponent(match[1]);
    if (req.method === "POST") {
      const input = asJson();
      const location = collection.locations.find((candidate) => candidate.id === input.location_id);
      if (!location) return fail(res, 404, "location_not_found", "That growing location is not in this collection.");
      if (location.retired_at) return fail(res, 409, "location_retired", "That bench has been retired. Bring it back into use before placing a plant on it.");
      if (!input.reason) return fail(res, 422, "reason_required", "Say why the plant is being placed here.");
      const placement = {
        id: randomUUID(),
        plant_id: plantId,
        location_id: input.location_id,
        reason: String(input.reason),
        note: input.note ?? null,
        recorded_at: now(),
        corrects_id: input.corrects_id ?? null,
        corrected_by_id: null,
      };
      if (placement.corrects_id) {
        const corrected = collection.placements.find((candidate) => candidate.id === placement.corrects_id);
        if (!corrected) return fail(res, 404, "corrects_not_found", "The placement being corrected is not in this history.");
        corrected.corrected_by_id = placement.id;
      }
      collection.placements.push(placement);
      const plant = collection.plants.find((candidate) => candidate.id === plantId);
      if (plant) { plant.location = location.name; plant.updated_at = now(); }
      return json(res, 201, placement);
    }
    return json(res, 200, {
      plant_id: plantId,
      current: currentLocationOf(collection, plantId),
      // Append-only: a correction is added, the corrected entry stays visible.
      history: collection.placements.filter((placement) => placement.plant_id === plantId),
    });
  }

  match = /^\/api\/conservatory\/plants\/([^/]+)\/placement-assessment$/.exec(path);
  if (match) {
    const plantId = decodeURIComponent(match[1]);
    const plant = collection.plants.find((candidate) => candidate.id === plantId);
    const placement = currentLocationOf(collection, plantId);
    const result = assess(collection, placement?.location_id, plant?.accepted_scientific_name);
    return json(res, 200, {
      ...result,
      requirement_source_consulted: true,
      is_recommendation: false,
    });
  }

  /* --- locations --- */
  if (path === "/api/conservatory/locations" && req.method === "GET") {
    return json(res, 200, { locations: collection.locations });
  }
  if (path === "/api/conservatory/locations" && req.method === "POST") {
    const input = asJson();
    const name = String(input.name || "").trim();
    if (!name) return fail(res, 422, "name_required", "A growing location needs a name.");
    if (collection.locations.some((location) => location.name === name && !location.retired_at)) {
      return fail(res, 409, "name_in_use", "Another location in use already has that name.");
    }
    const location = {
      id: randomUUID(),
      name,
      kind: String(input.kind || "bench"),
      described_conditions: input.described_conditions ?? null,
      retired_at: null,
    };
    collection.locations.push(location);
    collection.locationHistory.push({
      id: randomUUID(), location_id: location.id, change: "created",
      previous_name: null, new_name: location.name, note: null, recorded_at: now(),
    });
    return json(res, 201, location);
  }

  match = /^\/api\/conservatory\/locations\/([^/]+)\/(rename|retire|unretire|history|environment)$/.exec(path);
  if (match) {
    const locationId = decodeURIComponent(match[1]);
    const action = match[2];
    const location = collection.locations.find((candidate) => candidate.id === locationId);
    if (!location) return fail(res, 404, "location_not_found", "That growing location is not in this collection.");

    if (action === "history") {
      return json(res, 200, {
        history: collection.locationHistory.filter((entry) => entry.location_id === locationId),
      });
    }

    if (action === "rename") {
      const name = String(asJson().name || "").trim();
      if (!name) return fail(res, 422, "name_required", "A growing location needs a name.");
      const previous = location.name;
      location.name = name;
      // A rename is not a move: nothing about where any plant is has changed.
      collection.locationHistory.push({
        id: randomUUID(), location_id: locationId, change: "renamed",
        previous_name: previous, new_name: name, note: null, recorded_at: now(),
      });
      return json(res, 200, location);
    }

    if (action === "retire") {
      const here = collection.plants.filter((plant) => currentLocationOf(collection, plant.id)?.location_id === locationId);
      if (here.length) {
        return fail(res, 409, "location_occupied",
          `${here.length} plant${here.length === 1 ? " is" : "s are"} still here. Move ${here.length === 1 ? "it" : "them"} before retiring this location.`);
      }
      location.retired_at = now();
      collection.locationHistory.push({
        id: randomUUID(), location_id: locationId, change: "retired",
        previous_name: location.name, new_name: location.name, note: null, recorded_at: location.retired_at,
      });
      return json(res, 200, location);
    }

    if (action === "unretire") {
      location.retired_at = null;
      collection.locationHistory.push({
        id: randomUUID(), location_id: locationId, change: "unretired",
        previous_name: location.name, new_name: location.name, note: null, recorded_at: now(),
      });
      return json(res, 200, location);
    }

    if (action === "environment") {
      if (req.method === "POST") {
        const input = asJson();
        const variable = String(input.variable || "").trim();
        if (!variable) return fail(res, 422, "variable_required", "Say which variable this reading is for.");
        if (input.origin !== "measured" && input.instrument) {
          return fail(res, 422, "instrument_without_measurement",
            "Only a measured reading may name an instrument.");
        }
        if (input.origin === "measured" && !input.instrument) {
          return fail(res, 422, "instrument_required", "A measured reading must say what measured it.");
        }
        const reading = {
          id: randomUUID(),
          location_id: locationId,
          variable,
          unit: String(input.unit || (variable.endsWith("_c") ? "C" : variable.endsWith("_pct") ? "%" : "")),
          value: input.value === null || input.value === undefined ? null : Number(input.value),
          origin: String(input.origin || "unknown"),
          instrument: input.instrument ?? null,
          observed_at: input.observed_at || now(),
          note: input.note ?? null,
          supersedes_id: input.supersedes_id ?? null,
          superseded_by_id: null,
        };
        if (reading.supersedes_id) {
          const superseded = collection.readings.find((candidate) => candidate.id === reading.supersedes_id);
          if (!superseded) return fail(res, 404, "supersedes_not_found", "The reading being corrected is not at this location.");
          superseded.superseded_by_id = reading.id;
        }
        collection.readings.push(reading);
        return json(res, 201, reading);
      }
      const readings = collection.readings.filter((reading) => reading.location_id === locationId);
      const variables = {};
      for (const reading of readings.filter((entry) => !entry.superseded_by_id)) {
        variables[reading.variable] = {
          unit: reading.unit,
          known: reading.value !== null,
          value: reading.value ?? undefined,
          origin: reading.origin,
          instrument: reading.instrument,
          observed_at: reading.observed_at,
        };
      }
      return json(res, 200, { location_id: locationId, variables, readings });
    }
  }

  if (path === "/api/conservatory/locations/suitability") {
    const taxon = url.searchParams.get("taxon") || "";
    const requirements = requirementsFor(taxon);
    const locations = collection.locations
      .filter((location) => !location.retired_at)
      .map((location) => ({
        location_id: location.id,
        name: location.name,
        kind: location.kind,
        ...assess(collection, location.id, taxon),
      }));
    return json(res, 200, {
      taxon,
      locations,
      requirements: requirements
        ? { value: requirements, claim_class: "cultivation_bound", source_consulted: true }
        : { claim_class: "none", reason: "The Continuum holds no cultivation bounds for this taxon.", source_consulted: true },
      anything_assessed: locations.some((location) => location.anything_assessed),
      is_recommendation: false,
      ...(requirements ? {} : { reason: "The Continuum holds no cultivation bounds for this taxon." }),
    });
  }

  /* --- collection review --- */
  if (path === "/api/conservatory/collection/review") {
    const groups = { outside: [], conflicting: [], within: [], unassessed: [] };
    for (const plant of collection.plants) {
      const placement = currentLocationOf(collection, plant.id);
      const result = assess(collection, placement?.location_id, plant.accepted_scientific_name);
      const breaches = result.assessments
        .filter((entry) => entry.outcome === "outside")
        .map((entry) => ({ variable: entry.variable, breached: entry.breached || [] }));
      const row = {
        plant_id: plant.id,
        accession_number: plant.accession_number,
        display_name: plant.display_name,
        accepted_scientific_name: plant.accepted_scientific_name,
        breaches,
        requirement_source_consulted: true,
        oldest_verdict_condition_age_days: result.oldest_verdict_condition_age_days,
      };
      if (breaches.length) groups.outside.push(row);
      else if (!result.anything_assessed) groups.unassessed.push(row);
      else groups.within.push(row);
    }
    return json(res, 200, {
      groups,
      counts: Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length])),
      plant_count: collection.plants.length,
      anything_assessed: groups.outside.length + groups.within.length > 0,
      requirement_source_unread_for: 0,
      is_recommendation: false,
    });
  }

  return fail(res, 404, "no_such_endpoint", `The reference backend does not answer ${req.method} ${path}.`);
}

/* ------------------------------------------------ Calyx fixtures ----- */

/**
 * Missions for the scientific-demonstration journey.
 *
 * FIXTURES, NOT FINDINGS. Every trait, citation, confidence and gap below is
 * invented for this test double. None of it is a claim about any orchid, and a
 * passing journey says the frontend renders a governed mission correctly —
 * never that the Continuum holds this evidence.
 *
 * Two missions, because the pair is the point. One question has enough fixture
 * evidence to reach bounded conclusions and also carries evidence against
 * them; the other does not, and must come back with no conclusions at all
 * rather than a hedged sentence. A demo that only ever shows the answering
 * case cannot show that the product declines to answer.
 */

const COOL_WARM_QUESTION = /cool[- ]?growing.*warm[- ]?growing|warm[- ]?growing.*cool[- ]?growing/i;

function missionShell(question, extra) {
  return {
    mission_id: randomUUID(),
    project_id: "reference-demonstration",
    question,
    state: "completed",
    current_stage: "synthesis",
    steps_executed: 4,
    sources: [],
    supporting_evidence: [],
    contradicting_evidence: [],
    missing_evidence: [],
    confidence: null,
    conclusions: [],
    reasoning_ledger: { ledger_id: randomUUID(), version: 1 },
    validation: { valid: true, blockers: [] },
    review_status: "awaiting_review",
    // Never true. Nothing in this repository publishes science automatically.
    publication_eligibility: { eligible: false, automatic_publication: false, blockers: ["human_review_required"] },
    blockers: [],
    partial: true,
    created_at: isoNow(),
    updated_at: isoNow(),
    ...extra,
  };
}

function coolVersusWarmMission(question) {
  return missionShell(question, {
    sources: [
      {
        result_id: "fixture-src-1",
        title: "Fixture: cultivation notes, Phalaenopsis section Phalaenopsis",
        object_type: "taxonomic-treatment",
        authorized_excerpt:
          "Fixture text. Plants from higher-elevation collections were maintained at lower night temperatures.",
        citation: { revision_id: 11, source_anchor_ids: [3, 4] },
      },
      {
        result_id: "fixture-src-2",
        title: "Fixture: growth trial summary",
        object_type: "result",
        // Withheld on purpose: the display policy is part of what is demonstrated.
        authorized_excerpt: null,
        citation: { revision_id: 12, source_anchor_ids: [7] },
      },
    ],
    supporting_evidence: [
      {
        candidate_id: 501,
        candidate_version: 1,
        subject: "Phalaenopsis, cool-growing collections (fixture)",
        predicate: "associated_night_temperature_minimum_c",
        value: 14,
        source_revision_id: 11,
        source_anchor_ids: [3],
        provenance: { mission_id: "fixture", extraction: "fixture" },
      },
      {
        candidate_id: 502,
        candidate_version: 1,
        subject: "Phalaenopsis, cool-growing collections (fixture)",
        predicate: "associated_leaf_texture",
        value: "more rigid, mottled",
        source_revision_id: 11,
        source_anchor_ids: [4],
        provenance: { mission_id: "fixture", extraction: "fixture" },
      },
    ],
    // The half that makes this a demonstration rather than a summary.
    contradicting_evidence: [
      {
        candidate_id: 601,
        candidate_version: 1,
        subject: "Phalaenopsis, cool-growing collections (fixture)",
        predicate: "associated_leaf_texture",
        value: "no consistent difference observed",
        source_revision_id: 12,
        source_anchor_ids: [7],
        provenance: { mission_id: "fixture", extraction: "fixture" },
      },
    ],
    missing_evidence: [
      "No fixture source measures both groups under one protocol, so the comparison rests on separate studies.",
      "No fixture source reports provenance elevation for the warm-growing group.",
    ],
    confidence: 0.42,
    conclusions: [
      {
        type: "bounded_conclusion",
        text:
          "In the fixture corpus, cool-growing accessions are associated with lower recorded night temperatures. Leaf texture is NOT separated: one source reports a difference and another reports none.",
        claim_ids: [501, 502, 601],
      },
    ],
  });
}

function insufficientEvidenceMission(question) {
  // The abstention case. No conclusions, no confidence, and gaps that say why.
  return missionShell(question, {
    sources: [],
    supporting_evidence: [],
    contradicting_evidence: [],
    missing_evidence: [
      "The fixture corpus holds no record addressing this question.",
      "No conclusion is offered, because none is supported.",
    ],
    confidence: null,
    conclusions: [],
    validation: { valid: true, blockers: [] },
    partial: true,
  });
}

function missionForQuestion(question) {
  const answering = COOL_WARM_QUESTION.test(question);
  const mission = answering
    ? coolVersusWarmMission(question)
    : insufficientEvidenceMission(question);
  calyxStore.missions.set(mission.mission_id, mission);

  return {
    mission,
    subject: answering ? "Phalaenopsis (fixture corpus)" : null,
    answer: answering
      ? "Fixture answer. One trait separates the two groups in this corpus and one does not; see the conclusion, the contradicting evidence and the gaps."
      : "Fixture answer. The corpus holds nothing that addresses this question, so no conclusion is offered.",
    citations: answering
      ? [
          {
            title: "Fixture: cultivation notes, Phalaenopsis section Phalaenopsis",
            authors: "Reference Fixture",
            publication_date: "2019-01-01",
            journal: "Reference Fixtures",
          },
        ]
      : [],
  };
}

/**
 * Governed-corpus retrieval, in the shape src/lib/evidenceRetrieval.ts declares.
 *
 * Three outcomes are reachable, because all three are governance behaviour the
 * frontend has to render distinctly and none of them is an error:
 *   • results, one of which withholds its excerpt by display policy;
 *   • zero eligible results WITH exclusion counts — a filtered corpus, which is
 *     not the same claim as an empty one;
 *   • 403 and 503, which must never render as "no evidence found".
 */
function evidenceFor(query, route) {
  return {
    normalized_query: query.toLowerCase(),
    retrieval_mode: route,
    active_collections: ["reference-fixture-corpus"],
    ranking_configuration_version: "fixture-1",
    total_candidates: 4,
    total_eligible_results: /\bno eligible\b/i.test(query) ? 0 : 2,
    excluded_counts: { RETRACTED: 1, AWAITING_REVIEW: 1 },
    deduplicated_count: 0,
    results: /\bno eligible\b/i.test(query)
      ? []
      : [
          {
            rank: 1,
            scores: { hybrid: 0.81 },
            object_type: "claim",
            title: "Fixture claim: night temperature association",
            authorized_excerpt: "Fixture excerpt. Lower night temperatures were recorded for that group.",
            matched_terms: ["temperature"],
            citation: {
              document_id: "fixture-doc-1",
              document_title: "Fixture: cultivation notes",
              authors: ["Reference Fixture"],
              publication_date: "2019-01-01",
              revision_id: 11,
              source_anchor_ids: [3],
            },
            reliability_signals: {
              peer_reviewed: true,
              ai_generated: false,
              citations_verified: true,
              evidence_type: "observational",
            },
            review_state: "reviewed",
            verification_state: "verified",
            temporal_status: "current",
            display_policy: "excerpt_allowed",
            collections: ["reference-fixture-corpus"],
            active: true,
          },
          {
            rank: 2,
            scores: { hybrid: 0.62 },
            object_type: "result",
            title: "Fixture result: growth trial",
            // Withheld by policy, not missing. The UI must say which.
            authorized_excerpt: null,
            citation: {
              document_id: "fixture-doc-2",
              document_title: "Fixture: growth trial summary",
              revision_id: 12,
            },
            reliability_signals: { peer_reviewed: false, ai_generated: false, citations_verified: false },
            review_state: "awaiting_review",
            verification_state: "unverified",
            temporal_status: "current",
            display_policy: "excerpt_withheld",
            collections: ["reference-fixture-corpus"],
            active: true,
          },
        ],
    warnings: [],
    elapsed_ms: 3,
  };
}



/* --------------------------------------- Research Station acceptance ----- */

/**
 * A single persisted research investigation for the browser acceptance path.
 *
 * FIXTURE, NOT FINDING. The records below are invented and exist only to prove
 * that the mounted frontend preserves provenance, contradiction, missingness,
 * human review, and the proposal-only Knowledge Graph boundary.
 */
const RESEARCH_PROJECT_ID = "project-phal-browser";
const RESEARCH_QUESTION =
  "Which recorded evidence distinguishes cool-growing from warm-growing Phalaenopsis?";

const researchProject = {
  project_id: RESEARCH_PROJECT_ID,
  owner_subject: "reference-operator",
  title: "Phalaenopsis evidence decision — browser fixture",
  description: "Deterministic acceptance fixture; not scientific evidence.",
  research_question: RESEARCH_QUESTION,
  hypothesis: "Fixture hypothesis only: recorded night-temperature associations may differ.",
  status: "ACTIVE",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  archived_at: null,
  version: 1,
  permissions: { can_read: true, can_update: false, can_archive: false },
  link_counts: { taxa: 1, documents: 2, evidence: 2, notes: 1 },
};

/* ---------------------------------------- Research Trait Explorer ------ */

/**
 * `GET /api/research/traits`, answered only with payloads the real backend
 * returned.
 *
 * PROVENANCE. `src/lib/__fixtures__/researchTraits.pr1611.json` holds the
 * AVAILABLE / UNAVAILABLE / ABSENT bodies captured through FastAPI TestClient
 * from `app/research_traits/routes.py` (backend #1611), using that suite's
 * `FakeService` (the real `ResearchTraitsService.get()` pipeline with only the
 * database boundary replaced) and its `ROWS`. The file's note says the capture
 * predates the merge; re-capturing from backend `main` 615af698b with the same
 * harness produced bodies identical to it in every field except
 * `generated_at`, which is a capture timestamp. They are served verbatim, so
 * `generated_at` is the capture instant, not the time of this request.
 *
 * The rows behind them are the backend test suite's own fixture rows, not
 * botanical records. A passing browser run proves the frontend renders what
 * the backend emits; it says nothing about any orchid.
 *
 * Only the two subjects the capture covers are answered. Any other valid
 * subject gets a 503 instead of a borrowed payload, because re-labelling a
 * captured body with a different name would invent a result for that name.
 *
 * Authentication: the real route depends on `verify_owner_or_api_key`, an
 * owner cookie or API key this stand-in has no equivalent of, so — like the
 * `/api/research/projects` fixtures above — it does not check one. The
 * captured 401 is served on request so the signed-out rendering is covered.
 */
const CAPTURED_TRAITS = JSON.parse(
  readFileSync(new URL("../../src/lib/__fixtures__/researchTraits.pr1611.json", import.meta.url), "utf8"),
);

/** Both captured genus bodies are for `Cattleya`, so the journey picks one. */
const TRAIT_GENUS_CAPTURES = new Set(["unavailable_genus", "absent_genus"]);

/**
 * Failure bodies. `unauthenticated` and `server_error` are what backend `main`
 * returned through TestClient (the route with no credentials, and an unhandled
 * service exception). `malformed` is SYNTHETIC — a contract-version the
 * client must refuse — and exists only to exercise the fail-closed parse.
 */
const TRAIT_FAILURES = new Set(["unauthenticated", "server_error", "malformed"]);

const traitsControl = { genus: "unavailable_genus", failure: null };

// Mirrors `_subject` in app/research_traits/routes.py, including its details.
const TRAIT_GENUS_RE = /^[A-Z][A-Za-z-]{1,79}$/;
const TRAIT_SPECIES_RE = /^[A-Z][A-Za-z-]{1,79} [a-z][A-Za-z-]{1,79}$/;

function traitSubject(url) {
  const genus = url.searchParams.get("genus");
  const species = url.searchParams.get("species");
  if (Boolean(genus) + Boolean(species) !== 1) return { error: "Supply exactly one of genus or species" };
  if (genus !== null && genus !== "") {
    const name = genus.trim();
    return TRAIT_GENUS_RE.test(name) ? { rank: "genus", name } : { error: "Invalid genus" };
  }
  const name = (species || "").trim();
  return TRAIT_SPECIES_RE.test(name) ? { rank: "species", name } : { error: "Invalid species binomial" };
}

function researchTraitsRoute(req, res, url) {
  if (req.method !== "GET") return fail(res, 405, "method_not_allowed", "GET only.");
  const failure = traitsControl.failure;
  if (failure === "unauthenticated") return json(res, 401, { detail: "Owner session or API key is required" });
  if (failure === "server_error") {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", ...cors() });
    return res.end("Internal Server Error");
  }
  const subject = traitSubject(url);
  if (subject.error) return json(res, 422, { detail: subject.error });
  if (failure === "malformed") {
    const body = { ...CAPTURED_TRAITS.absent_genus, subject: { rank: subject.rank, name: subject.name } };
    return json(res, 200, { ...body, contract_version: "oc-research-traits-v0" });
  }
  let capture = null;
  if (subject.rank === "species" && subject.name === CAPTURED_TRAITS.available_species.subject.name) {
    capture = CAPTURED_TRAITS.available_species;
  } else if (subject.rank === "genus" && subject.name === CAPTURED_TRAITS[traitsControl.genus].subject.name) {
    capture = CAPTURED_TRAITS[traitsControl.genus];
  }
  if (!capture) {
    return json(res, 503, {
      detail: `The reference backend holds no captured trait payload for ${subject.rank} ${subject.name}.`,
    });
  }
  return json(res, 200, capture);
}

/**
 * Test-only switch, reachable only from the Playwright runner. It selects
 * which captured genus body is served and whether a failure replaces it.
 */
async function researchTraitsControlRoute(req, res) {
  if (req.method !== "PUT") return fail(res, 405, "method_not_allowed", "PUT only.");
  const body = safeJson(await readBody(req)) || {};
  const genus = body.genus ?? traitsControl.genus;
  const failure = body.failure ?? null;
  if (!TRAIT_GENUS_CAPTURES.has(genus) || (failure !== null && !TRAIT_FAILURES.has(failure))) {
    return fail(res, 400, "invalid_scenario", "Unknown trait scenario.");
  }
  traitsControl.genus = genus;
  traitsControl.failure = failure;
  return json(res, 200, { ...traitsControl });
}

async function researchRoute(req, res, url) {
  const path = url.pathname;
  if (path === "/api/research/traits") return researchTraitsRoute(req, res, url);
  if (path === "/api/research/projects" && req.method === "GET") {
    return json(res, 200, { items: [researchProject] });
  }
  if (path === `/api/research/projects/${RESEARCH_PROJECT_ID}` && req.method === "GET") {
    return json(res, 200, researchProject);
  }
  if (path === `/api/research/projects/${RESEARCH_PROJECT_ID}/taxa` && req.method === "GET") {
    return json(res, 200, {
      items: [{ project_id: RESEARCH_PROJECT_ID, taxon_id: "taxon:phalaenopsis", relationship: "SUBJECT" }],
    });
  }
  if (path === `/api/research/projects/${RESEARCH_PROJECT_ID}/documents` && req.method === "GET") {
    return json(res, 200, {
      items: [
        { project_id: RESEARCH_PROJECT_ID, document_id: "fixture-literature-1", revision_id: "41", relationship: "SOURCE" },
        { project_id: RESEARCH_PROJECT_ID, document_id: "fixture-literature-2", revision_id: "42", relationship: "CONTRADICTS" },
      ],
    });
  }
  if (path === `/api/research/projects/${RESEARCH_PROJECT_ID}/evidence` && req.method === "GET") {
    return json(res, 200, {
      items: [
        { project_id: RESEARCH_PROJECT_ID, evidence_kind: "CANDIDATE", evidence_id: "fixture-trait-observation", relationship: "SUPPORTS" },
        { project_id: RESEARCH_PROJECT_ID, evidence_kind: "AGGREGATE", evidence_id: "fixture-measurement-aggregate", relationship: "COMPARES" },
      ],
    });
  }
  if (path === `/api/research/projects/${RESEARCH_PROJECT_ID}/notes` && req.method === "GET") {
    return json(res, 200, {
      items: [{
        note_id: "fixture-note-1",
        project_id: RESEARCH_PROJECT_ID,
        title: "Acceptance boundary",
        body: "Fixture note: live literature retrieval is unavailable in this browser proof.",
        note_type: "METHOD",
        data_status: "USER_ANNOTATION_NOT_EVIDENCE",
      }],
    });
  }
  return fail(res, 404, "no_such_project", "The reference backend holds no other research project.");
}

function researchStationMissionFor(question) {
  const missionId = "fixture-research-mission-1";
  const mission = {
    mission_id: missionId,
    project_id: RESEARCH_PROJECT_ID,
    question,
    state: "completed",
    current_stage: "human_review",
    steps_executed: 5,
    plan: {
      question,
      domains: ["literature", "trait", "measurement"],
      retrieval_queries: [
        "fixture literature: Phalaenopsis temperature association",
        "fixture Continuum trait observations",
        "fixture Continuum measurement aggregates",
      ],
      source_budget: 6,
      per_domain_source_budget: 2,
      claims_and_inferences_separated: true,
    },
    sources: [
      {
        result_id: "fixture-literature-1",
        title: "Fixture literature record: night-temperature association",
        object_type: "document",
        authorized_excerpt: "Invented acceptance text; not a botanical finding.",
        citation: {
          revision_id: 41,
          source_anchor_ids: [101],
          locator: "fixture://literature/41#anchor-101",
        },
      },
      {
        result_id: "fixture-literature-2",
        title: "Fixture literature record: conflicting observation",
        object_type: "document",
        authorized_excerpt: "Invented conflicting acceptance text; not a botanical finding.",
        citation: {
          revision_id: 42,
          source_anchor_ids: [102],
          locator: "fixture://literature/42#anchor-102",
        },
      },
    ],
    supporting_evidence: [{
      candidate_id: "candidate:phal-temperature-fixture",
      candidate_version: 1,
      subject: "taxon:phalaenopsis",
      predicate: "fixture_recorded_night_temperature_association",
      value: "fixture:cooler-recorded-nights",
      source_revision_id: 41,
      source_anchor_ids: [101],
      provenance: {
        mission_id: missionId,
        confidence: 0.67,
        domain: "measurement",
        source_object_type: "document_revision",
        source_object_id: 41,
        extraction_run_id: 701,
      },
    }],
    contradicting_evidence: [{
      candidate_id: "counter:phal-temperature-fixture",
      candidate_version: 1,
      subject: "taxon:phalaenopsis",
      predicate: "fixture_recorded_night_temperature_association",
      value: "fixture:no-separated-association",
      source_revision_id: 42,
      source_anchor_ids: [102],
      provenance: { mission_id: missionId, extraction_run_id: 702 },
    }],
    missing_evidence: [
      "Live literature retrieval is unavailable in this deterministic acceptance fixture.",
    ],
    confidence: 0.67,
    conclusions: [{
      type: "bounded_conclusion",
      text: "Fixture conclusion: the recorded evidence supports one association while a second source contests it; human review remains required.",
      claim_ids: ["candidate:phal-temperature-fixture", "counter:phal-temperature-fixture"],
    }],
    reasoning_ledger: { ledger_id: "fixture-ledger-1", version: 1 },
    validation: { valid: true, blockers: [] },
    review_status: "HUMAN_REVIEW_REQUIRED",
    publication_eligibility: {
      eligible: false,
      automatic_publication: false,
      blockers: ["human_review_required", "fixture_not_scientific_evidence"],
    },
    blockers: [],
    partial: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  calyxStore.missions.set(missionId, mission);
  return {
    mission,
    subject: "taxon:phalaenopsis",
    answer:
      "Fixture synthesis only. One provenance-bearing claim is supported, a second comparison is contested, and live evidence remains unavailable.",
    citations: [{
      title: "Fixture literature record: night-temperature association",
      authors: "Reference Fixture",
      publication_date: "2020-01-01",
      journal: "Acceptance Fixtures",
      doi: "10.0000/orchid.fixture.1",
      provider: "reference-backend",
      review_state: "review_required",
      canonical_evidence: false,
    }],
    synthesis_structure: {
      composer_contract: "oc-research-station-browser-fixture-v1",
      generative: true,
      degraded_composition: false,
      resolved_subject: "taxon:phalaenopsis",
      taxonomy_snapshot_id: "world-plants:2.1.2026",
      evidence_class_readiness: {
        status: "ready",
        literature_present: true,
        literature_review_required: true,
        continuum_evidence_classes: ["trait_observation", "measurement_aggregate"],
        continuum_evidence_class_count: 2,
        required_continuum_evidence_class_count: 2,
        missing_requirements: [],
      },
      claim_coverage: [
        {
          claim_id: "claim:temperature-association",
          claim: "Fixture recorded night-temperature association",
          coverage: "supported",
          supporting_count: 2,
          contradicting_count: 0,
          source_families: ["literature", "trait_observation"],
        },
        {
          claim_id: "claim:temperature-contested",
          claim: "Fixture comparison remains contested",
          coverage: "contested",
          supporting_count: 1,
          contradicting_count: 1,
          source_families: ["literature", "measurement_aggregate"],
        },
      ],
      unresolved_conflict: true,
      missing_evidence: [],
      governed_provenance: {
        mission_id: missionId,
        evidence_packet_id: "fixture-packet-1",
        review_status: "HUMAN_REVIEW_REQUIRED",
      },
    },
  };
}

/* ----------------------------------------------------------- calyx ----- */

/**
 * Conversations and missions live here rather than in a per-user collection.
 * A Calyx conversation is not private collection data, and putting it behind
 * the collection's bearer gate would make the workspace unreachable signed
 * out — which is not how the mounted route behaves.
 */
const calyxStore = { conversations: new Map(), missions: new Map() };

/** Module-level, because the fixtures below are built outside any request. */
const isoNow = () => new Date().toISOString();

/* ------------------------------------------------ scientific synthesis ----- */

/**
 * Where the backend mounts the scientific-synthesis router: app/scientific_
 * synthesis/routes.py declares prefix "/synthesis", and app/scientific_
 * interpretation/routes.py includes it in a router with prefix
 * "/api/scientific-interpretation" guarded by verify_owner_or_api_key. The
 * Research Station calls these mounted paths (frontend #814).
 *
 * The two handlers below mirror the backend's deterministic derivations
 * (run_manifest.build_run_evidence_manifest, candidate_proposal.build_
 * candidate_knowledge_proposal, reasoning_contract_bridge.verification_
 * packet_to_handoff_request). For the request the browser journey sends, the
 * responses were compared field by field with FastAPI TestClient output from
 * backend main and are identical apart from created_at_utc, which is pinned
 * here so the journey is reproducible.
 *
 * Owner authentication is NOT modelled: the deployed routes answer 401 without
 * an owner session or API key. A passing browser run here says nothing about
 * whether a given deployed account is authorised.
 */
const SYNTHESIS_PREFIX = "/api/scientific-interpretation/synthesis";

const CANDIDATE_DOMAINS = new Set([
  "taxonomy", "trait", "morphology", "ecology", "geography",
  "phenology", "conservation", "measurement", "molecular", "cultivation",
]);

/** Python json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True). */
function canonicalJson(value) {
  const sorted = (v) => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v).sort().map((key) => [key, sorted(v[key])]));
    }
    return v;
  };
  return JSON.stringify(sorted(value)).replace(
    /[\u007f-￿]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

const sha256Hex = (value) => createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
const trimmed = (value) => String(value ?? "").trim();
const positiveInt = (value) => Number.isInteger(value) && value > 0;

function runEvidenceManifest(input) {
  const runId = trimmed(input.run_id);
  const taxonId = trimmed(input.taxon_id);
  const snapshot = trimmed(input.taxonomy_snapshot_id);
  if (!runId) return { code: "RUN_ID_REQUIRED" };
  if (!trimmed(input.research_question)) return { code: "RESEARCH_QUESTION_REQUIRED" };
  if (!taxonId) return { code: "TAXON_ID_REQUIRED" };
  if (!snapshot) return { code: "TAXONOMY_SNAPSHOT_REQUIRED" };
  const packets = Array.isArray(input.verification_packets) ? input.verification_packets : [];
  if (packets.length === 0) return { code: "VERIFICATION_PACKET_REQUIRED" };
  const reviewRecords = Array.isArray(input.review_records) ? input.review_records : [];
  const memoryEntries = Array.isArray(input.epistemic_memory_entries) ? input.epistemic_memory_entries : [];

  let resolved = 0;
  let missing = 0;
  let gaps = 0;
  const contradictions = [];
  let verificationState = "ready_for_review";
  for (const packet of packets) {
    if (packet?.contract_version !== "oc-verification-handoff-v1") return { code: "UNSUPPORTED_VERIFICATION_PACKET" };
    if (packet.human_review_required !== true || packet.automatic_scientific_publication_allowed !== false) {
      return { code: "PACKET_GOVERNANCE_INVALID" };
    }
    resolved += (packet.resolved_evidence ?? []).length;
    missing += (packet.missing_evidence ?? []).length;
    gaps += (packet.knowledge_gaps ?? []).length;
    contradictions.push(...(packet.contradictions ?? []));
    const state = packet.verification_state ?? "ready_for_review";
    if (state === "evidence_incomplete") verificationState = "evidence_incomplete";
    else if (state === "validation_required" && verificationState !== "evidence_incomplete") {
      verificationState = "validation_required";
    }
  }

  // Only a recorded review decision or reviewed epistemic memory sets these;
  // nothing is invented for a run that has neither.
  let reviewDecision = null;
  for (const record of reviewRecords) {
    if (record?.contract_version === "oc-review-decision-record-v1") {
      reviewDecision = trimmed(record.review_decision) || null;
    }
  }
  let epistemicState = null;
  for (const entry of memoryEntries) {
    if (entry?.contract_version === "oc-reviewed-epistemic-memory-v1") {
      epistemicState = trimmed(entry.epistemic_state) || null;
    }
  }

  return {
    manifest: {
      contract_version: "oc-run-evidence-manifest-v1",
      run_id: runId,
      research_question: input.research_question,
      taxon_id: taxonId,
      taxonomy_snapshot_id: snapshot,
      run_fingerprint: sha256Hex({
        run_id: runId,
        research_question: input.research_question,
        taxon_id: taxonId,
        taxonomy_snapshot_id: snapshot,
        verification_packets: packets,
        review_records: reviewRecords,
        epistemic_memory_entries: memoryEntries,
      }),
      created_at_utc: "2026-01-01T00:00:00+00:00",
      verification_state: verificationState,
      resolved_evidence_count: resolved,
      missing_evidence_count: missing,
      knowledge_gap_count: gaps,
      contradictions: [...new Set(contradictions)].sort(),
      review_decision: reviewDecision,
      epistemic_state: epistemicState,
      human_review_required: true,
      automatic_scientific_publication_allowed: false,
      canonical_knowledge_mutation_allowed: false,
      canonical_activation_requires_human_authority: true,
      immutable: true,
    },
  };
}

function candidateKnowledgeProposal(input) {
  const { manifest, verification_packet: packet, domain } = input;
  if (!manifest || !packet) return { code: "PROPOSAL_CONTRACT_INCOMPLETE" };
  if (!CANDIDATE_DOMAINS.has(domain)) return { code: "DOMAIN_INVALID" };
  if (
    !trimmed(input.source_object_type) ||
    !positiveInt(input.source_object_id) ||
    !positiveInt(input.revision_id) ||
    !positiveInt(input.extraction_run_id)
  ) {
    return { code: "SOURCE_BINDING_INVALID" };
  }
  if (
    manifest.contract_version !== "oc-run-evidence-manifest-v1" ||
    !/^[0-9a-f]{64}$/.test(String(manifest.run_fingerprint ?? ""))
  ) {
    return { code: "MANIFEST_CONTRACT_INVALID" };
  }
  if (
    manifest.human_review_required !== true ||
    manifest.automatic_scientific_publication_allowed !== false ||
    manifest.canonical_knowledge_mutation_allowed !== false ||
    manifest.canonical_activation_requires_human_authority !== true ||
    manifest.immutable !== true
  ) {
    return { code: "MANIFEST_GOVERNANCE_INVALID" };
  }
  if (manifest.verification_state !== "ready_for_review") return { code: "MANIFEST_NOT_READY_FOR_REVIEW" };

  const candidate = packet.reasoning?.candidate_knowledge ?? {};
  const taxonId = trimmed(manifest.taxon_id);
  if (!taxonId || trimmed(candidate.subject_id) !== taxonId) return { code: "CANDIDATE_SUBJECT_MANIFEST_MISMATCH" };

  if (packet.contract_version !== "oc-verification-handoff-v1") return { code: "UNSUPPORTED_VERIFICATION_PACKET" };
  if (
    packet.human_review_required !== true ||
    packet.automatic_scientific_publication_allowed !== false ||
    packet.canonical_knowledge_mutation_allowed !== false
  ) {
    return { code: "PACKET_GOVERNANCE_INVALID" };
  }
  if (packet.verification_state !== "ready_for_review") return { code: "PACKET_NOT_READY_FOR_REVIEW" };

  const candidateId = trimmed(candidate.candidate_id);
  const subjectId = trimmed(candidate.subject_id);
  const predicate = trimmed(candidate.predicate);
  const objectId = trimmed(candidate.object_id);
  if (!candidateId) return { code: "CANDIDATE_ID_REQUIRED" };
  if (!predicate) return { code: "PREDICATE_REQUIRED" };
  if (!objectId) return { code: "OBJECT_ID_REQUIRED" };
  const resolved = Array.isArray(packet.resolved_evidence) ? packet.resolved_evidence : [];
  if (resolved.length === 0) return { code: "RESOLVED_EVIDENCE_REQUIRED" };
  const confidence = Number(candidate.confidence || 0);
  if (!(confidence >= 0 && confidence <= 1)) return { code: "CONFIDENCE_INVALID" };

  const anchor = (anchor_id, logical_unit, locator) => ({
    anchor_id, ordered_span: 0, page_number: null, char_start: null, char_end: null,
    block_id: null, logical_unit, locator,
  });
  const statements = [];
  const anchors = [];
  for (const evidence of resolved) {
    const statement = trimmed(evidence?.statement);
    if (statement) statements.push(statement);
    for (const item of evidence?.provenance ?? []) {
      anchors.push(anchor(anchors.length + 1, String(item), {
        evidence_id: String(evidence?.evidence_id ?? ""),
        provenance_item: String(item),
      }));
    }
  }
  if (anchors.length === 0) anchors.push(anchor(1, candidateId, { candidate_id: candidateId }));

  const binding = {
    source_object_type: input.source_object_type,
    source_object_id: input.source_object_id,
    revision_id: input.revision_id,
    extraction_run_id: input.extraction_run_id,
  };
  return {
    proposal: {
      contract_version: "oc-candidate-knowledge-proposal-v1",
      proposal_id: `candidate-proposal:${sha256Hex({
        run_fingerprint: manifest.run_fingerprint,
        candidate_id: candidateId,
        domain,
        ...binding,
      })}`,
      run_id: manifest.run_id ?? null,
      run_fingerprint: manifest.run_fingerprint,
      candidate_handoff_request: {
        reasoning_id: candidateId,
        domain,
        subject: subjectId,
        predicate,
        object_value: objectId,
        numeric_value: null,
        unit: null,
        confidence,
        evidence_text: statements.join("\n\n") || objectId,
        ...binding,
        source_anchors: anchors,
        provenance: {
          contract_version: "oc-verification-handoff-v1",
          candidate_id: candidateId,
          contradictions: [...(packet.contradictions ?? [])],
          knowledge_gap_count: (packet.knowledge_gaps ?? []).length,
          missing_evidence_count: (packet.missing_evidence ?? []).length,
        },
        qualifiers: {
          human_review_required: true,
          automatic_scientific_publication_allowed: false,
          canonical_knowledge_mutation_allowed: false,
        },
        display_policy: "UNKNOWN_REQUIRES_REVIEW",
        internal_use_permission: false,
        language: "en",
      },
      review_required: true,
      owner_submission_required: true,
      candidate_persistence_performed: false,
      automatic_approval: false,
      automatic_scientific_publication: false,
      canonical_knowledge_mutation: false,
      knowledge_graph_mutation: false,
    },
  };
}

async function calyxRoute(req, res, url) {
  const path = url.pathname;
  const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : Buffer.alloc(0);
  const asJson = () => safeJson(body);
  const now = () => new Date().toISOString();
  let match;

  /* ------------------------------------------------- Calyx / Brain ----- */

  if (path === "/api/matrix-identification/registry" && req.method === "GET") {
    return json(res, 200, {
      versions: [{
        registry_id: "reference-orchid-matrix",
        version: "fixture-v1",
        title: "Provider-free reference matrix",
        scope: { genus: "Phalaenopsis" },
        candidate_count: 0,
        character_count: 0,
        publication_state: "fixture_only",
      }],
    });
  }

  // Conversation, turn, mission and evidence retrieval, in the shapes
  // src/lib/calyxWorkspace.ts and src/lib/evidenceRetrieval.ts declare.
  //
  // FIXTURES, NOT FINDINGS. Every trait, citation and confidence below is
  // invented for this test double. None of it is a claim about Phalaenopsis,
  // and a passing journey here says the frontend renders a governed mission
  // correctly — never that the Continuum holds this evidence.

  match = /^\/api\/calyx\/speak\/conversations$/.exec(path);
  if (match) {
    if (req.method === "POST") {
      const input = asJson();
      const conversation = {
        conversation_id: randomUUID(),
        owner: "reference-operator",
        project_id: input.project_id ?? null,
        title: input.title ?? null,
        created_at: now(),
        updated_at: now(),
        context: input.context ?? {},
        status: "open",
        messages: [],
      };
      calyxStore.conversations.set(conversation.conversation_id, conversation);
      return json(res, 201, conversation);
    }
    return json(res, 200, {
      conversations: [...calyxStore.conversations.values()].map(({ messages, ...rest }) => ({
        ...rest,
        message_count: messages.length,
      })),
      persistence_mode: "in_process",
    });
  }

  match = /^\/api\/calyx\/speak\/conversations\/([^/]+)$/.exec(path);
  if (match) {
    const conversation = calyxStore.conversations.get(decodeURIComponent(match[1]));
    if (!conversation) return fail(res, 404, "conversation_not_found", "No such conversation.");
    return json(res, 200, conversation);
  }

  match = /^\/api\/calyx\/speak\/conversations\/([^/]+)\/turns$/.exec(path);
  if (match && req.method === "POST") {
    const conversation = calyxStore.conversations.get(decodeURIComponent(match[1]));
    if (!conversation) return fail(res, 404, "conversation_not_found", "No such conversation.");
    const input = asJson();
    const question = String(input.message ?? input.content ?? "").trim();
    const mission = conversation.project_id === RESEARCH_PROJECT_ID
      ? researchStationMissionFor(question)
      : missionForQuestion(question);

    const operator_message = {
      message_id: randomUUID(),
      conversation_id: conversation.conversation_id,
      role: "operator",
      content: question,
      created_at: now(),
    };
    const calyx_message = {
      message_id: randomUUID(),
      conversation_id: conversation.conversation_id,
      role: "calyx",
      content: mission.answer,
      created_at: now(),
      // The workspace discovers the mission from here, not from the turn body:
      // it reads metadata.mission_id and then fetches /brain/missions/{id}.
      // Both carry it, because both are in the contract the frontend reads.
      metadata: { citations: mission.citations, mission_id: mission.mission.mission_id },
    };
    conversation.messages.push(operator_message, calyx_message);
    conversation.updated_at = now();

    return json(res, 201, {
      conversation_id: conversation.conversation_id,
      operator_message,
      calyx_message,
      answer: mission.answer,
      provider: {
        name: "reference-backend",
        model: "reference-fixture",
        request_hash: createHash("sha256").update(question).digest("hex").slice(0, 32),
      },
      research: {
        casual: false,
        mission: mission.mission,
        mission_error: null,
        retrieval: {},
        citations: mission.citations,
      },
      synthesis_structure: mission.synthesis_structure ?? {
        composer_contract: "reference-fixture-v1",
        // Composed from linked fixture evidence, not reasoned generatively.
        generative: false,
        degraded_composition: false,
        resolved_subject: mission.subject,
        missing_evidence: mission.mission.missing_evidence,
      },
    });
  }


  // The synthesis router is mounted inside the owner-gated scientific
  // interpretation router, so the real paths carry both prefixes. A bare
  // /synthesis/... path is not served by the deployed app (404), and this
  // stand-in does not answer it either. See SYNTHESIS_PREFIX.
  if (path === `${SYNTHESIS_PREFIX}/run-manifest` && req.method === "POST") {
    const result = runEvidenceManifest(asJson());
    return result.code
      ? fail(res, 422, result.code, "The immutable review manifest contract was incomplete.")
      : json(res, 200, result.manifest);
  }

  if (path === `${SYNTHESIS_PREFIX}/candidate-proposal` && req.method === "POST") {
    const result = candidateKnowledgeProposal(asJson());
    return result.code
      ? fail(res, 422, result.code, "Only a review-ready, human-gated packet may become a proposal.")
      : json(res, 200, result.proposal);
  }

  match = /^\/brain\/missions\/([^/]+)$/.exec(path);
  if (match) {
    const mission = calyxStore.missions.get(decodeURIComponent(match[1]));
    if (!mission) return fail(res, 404, "mission_not_found", "No such mission.");
    return json(res, 200, mission);
  }

  if (path === "/brain/orchestrator/status") {
    return json(res, 200, { state: "available", persistence_mode: "in_process" });
  }

  match = /^\/api\/evidence-retrieval\/([a-z-]+)$/.exec(path);
  if (match && req.method === "POST") {
    const route = match[1];
    const input = asJson();
    const query = String(input.query ?? "").trim();
    if (!query) {
      return fail(res, 422, "query_rejected", "A retrieval needs a query.");
    }
    // 403 and 503 are governance outcomes the UI must render as themselves.
    // Neither may ever reach the reader as "no evidence found".
    if (/\bunauthori[sz]ed\b/i.test(query)) {
      return fail(res, 403, "not_authorised", "This operator may not search the governed corpus.");
    }
    if (/\bindex unavailable\b/i.test(query)) {
      return fail(res, 503, "index_unavailable", "The evidence index is not answering.");
    }
    return json(res, 200, evidenceFor(query, route));
  }


  return fail(res, 404, "no_such_endpoint", `The reference backend does not answer ${req.method} ${path}.`);
}

/* --------------------------------------------------------------- main ----- */

let requestOrigin = "*";
let requestHeaders = "";

const server = createServer(async (req, res) => {
  requestOrigin = req.headers.origin || "*";
  requestHeaders = String(req.headers["access-control-request-headers"] || "");
  const url = new URL(req.url, "http://localhost");
  // Logged so a failing browser journey shows what the app actually asked for
  // rather than only which selector timed out.
  if (process.env.REFERENCE_BACKEND_LOG !== "off") {
    process.stdout.write(`${req.method} ${url.pathname}${url.search}\n`);
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors());
    return res.end();
  }
  try {
    if (url.pathname.startsWith("/auth/v1")) return await identityRoute(req, res, url);
    if (url.pathname.startsWith("/api/conservatory")) return await conservatoryRoute(req, res, url);
    if (url.pathname.startsWith("/api/research/")) return await researchRoute(req, res, url);
    if (
      url.pathname.startsWith("/api/species/") ||
      url.pathname.startsWith("/api/mycorrhizal/") ||
      url.pathname.startsWith("/api/platform/")
    ) {
      return await publicSpeciesRoute(req, res, url);
    }
    if (
      url.pathname.startsWith("/api/calyx/") ||
      url.pathname.startsWith("/api/matrix-identification/") ||
      url.pathname.startsWith("/brain/") ||
      url.pathname.startsWith("/api/evidence-retrieval/") ||
      url.pathname.startsWith(`${SYNTHESIS_PREFIX}/`)
    ) {
      return await calyxRoute(req, res, url);
    }
    if (url.pathname === "/__reference/health") return json(res, 200, { ok: true });
    if (url.pathname === "/__reference/research-traits") return await researchTraitsControlRoute(req, res);
    // The rest of the app reads a handful of tables through PostgREST. None of
    // them belong to the Conservatory journey, but leaving them to 404 fills
    // the console with failures that would mask a real one.
    if (url.pathname.startsWith("/rest/v1/")) {
      if (req.method === "HEAD") { res.writeHead(200, { "Content-Range": "*/0", ...cors() }); return res.end(); }
      return json(res, 200, [], { "Content-Range": "*/0" });
    }
    return json(res, 404, { message: "not found" });
  } catch (cause) {
    return json(res, 500, { message: String(cause?.message || cause) });
  }
});

const port = Number(process.env.REFERENCE_BACKEND_PORT || 8791);
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`reference backend listening on http://127.0.0.1:${port}\n`);
});
